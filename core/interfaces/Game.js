/**
 * @typedef {Object} Player
 * @property {string} id - Unique player ID
 * @property {string} name - Player's display name
 * @property {boolean} connected - Whether the player is currently connected
 * @property {Date} lastSeen - Last time the player was active
 */

/**
 * @typedef {Object} GameContext
 * @property {import('socket.io').Server} io - Socket.IO server instance
 * @property {Object.<string, Player>} players - Read-only map of playerId to player data
 * @property {Function} endGame - Call to end the current game
 * @property {Function} broadcast - Helper to broadcast events to all clients
 */

/**
 * @typedef {Object} Game
 * @property {string} id - Unique game identifier (e.g., 'chameleon')
 * @property {string} name - Human-readable game name
 * @property {number} minPlayers - Minimum number of players required to start
 * @property {number} maxPlayers - Maximum number of players allowed
 * @property {Function} start - Called when the game starts. Receives GameContext.
 * @property {Function} onPlayerJoin - Called when a player joins during the game. Receives { socket, player, ...GameContext }.
 * @property {Function} onPlayerAction - Called when a player sends an action. Receives { socket, player, payload, ...GameContext }.
 * @property {Function} onHostAction - Called when the host sends an action. Receives { socket, payload, ...GameContext }.
 * @property {Function} [onHostReady] - Called when the host UI is ready. Receives { hostSocket, ...GameContext }.
 * @property {Function} [onPlayerReady] - Called when a player UI is ready. Receives { socket, player, ...GameContext }.
 * @property {Function} [onEnd] - Called when the game ends. Receives GameContext.
 */

// This file is for JSDoc only; no runtime exports needed
