// Audio Channels — layered playback with per-category volume control
// Categories: music, sfx, voice
// Each channel has independent volume, mute state, and localStorage persistence

const STORAGE_PREFIX = 'foodchain_vol_';
const MASTER_KEY = 'foodchain_sound_volume';

function loadStored(key, fallback) {
  try {
    const val = parseFloat(localStorage.getItem(key));
    if (!isNaN(val) && val >= 0 && val <= 1) return val;
  } catch { /* noop */ }
  return fallback;
}

function saveStored(key, val) {
  try { localStorage.setItem(key, String(val)); } catch { /* noop */ }
}

// Channel definition
function createChannel(name, defaultVol) {
  return {
    name,
    volume: loadStored(STORAGE_PREFIX + name, defaultVol),
    muted: false,
  };
}

const channels = {
  music: createChannel('music', 0.4),
  sfx: createChannel('sfx', 0.8),
  voice: createChannel('voice', 0.7),
};

let masterVolume = loadStored(MASTER_KEY, 0.5);

// Compute effective volume for a channel
function effectiveVolume(channelName) {
  const ch = channels[channelName];
  if (!ch || ch.muted) return 0;
  return masterVolume * ch.volume;
}

export const AudioChannels = {
  // Get the effective volume for a channel (master * channel)
  getVolume(channelName) {
    return effectiveVolume(channelName);
  },

  // Set per-channel volume (0-1)
  setChannelVolume(channelName, val) {
    const ch = channels[channelName];
    if (!ch) return;
    ch.volume = Math.max(0, Math.min(1, val));
    saveStored(STORAGE_PREFIX + channelName, ch.volume);
  },

  getChannelVolume(channelName) {
    const ch = channels[channelName];
    return ch ? ch.volume : 0;
  },

  // Mute/unmute a channel
  setMuted(channelName, muted) {
    const ch = channels[channelName];
    if (ch) ch.muted = muted;
  },

  isMuted(channelName) {
    const ch = channels[channelName];
    return ch ? ch.muted : true;
  },

  // Master volume (0-1)
  getMasterVolume() {
    return masterVolume;
  },

  setMasterVolume(val) {
    masterVolume = Math.max(0, Math.min(1, val));
    saveStored(MASTER_KEY, masterVolume);
  },

  // Get all channel names
  getChannelNames() {
    return Object.keys(channels);
  },
};
