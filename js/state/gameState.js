// Re-export history logging functions for convenience
export {
  LOG_CATEGORIES,
  KEYWORD_EMOJIS,
  logGameAction,
  formatKeyword,
  formatKeywordList,
  getKeywordEmoji,
  formatCardForLog,
} from '../game/historyLog.js';

// ============================================================================
// SEEDED PRNG - Mulberry32 algorithm for deterministic random numbers
// Both clients use the same seed to get identical random sequences
// ============================================================================

/**
 * Creates a seeded random number generator using mulberry32 algorithm.
 * @param {number} seed - The seed value
 * @returns {function} A function that returns random numbers [0, 1)
 */
const createSeededRandom = (seed) => {
  let state = seed >>> 0; // Ensure unsigned 32-bit integer
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Global PRNG instance - initialized when game starts
let gameRandom = null;
let currentSeed = null;

/**
 * Initialize the game's random number generator with a seed.
 * Call this when starting a new game - host generates seed, shares via sync.
 * @param {number} seed - The seed value (use Date.now() for host)
 */
export const initializeGameRandom = (seed) => {
  currentSeed = seed;
  gameRandom = createSeededRandom(seed);

};

/**
 * Get the current seed (for syncing to opponent).
 * @returns {number|null} The current seed
 */
export const getGameSeed = () => currentSeed;

/**
 * Get a random number [0, 1) using the seeded PRNG.
 * Falls back to Math.random() if PRNG not initialized (offline/AI games).
 * @returns {number} Random number between 0 and 1
 */
export const seededRandom = () => {
  if (gameRandom) {
    return gameRandom();
  }
  // Fallback for non-multiplayer games
  return Math.random();
};

/**
 * Get a random integer in range [0, max) using seeded PRNG.
 * @param {number} max - Exclusive upper bound
 * @returns {number} Random integer
 */
export const seededRandomInt = (max) => {
  return Math.floor(seededRandom() * max);
};

/**
 * Shuffle array using seeded PRNG (Fisher-Yates algorithm).
 * @param {Array} array - Array to shuffle (mutated in place)
 * @returns {Array} The shuffled array
 */
// Track instanceIds generated during action execution.
// The host includes these in confirmed broadcasts so the guest can use them.
let _createdInstanceIds = [];
let _trackingActive = false;

/**
 * Start tracking instanceIds created during action execution.
 * Called by ActionBus before executeAction on the host.
 */
export const beginTrackingInstanceIds = () => {
  _createdInstanceIds = [];
  _trackingActive = true;
};

/**
 * Get all instanceIds created since beginTrackingInstanceIds was called.
 * @returns {string[]} Array of instanceIds in creation order
 */
export const getCreatedInstanceIds = () => [..._createdInstanceIds];

/**
 * Stop tracking instanceIds.
 */
export const stopTrackingInstanceIds = () => {
  _trackingActive = false;
};

// Host-authoritative ID override queue.
// When the guest applies a host-confirmed action, it uses the host's IDs
// instead of generating its own, ensuring both sides have identical instanceIds.
let _idOverrides = [];

/**
 * Set instance ID overrides (guest uses these when applying host actions).
 * @param {string[]} ids - Array of instanceIds from the host
 */
export const setInstanceIdOverrides = (ids) => { _idOverrides = [...ids]; };

/**
 * Clear instance ID overrides after action execution.
 */
export const clearInstanceIdOverrides = () => { _idOverrides = []; };

/**
 * Generate an instance ID for a card.
 * If overrides are queued (guest applying host action), uses the host's ID.
 * Otherwise generates via crypto.randomUUID() (host path, or single-player).
 */
export const seededInstanceId = () => {
  if (_idOverrides.length > 0) {
    return _idOverrides.shift();
  }
  const id = crypto.randomUUID();
  if (_trackingActive) {
    _createdInstanceIds.push(id);
  }
  return id;
};

const shuffle = (array) => {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(seededRandom() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const createPlayer = (name) => ({
  name,
  nameStyle: {}, // { effect, font, color } for customized name display
  hp: 10,
  deck: [],
  hand: [],
  field: [null, null, null],
  carrion: [],
  exile: [],
  traps: [], // Kept for backward compatibility - traps now trigger from hand
});

// Helper to get traps that can trigger from a player's hand
export const getTrapsFromHand = (player, triggerType) => {
  if (!player?.hand) return [];
  return player.hand.filter((card) => card.type === 'Trap' && card.trigger === triggerType);
};

export const createGameState = () => {
  const players = [createPlayer('Player 1'), createPlayer('Player 2')];
  return {
    players,
    activePlayerIndex: 0,
    phase: 'Setup',
    turn: 1,
    randomSeed: null, // Shared seed for deterministic PRNG - set by host, synced to opponent
    firstPlayerIndex: null,
    skipFirstDraw: true,
    cardPlayedThisTurn: false,
    passPending: false,
    extendedConsumption: null, // { predatorInstanceId, predatorSlotIndex, consumedCount, maxConsumption: 3 }
    beforeCombatQueue: [],
    beforeCombatProcessing: false,
    endOfTurnQueue: [],
    endOfTurnProcessing: false,
    endOfTurnFinalized: false,
    visualEffects: [],
    pendingTrapDecision: null,
    pendingReaction: null, // { deciderIndex, reactions, attackContext, timerStart }
    victoryProcessed: false, // Prevents multiple pack awards on re-renders
    setup: {
      stage: 'rolling',
      rolls: [null, null],
      winnerIndex: null,
    },
    deckSelection: {
      stage: 'p1',
      selections: [null, null],
      readyStatus: [false, false], // Tracks if each player has confirmed their deck choice
    },
    deckBuilder: {
      stage: 'p1',
      selections: [[], []],
      available: [[], []],
      catalogOrder: [[], []],
    },
    menu: {
      stage: 'main',
      mode: null,
      profile: null,
      lobby: null,
      existingLobby: null, // Tracks existing lobby for rejoin functionality
      error: null,
      loading: false,
      lastLobbySyncAt: 0,
      lastLobbySyncBySender: {},
      onlineDecksReady: false,
      decks: [],
      aiSlowMode: false, // When true, AI moves 4x slower (turtle mode)
    },
    catalogBuilder: {
      stage: null,
      deckId: null,
      selections: [],
      available: [],
      catalogOrder: [],
      editingDeckId: null,
      editingDeckName: null,
    },
    log: [],
    advantageHistory: [], // Tracks position advantage over time for graphing
    combat: {
      declaredAttacks: [],
    },
    emotes: {
      squelched: false, // Whether opponent emotes are muted
    },
  };
};

export const drawCard = (state, playerIndex) => {
  const player = state.players[playerIndex];
  if (player.deck.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * player.deck.length);
  const [card] = player.deck.splice(randomIndex, 1);
  // instanceId is already assigned at deck creation (seeded, deterministic).
  // Only assign a fallback if somehow missing (e.g. legacy/test code).
  if (!card.instanceId) {
    card.instanceId = seededInstanceId();
  }
  player.hand.push(card);
  return card;
};

export const logMessage = (state, message) => {
  state.log.unshift(message);
  // Increased limit to preserve full game history
  // 2000 entries should be more than enough for any game
  if (state.log.length > 2000) {
    state.log.pop();
  }
};

export const queueVisualEffect = (state, effect) => {
  if (!state.visualEffects) {
    state.visualEffects = [];
  }
  const entry = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...effect,
  };
  state.visualEffects.push(entry);
  if (state.visualEffects.length > 30) {
    state.visualEffects.shift();
  }
  return entry;
};

export const setPlayerDeck = (state, playerIndex, deck, ownedCards = null) => {
  const player = state.players[playerIndex];

  // Attach rarity from ownedCards to each card in the deck
  const deckWithRarity = deck.map((card) => {
    if (ownedCards && card.id) {
      // ownedCards can be a Map or an array of {cardId, rarity}
      let rarity = null;
      if (ownedCards instanceof Map) {
        rarity = ownedCards.get(card.id);
      } else if (Array.isArray(ownedCards)) {
        const owned = ownedCards.find((c) => c.cardId === card.id);
        rarity = owned?.rarity;
      }
      if (rarity) {
        return { ...card, rarity };
      }
    }
    return { ...card };
  });

  // Assign stable instanceIds using seeded PRNG so host and guest get identical IDs
  const deckWithIds = deckWithRarity.map((card) => ({
    ...card,
    instanceId: seededInstanceId(),
  }));
  player.deck = shuffle(deckWithIds);
  player.hand = [];
  player.field = [null, null, null];
  player.carrion = [];
  player.exile = [];
  player.traps = [];
};

export const getActivePlayer = (state) => state.players[state.activePlayerIndex];

export const getOpponentPlayer = (state) => state.players[(state.activePlayerIndex + 1) % 2];

export const resetCombat = (state) => {
  state.combat.declaredAttacks = [];
  state.players.forEach((player) => {
    player.field.forEach((card) => {
      if (card) {
        card.hasAttacked = false;
        card.attacksMadeThisTurn = 0; // Reset Multi-Strike counter
        card.beforeCombatFiredThisAttack = false; // Reset per-attack beforeCombat flag
      }
    });
  });
};

export const rollSetupDie = (state, playerIndex) => {
  if (!state.setup || state.setup.stage !== 'rolling') {
    console.warn(`Cannot roll - invalid setup state. Stage: ${state.setup?.stage}`);
    return null;
  }

  if (state.setup.rolls[playerIndex] !== null) {
    return state.setup.rolls[playerIndex];
  }

  // Validate rolls array before proceeding
  const rollsAreValid = state.setup.rolls.every(
    (roll) => roll === null || (typeof roll === 'number' && roll >= 1 && roll <= 10)
  );

  if (!rollsAreValid) {
    console.error('Invalid rolls array detected, resetting:', state.setup.rolls);
    state.setup.rolls = [null, null];
  }

  const roll = Math.floor(seededRandom() * 10) + 1;
  state.setup.rolls[playerIndex] = roll;

  logMessage(state, `${state.players[playerIndex].name} rolls a ${roll}.`);

  const [p1Roll, p2Roll] = state.setup.rolls;
  if (p1Roll !== null && p2Roll !== null) {
    if (p1Roll === p2Roll) {
      logMessage(state, 'Tie! Reroll the dice to determine who chooses first.');
      state.setup.rolls = [null, null];
    } else {
      state.setup.winnerIndex = p1Roll > p2Roll ? 0 : 1;
      state.setup.stage = 'choice';
      logMessage(
        state,
        `${state.players[state.setup.winnerIndex].name} wins the roll and chooses who goes first.`
      );
    }
  }

  return roll;
};

export const chooseFirstPlayer = (state, chosenIndex) => {
  state.activePlayerIndex = chosenIndex;
  state.firstPlayerIndex = chosenIndex;
  state.turn = 1;
  state.phase = 'Start';
  state.cardPlayedThisTurn = false;
  state.passPending = false;
  state.setup.stage = 'complete';
  state.advantageHistory = []; // Reset advantage graph for new game

  // Initialize PRNG seed if not already set (host generates, opponent receives via sync)
  if (!state.randomSeed) {
    const seed = Date.now() ^ (Math.random() * 0xffffffff);
    state.randomSeed = seed;
    initializeGameRandom(seed);
  }

  logMessage(state, `${state.players[chosenIndex].name} will take the first turn.`);
};
