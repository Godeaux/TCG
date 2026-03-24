const { webkit } = require('@playwright/test');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  // === SETUP: AI mode, Bird deck, random cards ===
  await p.click('#menu-other', { force: true }); await p.waitForTimeout(300);
  await p.click('#other-ai', { force: true }); await p.waitForTimeout(300);
  await p.click('#ai-deck-random', { force: true }); await p.waitForTimeout(1000);
  await p.click('.deck-select-panel--bird', { force: true }); await p.waitForTimeout(1000);
  await p.click('#deck-random', { force: true }); await p.waitForTimeout(500);
  await p.click('#deck-confirm', { force: true }); await p.waitForTimeout(2000);
  await p.click('text="Roll for Player 1"', { force: true }); await p.waitForTimeout(3000);
  
  // Dismiss pass overlays
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    await p.waitForTimeout(500);
  }
  
  // Wait for my turn at Main 1
  for (let i = 0; i < 30; i++) {
    const s = await p.evaluate(() => {
      const st = window.__qa?.getState();
      return { phase: st?.phase, myTurn: st?.ui?.isMyTurn };
    });
    if (s.myTurn && s.phase === 'Main 1') break;
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    await p.waitForTimeout(500);
  }
  
  console.log('=== MY TURN - MAIN 1 ===');
  
  const state = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      hand: s?.players?.[0]?.hand,
      field: s?.players?.[0]?.field,
    };
  });
  console.log(state.compact);
  console.log('\nHand:');
  state.hand?.forEach((c, i) => console.log(`  [${i}] ${c.name} (${c.type}) ${c.atk || ''}/${c.hp || ''} ${c.keywords?.join(', ') || ''}`));
  
  // === EXPLORE: How does drag-and-drop work? ===
  // The game uses drag-and-drop. Let's check the input handlers.
  const dragInfo = await p.evaluate(() => {
    // Check if cards have drag-related event listeners or attributes
    const card = document.querySelector('.hand-grid .card');
    if (!card) return { found: false };
    return {
      found: true,
      draggable: card.draggable,
      hasDataset: Object.keys(card.dataset),
      classes: card.className,
      // Check for touch/mouse event attributes
      hasDragStart: typeof card.ondragstart === 'function',
      hasTouchStart: typeof card.ontouchstart === 'function',
    };
  });
  console.log('\nCard drag info:', dragInfo);
  
  // === TRY: Use the QA API to play a card via dispatch (bypasses drag) ===
  // First, let's see if QA API act.playCard works
  const preyIndex = state.hand?.findIndex(c => c.type === 'Prey');
  if (preyIndex >= 0) {
    console.log(`\n=== PLAYING CARD via QA API: ${state.hand[preyIndex].name} (index ${preyIndex}) ===`);
    
    const result = await p.evaluate((idx) => {
      return window.__qa?.act?.playCard(idx, null);
    }, preyIndex);
    
    console.log('Play result:', JSON.stringify(result?.success));
    console.log('Error:', result?.error);
    
    if (result?.success) {
      console.log('New state:', result?.newState?.phase);
      const newCompact = await p.evaluate(() => window.__qa?.getCompactState());
      console.log('Compact:', newCompact);
    }
  }
  
  // === NOW TRY: Drag-and-drop via Playwright ===
  // Find the first prey card in hand and drag to an empty field slot
  const handCards = await p.evaluate(() => {
    const cards = document.querySelectorAll('.hand-grid .card');
    return Array.from(cards).map((c, i) => ({
      index: i,
      instanceId: c.dataset.instanceId,
      rect: c.getBoundingClientRect(),
      type: c.classList.contains('type-prey') ? 'prey' : 
            c.classList.contains('type-predator') ? 'predator' : 'spell',
    }));
  });
  
  const fieldSlots = await p.evaluate(() => {
    const slots = document.querySelectorAll('.field-slot');
    return Array.from(slots).map((s, i) => ({
      index: i,
      isEmpty: !s.querySelector('.card') || s.classList.contains('empty-field-slot'),
      rect: s.getBoundingClientRect(),
      classes: s.className.substring(0, 50),
    }));
  });
  
  // My field slots are indices 3, 4, 5 (bottom row)
  const myEmptySlot = fieldSlots.find(s => s.index >= 3 && s.isEmpty);
  const nextPreyCard = handCards.find(c => c.type === 'prey');
  
  if (nextPreyCard && myEmptySlot) {
    console.log(`\n=== DRAG: ${nextPreyCard.type} card to slot ${myEmptySlot.index} ===`);
    console.log(`Card pos: (${nextPreyCard.rect.x}, ${nextPreyCard.rect.y})`);
    console.log(`Slot pos: (${myEmptySlot.rect.x}, ${myEmptySlot.rect.y})`);
    
    // Attempt drag from card center to slot center
    const fromX = nextPreyCard.rect.x + nextPreyCard.rect.width / 2;
    const fromY = nextPreyCard.rect.y + nextPreyCard.rect.height / 2;
    const toX = myEmptySlot.rect.x + myEmptySlot.rect.width / 2;
    const toY = myEmptySlot.rect.y + myEmptySlot.rect.height / 2;
    
    await p.mouse.move(fromX, fromY);
    await p.waitForTimeout(100);
    await p.mouse.down();
    await p.waitForTimeout(100);
    // Move in steps to simulate real drag
    for (let step = 0; step <= 10; step++) {
      const x = fromX + (toX - fromX) * step / 10;
      const y = fromY + (toY - fromY) * step / 10;
      await p.mouse.move(x, y);
      await p.waitForTimeout(30);
    }
    await p.mouse.up();
    await p.waitForTimeout(1000);
    
    // Check if it worked
    const afterDrag = await p.evaluate(() => {
      const s = window.__qa?.getState();
      return {
        compact: window.__qa?.getCompactState(),
        field: s?.players?.[0]?.field?.map(c => c ? c.name : null),
        handSize: s?.players?.[0]?.hand?.length,
      };
    });
    console.log('After drag:', afterDrag.compact);
    console.log('My field:', afterDrag.field);
    console.log('Hand size:', afterDrag.handSize);
  }
  
  // === EXPLORE: Phase advance button ===
  console.log('\n=== PHASE BUTTON ===');
  const turnBtn = await p.evaluate(() => {
    const btn = document.getElementById('field-turn-btn');
    return {
      text: btn?.innerText?.trim(),
      visible: btn?.offsetHeight > 0,
      rect: btn?.getBoundingClientRect(),
    };
  });
  console.log('Turn button:', turnBtn);
  
  // Click phase button to advance
  await p.evaluate(() => document.getElementById('field-turn-btn')?.click());
  await p.waitForTimeout(1000);
  
  const afterAdvance = await p.evaluate(() => ({
    compact: window.__qa?.getCompactState(),
    phase: window.__qa?.getState()?.phase,
  }));
  console.log('After advance:', afterAdvance.compact);
  console.log('Phase:', afterAdvance.phase);
  
  // === EXPLORE: If in Combat, what attack options are shown? ===
  if (afterAdvance.phase === 'Combat') {
    console.log('\n=== COMBAT PHASE ===');
    const combatInfo = await p.evaluate(() => {
      const s = window.__qa?.getState();
      // Check for attack indicators on field cards
      const myCards = document.querySelectorAll('.player-field .card, .field-bottom .card');
      const attackable = Array.from(myCards).map(c => ({
        name: c.querySelector('[class*=name]')?.innerText?.trim(),
        hasAttackIndicator: c.classList.contains('can-attack') || c.querySelector('.attack-indicator') !== null,
        classes: c.className.substring(0, 60),
      }));
      return {
        creatures: s?.players?.[0]?.field?.filter(c => c)?.map(c => ({ 
          name: c.name, canAttack: c.canAttack, canAttackPlayer: c.canAttackPlayer 
        })),
        domCards: attackable,
      };
    });
    console.log('My creatures:', combatInfo.creatures);
    console.log('DOM cards:', combatInfo.domCards);
  }
  
  await browser.close();
})();
