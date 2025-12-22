import { cardCatalog } from "./cards.js";

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
  const catalogOrder = cardCatalog.map((card) => card.id);
  const catalogCopies = [
    cardCatalog.map((card) => ({ ...card })),
    cardCatalog.map((card) => ({ ...card })),
  ];
  return {
    players,
    activePlayerIndex: 0,
    phase: "Setup",
    turn: 1,
    firstPlayerIndex: null,
    skipFirstDraw: true,
    cardPlayedThisTurn: false,
    passPending: false,
    setup: {
      stage: "rolling",
      rolls: [null, null],
      winnerIndex: null,
    },
    deckBuilder: {
      stage: "p1",
      selections: [[], []],
      available: catalogCopies,
      catalogOrder,
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

export const setPlayerDeck = (state, playerIndex, deck) => {
  const player = state.players[playerIndex];
  player.deck = shuffle([...deck]);
  player.hand = [];
  player.field = [null, null, null];
  player.carrion = [];
  player.exile = [];
  player.traps = [];
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
