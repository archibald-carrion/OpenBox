/**
 * GameManager
 * -----------
 * Manages the lobby, player list, and delegates all game logic to
 * the currently active game module.
 *
 * A "game module" is any file in /games/ that exports an object with:
 *
 *   {
 *     id:          "my_game",          // unique key
 *     name:        "My Awesome Game",  // display name
 *     minPlayers:  2,
 *     maxPlayers:  8,
 *
 *     // Called once when the game starts. Use io/players to set up state.
 *     start({ io, players, endGame }),
 *
 *     // Called when a player sends a "player:action" event.
 *     onPlayerAction({ socket, player, payload, io, players, endGame }),
 *
 *     // Called when the host sends a "host:action" event.
 *     onHostAction({ socket, payload, io, players, endGame }),
 *   }
 */

const fs   = require("fs");
const path = require("path");

class GameManager {
  constructor(io) {
    this.io        = io;
    this.players   = {};   // socketId -> { id, name, socket }
    this.hostSocket = null;
    this.activeGame = null;
    this.games      = this._loadGames();
  }

  // ── Load all game modules from /games/ ──────────────────────────────────
  _loadGames() {
    const dir = path.join(__dirname, "games");
    const games = {};
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
      const game = require(path.join(dir, file));
      games[game.id] = game;
      console.log(`  📦 Loaded game: ${game.name} (${game.id})`);
    }
    return games;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  _playerList() {
    return Object.values(this.players).map(p => ({ id: p.id, name: p.name }));
  }

  _broadcastLobby() {
    this.io.emit("lobby:update", {
      players: this._playerList(),
      games: Object.values(this.games).map(g => ({
        id: g.id, name: g.name,
        minPlayers: g.minPlayers, maxPlayers: g.maxPlayers,
      })),
    });
  }

  _ctx() {
    return {
      io:       this.io,
      players:  this.players,
      endGame:  () => this.endGame(),
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  onHostConnect(socket) {
    this.hostSocket = socket;
    socket.emit("host:init", {
      players: this._playerList(),
      games: Object.values(this.games).map(g => ({
        id: g.id, name: g.name,
        minPlayers: g.minPlayers, maxPlayers: g.maxPlayers,
      })),
    });
  }

  onPlayerJoin(socket, name) {
    const trimmed = (name || "").trim().substring(0, 20) || "Player";
    this.players[socket.id] = { id: socket.id, name: trimmed, socket };
    socket.join("players");
    socket.emit("player:joined", { id: socket.id, name: trimmed });
    this._broadcastLobby();

    // If a game is running, let the game handle late joiners (optional)
    if (this.activeGame && this.activeGame.onPlayerJoin) {
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

  // ── Game control ─────────────────────────────────────────────────────────
  startGame(gameId) {
    const game = this.games[gameId];
    if (!game) return;

    const count = Object.keys(this.players).length;
    if (count < game.minPlayers) {
      this.io.to("host").emit("host:error",
        `Need at least ${game.minPlayers} players (have ${count})`);
      return;
    }

    this.activeGame = game;
    this.io.emit("game:start", { gameId: game.id, gameName: game.name });
    game.start(this._ctx());
  }

  endGame() {
    if (this.activeGame && typeof this.activeGame.onEnd === "function") {
      this.activeGame.onEnd(this._ctx());
    }

    this.activeGame = null;
    this.io.emit("game:end", {});
    this._broadcastLobby();
  }
}

module.exports = GameManager;
