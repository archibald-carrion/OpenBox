const fs = require("fs");
const path = require("path");
const express = require("express");
const crypto = require("crypto");
const GameContext = require("./core/GameContext");

/**
 * @typedef {import('./core/interfaces/Game').Game} Game
 */

/**
 * Manages game loading, player connections, and game lifecycle.
 * Provides a clean separation between core system and individual games.
 */
class GameManager {
  /**
   * @param {import('socket.io').Server} io - Socket.IO server instance
   * @param {import('express').Application} app - Express application
   */
  constructor(io, app) {
    this.io = io;
    this.app = app;
    this.players = {}; // persistentId → { id, name, socket, connected: boolean, lastSeen: Date }
    this.hostSocket = null;
    this.activeGame = null;
    this.games = this._loadGames();

    // Clean up disconnected players every 5 minutes
    setInterval(() => this._cleanupDisconnectedPlayers(), 5 * 60 * 1000);
  }

  // ── Game Loading ─────────────────────────────────────────────────────────

  /**
   * Loads all valid games from the /games/ directory.
   * Validates that each game module conforms to the required interface.
   * @returns {Object.<string, Game>} Map of gameId to Game objects
   */
  _loadGames() {
    const dir = path.join(__dirname, "games");
    const games = {};

    if (!fs.existsSync(dir)) {
      console.warn(`Games directory not found: ${dir}`);
      return games;
    }

    for (const folder of fs.readdirSync(dir)) {
      const gamePath = path.join(dir, folder);
      if (!fs.statSync(gamePath).isDirectory()) continue;

      const entryPoint = path.join(gamePath, "game.js");
      if (!fs.existsSync(entryPoint)) continue;

      try {
        // Clear module cache to allow hot-reloading during development
        const modulePath = require.resolve(entryPoint);
        delete require.cache[modulePath];
        
        const game = require(entryPoint);
        
        // Validate game interface
        if (!this._isValidGame(game, folder)) {
          console.warn(`Game ${folder} is missing required properties or methods.`);
          continue;
        }

        games[game.id] = game;
        
        // Serve the game's static assets
        this.app.use(`/games/${game.id}`, express.static(gamePath));
        
        console.log(`  📦 Loaded game: ${game.name} (${game.id})`);
      } catch (error) {
        console.error(`Failed to load game ${folder}:`, error.message);
      }
    }

    return games;
  }

  /**
   * Validates that a game module conforms to the required interface.
   * @param {Object} game - Game module to validate
   * @param {string} folder - Game folder name (for logging)
   * @returns {boolean} True if game is valid
   */
  _isValidGame(game, folder) {
    const requiredProperties = ['id', 'name', 'minPlayers', 'maxPlayers'];
    const requiredMethods = ['start'];

    // Check required properties
    for (const prop of requiredProperties) {
      if (typeof game[prop] === 'undefined') {
        console.warn(`  Game ${folder} is missing required property: ${prop}`);
        return false;
      }
    }

    // Check required methods
    for (const method of requiredMethods) {
      if (typeof game[method] !== 'function') {
        console.warn(`  Game ${folder} is missing required method: ${method}`);
        return false;
      }
    }

    // Validate types
    if (typeof game.id !== 'string' || game.id.trim() === '') {
      console.warn(`  Game ${folder} has invalid id (must be non-empty string)`);
      return false;
    }

    if (typeof game.name !== 'string' || game.name.trim() === '') {
      console.warn(`  Game ${folder} has invalid name (must be non-empty string)`);
      return false;
    }

    if (typeof game.minPlayers !== 'number' || game.minPlayers < 1) {
      console.warn(`  Game ${folder} has invalid minPlayers (must be positive number)`);
      return false;
    }

    if (typeof game.maxPlayers !== 'number' || game.maxPlayers < game.minPlayers) {
      console.warn(`  Game ${folder} has invalid maxPlayers (must be >= minPlayers)`);
      return false;
    }

    return true;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Returns a list of players for lobby updates (excluding sensitive data)
   * @returns {Array.<{id: string, name: string, connected: boolean}>}
   */
  _playerList() {
    return Object.values(this.players).map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected
    }));
  }

  /**
   * Broadcasts lobby state to all clients
   */
  _broadcastLobby() {
    this.io.emit("lobby:update", {
      players: this._playerList(),
      games: this._gameList(),
    });
  }

  /**
   * Returns a list of available games for lobby updates
   * @returns {Array.<{id: string, name: string, minPlayers: number, maxPlayers: number}>}
   */
  _gameList() {
    return Object.values(this.games).map(g => ({
      id: g.id,
      name: g.name,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
    }));
  }

  /**
   * Creates a restricted GameContext for the current game
   * @returns {GameContext} Game context with restricted access to core functionality
   */
  _ctx() {
    return new GameContext(
      this.io,
      this.players,
      () => this.endGame()
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Handles host connection
   * @param {import('socket.io').Socket} socket - Host socket
   */
  onHostConnect(socket) {
    this.hostSocket = socket;
    socket.join("host");
    socket.emit("host:init", {
      players: this._playerList(),
      games: this._gameList(),
    });
  }

  /**
   * Handles player join
   * @param {import('socket.io').Socket} socket - Player socket
   * @param {Object} data - Join data
   * @param {string} data.name - Player name
   * @param {string} [data.persistentId] - Persistent player ID
   * @param {string} [data.token] - Reconnection token
   */
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

  /**
   * Handles player action
   * @param {import('socket.io').Socket} socket - Player socket
   * @param {Object} payload - Action payload
   */
  onPlayerAction(socket, payload) {
    const player = Object.values(this.players).find(p => p.socket?.id === socket.id);
    if (!player || !this.activeGame) return;
    
    if (this.activeGame.onPlayerAction) {
      this.activeGame.onPlayerAction({ socket, player, payload, ...this._ctx() });
    }
  }

  /**
   * Handles host action
   * @param {import('socket.io').Socket} socket - Host socket
   * @param {Object} payload - Action payload
   */
  onHostAction(socket, payload) {
    if (!this.activeGame) return;
    
    if (this.activeGame.onHostAction) {
      this.activeGame.onHostAction({ socket, payload, ...this._ctx() });
    }
  }

  /**
   * Handles socket disconnection
   * @param {import('socket.io').Socket} socket - Disconnected socket
   */
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

  // ── Game Control ─────────────────────────────────────────────────────────

  /**
   * Starts a new game
   * @param {string} gameId - ID of the game to start
   */
  startGame(gameId) {
    const game = this.games[gameId];
    if (!game) {
      console.warn(`Game ${gameId} not found`);
      return;
    }

    const count = Object.keys(this.players).length;
    if (count < game.minPlayers) {
      this.io.to("host").emit("host:error",
        `Need at least ${game.minPlayers} players (have ${count})`);
      return;
    }

    this.activeGame = game;

    // Tell everyone a game is starting so they load their UI fragments
    this.io.emit("game:start", { gameId: game.id, gameName: game.name });

    // Prepare game state without emitting anything
    game.start(this._ctx());
  }

  /**
   * Called when the host shell finishes loading the game UI
   * @param {import('socket.io').Socket} socket - Host socket
   */
  onHostReady(socket) {
    if (this.activeGame?.onHostReady) {
      this.activeGame.onHostReady({ hostSocket: socket, ...this._ctx() });
    }
  }

  /**
   * Called when a player shell finishes loading the game UI
   * @param {import('socket.io').Socket} socket - Player socket
   */
  onPlayerReady(socket) {
    const player = Object.values(this.players).find(p => p.socket?.id === socket.id);
    if (!player || !this.activeGame?.onPlayerReady) return;
    this.activeGame.onPlayerReady({ socket, player, ...this._ctx() });
  }

  /**
   * Ends the current game
   */
  endGame() {
    if (this.activeGame?.onEnd) {
      this.activeGame.onEnd(this._ctx());
    }
    this.activeGame = null;
    this.io.emit("game:end", {});
    this._broadcastLobby();
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  /**
   * Cleans up old disconnected players (called every 5 minutes)
   */
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