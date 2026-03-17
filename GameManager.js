const fs      = require("fs");
const path    = require("path");
const express = require("express");
const crypto  = require("crypto");

class GameManager {
  constructor(io, app) {
    this.io         = io;
    this.app        = app;
    this.players    = {};   // persistentId → { id, name, socket, connected: boolean, lastSeen: Date }
    this.hostSocket = null;
    this.activeGame = null;
    this.games      = this._loadGames();

    // Clean up disconnected players every 5 minutes
    setInterval(() => this._cleanupDisconnectedPlayers(), 5 * 60 * 1000);
  }

  // ── Auto-load every subfolder in /games/ that has a game.js ──────────────
  _loadGames() {
    const dir   = path.join(__dirname, "games");
    const games = {};

    for (const folder of fs.readdirSync(dir)) {
      const gamePath = path.join(dir, folder);
      if (!fs.statSync(gamePath).isDirectory()) continue;

      const entryPoint = path.join(gamePath, "game.js");
      if (!fs.existsSync(entryPoint)) continue;

      const game = require(entryPoint);
      games[game.id] = game;

      // Serve the game's own static assets (html, js, images…)
      this.app.use(`/games/${game.id}`, express.static(gamePath));

      console.log(`  📦 Loaded game: ${game.name} (${game.id})`);
    }

    return games;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _playerList() {
    return Object.values(this.players).map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected
    }));
  }

  _broadcastLobby() {
    this.io.emit("lobby:update", {
      players: this._playerList(),
      games:   this._gameList(),
    });
  }

  _gameList() {
    return Object.values(this.games).map(g => ({
      id: g.id, name: g.name,
      minPlayers: g.minPlayers, maxPlayers: g.maxPlayers,
    }));
  }

  _ctx() {
    return {
      io:      this.io,
      players: this.players,
      endGame: () => this.endGame(),
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onHostConnect(socket) {
    this.hostSocket = socket;
    socket.join("host");
    socket.emit("host:init", {
      players: this._playerList(),
      games:   this._gameList(),
    });
  }

  onPlayerJoin(socket, data) {
    const { name, persistentId, token } = data;
    let playerId = persistentId;

    // If no persistentId provided, generate one
    if (!playerId) {
      playerId = crypto.randomUUID();
    }

    // Check if player already exists (reconnection)
    let player = this.players[playerId];

    if (player) {
      // Reconnection: update socket and mark as connected
      player.socket = socket;
      player.connected = true;
      player.lastSeen = new Date();
      console.log(`Player ${player.name} reconnected with ID ${playerId}`);
    } else {
      // New player
      const trimmed = (name || "").trim().substring(0, 20) || "Player";
      player = {
        id: playerId,
        name: trimmed,
        socket,
        connected: true,
        lastSeen: new Date()
      };
      this.players[playerId] = player;
      console.log(`New player ${trimmed} joined with ID ${playerId}`);
    }

    socket.join("players");
    socket.emit("player:joined", {
      id: player.id,
      name: player.name,
      persistentId: player.id,
      gameActive: !!this.activeGame,
      gameId: this.activeGame?.id
    });
    this._broadcastLobby();

    if (this.activeGame?.onPlayerJoin) {
      this.activeGame.onPlayerJoin({ socket, player, ...this._ctx() });
    }

    // If there's an active game, send the start event to the rejoining player
    if (this.activeGame && player) {
      socket.emit("game:start", { gameId: this.activeGame.id });
    }
  }

  onPlayerAction(socket, payload) {
    const player = Object.values(this.players).find(p => p.socket?.id === socket.id);
    if (!player || !this.activeGame) return;
    this.activeGame.onPlayerAction({ socket, player, payload, ...this._ctx() });
  }

  onHostAction(socket, payload) {
    if (!this.activeGame) return;
    this.activeGame.onHostAction({ socket, payload, ...this._ctx() });
  }

  onDisconnect(socket) {
    // Find the player by socket
    const player = Object.values(this.players).find(p => p.socket?.id === socket.id);
    if (player) {
      player.connected = false;
      player.socket = null;
      console.log(`Player ${player.name} disconnected (ID: ${player.id})`);
      this._broadcastLobby();
    }
    if (this.hostSocket?.id === socket.id) this.hostSocket = null;
  }

  // ── Game control ──────────────────────────────────────────────────────────
  startGame(gameId) {
    const game  = this.games[gameId];
    if (!game) return;

    const count = Object.keys(this.players).length;
    if (count < game.minPlayers) {
      this.io.to("host").emit("host:error",
        `Need at least ${game.minPlayers} players (have ${count})`);
      return;
    }

    this.activeGame = game;

    // Tell everyone a game is starting so they load their UI fragments.
    // Neither host nor players receive game events yet — both pull their
    // initial state once their UI is ready (host:ready / player:ready).
    this.io.emit("game:start", { gameId: game.id, gameName: game.name });

    // Prepare game state without emitting anything
    game.start(this._ctx());
  }

  // Called when the host shell finishes loading the game UI
  onHostReady(socket) {
    if (this.activeGame?.onHostReady) {
      this.activeGame.onHostReady({ hostSocket: socket, ...this._ctx() });
    }
  }

  // Called when a player shell finishes loading the game UI
  onPlayerReady(socket) {
    const player = Object.values(this.players).find(p => p.socket?.id === socket.id);
    if (!player || !this.activeGame?.onPlayerReady) return;
    this.activeGame.onPlayerReady({ socket, player, ...this._ctx() });
  }

  endGame() {
    if (this.activeGame?.onEnd) this.activeGame.onEnd(this._ctx());
    this.activeGame = null;
    this.io.emit("game:end", {});
    this._broadcastLobby();
  }

  // ── Cleanup old disconnected players (called every 5 minutes) ────────────
  _cleanupDisconnectedPlayers() {
    const now = new Date();
    const timeoutMs = 30 * 60 * 1000; // 30 minutes

    for (const [id, player] of Object.entries(this.players)) {
      if (!player.connected && (now - player.lastSeen) > timeoutMs) {
        console.log(`Cleaning up disconnected player ${player.name} (ID: ${id})`);
        delete this.players[id];
      }
    }
  }
}

module.exports = GameManager;