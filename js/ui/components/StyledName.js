/**
 * StyledName Component
 *
 * Renders player names with customizable effects, fonts, and colors.
 * Used in the top bar player badges and profile preview.
 */

// Effect configurations
export const NAME_EFFECTS = {
  wave: { label: 'Wave', description: 'Letters animate up and down' },
  glow: { label: 'Glow', description: 'Pulsing shadow effect' },
  rainbow: { label: 'Rainbow', description: 'Shimmer gradient' },
  pulse: { label: 'Pulse', description: 'Gentle size breathing' },
  shadow: { label: 'Shadow', description: 'Drop shadow' },
};

// Font configurations
export const NAME_FONTS = {
  bebas: { label: 'Bebas Neue', family: "'Bebas Neue', sans-serif" },
  orbitron: { label: 'Orbitron', family: "'Orbitron', sans-serif" },
  cinzel: { label: 'Cinzel', family: "'Cinzel', serif" },
  righteous: { label: 'Righteous', family: "'Righteous', cursive" },
  russo: { label: 'Russo One', family: "'Russo One', sans-serif" },
};

// Color configurations
export const NAME_COLORS = {
  gold: { label: 'Gold', value: '#d4a853' },
  crimson: { label: 'Crimson', value: '#dc2626' },
  ocean: { label: 'Ocean', value: '#0891b2' },
  forest: { label: 'Forest', value: '#16a34a' },
  violet: { label: 'Violet', value: '#7c3aed' },
  sunset: { label: 'Sunset', value: '#ea580c' },
  ice: { label: 'Ice', value: '#67e8f9' },
  fire: { label: 'Fire', value: '#f97316' },
  neon: { label: 'Neon', value: '#22d3ee' },
  royal: { label: 'Royal', value: '#8b5cf6' },
  'gradient-rainbow': {
    label: 'Rainbow',
    value: 'linear-gradient(90deg, #ff6b6b, #feca57, #48dbfb, #ff9ff3, #ff6b6b)',
    isGradient: true,
  },
  'gradient-gold': {
    label: 'Gold Shine',
    value: 'linear-gradient(90deg, #d4a853, #f0d078, #d4a853)',
    isGradient: true,
  },
};

/**
 * Render a styled player name element
 * @param {string} name - Player name text
 * @param {Object} style - Style object { effect, font, color }
 * @returns {HTMLElement} Styled name container
 */
export const renderStyledName = (name, style = {}) => {
  const { effect, font, color } = style;
  const container = document.createElement('span');
  container.className = 'styled-player-name';

  // Apply font
  if (font && NAME_FONTS[font]) {
    container.style.fontFamily = NAME_FONTS[font].family;
  }

  // Apply color
  if (color && NAME_COLORS[color]) {
    const colorConfig = NAME_COLORS[color];
    if (colorConfig.isGradient) {
      container.style.background = colorConfig.value;
      container.style.backgroundClip = 'text';
      container.style.webkitBackgroundClip = 'text';
      container.style.color = 'transparent';
      container.classList.add('name-gradient');
    } else {
      container.style.color = colorConfig.value;
    }
  }

  // Handle wave effect (needs per-letter spans)
  if (effect === 'wave') {
    name.split('').forEach((char, i) => {
      const charSpan = document.createElement('span');
      charSpan.className = 'name-wave-char';
      charSpan.textContent = char === ' ' ? '\u00A0' : char;
      charSpan.style.animationDelay = `${i * 0.08}s`;
      container.appendChild(charSpan);
    });
    container.classList.add('name-effect-wave');
  } else {
    container.textContent = name;
    // Apply other effects via CSS class
    if (effect && NAME_EFFECTS[effect]) {
      container.classList.add(`name-effect-${effect}`);
    }
  }

  return container;
};

/**
 * Apply styled name content to an existing element
 * Clears the element and applies the styled name
 * @param {HTMLElement} nameEl - Target element
 * @param {string} name - Player name text
 * @param {Object} style - Style object { effect, font, color }
 */
export const applyStyledName = (nameEl, name, style = {}) => {
  if (!nameEl) return;

  // Clear existing content and reset classes/styles
  nameEl.innerHTML = '';

  // Remove any previous effect classes
  nameEl.classList.remove(
    'name-effect-wave',
    'name-effect-glow',
    'name-effect-rainbow',
    'name-effect-pulse',
    'name-effect-shadow',
    'name-gradient'
  );

  // Reset inline styles that might have been set
  nameEl.style.fontFamily = '';
  nameEl.style.color = '';
  nameEl.style.background = '';
  nameEl.style.backgroundClip = '';
  nameEl.style.webkitBackgroundClip = '';

  const { effect, font, color } = style;

  // Apply font
  if (font && NAME_FONTS[font]) {
    nameEl.style.fontFamily = NAME_FONTS[font].family;
  }

  // Apply color
  if (color && NAME_COLORS[color]) {
    const colorConfig = NAME_COLORS[color];
    if (colorConfig.isGradient) {
      nameEl.style.background = colorConfig.value;
      nameEl.style.backgroundClip = 'text';
      nameEl.style.webkitBackgroundClip = 'text';
      nameEl.style.color = 'transparent';
      nameEl.classList.add('name-gradient');
    } else {
      nameEl.style.color = colorConfig.value;
    }
  }

  // Handle wave effect (needs per-letter spans)
  if (effect === 'wave') {
    name.split('').forEach((char, i) => {
      const charSpan = document.createElement('span');
      charSpan.className = 'name-wave-char';
      charSpan.textContent = char === ' ' ? '\u00A0' : char;
      charSpan.style.animationDelay = `${i * 0.08}s`;
      nameEl.appendChild(charSpan);
    });
    nameEl.classList.add('name-effect-wave');
  } else {
    nameEl.textContent = name;
    // Apply other effects via CSS class
    if (effect && NAME_EFFECTS[effect]) {
      nameEl.classList.add(`name-effect-${effect}`);
    }
  }
};

/**
 * Get a preview swatch element for a color
 * @param {string} colorKey - Color key from NAME_COLORS
 * @returns {HTMLElement} Swatch element
 */
export const renderColorSwatch = (colorKey) => {
  const swatch = document.createElement('div');
  swatch.className = 'style-color-swatch';

  if (colorKey && NAME_COLORS[colorKey]) {
    swatch.style.background = NAME_COLORS[colorKey].value;
    swatch.title = NAME_COLORS[colorKey].label;
  } else {
    swatch.style.background = '#f5f5f5';
    swatch.title = 'Default';
  }

  return swatch;
};
