const { webkit } = require('@playwright/test');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  // Full setup: AI mode, Bird, Random deck, Confirm
  await p.click('#menu-other', { force: true }); await p.waitForTimeout(300);
  await p.click('#other-ai', { force: true }); await p.waitForTimeout(300);
  await p.click('#ai-deck-random', { force: true }); await p.waitForTimeout(1000);
  await p.click('.deck-select-panel--bird', { force: true }); await p.waitForTimeout(1000);
  await p.click('#deck-random', { force: true }); await p.waitForTimeout(500);
  await p.click('#deck-confirm', { force: true }); await p.waitForTimeout(2000);
  
  // Roll
  await p.click('text="Roll for Player 1"', { force: true });
  await p.waitForTimeout(3000);
  
  // After rolling, P1 won. In AI mode, AI auto-chooses who goes first.
  // But we still need to click "Player 1 goes first" or similar.
  // Check what buttons are available
  const setupButtons = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('.setup-overlay button')).filter(b => b.offsetHeight > 0)
      .map(b => ({ text: b.innerText.trim().substring(0, 40), class: b.className }));
  });
  console.log('Setup buttons after roll:', setupButtons);
  
  // Click any "goes first" button
  for (const btn of setupButtons) {
    if (btn.text.includes('goes first')) {
      console.log('Clicking:', btn.text);
      await p.evaluate((text) => {
        const btns = document.querySelectorAll('.setup-overlay button');
        for (const b of btns) {
          if (b.innerText.trim().includes(text)) { b.click(); break; }
        }
      }, btn.text.split(' goes first')[0]); // pass partial text
      await p.waitForTimeout(2000);
      break;
    }
  }
  
  // Wait for game to transition
  await p.waitForTimeout(2000);
  
  // Dismiss pass overlay — use evaluate to click directly (avoids interception)
  await p.evaluate(() => {
    const btn = document.getElementById('pass-confirm');
    if (btn) btn.click();
  });
  await p.waitForTimeout(1000);
  
  // May need to dismiss again (turn pass for local 2P)
  await p.evaluate(() => {
    const btn = document.getElementById('pass-confirm');
    if (btn) btn.click();
  });
  await p.waitForTimeout(1000);
  
  // Check game state
  const state = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      phase: s?.phase,
      turn: s?.turn,
      activePlayer: s?.activePlayer,
      myTurn: s?.ui?.isMyTurn,
      hand: s?.players?.[0]?.hand?.map(c => ({ name: c.name, type: c.type, atk: c.atk, hp: c.hp, keywords: c.keywords })),
      field: s?.players?.[0]?.field,
      opponentField: s?.players?.[1]?.field,
      log: s?.recentLog?.slice(0, 5),
    };
  });
  
  console.log('=== GAME STATE ===');
  console.log('Compact:', state.compact);
  console.log('Phase:', state.phase, '| Turn:', state.turn);
  console.log('My turn:', state.myTurn);
  console.log('\nHand (' + (state.hand?.length || 0) + ' cards):');
  state.hand?.forEach(c => console.log('  ', c.name, '(' + c.type + ')', c.atk ? c.atk + '/' + c.hp : '', c.keywords?.join(', ') || ''));
  console.log('\nField:', state.field);
  console.log('Opponent field:', state.opponentField);
  console.log('\nRecent log:', state.log);
  
  // Now try to play a card! Find a Prey card in hand
  const preyCard = state.hand?.find(c => c.type === 'Prey');
  if (preyCard && state.myTurn && state.phase === 'Main 1') {
    console.log('\n=== PLAYING CARD: ' + preyCard.name + ' ===');
    
    // Find the card in the DOM and click it
    const handCards = await p.evaluate(() => {
      const cards = document.querySelectorAll('.hand .card, .hand-area .card, [class*=hand] .card');
      return Array.from(cards).map((c, i) => ({
        index: i,
        text: c.innerText?.substring(0, 30),
        name: c.querySelector('.card-name, [class*=name]')?.innerText,
        visible: c.offsetHeight > 0,
        classes: c.className.substring(0, 50),
      }));
    });
    console.log('DOM hand cards:', handCards);
  } else {
    console.log('\nCannot play yet - phase:', state.phase, '| myTurn:', state.myTurn);
    
    // Check what overlays are active
    const overlays = await p.evaluate(() => {
      return Array.from(document.querySelectorAll('.overlay.active')).map(o => ({
        class: o.className.substring(0, 50),
        content: o.innerText?.substring(0, 100),
      }));
    });
    console.log('Active overlays:', overlays);
  }
  
  await browser.close();
})();
