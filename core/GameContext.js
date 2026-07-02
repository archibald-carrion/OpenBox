/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} name
 * @property {boolean} connected
 * @property {Date} lastSeen
 * @property {import('socket.io').Socket} [socket]
 */

/**
 * Provides a restricted, stable API for games to interact with the core system.
 * Prevents games from directly modifying core state or accessing internal methods.
 * 
 * This class exposes properties that can be destructured by game modules,
 * maintaining backward compatibility while adding type safety and restrictions.
 */
class GameContext {
  /**
   * @param {import('socket.io').Server} io - Socket.IO server instance
   * @param {Object.<string, Player>} players - Map of playerId to Player objects
   * @param {Function} endGame - Function to end the current game
   */
  constructor(io, players, endGame) {
    // Store internal references
    this._io = io;
    this._players = players;
    this._endGame = endGame;

    // Expose io directly (read-only via getter)
    // Expose players as a frozen array (read-only)
    // Expose endGame as a bound function
    
    // Make these enumerable so they can be destructured by game modules
    Object.defineProperty(this, 'io', {
      value: io,
      enumerable: true,
      writable: false,
      configurable: false
    });

    Object.defineProperty(this, 'players', {
      get: () => Object.freeze(Object.values(this._players)),
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(this, 'endGame', {
      value: () => this._endGame(),
      enumerable: true,
      writable: false,
      configurable: false
    });
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