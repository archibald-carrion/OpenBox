/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} name
 * @property {boolean} connected
 * @property {Date} lastSeen
 */

const { Socket } = require('socket.io');

/**
 * Provides a restricted, stable API for games to interact with the core system.
 * Prevents games from directly modifying core state or accessing internal methods.
 */
class GameContext {
  /**
   * @param {import('socket.io').Server} io - Socket.IO server instance
   * @param {Object.<string, Player>} players - Map of playerId to Player objects
   * @param {Function} endGame - Function to end the current game
   */
  constructor(io, players, endGame) {
    this._io = io;
    this._players = players;
    this._endGame = endGame;
  }

  /**
   * @returns {import('socket.io').Server} Socket.IO server instance (read-only)
   */
  get io() {
    return this._io;
  }

  /**
   * @returns {Player[]} Array of all players (read-only)
   */
  get players() {
    return Object.freeze(Object.values(this._players));
  }

  /**
   * @returns {number} Number of connected players
   */
  get playerCount() {
    return Object.values(this._players).filter(p => p.connected).length;
  }

  /**
   * @returns {number} Total number of players (including disconnected)
   */
  get totalPlayers() {
    return Object.keys(this._players).length;
  }

  /**
   * Ends the current game
   */
  endGame() {
    this._endGame();
  }

  /**
   * Broadcasts an event to all connected clients (host and players)
   * @param {string} event - Event name
   * @param {any} data - Data to send
   */
  broadcast(event, data) {
    this._io.emit(event, data);
  }

  /**
   * Broadcasts an event to all players only
   * @param {string} event - Event name
   * @param {any} data - Data to send
   */
  broadcastToPlayers(event, data) {
    this._io.to('players').emit(event, data);
  }

  /**
   * Broadcasts an event to the host only
   * @param {string} event - Event name
   * @param {any} data - Data to send
   */
  broadcastToHost(event, data) {
    this._io.to('host').emit(event, data);
  }

  /**
   * Gets a player by ID
   * @param {string} playerId - Player ID
   * @returns {Player|undefined} Player object or undefined if not found
   */
  getPlayer(playerId) {
    return this._players[playerId];
  }

  /**
   * Gets all connected players
   * @returns {Player[]} Array of connected players
   */
  getConnectedPlayers() {
    return Object.values(this._players).filter(p => p.connected);
  }

  /**
   * Checks if a player is connected
   * @param {string} playerId - Player ID
   * @returns {boolean} True if player is connected
   */
  isPlayerConnected(playerId) {
    const player = this._players[playerId];
    return player ? player.connected : false;
  }
}

module.exports = GameContext;