import { describe, expect, it } from 'vitest';
import {
  profileAppearance,
  withProfileAppearance,
  collectionOwnership,
  filterCollection,
} from '../js/ui/playerExperienceModel.js';
const ids = new Set(['fish-predator-orca', 'fish-prey-black-mullet', 'amphibian-prey-axolotl']);
describe('profile appearance persistence', () => {
  it('round trips all three independent art choices without erasing name styling', () => {
    const old = { color: 'gold', effect: 'wave', font: 'cinzel' };
    const art = {
      favoriteArt: 'fish-prey-black-mullet',
      bannerArt: 'fish-predator-orca',
      avatarArt: 'amphibian-prey-axolotl',
    };
    const saved = JSON.parse(JSON.stringify(withProfileAppearance(old, art, ids)));
    expect(profileAppearance(saved, ids)).toEqual(art);
    expect(saved).toMatchObject(old);
    expect(old).not.toHaveProperty('appearance');
  });
  it('keeps old profiles compatible and rejects unsafe / nonexistent artwork', () => {
    expect(profileAppearance({ color: 'gold' }, ids)).toEqual({
      favoriteArt: 'fish-predator-orca',
      bannerArt: 'fish-predator-orca',
      avatarArt: 'fish-predator-orca',
    });
    expect(() =>
      withProfileAppearance(
        {},
        {
          favoriteArt: '../../private',
          bannerArt: 'fish-predator-orca',
          avatarArt: 'amphibian-prey-axolotl',
        },
        ids
      )
    ).toThrow();
    expect(
      profileAppearance(
        { appearance: { avatarArt: 'https://external/x', favoriteArt: 'unknown-card' } },
        ids
      ).avatarArt
    ).toBe('fish-predator-orca');
  });
  it('uses favorite art as fallback while preserving explicit banner and avatar', () => {
    expect(
      profileAppearance(
        { appearance: { favoriteArt: 'amphibian-prey-axolotl', avatarArt: 'fish-predator-orca' } },
        ids
      )
    ).toEqual({
      favoriteArt: 'amphibian-prey-axolotl',
      bannerArt: 'amphibian-prey-axolotl',
      avatarArt: 'fish-predator-orca',
    });
  });
});
describe('collection navigation', () => {
  const cards = [
    { id: 'fish-prey-black-mullet', name: 'Black Mullet', type: 'Prey', keywords: ['Ambush'] },
    { id: 'amphibian-prey-axolotl', name: 'Axolotl', type: 'Prey', effectText: 'Heal 4' },
    { id: 'fish-predator-orca', name: 'Orca', type: 'Predator' },
    { id: 'token-x', name: 'Token', isToken: true },
  ];
  const owned = new Map([
    ['fish-prey-black-mullet', 'rare'],
    ['amphibian-prey-axolotl', 'common'],
  ]);
  const base = { ownership: 'all', animal: 'all', rarity: 'all', sort: 'name', query: '' };
  it('combines ownership, animal, rarity and keyword search instead of replacing one filter with another', () => {
    expect(
      filterCollection(cards, owned, {
        ...base,
        ownership: 'owned',
        animal: 'fish',
        rarity: 'rare',
        query: 'AMBUSH',
      }).map((c) => c.id)
    ).toEqual(['fish-prey-black-mullet']);
    expect(filterCollection(cards, owned, { ...base, animal: 'fish', query: 'Heal' })).toEqual([]);
  });
  it('hides tokens, separates owned from playable catalog, searches effect text', () => {
    expect(filterCollection(cards, owned, base)).toHaveLength(3);
    expect(filterCollection(cards, owned, { ...base, ownership: 'owned' })).toHaveLength(2);
    expect(filterCollection(cards, owned, { ...base, query: 'heal' }).map((c) => c.name)).toEqual([
      'Axolotl',
    ]);
  });
  it('accepts API rows and JSON snapshot pairs without losing rarity', () => {
    expect(collectionOwnership(JSON.parse(JSON.stringify([...owned])))).toEqual(owned);
    expect(
      collectionOwnership([{ card_id: 'fish-prey-black-mullet', rarity: 'rare' }]).get(
        'fish-prey-black-mullet'
      )
    ).toBe('rare');
  });
});
