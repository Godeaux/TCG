/**
 * Emote Registry
 *
 * Defines available emotes for multiplayer quick chat.
 */

export const EMOTES = {
  hello: { id: 'hello', label: 'Hello', emoji: '👋' },
  wellPlayed: { id: 'wellPlayed', label: 'Well Played', emoji: '👏' },
  thanks: { id: 'thanks', label: 'Thanks', emoji: '🙏' },
  oops: { id: 'oops', label: 'Oops', emoji: '😅' },
  threaten: { id: 'threaten', label: 'Threaten', emoji: '😈' },
};

/**
 * Get an emote definition by ID
 * @param {string} id - Emote ID
 * @returns {Object|null} Emote definition or null if not found
 */
export const getEmoteById = (id) => EMOTES[id] || null;

/**
 * Get all emote IDs
 * @returns {string[]} Array of emote IDs
 */
export const getEmoteIds = () => Object.keys(EMOTES);

/**
 * Get all emotes as an array
 * @returns {Object[]} Array of emote definitions
 */
export const getAllEmotes = () => Object.values(EMOTES);
