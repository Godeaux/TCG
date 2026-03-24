const { webkit } = require('@playwright/test');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  // Full setup: AI mode, Bird, Random, Confirm, Roll
  await p.click('#menu-other', { force: true }); await p.waitForTimeout(300);
  await p.click('#other-ai', { force: true }); await p.waitForTimeout(300);
  await p.click('#ai-deck-random', { force: true }); await p.waitForTimeout(1000);
  await p.click('.deck-select-panel--bird', { force: true }); await p.waitForTimeout(1000);
  await p.click('#deck-random', { force: true }); await p.waitForTimeout(500);
  await p.click('#deck-confirm', { force: true }); await p.waitForTimeout(2000);
  await p.click('text="Roll for Player 1"', { force: true }); await p.waitForTimeout(3000);
  
  // Dismiss any pass overlays
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    await p.waitForTimeout(500);
  }
  
  console.log('Game started. Waiting for AI to finish its turn...');
  
  // Wait for my turn (activePlayer = 0 and phase = Main 1)
  for (let i = 0; i < 30; i++) {
    const state = await p.evaluate(() => {
      const s = window.__qa?.getState();
      return { phase: s?.phase, activePlayer: s?.activePlayer, myTurn: s?.ui?.isMyTurn };
    });
    
    if (state.myTurn && (state.phase === 'Main 1' || state.phase === 'Main1')) {
      console.log('My turn! Phase:', state.phase);
      break;
    }
    
    // Dismiss pass overlays that appear during turn transition
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    await p.waitForTimeout(500);
  }
  
  // Get full state
  const state = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      phase: s?.phase,
      turn: s?.turn,
      myTurn: s?.ui?.isMyTurn,
      hand: s?.players?.[0]?.hand?.map(c => ({ name: c.name, type: c.type, index: c.index })),
      field: s?.players?.[0]?.field,
      opponentHP: s?.players?.[1]?.hp,
      myHP: s?.players?.[0]?.hp,
      log: s?.recentLog?.slice(0, 10),
    };
  });
  
  console.log('\n=== MY TURN ===');
  console.log('Compact:', state.compact);
  console.log('HP: me=' + state.myHP + ' opp=' + state.opponentHP);
  console.log('Hand:');
  state.hand?.forEach((c, i) => console.log('  [' + i + ']', c.name, '(' + c.type + ')'));
  
  // Now let's explore the hand DOM to find clickable cards
  const handDOM = await p.evaluate(() => {
    // Find all card elements in the hand area
    const handArea = document.querySelector('.hand, .hand-area, .hand-grid, [class*=hand-strip]');
    if (!handArea) return { found: false, msg: 'no hand area' };
    
    const cards = handArea.querySelectorAll('.card');
    return {
      found: true,
      areaClass: handArea.className,
      cardCount: cards.length,
      cards: Array.from(cards).map((c, i) => ({
        index: i,
        classes: c.className.substring(0, 60),
        name: c.querySelector('[class*=name]')?.innerText || c.getAttribute('data-card-name'),
        dataAttrs: Object.keys(c.dataset).join(','),
        visible: c.offsetHeight > 0,
        rect: c.getBoundingClientRect(),
      }))
    };
  });
  console.log('\nHand DOM:', JSON.stringify(handDOM, null, 2));
  
  // Also check for any field slot elements
  const fieldDOM = await p.evaluate(() => {
    const slots = document.querySelectorAll('.field-slot, [class*=field-slot]');
    return Array.from(slots).map((s, i) => ({
      index: i,
      classes: s.className.substring(0, 50),
      hasCard: s.querySelector('.card') !== null,
      rect: s.getBoundingClientRect(),
    }));
  });
  console.log('\nField slots:', fieldDOM);
  
  await browser.close();
})();
