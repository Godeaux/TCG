import { describe, expect, it } from 'vitest';
import { createGameState } from '../js/state/gameState.js';
import { deckCatalogs, initializeCardRegistry } from '../js/cards/index.js';
import {
  PRACTICE_DOMAINS,
  resolvePracticeDeck,
  preparePracticeDecks,
} from '../js/game/practiceDecks.js';
initializeCardRegistry();

const fixture = (domain) =>
  [
    ['Predator', 6],
    ['Prey', 7],
    ['Spell', 4],
    ['Free Spell', 2],
    ['Trap', 1],
  ].flatMap(([type, n]) =>
    deckCatalogs[domain]
      .filter((c) => c.type === type)
      .slice(0, n)
      .map((c) => c.id)
  );
const stateWithDecks = () => {
  const state = createGameState();
  state.menu.decks = [
    { id: 'fish', name: 'Saved fish', deck: fixture('fish') },
    { id: 'frog', name: 'Saved frog', deck: fixture('amphibian') },
  ];
  return state;
};
describe('offline deck choices', () => {
  it.each(PRACTICE_DOMAINS)('creates a legal single-domain random %s deck', (domain) => {
    const deck = resolvePracticeDeck(stateWithDecks(), `domain:${domain}`);
    expect(deck.domain).toBe(domain);
    expect(deck.cards).toHaveLength(20);
    expect(new Set(deck.cards.map((c) => c.id)).size).toBe(20);
    expect(deck.cards.every((c) => deckCatalogs[domain].some((d) => d.id === c.id))).toBe(true);
    expect(deck.cards.filter((c) => c.type === 'Prey').length).toBeGreaterThan(
      deck.cards.filter((c) => c.type === 'Predator').length
    );
  });
  it.each(['ai', 'aiVsAi'])(
    'preserves exact saved cards for both seats through JSON recovery in %s',
    (mode) => {
      const state = stateWithDecks();
      state.menu.mode = mode;
      const recovered = JSON.parse(JSON.stringify(state));
      preparePracticeDecks(recovered, ['saved:fish', 'saved:frog']);
      expect(recovered.deckBuilder.selections.map((d) => d.map((c) => c.id))).toEqual(
        state.menu.decks.map((d) => d.deck)
      );
      expect(recovered.menu.decks).toEqual(state.menu.decks);
    }
  );
  it('rejects a missing second saved deck without modifying the first seat', () => {
    const state = stateWithDecks(),
      before = JSON.stringify(state);
    expect(() => preparePracticeDecks(state, ['saved:fish', 'saved:gone'])).toThrow('unavailable');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('rejects duplicate card IDs rather than silently randomizing', () => {
    const state = stateWithDecks();
    state.menu.decks[0].deck.fill(state.menu.decks[0].deck[0]);
    expect(() => resolvePracticeDeck(state, 'saved:fish')).toThrow('20 different');
  });
  it('rejects mixed-domain saved cards', () => {
    const state = stateWithDecks();
    state.menu.decks[0].deck[0] = state.menu.decks[1].deck[0];
    expect(() => resolvePracticeDeck(state, 'saved:fish')).toThrow('one domain');
  });
  it('rejects illegal prey counts', () => {
    const state = stateWithDecks();
    state.menu.decks[0].deck = deckCatalogs.fish
      .filter((c) => c.type !== 'Prey')
      .slice(0, 20)
      .map((c) => c.id);
    expect(() => resolvePracticeDeck(state, 'saved:fish')).toThrow('more prey');
  });
  it('leaves the human builder empty while preparing the chosen AI deck', () => {
    const state = stateWithDecks();
    preparePracticeDecks(state, ['build', 'saved:frog']);
    expect(state.deckBuilder.selections[0]).toEqual([]);
    expect(state.deckBuilder.selections[1].map((c) => c.id)).toEqual(state.menu.decks[1].deck);
  });
});
