// Sound manager for multiplayer games
// Only plays sounds when in online mode

import { isOnlineMode } from '../state/selectors.js';

// Sound registry - maps sound names to file paths
const SOUNDS = {
  turnEnd: 'audio/turn-end.wav',
  cardDraw: 'audio/card-draw.wav',
};

// LocalStorage key for volume
const VOLUME_KEY = 'foodchain_sound_volume';

// Cached Audio objects
const audioCache = {};

// State getter function (set by init)
let getState = null;

// Volume level (0-1)
let volume = loadVolume();

// Load volume from localStorage
function loadVolume() {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored !== null) {
      const val = parseFloat(stored);
      if (!isNaN(val) && val >= 0 && val <= 1) {
        return val;
      }
    }
  } catch {
    // localStorage not available
  }
  return 0.5; // default volume
}

// Save volume to localStorage
function saveVolume(val) {
  try {
    localStorage.setItem(VOLUME_KEY, String(val));
  } catch {
    // localStorage not available
  }
}

// Preload sounds into cache
const preloadSounds = () => {
  Object.entries(SOUNDS).forEach(([name, path]) => {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audioCache[name] = audio;
  });
};

export const SoundManager = {
  init(stateGetter) {
    getState = stateGetter;
    preloadSounds();
  },

  play(soundName) {
    // Only play sounds in online multiplayer mode
    if (!getState || !isOnlineMode(getState())) {
      return;
    }

    // Skip if volume is 0
    if (volume === 0) {
      return;
    }

    const audio = audioCache[soundName];
    if (!audio) {
      console.warn(`[SoundManager] Unknown sound: ${soundName}`);
      return;
    }

    // Clone the audio for overlapping sounds
    const sound = audio.cloneNode();
    sound.volume = volume;
    sound.play().catch((err) => {
      // Ignore autoplay errors (browser policy)
      if (err.name !== 'NotAllowedError') {
        console.warn(`[SoundManager] Failed to play ${soundName}:`, err);
      }
    });
  },

  getVolume() {
    return volume;
  },

  setVolume(val) {
    volume = Math.max(0, Math.min(1, val));
    saveVolume(volume);
  },
};
