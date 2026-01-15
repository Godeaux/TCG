/**
 * Presence Manager Module
 *
 * Handles real-time online status tracking using Supabase Presence.
 * Tracks which users are online and notifies subscribers of status changes.
 */

import { supabase } from "./supabaseClient.js";

// ============================================================================
// STATE
// ============================================================================

let presenceChannel = null;
let currentProfileId = null;
let onlineStatusCallbacks = new Set();

// ============================================================================
// PRESENCE MANAGEMENT
// ============================================================================

/**
 * Initialize presence tracking for logged-in user
 * @param {string} profileId - Current user's profile ID
 */
export const initializePresence = async (profileId) => {
  if (!profileId) {
    return;
  }

  // Clean up existing channel if any
  if (presenceChannel) {
    await cleanupPresence();
  }

  currentProfileId = profileId;

  presenceChannel = supabase.channel("online-users", {
    config: {
      presence: {
        key: profileId,
      },
    },
  });

  presenceChannel
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      notifyStatusChange(state);
    })
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      const state = presenceChannel.presenceState();
      notifyStatusChange(state);
    })
    .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      const state = presenceChannel.presenceState();
      notifyStatusChange(state);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          profile_id: profileId,
          online_at: new Date().toISOString(),
        });
      }
    });
};

/**
 * Get list of online profile IDs
 * @returns {Set<string>} Set of online profile IDs
 */
export const getOnlineUsers = () => {
  if (!presenceChannel) return new Set();
  const state = presenceChannel.presenceState();
  return new Set(Object.keys(state));
};

/**
 * Check if a specific user is online
 * @param {string} profileId - Profile ID to check
 * @returns {boolean} True if online
 */
export const isUserOnline = (profileId) => {
  return getOnlineUsers().has(profileId);
};

/**
 * Subscribe to online status changes
 * @param {Function} callback - Called with Set<profileId> of online users
 * @returns {Function} Unsubscribe function
 */
export const subscribeToOnlineStatus = (callback) => {
  onlineStatusCallbacks.add(callback);
  // Immediately call with current state
  callback(getOnlineUsers());
  return () => onlineStatusCallbacks.delete(callback);
};

/**
 * Cleanup presence channel (call on logout)
 */
export const cleanupPresence = async () => {
  if (presenceChannel) {
    try {
      await presenceChannel.untrack();
    } catch (e) {
      // Ignore untrack errors
    }
    supabase.removeChannel(presenceChannel);
    presenceChannel = null;
    currentProfileId = null;
  }
};

/**
 * Reset all presence state (for use during login/logout)
 * This ensures a clean slate when switching accounts
 */
export const resetPresenceState = async () => {
  await cleanupPresence();
  onlineStatusCallbacks.clear();
};

/**
 * Get the current user's profile ID
 * @returns {string|null} Current profile ID or null
 */
export const getCurrentPresenceProfileId = () => currentProfileId;

// ============================================================================
// INTERNAL
// ============================================================================

/**
 * Notify all subscribers of online status change
 * @param {Object} state - Presence state object
 */
const notifyStatusChange = (state) => {
  const onlineIds = new Set(Object.keys(state));
  onlineStatusCallbacks.forEach((cb) => {
    try {
      cb(onlineIds);
    } catch (e) {
      console.error("Error in online status callback:", e);
    }
  });
};
