/**
 * Game History Logging System
 * Provides categorized logging with emojis for all game actions.
 */

export const LOG_CATEGORIES = {
  COMBAT: { name: "combat", emoji: "\u2694\uFE0F" },    // ⚔️
  DEATH: { name: "death", emoji: "\uD83D\uDC80" },      // 💀
  SUMMON: { name: "summon", emoji: "\u2728" },          // ✨
  SPELL: { name: "spell", emoji: "\uD83D\uDCDC" },      // 📜
  BUFF: { name: "buff", emoji: "\uD83D\uDCAA" },        // 💪
  DEBUFF: { name: "debuff", emoji: "\uD83D\uDC94" },    // 💔
  HEAL: { name: "heal", emoji: "\uD83D\uDC9A" },        // 💚
  DAMAGE: { name: "damage", emoji: "\uD83D\uDD25" },    // 🔥
  PHASE: { name: "phase", emoji: "\uD83D\uDD04" },      // 🔄
  CHOICE: { name: "choice", emoji: "\uD83C\uDFAF" },    // 🎯
};

export const KEYWORD_EMOJIS = {
  Haste: "\u26A1",           // ⚡
  "Free Play": "\uD83C\uDD93", // 🆓
  Hidden: "\uD83D\uDE48",    // 🙈
  Lure: "\uD83E\uDDF2",      // 🧲
  Invisible: "\uD83D\uDC7B", // 👻
  Passive: "\uD83D\uDCA4",   // 💤
  Barrier: "\uD83D\uDEE1\uFE0F", // 🛡️
  Acuity: "\uD83D\uDC41\uFE0F",  // 👁️
  Immune: "\uD83C\uDFDB\uFE0F",  // 🏛️
  Edible: "\uD83C\uDF56",    // 🍖
  Scavenge: "\uD83E\uDDB4",  // 🦴
  Neurotoxic: "\uD83E\uDDCA", // 🧊
  Ambush: "\uD83D\uDC0D",    // 🐍
  Toxic: "\u2620\uFE0F",     // ☠️
  Poisonous: "\uD83E\uDDEA", // 🧪
  Harmless: "\uD83D\uDD4A\uFE0F", // 🕊️
  Frozen: "\u2744\uFE0F",    // ❄️
};

/**
 * Format a keyword with its emoji
 * @param {string} keyword - The keyword name
 * @returns {string} Keyword with emoji prefix
 */
export const formatKeyword = (keyword) => {
  const emoji = KEYWORD_EMOJIS[keyword];
  return emoji ? `${emoji} ${keyword}` : keyword;
};

/**
 * Format a list of keywords with their emojis
 * @param {string[]} keywords - Array of keyword names
 * @returns {string} Comma-separated keywords with emojis
 */
export const formatKeywordList = (keywords) => {
  if (!keywords || keywords.length === 0) {
    return "";
  }
  return keywords.map(formatKeyword).join(", ");
};

/**
 * Get the emoji for a keyword
 * @param {string} keyword - The keyword name
 * @returns {string} The emoji or empty string
 */
export const getKeywordEmoji = (keyword) => {
  return KEYWORD_EMOJIS[keyword] || "";
};

/**
 * Log a game action with category
 * @param {object} state - Game state
 * @param {object} category - Category from LOG_CATEGORIES
 * @param {string} message - The message to log
 */
export const logGameAction = (state, category, message) => {
  const formattedMessage = `${category.emoji} ${message}`;
  state.log.unshift(formattedMessage);
  if (state.log.length > 50) {
    state.log.pop();
  }
};

/**
 * Log a plain message without category (for phase separators, etc.)
 * @param {object} state - Game state
 * @param {string} message - The message to log
 */
export const logPlainMessage = (state, message) => {
  state.log.unshift(message);
  if (state.log.length > 50) {
    state.log.pop();
  }
};
