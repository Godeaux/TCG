/**
 * State Utilities for AI modules
 *
 * Lightweight replacements for the stripped simulation/stateSnapshot.js.
 * Only the functions actually used by AI code.
 */

/**
 * Create a deep clone of the game state.
 */
export const createSnapshot = (state) => {
  try {
    return structuredClone(state);
  } catch {
    // Fallback for states with non-cloneable values
    const seen = new WeakSet();
    const json = JSON.stringify(state, (key, value) => {
      if (typeof value === 'function') return undefined;
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    return JSON.parse(json);
  }
};

/**
 * Compare two states and return differences.
 */
export const diffSnapshots = (before, after) => {
  const diffs = { players: [], global: {} };

  for (let i = 0; i < 2; i++) {
    const pb = before.players[i];
    const pa = after.players[i];
    const d = {};

    if (pb.hp !== pa.hp) d.hp = { before: pb.hp, after: pa.hp };
    if (pb.hand.length !== pa.hand.length)
      d.handSize = { before: pb.hand.length, after: pa.hand.length };
    if (pb.deck.length !== pa.deck.length)
      d.deckSize = { before: pb.deck.length, after: pa.deck.length };

    const fcB = pb.field.filter((c) => c !== null).length;
    const fcA = pa.field.filter((c) => c !== null).length;
    if (fcB !== fcA) d.fieldCount = { before: fcB, after: fcA };

    if (pb.carrion.length !== pa.carrion.length)
      d.carrionSize = { before: pb.carrion.length, after: pa.carrion.length };
    if (pb.exile.length !== pa.exile.length)
      d.exileSize = { before: pb.exile.length, after: pa.exile.length };

    if (Object.keys(d).length > 0) diffs.players[i] = d;
  }

  if (before.turn !== after.turn) diffs.global.turn = { before: before.turn, after: after.turn };
  if (before.phase !== after.phase)
    diffs.global.phase = { before: before.phase, after: after.phase };
  if (before.activePlayerIndex !== after.activePlayerIndex) {
    diffs.global.activePlayerIndex = {
      before: before.activePlayerIndex,
      after: after.activePlayerIndex,
    };
  }

  return diffs;
};
