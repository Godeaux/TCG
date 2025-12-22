import { getStarterDeck } from "./cards.js";

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
  deck: shuffle(getStarterDeck()),
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
    setup: {
      stage: "rolling",
      rolls: [null, null],
      winnerIndex: null,
      needsReroll: false,
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

export const rollSetupDice = (state) => {
  if (!state.setup || state.setup.stage !== "rolling") {
    return null;
  }

  const p1Roll = Math.floor(Math.random() * 10) + 1;
  const p2Roll = Math.floor(Math.random() * 10) + 1;
  state.setup.rolls = [p1Roll, p2Roll];
  state.setup.needsReroll = false;
  logMessage(state, `${state.players[0].name} rolls a ${p1Roll}.`);
  logMessage(state, `${state.players[1].name} rolls a ${p2Roll}.`);

  if (p1Roll === p2Roll) {
    state.setup.needsReroll = true;
    logMessage(state, "Tie! Roll again to determine who chooses first.");
    return state.setup.rolls;
  }

  state.setup.winnerIndex = p1Roll > p2Roll ? 0 : 1;
  state.setup.stage = "choice";
  logMessage(
    state,
    `${state.players[state.setup.winnerIndex].name} wins the roll and chooses who goes first.`
  );
  return state.setup.rolls;
};

export const chooseFirstPlayer = (state, chosenIndex) => {
  state.activePlayerIndex = chosenIndex;
  state.firstPlayerIndex = chosenIndex;
  state.turn = 1;
  state.phase = "Start";
  state.cardPlayedThisTurn = false;
  state.passPending = false;
  state.setup.stage = "complete";
  state.setup.needsReroll = false;
  logMessage(state, `${state.players[chosenIndex].name} will take the first turn.`);
};
