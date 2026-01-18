/**
 * Mock Factory
 *
 * Creates mock objects for testing effect contexts and game operations.
 */

/**
 * Create a mock logger that captures log messages
 */
export const createMockLog = () => {
  const messages = [];
  const log = (msg) => messages.push(msg);
  log.getMessages = () => messages;
  log.clear = () => (messages.length = 0);
  return log;
};

/**
 * Create an effect context for testing effects
 */
export const createEffectContext = (state, playerIndex = 0, overrides = {}) => {
  const opponentIndex = (playerIndex + 1) % 2;
  const log = createMockLog();

  return {
    log,
    state,
    player: state.players[playerIndex],
    opponent: state.players[opponentIndex],
    playerIndex,
    opponentIndex,
    ...overrides,
  };
};

/**
 * Create a combat context for testing combat effects
 */
export const createCombatContext = (state, attacker, target, attackerIndex = 0) => {
  const defenderIndex = (attackerIndex + 1) % 2;
  const log = createMockLog();

  return {
    log,
    state,
    attacker,
    target,
    attackerIndex,
    defenderIndex,
    player: state.players[attackerIndex],
    opponent: state.players[defenderIndex],
    playerIndex: attackerIndex,
    opponentIndex: defenderIndex,
  };
};

/**
 * Create a trap trigger context
 */
export const createTrapContext = (state, trapCard, triggeringCreature, trapOwnerIndex = 1) => {
  const opponentIndex = (trapOwnerIndex + 1) % 2;
  const log = createMockLog();

  return {
    log,
    state,
    trap: trapCard,
    creature: triggeringCreature,
    attacker: triggeringCreature,
    target: triggeringCreature,
    player: state.players[trapOwnerIndex],
    opponent: state.players[opponentIndex],
    playerIndex: trapOwnerIndex,
    opponentIndex,
  };
};
