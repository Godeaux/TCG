// Module load verification - this should appear in console on page load
console.log('[GAMESTATE-MODULE] Loaded at:', new Date().toISOString());

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
  console.log(`[PRNG] Initialized with seed: ${seed}`);
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
      stage: 'waiting', // 'waiting', 'flipping', 'choice', 'complete'
      coinResult: null, // 'gator' or 'shark'
      playerSymbols: [null, null], // ['gator', 'shark'] or ['shark', 'gator']
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
  console.log(
    `[DRAW-DEBUG] Before: hand=${player.hand.length}, deck=${player.deck.length}, playerIndex=${playerIndex}`
  );
  if (player.deck.length === 0) {
    console.log(`[DRAW-DEBUG] Deck empty!`);
    return null;
  }
  const card = player.deck.shift();
  const newCard = { ...card, instanceId: crypto.randomUUID() };
  player.hand.push(newCard);
  console.log(
    `[DRAW-DEBUG] After: hand=${player.hand.length}, deck=${player.deck.length}, drew: ${card.name}`
  );
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

  player.deck = shuffle(deckWithRarity);
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

/**
 * Flip the setup coin to determine who chooses first player.
 * Each player is randomly assigned gator or shark. The coin flip result
 * determines the winner (whoever matches the result).
 *
 * @param {Object} state - Game state
 * @returns {Object} - { result: 'gator'|'shark', playerSymbols: ['gator'|'shark', 'gator'|'shark'] }
 */
export const flipSetupCoin = (state) => {
  if (!state.setup || state.setup.stage !== 'waiting') {
    console.warn(`Cannot flip - invalid setup state. Stage: ${state.setup?.stage}`);
    return null;
  }

  // Mark as flipping (animation in progress)
  state.setup.stage = 'flipping';

  // Randomly assign symbols to players
  const p1IsGator = seededRandom() < 0.5;
  state.setup.playerSymbols = p1IsGator ? ['gator', 'shark'] : ['shark', 'gator'];

  // Determine coin flip result
  const result = seededRandom() < 0.5 ? 'gator' : 'shark';
  state.setup.coinResult = result;

  // Winner is whoever matches the coin result
  state.setup.winnerIndex = state.setup.playerSymbols[0] === result ? 0 : 1;

  const p1Symbol = state.setup.playerSymbols[0] === 'gator' ? '🐊' : '🦈';
  const p2Symbol = state.setup.playerSymbols[1] === 'gator' ? '🐊' : '🦈';
  const resultEmoji = result === 'gator' ? '🐊' : '🦈';

  console.log(`[CoinFlip] ${state.players[0].name}=${p1Symbol}, ${state.players[1].name}=${p2Symbol}`);
  console.log(`[CoinFlip] Result: ${resultEmoji} - ${state.players[state.setup.winnerIndex].name} wins!`);

  logMessage(state, `Coin flip: ${state.players[0].name} is ${p1Symbol}, ${state.players[1].name} is ${p2Symbol}`);

  return { result, playerSymbols: state.setup.playerSymbols };
};

/**
 * Complete the coin flip animation and transition to choice phase.
 * Called after the coin flip animation finishes.
 *
 * @param {Object} state - Game state
 */
export const completeCoinFlip = (state) => {
  if (!state.setup || state.setup.stage !== 'flipping') {
    console.warn(`Cannot complete flip - invalid setup state. Stage: ${state.setup?.stage}`);
    return;
  }

  state.setup.stage = 'choice';

  const resultEmoji = state.setup.coinResult === 'gator' ? '🐊' : '🦈';
  const winnerName = state.players[state.setup.winnerIndex].name;

  logMessage(state, `${resultEmoji} ${state.setup.coinResult.toUpperCase()} wins! ${winnerName} chooses who goes first.`);
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
    console.log('[PRNG] Host generated seed:', seed);
  }

  logMessage(state, `${state.players[chosenIndex].name} will take the first turn.`);
};
