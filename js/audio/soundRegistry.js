// Sound Registry — maps card IDs and game events to sound file paths
// Card-specific sounds are loaded on-demand and cached, not preloaded

// Built-in game event sounds (always preloaded)
export const EVENT_SOUNDS = {
  // UI
  turnEnd: 'audio/turn-end.wav',
  cardDraw: 'audio/card-draw.wav',

  // Combat
  attackWhoosh: 'audio/attack-whoosh.wav',
  impactMedium: 'audio/impact-medium.wav',
  impactHeavy: 'audio/impact-heavy.wav',
  creatureDeath: 'audio/creature-death.wav',

  // Card play
  cardSlam: 'audio/card-slam.wav',
  cardSlamHeavy: 'audio/card-slam-heavy.wav',

  // Consumption
  consumptionCrunch: 'audio/consumption-crunch.wav',
};

// Card sound mappings — card ID → { event: filename }
// Sounds are expected at: audio/cards/{cardId}/{event}.wav
// e.g. audio/cards/apex-shark/onPlay.wav
//
// To register card sounds, add entries here:
//   'apex-shark': { onPlay: 'roar.wav', onDeath: 'splash.wav' }
//
// Or use SoundRegistry.registerCard() at runtime.
const cardSounds = {};

// On-demand audio cache for card sounds
const cardAudioCache = {};

function getCardSoundPath(cardId, event) {
  const entry = cardSounds[cardId];
  if (!entry || !entry[event]) return null;
  return `audio/cards/${cardId}/${entry[event]}`;
}

function loadAudio(path) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.addEventListener('canplaythrough', () => resolve(audio), { once: true });
    audio.addEventListener('error', () => reject(new Error(`Failed to load: ${path}`)), { once: true });
  });
}

export const SoundRegistry = {
  // Register sounds for a card
  // usage: SoundRegistry.registerCard('apex-shark', { onPlay: 'roar.wav', onDeath: 'splash.wav' })
  registerCard(cardId, events) {
    cardSounds[cardId] = { ...cardSounds[cardId], ...events };
  },

  // Bulk register from a config object: { 'card-id': { onPlay: 'file.wav' }, ... }
  registerCards(config) {
    for (const [cardId, events] of Object.entries(config)) {
      this.registerCard(cardId, events);
    }
  },

  // Check if a card has a sound for a given event
  hasCardSound(cardId, event) {
    return !!getCardSoundPath(cardId, event);
  },

  // Get a cached Audio element for a card sound, loading on-demand if needed.
  // Returns null if no sound is registered for this card+event.
  async getCardAudio(cardId, event) {
    const path = getCardSoundPath(cardId, event);
    if (!path) return null;

    if (cardAudioCache[path]) return cardAudioCache[path];

    try {
      const audio = await loadAudio(path);
      cardAudioCache[path] = audio;
      return audio;
    } catch {
      // Sound file missing — don't retry
      cardSounds[cardId][event] = null;
      return null;
    }
  },

  // Preload card sounds for a list of card IDs (e.g. at match start for the deck)
  async preloadForDeck(cardIds) {
    const events = ['onPlay', 'onDeath', 'onAttack'];
    const loads = [];
    for (const cardId of cardIds) {
      for (const event of events) {
        if (this.hasCardSound(cardId, event)) {
          loads.push(this.getCardAudio(cardId, event));
        }
      }
    }
    await Promise.allSettled(loads);
  },

  // Get all registered card IDs
  getRegisteredCards() {
    return Object.keys(cardSounds);
  },

  // Clear cache (for memory management)
  clearCache() {
    for (const key of Object.keys(cardAudioCache)) {
      delete cardAudioCache[key];
    }
  },
};
