// Core game state structure and initialization functions

const shuffle = (array) => {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const createPlayer = (name) => ({
  name,
  hp: 10,
  deck: [],
  hand: [],
  field: [null, null, null],
  carrion: [],
  exile: [],
  traps: [],
});

export const createGameState = () => {
  const players = [createPlayer("Player 1"), createPlayer("Player 2")];
  return {
    players,
    activePlayerIndex: 0,
    phase: "Setup",
    turn: 1,
    firstPlayerIndex: null,
    skipFirstDraw: true,
    cardPlayedThisTurn: false,
    passPending: false,
    fieldSpell: null,
    beforeCombatQueue: [],
    beforeCombatProcessing: false,
    endOfTurnQueue: [],
    endOfTurnProcessing: false,
    endOfTurnFinalized: false,
    visualEffects: [],
    pendingTrapDecision: null,
    setup: {
      stage: "rolling",
      rolls: [null, null],
      winnerIndex: null,
    },
    deckSelection: {
      stage: "p1",
      selections: [null, null],
    },
    deckBuilder: {
      stage: "p1",
      selections: [[], []],
    },
    menu: {
      stage: "main",
      profile: null,
    },
    multiplayer: {
      mode: "local", // "local" | "online"
      lobbyId: null,
      isHost: false,
    },
    log: [],
    combat: {
      declaredAttacks: [],
    },
  };
};

export const getActivePlayer = (state) => state.players[state.activePlayerIndex];

export const getOpponentPlayer = (state) => state.players[(state.activePlayerIndex + 1) % 2];

export const getLocalPlayerIndex = (state) => {
  if (!isOnlineMode(state)) {
    return 0;
  }
  // In online mode, determine based on lobby and profile
  const profileId = state.menu?.profile?.id;
  const lobby = state.menu?.lobby;
  if (!profileId || !lobby) {
    return 0;
  }
  if (lobby.host_id === profileId) {
    return 0;
  }
  if (lobby.guest_id === profileId) {
    return 1;
  }
  return 0;
};

export const isLocalPlayersTurn = (state) =>
  !isOnlineMode(state) || state.activePlayerIndex === getLocalPlayerIndex(state);

export const isOnlineMode = (state) => state.menu?.mode === "online";

export const findCardByInstanceId = (state, instanceId) =>
  state.players
    .flatMap((player) => player.field.concat(player.hand, player.carrion, player.exile, player.traps))
    .find((card) => card?.instanceId === instanceId);

export const findCardSlotIndex = (state, instanceId) => {
  for (let playerIndex = 0; playerIndex < state.players.length; playerIndex++) {
    const player = state.players[playerIndex];
    
    // Check field
    const fieldIndex = player.field.findIndex(card => card?.instanceId === instanceId);
    if (fieldIndex !== -1) {
      return { ownerIndex: playerIndex, zone: 'field', slotIndex: fieldIndex };
    }
    
    // Check hand
    const handIndex = player.hand.findIndex(card => card?.instanceId === instanceId);
    if (handIndex !== -1) {
      return { ownerIndex: playerIndex, zone: 'hand', slotIndex: handIndex };
    }
    
    // Check carrion
    const carrionIndex = player.carrion.findIndex(card => card?.instanceId === instanceId);
    if (carrionIndex !== -1) {
      return { ownerIndex: playerIndex, zone: 'carrion', slotIndex: carrionIndex };
    }
    
    // Check exile
    const exileIndex = player.exile.findIndex(card => card?.instanceId === instanceId);
    if (exileIndex !== -1) {
      return { ownerIndex: playerIndex, zone: 'exile', slotIndex: exileIndex };
    }
    
    // Check traps
    const trapIndex = player.traps.findIndex(card => card?.instanceId === instanceId);
    if (trapIndex !== -1) {
      return { ownerIndex: playerIndex, zone: 'traps', slotIndex: trapIndex };
    }
  }
  
  return null;
};

export const logMessage = (state, message) => {
  if (!Array.isArray(state.log)) {
    state.log = [];
  }
  state.log.push({ message, timestamp: Date.now() });
};

export const queueVisualEffect = (state, effect) => {
  if (!Array.isArray(state.visualEffects)) {
    state.visualEffects = [];
  }
  state.visualEffects.push({ ...effect, id: Math.random().toString(36).substr(2, 9) });
};

export const drawCard = (state, playerIndex) => {
  const player = state.players[playerIndex];
  if (player.deck.length > 0) {
    const card = player.deck.shift();
    player.hand.push(card);
    return card;
  }
  return null;
};

export const initializeDeck = (state, playerIndex, deckCards) => {
  const player = state.players[playerIndex];
  player.deck = shuffle([...deckCards]);
  
  // Draw initial hand
  for (let i = 0; i < 5; i++) {
    drawCard(state, playerIndex);
  }
};

export const setPlayerDeck = (state, playerIndex, deck) => {
  const player = state.players[playerIndex];
  player.deck = shuffle([...deck]);
  player.hand = [];
  player.field = [null, null, null];
  player.carrion = [];
  player.exile = [];
  player.traps = [];
  if (state.fieldSpell?.ownerIndex === playerIndex) {
    state.fieldSpell = null;
  }
};

export const rollSetupDie = (state, playerIndex) => {
  if (!state.setup || state.setup.stage !== "rolling") {
    return null;
  }
  if (state.setup.rolls[playerIndex] !== null) {
    return state.setup.rolls[playerIndex];
  }
  const roll = Math.floor(Math.random() * 10) + 1;
  state.setup.rolls[playerIndex] = roll;
  logMessage(state, `${state.players[playerIndex].name} rolls a ${roll}.`);

  const [p1Roll, p2Roll] = state.setup.rolls;
  if (p1Roll !== null && p2Roll !== null) {
    if (p1Roll === p2Roll) {
      logMessage(state, "Tie! Reroll the dice to determine who chooses first.");
      state.setup.rolls = [null, null];
    } else {
      state.setup.winnerIndex = p1Roll > p2Roll ? 0 : 1;
      state.setup.stage = "choice";
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
  state.phase = "Start";
  state.cardPlayedThisTurn = false;
  state.passPending = false;
  state.setup.stage = "complete";
  logMessage(state, `${state.players[chosenIndex].name} will take the first turn.`);
};

export const resetCombat = (state) => {
  state.combat.declaredAttacks = [];
  state.players.forEach((player) => {
    player.field.forEach((card) => {
      if (card) {
        card.hasAttacked = false;
      }
    });
  });
};
