/**
 * Food Chain TCG — Game Helpers for Playwright
 * 
 * Reusable helpers for setup, playing, and inspecting game state.
 * These are the building blocks for the LLM-player Bible.
 */

/**
 * Complete the full game setup: menu → deck → roll → ready
 * Handles all edge cases: ties, AI auto-choice, pass overlays
 */
async function setupGame(p, deckCategory = 'bird') {
  // Navigate to AI mode
  await p.click('#menu-other', { force: true }); await p.waitForTimeout(300);
  await p.click('#other-ai', { force: true }); await p.waitForTimeout(300);
  await p.click('#ai-deck-random', { force: true }); await p.waitForTimeout(1000);
  
  // Select deck
  await p.click(`.deck-select-panel--${deckCategory}`, { force: true }); 
  await p.waitForTimeout(1000);
  await p.click('#deck-random', { force: true }); await p.waitForTimeout(500);
  await p.click('#deck-confirm', { force: true }); await p.waitForTimeout(3000);
  
  // Keep rolling + choosing until setup completes
  for (let attempt = 0; attempt < 10; attempt++) {
    const setup = await p.evaluate(() => window.__qa?.act?.menu?.getMenuState()?.setup);
    const phase = await p.evaluate(() => window.__qa?.getState()?.phase);
    
    if (setup?.stage === 'complete' || (phase && phase !== 'Setup')) {
      break; // Setup done!
    }
    
    // Click any roll buttons
    await p.evaluate(() => {
      document.querySelectorAll('.setup-overlay button').forEach(b => {
        if (b.innerText.includes('Roll') && b.offsetHeight > 0) b.click();
      });
    });
    await p.waitForTimeout(2000);
    
    // Click any "goes first" buttons (P1 always goes first for simplicity)
    await p.evaluate(() => {
      document.querySelectorAll('.setup-overlay button').forEach(b => {
        if (b.innerText.includes('Player 1 goes first') && b.offsetHeight > 0) b.click();
      });
    });
    await p.waitForTimeout(1000);
  }
  
  // Dismiss pass overlays until we're at Main 1
  await waitForMyTurn(p);
}

/**
 * Wait for it to be the player's turn at Main 1
 */
async function waitForMyTurn(p, maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    const s = await p.evaluate(() => ({
      phase: window.__qa?.getState()?.phase,
      myTurn: window.__qa?.getState()?.ui?.isMyTurn,
      gameOver: window.__qa?.isGameOver(),
    }));
    if (s.gameOver?.over) return s;
    if (s.myTurn && s.phase === 'Main 1') return s;
    await p.waitForTimeout(500);
  }
  // Return current state even if timeout
  return await p.evaluate(() => ({
    phase: window.__qa?.getState()?.phase,
    myTurn: window.__qa?.getState()?.ui?.isMyTurn,
    gameOver: window.__qa?.isGameOver(),
  }));
}

/**
 * Get full game state snapshot
 */
async function getState(p) {
  return p.evaluate(() => {
    const s = window.__qa?.getState();
    if (!s) return null;
    return {
      compact: window.__qa?.getCompactState(),
      phase: s.phase,
      turn: s.turn,
      myTurn: s.ui?.isMyTurn,
      hand: s.players?.[0]?.hand,
      myField: s.players?.[0]?.field,
      oppField: s.players?.[1]?.field,
      myHP: s.players?.[0]?.hp,
      oppHP: s.players?.[1]?.hp,
      pending: s.pendingContext,
      gameOver: window.__qa?.isGameOver(),
    };
  });
}

/**
 * Play a card from hand by index
 */
async function playCard(p, handIndex) {
  return p.evaluate((idx) => window.__qa?.act?.playCard(idx), handIndex);
}

/**
 * Select consumption targets
 */
async function selectEatTargets(p, indices) {
  return p.evaluate((idxs) => window.__qa?.act?.selectEatTargets(idxs), indices);
}

/**
 * Dry drop (predator with no consumption)
 */
async function dryDrop(p) {
  return p.evaluate(() => window.__qa?.act?.dryDrop());
}

/**
 * Attack a creature
 */
async function attackCreature(p, attackerSlot, targetSlot) {
  return p.evaluate(({a, t}) => window.__qa?.act?.attack(a, 'creature', t), {a: attackerSlot, t: targetSlot});
}

/**
 * Attack player directly
 */
async function attackPlayer(p, attackerSlot) {
  return p.evaluate(({a}) => window.__qa?.act?.attack(a, 'player'), {a: attackerSlot});
}

/**
 * Advance phase
 */
async function advancePhase(p) {
  return p.evaluate(() => window.__qa?.act?.advancePhase());
}

/**
 * End turn
 */
async function endTurn(p) {
  return p.evaluate(() => window.__qa?.act?.endTurn());
}

module.exports = {
  setupGame,
  waitForMyTurn,
  getState,
  playCard,
  selectEatTargets,
  dryDrop,
  attackCreature,
  attackPlayer,
  advancePhase,
  endTurn,
};
