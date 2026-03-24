/**
 * Browser Management — Playwright wrapper for two-tab multiplayer
 *
 * Launches two browser contexts (separate sessions), navigates to the game,
 * logs in, and connects them into a multiplayer match.
 */

import { chromium } from 'playwright';
import config from './config.js';

/**
 * Launch two browser contexts and return page handles.
 * Each context has its own cookies/session (like two different players).
 */
export async function launchBrowsers() {
  const browser = await chromium.launch({
    headless: config.browser.headless,
    slowMo: config.browser.slowMo,
  });

  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  return { browser, page1, page2, context1, context2 };
}

/**
 * Navigate to the game and wait for it to load.
 */
export async function navigateToGame(page) {
  await page.goto(config.gameUrl, { waitUntil: 'domcontentloaded' });

  // Wait for the QA API to be available
  await page.waitForFunction(() => typeof window.__qa !== 'undefined', {
    timeout: 15000,
  });

  console.log(`[Browser] Game loaded, window.__qa available`);
}

/**
 * Login with a test account.
 */
export async function login(page, account) {
  // Click the login/auth button from the menu
  // The game starts with menu-overlay visible
  await page.waitForSelector('#menu-overlay:not([aria-hidden="true"])', { timeout: 10000 });

  // Click "Other" to get to multiplayer options
  await page.click('#menu-other');
  await page.waitForSelector('#other-menu-overlay:not([aria-hidden="true"])', { timeout: 5000 });

  // Click "Multiplayer"
  await page.click('#other-multiplayer');
  await page.waitForSelector('#multiplayer-overlay:not([aria-hidden="true"])', { timeout: 5000 });

  // Click "Log In"
  await page.click('#multiplayer-auth');
  await page.waitForSelector('#login-overlay:not([aria-hidden="true"])', { timeout: 5000 });

  // Fill in credentials
  await page.fill('#login-username', account.username);
  await page.fill('#login-pin', account.pin);
  await page.click('#login-submit');

  // Wait for login to complete (overlay should close or show success)
  await page.waitForTimeout(2000);

  console.log(`[Browser] Logged in as ${account.username}`);
}

/**
 * Set up a multiplayer game between two pages.
 * Player 1 creates a lobby, player 2 joins it.
 */
export async function setupMultiplayerGame(page1, page2) {
  // === Player 1: Create lobby ===
  // Navigate to multiplayer screen if not there already
  await ensureMultiplayerScreen(page1);

  // Create lobby
  await page1.click('#lobby-create');
  await page1.waitForTimeout(2000);

  // Get lobby code
  const lobbyCode = await page1.textContent('#lobby-code-display');
  console.log(`[Browser] Lobby created with code: ${lobbyCode}`);

  if (!lobbyCode || lobbyCode === '----') {
    throw new Error('Failed to create lobby — no code displayed');
  }

  // === Player 2: Join lobby ===
  await ensureMultiplayerScreen(page2);

  // Click "Join as Guest"
  await page2.click('#lobby-join');
  await page2.waitForSelector('#lobby-join-form', { timeout: 5000 });

  // Enter lobby code
  await page2.fill('#lobby-code', lobbyCode.trim());
  await page2.click('#lobby-join-form button[type="submit"]');
  await page2.waitForTimeout(2000);

  console.log(`[Browser] Player 2 joined lobby ${lobbyCode}`);

  // === Both: Wait for lobby to be ready, then continue to game ===
  // The lobby-continue button appears when both players are connected
  await page1.waitForSelector('#lobby-continue:not([style*="display: none"])', {
    timeout: 15000,
  });

  // Player 1 clicks continue
  await page1.click('#lobby-continue');

  // Player 2 should also see continue
  try {
    await page2.waitForSelector('#lobby-continue:not([style*="display: none"])', {
      timeout: 5000,
    });
    await page2.click('#lobby-continue');
  } catch {
    // Player 2 may auto-advance
    console.log('[Browser] Player 2 auto-advanced to deck selection');
  }

  console.log('[Browser] Both players in deck selection');
}

/**
 * Select decks for both players (random decks for maximum coverage).
 */
export async function selectDecks(page1, page2) {
  // Wait for deck selection overlay
  for (const page of [page1, page2]) {
    try {
      await page.waitForSelector('#deck-select-overlay:not([aria-hidden="true"])', {
        timeout: 10000,
      });
      // Click first available deck category (random selection)
      const deckOptions = await page.$$('#deck-select-grid button');
      if (deckOptions.length > 0) {
        const randomIndex = Math.floor(Math.random() * deckOptions.length);
        await deckOptions[randomIndex].click();
        console.log(`[Browser] Selected deck category ${randomIndex}`);
      }
      await page.waitForTimeout(1000);
    } catch {
      console.log('[Browser] No deck select overlay — may have pre-selected decks');
    }

    // If deck builder appears, click random then confirm
    try {
      const randomBtn = await page.$('#deck-random');
      if (randomBtn) {
        await randomBtn.click();
        await page.waitForTimeout(500);
      }
      const confirmBtn = await page.$('#deck-confirm');
      if (confirmBtn) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // May not need deck builder
    }
  }

  console.log('[Browser] Decks selected for both players');
}

/**
 * Wait for the actual gameplay to start (past setup/coin flip).
 */
export async function waitForGameStart(page) {
  // Wait for the game to be in a playable state
  await page.waitForFunction(
    () => {
      try {
        const state = window.__qa.getState();
        return state.phase && state.turn >= 1 && !state.ui.overlayOpen;
      } catch {
        return false;
      }
    },
    { timeout: 60000, polling: 1000 }
  );

  console.log('[Browser] Game started — in playable state');
}

/**
 * Ensure we're on the multiplayer screen.
 */
async function ensureMultiplayerScreen(page) {
  const isMultiplayerVisible = await page.isVisible('#multiplayer-overlay:not([aria-hidden="true"])');
  if (isMultiplayerVisible) return;

  // Try navigating from menu
  try {
    await page.click('#menu-other');
    await page.waitForTimeout(500);
    await page.click('#other-multiplayer');
    await page.waitForSelector('#multiplayer-overlay:not([aria-hidden="true"])', { timeout: 5000 });
  } catch {
    console.log('[Browser] Could not navigate to multiplayer screen — may already be there');
  }
}

/**
 * Read game state from a page via window.__qa.
 */
export async function readState(page) {
  return page.evaluate(() => window.__qa.getState());
}

/**
 * Read compact state from a page.
 */
export async function readCompactState(page) {
  return page.evaluate(() => window.__qa.getCompactState());
}

/**
 * Execute an action on a page via window.__qa.act.
 */
export async function executeAction(page, actionType, args = []) {
  return page.evaluate(
    ({ type, args }) => {
      const act = window.__qa.act;
      // Navigate nested paths like "menu.surrender"
      const parts = type.split('.');
      let fn = act;
      for (const part of parts) {
        fn = fn[part];
        if (!fn) return { success: false, error: `Unknown action: ${type}` };
      }
      if (typeof fn !== 'function') {
        return { success: false, error: `${type} is not a function` };
      }
      return fn(...args);
    },
    { type: actionType, args }
  );
}

/**
 * Check if game is over on a page.
 */
export async function checkGameOver(page) {
  return page.evaluate(() => window.__qa.isGameOver());
}

/**
 * Get game log from a page.
 */
export async function getGameLog(page) {
  return page.evaluate(() => window.__qa.getLog(50));
}

export async function cleanup(browser) {
  if (browser) await browser.close();
}
