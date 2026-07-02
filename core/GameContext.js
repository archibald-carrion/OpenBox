const EventBus = require('./EventBus');

/**
 * Provides a restricted, stable API for games to interact with the core system.
 * Hides core internals and prevents direct state mutation.
 */
class GameContext {
  /**
   * @param {import('socket.io').Server} io - Socket.IO server instance
   * @param {Object.<string, import('./interfaces/Game').Player>} players - Map of playerId to player data
   * @param {Function} endGame - Function to end the current game
   * @param {EventBus} eventBus - Event bus for decoupled communication
   */
  constructor(io, players, endGame, eventBus) {
    this._io = io;
    this._players = players;
    this._endGame = endGame;
    this._eventBus = eventBus;
  }

  /**
   * @returns {import('socket.io').Server} Socket.IO server instance
   */
  get io() {
    return this._io;
  }

  /**
   * @returns {Object.<string, import('./interfaces/Game').Player>} Read-only copy of players
   */
  get players() {
    // Return a shallow copy of the players object to prevent direct mutation
    const playersCopy = {};
    for (const [id, player] of Object.entries(this._players)) {
      playersCopy[id] = { ...player };
    }
    return Object.freeze(playersCopy);
  }

  /**
   * @returns {EventBus} Event bus for subscribing to/emitting events
   */
  get eventBus() {
    return this._eventBus;
  }

  /**
   * Ends the current game.
   */
  endGame() {
    this._endGame();
  }

  /**
   * Broadcasts an event to all connected clients.
   * @param {string} event - Event name
   * @param {any} data - Data to send
   */
  broadcast(event, data) {
    this._io.emit(event, data);
  }

  /**
   * Broadcasts an event to the host only.
   * @param {string} event - Event name
   * @param {any} data - Data to send
   */
  broadcastToHost(event, data) {
    this._io.to('host').emit(event, data);
  }

  /**
   * Broadcasts an event to all players.
   * @param {string} event - Event name
   * @param {any} data - Data to send
   */
  broadcastToPlayers(event, data) {
    this._io.to('players').emit(event, data);
  }
}

module.exports = GameContext;