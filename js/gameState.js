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
      available: [[], []],
      catalogOrder: [[], []],
    },
    menu: {
      stage: "main",
      mode: null,
      profile: null,
      lobby: null,
      error: null,
      loading: false,
      lastLobbySyncAt: 0,
      lastLobbySyncBySender: {},
      onlineDecksReady: false,
      decks: [],
      multiplayerHydrated: false,
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
    combat: {
      declaredAttacks: [],
    },
  };
};

export const drawCard = (state, playerIndex) => {
  const player = state.players[playerIndex];
  if (player.deck.length === 0) {
    return null;
  }
  const card = player.deck.shift();
  player.hand.push({ ...card, instanceId: crypto.randomUUID() });
  return card;
};

export const logMessage = (state, message) => {
  state.log.unshift(message);
  if (state.log.length > 50) {
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

export const getActivePlayer = (state) => state.players[state.activePlayerIndex];

export const getOpponentPlayer = (state) =>
  state.players[(state.activePlayerIndex + 1) % 2];

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

export const rollSetupDie = (state, playerIndex) => {
  if (!state.setup || state.setup.stage !== "rolling") {
    console.warn(`Cannot roll - invalid setup state. Stage: ${state.setup?.stage}`);
    return null;
  }
  
  if (state.setup.rolls[playerIndex] !== null) {
    console.log(`Player ${playerIndex + 1} already rolled: ${state.setup.rolls[playerIndex]}`);
    return state.setup.rolls[playerIndex];
  }
  
  // Validate rolls array before proceeding
  const rollsAreValid = state.setup.rolls.every(roll => 
    roll === null || (typeof roll === 'number' && roll >= 1 && roll <= 10)
  );
  
  if (!rollsAreValid) {
    console.error("Invalid rolls array detected, resetting:", state.setup.rolls);
    state.setup.rolls = [null, null];
  }
  
  const roll = Math.floor(Math.random() * 10) + 1;
  state.setup.rolls[playerIndex] = roll;
  
  console.log(`${state.players[playerIndex].name} rolls a ${roll}.`);
  logMessage(state, `${state.players[playerIndex].name} rolls a ${roll}.`);

  const [p1Roll, p2Roll] = state.setup.rolls;
  if (p1Roll !== null && p2Roll !== null) {
    if (p1Roll === p2Roll) {
      console.log("Tie detected - rerolling");
      logMessage(state, "Tie! Reroll the dice to determine who chooses first.");
      state.setup.rolls = [null, null];
    } else {
      state.setup.winnerIndex = p1Roll > p2Roll ? 0 : 1;
      state.setup.stage = "choice";
      console.log(`${state.players[state.setup.winnerIndex].name} wins the roll`);
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
