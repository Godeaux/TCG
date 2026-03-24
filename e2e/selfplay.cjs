/**
 * Food Chain TCG — Self-Play Test Harness
 * 
 * Two browser contexts simulate two real players in a Supabase multiplayer game.
 * All interactions go through the DOM — no internal API calls for game actions.
 * __dev API used ONLY for state verification after actions.
 * 
 * Usage: node e2e/selfplay.js
 */

const { webkit } = require('@playwright/test');

const GAME_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = 'e2e/screenshots';

// ============================================================================
// BROWSER SETUP
// ============================================================================

async function createPlayer(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(GAME_URL);
  await page.waitForTimeout(1000);
  
  return {
    name,
    page,
    context,
    
    // ========================================================================
    // STATE INSPECTION (verification only — never for triggering actions)
    // ========================================================================
    
    async getState() {
      return page.evaluate(() => {
        // Use the QA API if available (full structured state)
        if (window.__qa) return window.__qa.getState();
        return null;
      });
    },
    
    async getCompactState() {
      return page.evaluate(() => {
        if (window.__qa) return window.__qa.getCompactState();
        return 'QA API not available';
      });
    },
    
    async isGameOver() {
      return page.evaluate(() => {
        if (window.__qa) return window.__qa.isGameOver();
        return { over: false };
      });
    },
    
    async screenshot(label) {
      const fs = require('fs');
      if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const filename = `${SCREENSHOT_DIR}/${name}-${label}-${Date.now()}.png`;
      await page.screenshot({ path: filename });
      console.log(`📸 ${name}: ${label} → ${filename}`);
      return filename;
    },
    
    // ========================================================================
    // MENU NAVIGATION (real DOM clicks)
    // ========================================================================
    
    async clickButton(id) {
      await page.click(`#${id}`);
      await page.waitForTimeout(300);
    },
    
    async clickText(text) {
      await page.click(`text="${text}"`);
      await page.waitForTimeout(300);
    },
    
    // ========================================================================
    // GAME ACTIONS (real DOM interactions)
    // ========================================================================
    
    async waitForPhase(phase, timeout = 10000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const state = await this.getState();
        if (state?.phase === phase) return state;
        await page.waitForTimeout(200);
      }
      throw new Error(`${name}: Timeout waiting for phase ${phase}`);
    },
    
    async waitForMyTurn(playerIndex, timeout = 10000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const state = await this.getState();
        if (state?.activePlayerIndex === playerIndex) return state;
        await page.waitForTimeout(200);
      }
      throw new Error(`${name}: Timeout waiting for my turn`);
    },
    
    // Click a card in hand by name
    async clickHandCard(cardName) {
      // Cards in hand have the card name displayed
      const card = await page.locator(`.hand .card, .hand-strip .card`).filter({ hasText: cardName }).first();
      if (!card) throw new Error(`${name}: Card "${cardName}" not found in hand`);
      await card.click();
      await page.waitForTimeout(300);
    },
    
    // Click a field slot (0, 1, or 2)
    async clickFieldSlot(slotIndex, playerSide = 'bottom') {
      const selector = playerSide === 'bottom' 
        ? `.field-bottom .field-slot:nth-child(${slotIndex + 1})`
        : `.field-top .field-slot:nth-child(${slotIndex + 1})`;
      await page.click(selector);
      await page.waitForTimeout(300);
    },
    
    // Click a creature on the field
    async clickFieldCreature(creatureName) {
      const card = await page.locator('.field .card').filter({ hasText: creatureName }).first();
      if (!card) throw new Error(`${name}: Creature "${creatureName}" not found on field`);
      await card.click();
      await page.waitForTimeout(300);
    },
    
    // Advance phase / end turn button
    async advancePhase() {
      // The turn badge or phase button advances the phase
      await page.click('#field-turn-btn');
      await page.waitForTimeout(500);
    },
    
    // Handle pass overlay (local 2P)
    async confirmPass() {
      const passBtn = await page.$('#pass-confirm');
      if (passBtn) {
        await passBtn.click();
        await page.waitForTimeout(300);
      }
    },
    
    // Select a target from selection modal
    async selectTarget(targetName) {
      const target = await page.locator('.selection-panel .card, .selection-modal .card').filter({ hasText: targetName }).first();
      if (!target) throw new Error(`${name}: Target "${targetName}" not found in selection`);
      await target.click();
      await page.waitForTimeout(300);
    },
    
    // Select an option from choice modal
    async selectOption(optionText) {
      await page.click(`text="${optionText}"`);
      await page.waitForTimeout(300);
    },
    
    // Handle trap activation prompt
    async activateTrap() {
      const btn = await page.$('.reaction-activate, text="Activate"');
      if (btn) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    },
    
    async declineTrap() {
      const btn = await page.$('.reaction-pass, text="Pass"');
      if (btn) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    },
    
    // Consumption selection (for predators)
    async selectPreyToEat(preyNames) {
      for (const name of preyNames) {
        await this.clickFieldCreature(name);
      }
      // Confirm consumption
      const confirmBtn = await page.$('.consumption-confirm, text="Confirm"');
      if (confirmBtn) {
        await confirmBtn.click();
        await page.waitForTimeout(300);
      }
    },
    
    async dryDrop() {
      const btn = await page.$('.dry-drop-btn, text="Dry Drop", text="Skip"');
      if (btn) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    },
  };
}

// ============================================================================
// GAME SETUP FLOW
// ============================================================================

async function setupLocalGame(p1, p2, deckName = 'Bird') {
  console.log(`\n🎮 Setting up local game: ${deckName} vs ${deckName}\n`);
  
  // TODO: Navigate through menu to start a local 2P game
  // This needs to be mapped once we understand the exact UI flow
  // For now, use AI mode as a simpler starting point
  
  // Click Other → Play vs AI (for initial testing)
  await p1.clickButton('menu-other');
  await p1.page.waitForTimeout(500);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🃏 Food Chain TCG — Self-Play Harness\n');
  
  const browser = await webkit.launch({ headless: true });
  
  try {
    const p1 = await createPlayer(browser, 'Player1');
    console.log('✅ Player 1 connected');
    
    // For now, just verify the page loaded and we can read state
    const bodyText = await p1.page.evaluate(() => document.body.innerText.substring(0, 100));
    console.log(`📄 Page content: ${bodyText}`);
    
    // Check if __gameState is accessible
    const state = await p1.getState();
    console.log(`🔍 Game state accessible: ${state !== null}`);
    if (state) {
      console.log(`   Phase: ${state.phase}, Turn: ${state.turn}`);
    }
    
    console.log('\n✅ Harness ready. Next step: implement full game flow.\n');
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
