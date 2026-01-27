/**
 * Coin Flip Effect Module
 *
 * Handles the visual coin flip animation for determining who chooses first.
 * The result is predetermined - animation is purely visual with physics-like feel.
 *
 * Key Functions:
 * - playCoinFlip: Main entry point, plays full animation sequence
 * - initCoinFlipEffect: Initialize DOM references
 * - hideCoinFlip: Hide overlay immediately
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Timing (ms)
  launchDuration: 200,
  airborneDuration: 800,
  fallDuration: 600,
  bounceDuration: 400,
  settleDuration: 200,
  presentationDelay: 200, // pause before presenting
  presentationDuration: 400, // lift and face camera

  // Physics
  maxHeight: 180, // pixels
  baseSpinSpeed: 8, // full rotations during airborne
  bounceDecay: 0.5, // each bounce is this fraction of previous
  bounceCount: 3,

  // Presentation
  presentationLift: 60, // pixels to lift
  presentationTilt: 15, // degrees from camera-facing (slight tilt)
  presentationScale: 1.1, // slight scale up for emphasis

  // Randomization
  bounceVariation: 0.3, // +/- 30% variation in bounce timing/height
};

// ============================================================================
// MODULE STATE
// ============================================================================

let coinElement = null;
let overlayElement = null;
let resultElement = null;
let assignmentsElement = null;
let isAnimating = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the coin flip effect module.
 * Call once during app startup.
 */
export const initCoinFlipEffect = () => {
  overlayElement = document.getElementById('coin-flip-overlay');
  coinElement = document.getElementById('coin-flip-coin');
  resultElement = document.getElementById('coin-flip-result');
  assignmentsElement = document.getElementById('coin-flip-assignments');
};

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

const easing = {
  // Slow start, fast end (launch)
  easeInQuad: (t) => t * t,

  // Fast start, slow end (fall with gravity)
  easeOutQuad: (t) => t * (2 - t),

  // Smooth acceleration/deceleration
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  // Elastic settle - springy wobble damping
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  // Smooth deceleration (presentation lift)
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
};

// ============================================================================
// SEEDED RANDOM FOR DETERMINISTIC VARIATION
// ============================================================================

/**
 * Simple seeded random number generator for reproducible bounce variations.
 */
const createSeededRandom = (seed) => {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
};

// ============================================================================
// ANIMATION HELPERS
// ============================================================================

/**
 * Calculate the total Y rotation needed to end on the correct face.
 *
 * @param {boolean} isGator - True if result should show gator
 * @param {number} minRotations - Minimum full rotations for realism
 * @returns {number} Total Y-axis rotation in degrees
 */
const calculateFinalRotation = (isGator, minRotations = 8) => {
  // Base rotations (gator at 0deg, shark at 180deg)
  const baseRotation = minRotations * 360;
  return isGator ? baseRotation : baseRotation + 180;
};

/**
 * Animate a single phase using requestAnimationFrame.
 *
 * @param {Function} updateFn - Called each frame with progress (0-1)
 * @param {number} duration - Total animation duration in ms
 * @returns {Promise} Resolves when animation completes
 */
const animate = (updateFn, duration) => {
  return new Promise((resolve) => {
    const startTime = performance.now();

    const frame = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      updateFn(progress);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(frame);
  });
};

// ============================================================================
// ANIMATION PHASES
// ============================================================================

/**
 * Phase 1: Launch - coin rises from origin with initial spin
 */
const animateLaunch = async () => {
  await animate((progress) => {
    const easedProgress = easing.easeInQuad(progress);
    const height = easedProgress * (CONFIG.maxHeight * 0.3);
    const rotationY = easedProgress * 720; // 2 full rotations
    const rotationX = easedProgress * 30; // Start tilting

    coinElement.style.transform = `
      translateY(${-height}px)
      rotateY(${rotationY}deg)
      rotateX(${rotationX}deg)
    `;
  }, CONFIG.launchDuration);
};

/**
 * Phase 2: Airborne - rapid spinning at apex
 *
 * @param {boolean} isGator - Result to show
 */
const animateAirborne = async (isGator) => {
  const targetRotationY = calculateFinalRotation(isGator);
  const startRotationY = 720;
  const rotationRange = targetRotationY - startRotationY;

  await animate((progress) => {
    const easedProgress = easing.easeInOutSine(progress);

    // Height: rise to max then start falling (parabolic)
    const heightProgress = Math.sin(progress * Math.PI);
    const height = CONFIG.maxHeight * 0.3 + heightProgress * CONFIG.maxHeight * 0.7;

    // Rotation: continuous spinning
    const rotationY = startRotationY + easedProgress * rotationRange * 0.7;

    // X rotation oscillates to show both faces
    const rotationX = 30 + Math.sin(progress * Math.PI * 6) * 80;

    coinElement.style.transform = `
      translateY(${-height}px)
      rotateY(${rotationY}deg)
      rotateX(${rotationX}deg)
    `;
  }, CONFIG.airborneDuration);
};

/**
 * Phase 3: Fall - gravity-like deceleration
 *
 * @param {boolean} isGator - Result to show
 */
const animateFall = async (isGator) => {
  const targetRotationY = calculateFinalRotation(isGator);
  const startRotationY = 720 + (calculateFinalRotation(isGator) - 720) * 0.7;

  await animate((progress) => {
    const easedProgress = easing.easeOutQuad(progress);

    // Height decreases (falling)
    const height = CONFIG.maxHeight * (1 - easedProgress);

    // Rotation continues but slows
    const rotationY = startRotationY + (targetRotationY - startRotationY) * easedProgress;

    // X rotation settles toward edge landing (85-90 degrees)
    const rotationX = 30 + 55 * easedProgress;

    coinElement.style.transform = `
      translateY(${-height}px)
      rotateY(${rotationY}deg)
      rotateX(${rotationX}deg)
    `;
  }, CONFIG.fallDuration);
};

/**
 * Phase 4: Bounce - diminishing bounces on edge
 *
 * @param {boolean} isGator - Result to show
 * @param {number} seed - Random seed for variation
 */
const animateBounce = async (isGator, seed) => {
  const seededRandom = createSeededRandom(seed);
  const targetRotationY = calculateFinalRotation(isGator);

  let currentBounceHeight = 25; // Starting bounce height in pixels

  for (let i = 0; i < CONFIG.bounceCount; i++) {
    // Add seeded variation to bounce
    const variation = 1 + (seededRandom() - 0.5) * CONFIG.bounceVariation * 2;
    const bounceHeight = currentBounceHeight * variation;
    const bounceDuration = (CONFIG.bounceDuration / CONFIG.bounceCount) * variation;

    // Random wobble direction
    const wobbleDirection = seededRandom() > 0.5 ? 1 : -1;
    const wobbleAmount = (12 - i * 4) * wobbleDirection;

    await animate((progress) => {
      // Parabolic bounce path
      const heightProgress = Math.sin(progress * Math.PI);
      const height = heightProgress * bounceHeight;

      // Wobble on Z axis during bounce
      const wobble = Math.sin(progress * Math.PI) * wobbleAmount;

      coinElement.style.transform = `
        translateY(${-height}px)
        rotateY(${targetRotationY}deg)
        rotateX(85deg)
        rotateZ(${wobble}deg)
      `;
    }, bounceDuration);

    // Decay for next bounce
    currentBounceHeight *= CONFIG.bounceDecay;
  }
};

/**
 * Phase 5: Settle - final wobble and lay flat
 *
 * @param {boolean} isGator - Result to show
 */
const animateSettle = async (isGator) => {
  const targetRotationY = calculateFinalRotation(isGator);

  await animate((progress) => {
    const easedProgress = easing.easeOutElastic(progress);

    // Settle from 85deg (on edge) to 90deg (flat)
    const rotationX = 85 + 5 * easedProgress;

    // Damped wobble
    const wobble = Math.sin(progress * Math.PI * 4) * (4 * (1 - progress));

    coinElement.style.transform = `
      translateY(0px)
      rotateY(${targetRotationY}deg)
      rotateX(${rotationX}deg)
      rotateZ(${wobble}deg)
    `;
  }, CONFIG.settleDuration);

  // Final position locked (flat on table)
  coinElement.style.transform = `
    translateY(0px)
    rotateY(${targetRotationY}deg)
    rotateX(90deg)
    rotateZ(0deg)
  `;
};

/**
 * Phase 6: Present - lift coin and tilt toward camera to show result
 * Tilt direction depends on which face won - gator tilts one way, shark the other
 *
 * @param {boolean} isGator - Result to show
 */
const animatePresent = async (isGator) => {
  const targetRotationY = calculateFinalRotation(isGator);

  // Target X rotation depends on which side is up after the Y rotation
  // Gator (Y=0): tilt from 90 toward 15 (front edge lifts)
  // Shark (Y=180): tilt from 90 toward 165 (back edge lifts, showing shark)
  const targetRotationX = isGator ? CONFIG.presentationTilt : 180 - CONFIG.presentationTilt;

  await animate((progress) => {
    const easedProgress = easing.easeOutCubic(progress);

    // Lift up from table
    const lift = easedProgress * CONFIG.presentationLift;

    // Rotate from flat (90deg) toward target angle
    const rotationX = 90 + (targetRotationX - 90) * easedProgress;

    // Scale up slightly for emphasis
    const scale = 1 + (CONFIG.presentationScale - 1) * easedProgress;

    coinElement.style.transform = `
      translateY(${-lift}px)
      rotateY(${targetRotationY}deg)
      rotateX(${rotationX}deg)
      rotateZ(0deg)
      scale(${scale})
    `;
  }, CONFIG.presentationDuration);

  // Final presentation position
  coinElement.style.transform = `
    translateY(${-CONFIG.presentationLift}px)
    rotateY(${targetRotationY}deg)
    rotateX(${targetRotationX}deg)
    rotateZ(0deg)
    scale(${CONFIG.presentationScale})
  `;
};

// ============================================================================
// MAIN ENTRY POINTS
// ============================================================================

/**
 * Show the coin flip overlay with player assignments before animation.
 *
 * @param {Array} playerSymbols - ['gator', 'shark'] or ['shark', 'gator']
 * @param {Array} playerNames - ['Player 1', 'Player 2']
 */
export const showCoinFlipOverlay = (playerSymbols, playerNames) => {
  if (!overlayElement) {
    initCoinFlipEffect();
  }
  if (!overlayElement) return;

  // Display player assignments
  if (assignmentsElement) {
    const p1Symbol = playerSymbols[0] === 'gator' ? '🐊' : '🦈';
    const p2Symbol = playerSymbols[1] === 'gator' ? '🐊' : '🦈';
    assignmentsElement.innerHTML = `
      <div class="coin-flip-player">${playerNames[0]} = ${p1Symbol}</div>
      <div class="coin-flip-player">${playerNames[1]} = ${p2Symbol}</div>
    `;
  }

  // Reset coin position
  if (coinElement) {
    coinElement.style.transform = 'translateY(0) rotateY(0) rotateX(0) rotateZ(0)';
  }

  // Hide result text
  if (resultElement) {
    resultElement.classList.remove('visible');
    resultElement.textContent = '';
  }

  // Show overlay
  overlayElement.classList.add('active');
  overlayElement.setAttribute('aria-hidden', 'false');
};

/**
 * Play the coin flip animation.
 *
 * @param {boolean} resultIsGator - Predetermined result (true = gator, false = shark)
 * @param {Object} options - Optional configuration
 * @param {number} options.seed - Random seed for bounce variation (default: Date.now())
 * @param {Function} options.onComplete - Callback when animation finishes
 * @returns {Promise<boolean>} Resolves with the result when complete
 */
export const playCoinFlip = async (resultIsGator, options = {}) => {
  if (isAnimating || !coinElement || !overlayElement) {
    console.warn('[CoinFlip] Animation already in progress or not initialized');
    return resultIsGator;
  }

  isAnimating = true;
  const seed = options.seed ?? Date.now();

  try {
    // Reset coin position
    coinElement.style.transform = 'translateY(0) rotateY(0) rotateX(0) rotateZ(0)';

    // Execute animation phases
    await animateLaunch();
    await animateAirborne(resultIsGator);
    await animateFall(resultIsGator);
    await animateBounce(resultIsGator, seed);
    await animateSettle(resultIsGator);

    // Brief pause before presentation
    await new Promise((resolve) => setTimeout(resolve, CONFIG.presentationDelay));

    // Lift coin to present result to camera
    await animatePresent(resultIsGator);

    // Show result text after presentation
    if (resultElement) {
      resultElement.textContent = resultIsGator ? '🐊 Gator!' : '🦈 Shark!';
      resultElement.classList.add('visible');
    }

    // Callback
    options.onComplete?.(resultIsGator);
  } finally {
    isAnimating = false;
  }

  return resultIsGator;
};

/**
 * Hide the coin flip overlay.
 */
export const hideCoinFlip = () => {
  if (overlayElement) {
    overlayElement.classList.remove('active');
    overlayElement.setAttribute('aria-hidden', 'true');
  }
  isAnimating = false;
};

/**
 * Check if coin flip is currently animating.
 */
export const isCoinFlipAnimating = () => isAnimating;
