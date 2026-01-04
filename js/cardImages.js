/**
 * Card Image Mapping System
 * 
 * This file manages the association between cards and their image files.
 * 
 * Image Naming Convention:
 * - Use the card ID (e.g., "f_py1") as the filename
 * - Supported formats: .jpg, .jpeg, .png, .webp
 * - Example: f_py1.jpg, b_m1.png, r_a1.webp
 * 
 * Folder Structure:
 * images/
 * ├── cards/
 * │   ├── f_py1.jpg     # Fish cards
 * │   ├── b_m1.jpg      # Bird cards  
 * │   ├── m_r1.jpg      # Mammal cards
 * │   ├── r_s1.jpg      # Reptile cards
 * │   └── a_f1.jpg      # Amphibian cards
 */

// Card image mapping - you can add custom mappings here if needed
const CARD_IMAGE_MAP = {
  // Example custom mappings (optional):
  // "f_py1": "great_white_shark.jpg",  // Custom filename
  // "b_m1": "eagle.jpg",               // Custom filename
  
  // By default, we'll use card ID + .jpg extension
};

// Image cache to prevent re-loading
const IMAGE_CACHE = new Map();

/**
 * Get the image path for a card
 * @param {string} cardId - The card ID (e.g., "f_py1")
 * @param {string} preferredFormat - Preferred image format (default: "jpg")
 * @returns {string|null} - Image path or null if no image
 */
export function getCardImagePath(cardId, preferredFormat = "jpg") {
  // Check for custom mapping first
  if (CARD_IMAGE_MAP[cardId]) {
    return `images/cards/${CARD_IMAGE_MAP[cardId]}`;
  }
  
  // Default to card ID + format
  return `images/cards/${cardId}.${preferredFormat}`;
}

/**
 * Check if a card has an associated image
 * @param {string} cardId - The card ID
 * @returns {boolean} - True if image exists
 */
export function hasCardImage(cardId) {
  const path = getCardImagePath(cardId);
  // In a real implementation, you might want to check if the file exists
  // For now, we'll assume the image exists if the path is constructed
  return path !== null;
}

/**
 * Get all available image formats for a card
 * @param {string} cardId - The card ID
 * @returns {string[]} - Array of available formats
 */
export function getCardImageFormats(cardId) {
  const formats = ["jpg", "jpeg", "png", "webp"];
  return formats.filter(format => {
    const path = `images/cards/${cardId}.${format}`;
    // In a real implementation, you'd check if the file exists
    // For now, return all possible formats
    return true;
  });
}

/**
 * Fallback image for cards without custom art
 */
export const FALLBACK_CARD_IMAGE = "images/cards/fallback.jpg";

/**
 * Preload card images for better performance
 * @param {string[]} cardIds - Array of card IDs to preload
 */
export function preloadCardImages(cardIds) {
  cardIds.forEach(cardId => {
    if (!IMAGE_CACHE.has(cardId)) {
      const img = new Image();
      const path = getCardImagePath(cardId);
      
      img.onload = () => {
        IMAGE_CACHE.set(cardId, img);
      };
      
      img.onerror = () => {
        // Mark as failed to prevent repeated attempts
        IMAGE_CACHE.set(cardId, null);
      };
      
      img.src = path;
    }
  });
}

/**
 * Get cached image for a card
 * @param {string} cardId - The card ID
 * @returns {HTMLImageElement|null} - Cached image or null if not loaded/failed
 */
export function getCachedCardImage(cardId) {
  return IMAGE_CACHE.get(cardId) || null;
}

/**
 * Check if image is already cached
 * @param {string} cardId - The card ID
 * @returns {boolean} - True if image is cached
 */
export function isCardImageCached(cardId) {
  return IMAGE_CACHE.has(cardId);
}
