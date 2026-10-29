/** Shared offline deck resolution. Choice IDs survive JSON snapshots and rematches. */
import { deckCatalogs } from '../cards/index.js';

export const PRACTICE_DOMAINS = ['fish', 'bird', 'mammal', 'reptile', 'amphibian'];
const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Same composition as the existing deck-builder Random action.
export const buildRandomDeck = ({ available, selected, catalogOrder }) => {
  available.push(...selected.splice(0, selected.length));
  available.sort((a, b) => catalogOrder.indexOf(a.id) - catalogOrder.indexOf(b.id));
  for (const [type, count] of [
    ['Predator', 6],
    ['Prey', 7],
    ['Spell', 4],
    ['Free Spell', 2],
    ['Trap', 1],
  ]) {
    const picks = shuffle(available.filter((card) => card.type === type)).slice(0, count);
    for (const card of picks) {
      available.splice(
        available.findIndex((entry) => entry.id === card.id),
        1
      );
      selected.push(card);
    }
  }
};

export const resolvePracticeDeck = (state, choice = 'random') => {
  if (choice === 'build') return null;
  let domain, selected;
  if (choice.startsWith('saved:')) {
    const saved = state.menu?.decks?.find((deck) => String(deck.id) === choice.slice(6));
    if (!saved || !Array.isArray(saved.deck))
      throw new Error('That saved deck is unavailable. Choose another deck.');
    domain = PRACTICE_DOMAINS.find((id) =>
      saved.deck.every((cardId) => deckCatalogs[id].some((card) => card.id === cardId))
    );
    if (!domain || saved.deck.length !== 20 || new Set(saved.deck).size !== 20)
      throw new Error('Saved decks must contain 20 different cards from one domain.');
    selected = saved.deck.map((id) => ({ ...deckCatalogs[domain].find((card) => card.id === id) }));
  } else {
    domain =
      choice === 'random'
        ? PRACTICE_DOMAINS[Math.floor(Math.random() * PRACTICE_DOMAINS.length)]
        : choice.replace(/^domain:/, '');
    if (!PRACTICE_DOMAINS.includes(domain)) throw new Error('Choose a valid deck domain.');
    selected = [];
    buildRandomDeck({
      available: deckCatalogs[domain].map((card) => ({ ...card })),
      selected,
      catalogOrder: deckCatalogs[domain].map((card) => card.id),
    });
  }
  if (
    selected.length !== 20 ||
    selected.filter((card) => card.type === 'Prey').length <=
      selected.filter((card) => card.type === 'Predator').length
  ) {
    throw new Error('Choose a 20-card deck with more prey than predators.');
  }
  return { domain, cards: selected };
};

export const installPracticeDeck = (state, playerIndex, resolved) => {
  if (!resolved) return;
  const catalog = deckCatalogs[resolved.domain];
  state.deckSelection.selections[playerIndex] = resolved.domain;
  state.deckBuilder.selections[playerIndex] = resolved.cards;
  state.deckBuilder.available[playerIndex] = catalog
    .filter((card) => !resolved.cards.some((picked) => picked.id === card.id))
    .map((card) => ({ ...card }));
  state.deckBuilder.catalogOrder[playerIndex] = catalog.map((card) => card.id);
};

export const preparePracticeDecks = (state, choices) => {
  // Resolve both before changing either seat; an unavailable saved deck cannot
  // partially replace the other player's deck.
  const resolved = choices.map((choice) => resolvePracticeDeck(state, choice));
  resolved.forEach((deck, index) => installPracticeDeck(state, index, deck));
  return state.deckBuilder.selections;
};
