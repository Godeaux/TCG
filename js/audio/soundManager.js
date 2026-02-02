// Sound Manager — unified API for all game audio
// Delegates to AudioChannels (volume), SoundRegistry (card sounds),
// and SoundScheduler (priority/throttling)

import { EVENT_SOUNDS, SoundRegistry } from './soundRegistry.js';
import { AudioChannels } from './audioChannels.js';
import { SoundScheduler, SoundPriority } from './soundScheduler.js';

// Preloaded audio cache for event sounds (small set, always loaded)
const eventAudioCache = {};

// Which channel each sound category belongs to
const SOUND_CHANNELS = {
  // UI
  turnEnd: 'sfx',
  cardDraw: 'sfx',

  // Combat
  attackWhoosh: 'sfx',
  impactMedium: 'sfx',
  impactHeavy: 'sfx',
  creatureDeath: 'sfx',

  // Card play
  cardSlam: 'sfx',
  cardSlamHeavy: 'sfx',

  // Consumption
  consumptionCrunch: 'sfx',
};

// Default priority for known sounds
const SOUND_PRIORITIES = {
  attackWhoosh: SoundPriority.HIGH,
  impactMedium: SoundPriority.HIGH,
  impactHeavy: SoundPriority.HIGH,
  cardSlam: SoundPriority.HIGH,
  cardSlamHeavy: SoundPriority.HIGH,
  consumptionCrunch: SoundPriority.HIGH,
  creatureDeath: SoundPriority.NORMAL,
  cardDraw: SoundPriority.LOW,
  turnEnd: SoundPriority.NORMAL,
};

function preloadEventSounds() {
  for (const [name, path] of Object.entries(EVENT_SOUNDS)) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    eventAudioCache[name] = audio;
  }
}

function playAudioClone(source, volume, id, priority) {
  if (volume === 0) return;
  const sound = source.cloneNode();
  sound.volume = volume;

  const scheduled = SoundScheduler.schedule(sound, { id, priority });
  if (!scheduled) return;

  sound.play().catch((err) => {
    if (err.name !== 'NotAllowedError') {
      console.warn(`[SoundManager] Failed to play ${id}:`, err);
    }
  });
}

export const SoundManager = {
  init() {
    preloadEventSounds();
  },

  // Play a named event sound (backward-compatible API)
  play(soundName) {
    const channelName = SOUND_CHANNELS[soundName] || 'sfx';
    const vol = AudioChannels.getVolume(channelName);
    if (vol === 0) return;

    const audio = eventAudioCache[soundName];
    if (!audio) {
      console.warn(`[SoundManager] Unknown sound: ${soundName}`);
      return;
    }

    const priority = SOUND_PRIORITIES[soundName] || SoundPriority.NORMAL;
    playAudioClone(audio, vol, soundName, priority);
  },

  // Play a card-specific sound (on-demand loaded)
  // usage: SoundManager.playCard('apex-shark', 'onPlay')
  async playCard(cardId, event) {
    const vol = AudioChannels.getVolume('voice');
    if (vol === 0) return;

    const audio = await SoundRegistry.getCardAudio(cardId, event);
    if (!audio) return;

    playAudioClone(audio, vol, `${cardId}:${event}`, SoundPriority.CRITICAL);
  },

  // --- Volume API (backward-compatible) ---

  getVolume() {
    return AudioChannels.getMasterVolume();
  },

  setVolume(val) {
    AudioChannels.setMasterVolume(val);
  },

  // --- Per-channel volume API ---

  getChannelVolume(channel) {
    return AudioChannels.getChannelVolume(channel);
  },

  setChannelVolume(channel, val) {
    AudioChannels.setChannelVolume(channel, val);
  },

  getChannelNames() {
    return AudioChannels.getChannelNames();
  },

  // --- Card registry pass-through ---

  registerCardSounds(config) {
    SoundRegistry.registerCards(config);
  },

  preloadDeckSounds(cardIds) {
    return SoundRegistry.preloadForDeck(cardIds);
  },

  // --- Lifecycle ---

  stopAll() {
    SoundScheduler.stopAll();
  },

  dispose() {
    SoundScheduler.dispose();
    SoundRegistry.clearCache();
  },
};
