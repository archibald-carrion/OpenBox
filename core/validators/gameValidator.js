/**
 * Validates that a game module conforms to the expected interface.
 * @param {Object} game - Game module to validate
 * @returns {boolean} True if the game is valid
 */
function validateGame(game) {
  const requiredProperties = [
    'id',
    'name',
    'minPlayers',
    'maxPlayers',
    'start',
    'onPlayerJoin',
    'onPlayerAction',
    'onHostAction',
  ];

  // Check required properties
  for (const prop of requiredProperties) {
    if (typeof game[prop] === 'undefined') {
      console.warn(`Game ${game.id || 'unknown'} is missing required property: ${prop}`);
      return false;
    }
  }

  // Validate types
  if (typeof game.id !== 'string' || game.id.trim() === '') {
    console.warn(`Game ${game.id || 'unknown'} has invalid id`);
    return false;
  }

  if (typeof game.name !== 'string' || game.name.trim() === '') {
    console.warn(`Game ${game.id} has invalid name`);
    return false;
  }

  if (
    typeof game.minPlayers !== 'number' ||
    game.minPlayers < 1 ||
    !Number.isInteger(game.minPlayers)
  ) {
    console.warn(`Game ${game.id} has invalid minPlayers`);
    return false;
  }

  if (
    typeof game.maxPlayers !== 'number' ||
    game.maxPlayers < game.minPlayers ||
    !Number.isInteger(game.maxPlayers)
  ) {
    console.warn(`Game ${game.id} has invalid maxPlayers`);
    return false;
  }

  // Check function types
  if (typeof game.start !== 'function') {
    console.warn(`Game ${game.id} has invalid start method`);
    return false;
  }

  if (typeof game.onPlayerJoin !== 'function') {
    console.warn(`Game ${game.id} has invalid onPlayerJoin method`);
    return false;
  }

  if (typeof game.onPlayerAction !== 'function') {
    console.warn(`Game ${game.id} has invalid onPlayerAction method`);
    return false;
  }

  if (typeof game.onHostAction !== 'function') {
    console.warn(`Game ${game.id} has invalid onHostAction method`);
    return false;
  }

  return true;
}

module.exports = { validateGame };