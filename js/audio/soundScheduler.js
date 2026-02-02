// Sound Scheduler — priority-based throttling for simultaneous sounds
// Prevents audio overload when many game events fire at once

// Priority levels (higher = more important, always plays)
export const SoundPriority = {
  LOW: 1, // ambient, background accents
  NORMAL: 2, // standard SFX (card draw, turn end)
  HIGH: 3, // combat impacts, card plays
  CRITICAL: 4, // player-initiated actions, voice lines
};

// Config
const MAX_CONCURRENT = 4; // max simultaneous sounds
const THROTTLE_WINDOW_MS = 80; // min ms between same sound
const CLEANUP_INTERVAL_MS = 500;

// Active sound tracking
const activeSounds = []; // { audio, priority, startTime, id }
const lastPlayTime = {}; // soundId → timestamp

let cleanupTimer = null;

function now() {
  return performance.now();
}

function cleanup() {
  const current = now();
  for (let i = activeSounds.length - 1; i >= 0; i--) {
    const s = activeSounds[i];
    if (s.audio.ended || s.audio.paused || current - s.startTime > 10000) {
      activeSounds.splice(i, 1);
    }
  }
}

function startCleanup() {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  }
}

export const SoundScheduler = {
  // Attempt to schedule a sound. Returns true if it will play.
  // audio: Audio element (already cloned with volume set)
  // options: { id, priority }
  schedule(audio, { id = 'unknown', priority = SoundPriority.NORMAL } = {}) {
    startCleanup();
    const t = now();

    // Throttle: skip if same sound played very recently
    if (lastPlayTime[id] && t - lastPlayTime[id] < THROTTLE_WINDOW_MS) {
      return false;
    }

    // If at max concurrent, only allow if higher priority than lowest active
    cleanup();
    if (activeSounds.length >= MAX_CONCURRENT) {
      if (priority <= SoundPriority.LOW) return false;

      // Find lowest-priority active sound
      let lowestIdx = 0;
      for (let i = 1; i < activeSounds.length; i++) {
        if (activeSounds[i].priority < activeSounds[lowestIdx].priority) {
          lowestIdx = i;
        }
      }

      if (priority <= activeSounds[lowestIdx].priority) {
        return false; // not important enough
      }

      // Evict lowest priority sound
      const evicted = activeSounds[lowestIdx];
      evicted.audio.pause();
      activeSounds.splice(lowestIdx, 1);
    }

    lastPlayTime[id] = t;
    activeSounds.push({ audio, priority, startTime: t, id });
    return true;
  },

  // Stop all active sounds (e.g. scene transition)
  stopAll() {
    for (const s of activeSounds) {
      s.audio.pause();
    }
    activeSounds.length = 0;
  },

  // Get current active count (for debugging)
  getActiveCount() {
    cleanup();
    return activeSounds.length;
  },

  dispose() {
    this.stopAll();
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  },
};
