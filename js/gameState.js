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
    phase: "Start",
    turn: 1,
    cardPlayedThisTurn: false,
    passPending: false,
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
