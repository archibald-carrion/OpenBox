const fs      = require("fs");
const path    = require("path");
const express = require("express");

class GameManager {
  constructor(io, app) {
    this.io         = io;
    this.app        = app;
    this.players    = {};   // socketId → { id, name, socket }
    this.hostSocket = null;
    this.activeGame = null;
    this.games      = this._loadGames();
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
    return Object.values(this.players).map(p => ({ id: p.id, name: p.name }));
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

  onPlayerJoin(socket, name) {
    const trimmed = (name || "").trim().substring(0, 20) || "Player";
    this.players[socket.id] = { id: socket.id, name: trimmed, socket };
    socket.join("players");
    socket.emit("player:joined", { id: socket.id, name: trimmed });
    this._broadcastLobby();

    if (this.activeGame?.onPlayerJoin) {
      this.activeGame.onPlayerJoin({ socket, player: this.players[socket.id], ...this._ctx() });
    }
  }

  onPlayerAction(socket, payload) {
    const player = this.players[socket.id];
    if (!player || !this.activeGame) return;
    this.activeGame.onPlayerAction({ socket, player, payload, ...this._ctx() });
  }

  onHostAction(socket, payload) {
    if (!this.activeGame) return;
    this.activeGame.onHostAction({ socket, payload, ...this._ctx() });
  }

  onDisconnect(socket) {
    if (this.players[socket.id]) {
      delete this.players[socket.id];
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
    const player = this.players[socket.id];
    if (!player || !this.activeGame?.onPlayerReady) return;
    this.activeGame.onPlayerReady({ socket, player, ...this._ctx() });
  }

  endGame() {
    if (this.activeGame?.onEnd) this.activeGame.onEnd(this._ctx());
    this.activeGame = null;
    this.io.emit("game:end", {});
    this._broadcastLobby();
  }
}

module.exports = GameManager;