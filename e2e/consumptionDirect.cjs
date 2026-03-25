/**
 * Direct Consumption Test — Drag predator directly onto prey on field
 * Also tests: additional consumption panel
 */
const { webkit } = require('@playwright/test');

function log(msg) { console.log(msg); }

(async () => {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[') && (text.includes('consume') || text.includes('Consume') || 
        text.includes('extend') || text.includes('direct'))) {
      log(`  [CONSOLE] ${text.substring(0, 200)}`);
    }
  });
  
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  
  // Setup game with mammal deck  
  log('=== SETUP ===');
  await page.click('#menu-other', { force: true }); await page.waitForTimeout(300);
  await page.click('#other-ai', { force: true }); await page.waitForTimeout(300);
  await page.click('#ai-deck-random', { force: true }); await page.waitForTimeout(1000);
  await page.click('.deck-select-panel--mammal', { force: true }); await page.waitForTimeout(1000);
  await page.click('#deck-random', { force: true }); await page.waitForTimeout(500);
  await page.click('#deck-confirm', { force: true }); await page.waitForTimeout(3000);
  
  for (let i = 0; i < 10; i++) {
    const done = await page.evaluate(() => {
      const phase = window.__qa?.getState()?.phase;
      if (phase && phase !== 'Setup') return true;
      document.querySelectorAll('.setup-overlay button').forEach(b => {
        if (b.offsetHeight > 0 && (b.innerText.includes('Roll') || b.innerText.includes('goes first'))) b.click();
      });
      return false;
    });
    if (done) break;
    await page.waitForTimeout(2000);
  }
  
  // Wait for my turn
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => document.getElementById('pass-confirm')?.click());
    const s = await page.evaluate(() => ({
      phase: window.__qa?.getState()?.phase,
      myTurn: window.__qa?.getState()?.ui?.isMyTurn,
    }));
    if (s.myTurn && s.phase === 'Main 1') break;
    await page.waitForTimeout(500);
  }
  
  log('=== GAME STARTED ===');
  
  // Strategy: Play 2 prey, then try to play predator onto one of them
  for (let turn = 0; turn < 15; turn++) {
    const state = await page.evaluate(() => {
      const s = window.__qa?.getState();
      if (!s) return null;
      return {
        phase: s.phase, turn: s.turn, myTurn: s.ui?.isMyTurn,
        hand: s.players?.[0]?.hand?.map(c => ({ name: c.name, type: c.type, instanceId: c.instanceId })),
        field: s.players?.[0]?.field?.map(c => c ? { name: c.name, type: c.type, slot: c.slot ?? null, instanceId: c.instanceId } : null),
        hp: [s.players?.[0]?.hp, s.players?.[1]?.hp],
        gameOver: window.__qa?.isGameOver()?.over,
      };
    });
    
    if (!state || state.gameOver) { log(`Game over or no state at turn ${turn}`); break; }
    if (!state.myTurn || state.phase !== 'Main 1') {
      for (let i = 0; i < 20; i++) {
        await page.evaluate(() => document.getElementById('pass-confirm')?.click());
        const s = await page.evaluate(() => ({
          phase: window.__qa?.getState()?.phase,
          myTurn: window.__qa?.getState()?.ui?.isMyTurn,
          over: window.__qa?.isGameOver()?.over,
        }));
        if (s.over) break;
        if (s.myTurn && s.phase === 'Main 1') break;
        await page.waitForTimeout(500);
      }
      continue;
    }
    
    const preyOnField = state.field?.filter(c => c && c.type === 'Prey') || [];
    const predInHand = state.hand?.filter(c => c.type === 'Predator') || [];
    const preyInHand = state.hand?.filter(c => c.type === 'Prey') || [];
    const emptySlots = state.field?.filter(c => !c)?.length || 0;
    const filledSlots = 3 - emptySlots;
    
    log(`\nT${state.turn} | HP ${state.hp.join('-')} | Field: ${state.field?.map(c => c ? c.name : 'empty').join(', ')}`);
    log(`  Hand: ${state.hand?.map(c => `${c.name}(${c.type[0]})`).join(', ')}`);
    log(`  Prey field:${preyOnField.length} Pred hand:${predInHand.length} Prey hand:${preyInHand.length} Empty:${emptySlots}`);
    
    // === TEST: Direct consumption — drag predator onto prey when field is full ===
    if (predInHand.length > 0 && preyOnField.length > 0 && emptySlots === 0) {
      log('\n🧪 DIRECT CONSUMPTION TEST (full field)');
      const pred = predInHand[0];
      // Find a prey's slot index on field
      const preyFieldIdx = state.field.findIndex(c => c && c.type === 'Prey');
      
      log(`  Dragging ${pred.name} onto ${state.field[preyFieldIdx].name} at field idx ${preyFieldIdx}`);
      
      const predDomIdx = await page.evaluate((iid) => {
        const cards = document.querySelectorAll('.hand-grid .card');
        for (let i = 0; i < cards.length; i++) {
          if (cards[i].dataset.instanceId === iid) return i;
        }
        return -1;
      }, pred.instanceId);
      
      // Drag hand card onto field card
      const result = await page.evaluate(({cardIdx, targetFieldIdx}) => {
        const handCards = document.querySelectorAll('.hand-grid .card');
        const card = handCards[cardIdx];
        if (!card) return { error: 'no hand card' };
        
        const slots = document.querySelectorAll('.field-slot');
        const targetSlot = slots[targetFieldIdx + 3]; // player slots 3,4,5
        const targetCard = targetSlot?.querySelector('.card');
        if (!targetCard) return { error: 'no card in target slot' };
        
        const cardRect = card.getBoundingClientRect();
        const targetRect = targetCard.getBoundingClientRect();
        
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', card.dataset.instanceId);
        
        card.dispatchEvent(new DragEvent('dragstart', {
          bubbles: true, cancelable: true, dataTransfer,
          clientX: cardRect.x + cardRect.width/2, clientY: cardRect.y + cardRect.height/2,
        }));
        
        targetCard.dispatchEvent(new DragEvent('dragover', {
          bubbles: true, cancelable: true, dataTransfer,
          clientX: targetRect.x + targetRect.width/2, clientY: targetRect.y + targetRect.height/2,
        }));
        
        targetCard.dispatchEvent(new DragEvent('drop', {
          bubbles: true, cancelable: true, dataTransfer,
          clientX: targetRect.x + targetRect.width/2, clientY: targetRect.y + targetRect.height/2,
        }));
        
        card.dispatchEvent(new DragEvent('dragend', {
          bubbles: true, cancelable: true, dataTransfer,
        }));
        
        return { success: true };
      }, {cardIdx: predDomIdx, targetFieldIdx: preyFieldIdx});
      
      log(`  Drag result: ${JSON.stringify(result)}`);
      await page.waitForTimeout(1000);
      
      // Check for panel or extended consumption
      const afterDirect = await page.evaluate(() => {
        const panel = document.getElementById('selection-panel');
        const s = window.__qa?.getState();
        return {
          panel: panel?.innerHTML?.substring(0, 500) || '',
          panelChildren: panel?.children?.length || 0,
          field: s?.players?.[0]?.field?.map(c => c ? `${c.name}(${c.type})` : 'empty'),
          extendedConsumption: !!s?.extendedConsumption,
          extendedData: s?.extendedConsumption,
          phase: s?.phase,
        };
      });
      
      log(`  Panel: ${afterDirect.panelChildren} children`);
      if (afterDirect.panel) log(`  HTML: ${afterDirect.panel.substring(0, 300)}`);
      log(`  Field: ${afterDirect.field?.join(', ')}`);
      log(`  Extended: ${afterDirect.extendedConsumption}`);
      if (afterDirect.extendedData) log(`  Extended data: ${JSON.stringify(afterDirect.extendedData)}`);
      
      // Check for CSS markers
      const markers = await page.evaluate(() => {
        return {
          active: document.querySelectorAll('.extended-consumption-active').length,
          targets: document.querySelectorAll('.consumption-target').length,
        };
      });
      log(`  CSS markers: active=${markers.active} targets=${markers.targets}`);
      
      log('\n✅ DIRECT CONSUMPTION TESTED!');
      break;
    }
    
    // === TEST: Direct consumption with empty slot — drag predator onto prey ===
    if (predInHand.length > 0 && preyOnField.length > 0 && emptySlots > 0) {
      log('\n🧪 DIRECT CONSUMPTION TEST (with empty slot)');
      const pred = predInHand[0];
      const preyFieldIdx = state.field.findIndex(c => c && c.type === 'Prey');
      
      log(`  Dragging ${pred.name} onto ${state.field[preyFieldIdx].name} at field idx ${preyFieldIdx}`);
      
      const predDomIdx = await page.evaluate((iid) => {
        const cards = document.querySelectorAll('.hand-grid .card');
        for (let i = 0; i < cards.length; i++) {
          if (cards[i].dataset.instanceId === iid) return i;
        }
        return -1;
      }, pred.instanceId);
      
      const result = await page.evaluate(({cardIdx, targetFieldIdx}) => {
        const handCards = document.querySelectorAll('.hand-grid .card');
        const card = handCards[cardIdx];
        if (!card) return { error: 'no hand card' };
        
        const slots = document.querySelectorAll('.field-slot');
        const targetSlot = slots[targetFieldIdx + 3];
        const targetCard = targetSlot?.querySelector('.card');
        if (!targetCard) return { error: 'no card in target slot' };
        
        const cardRect = card.getBoundingClientRect();
        const targetRect = targetCard.getBoundingClientRect();
        
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', card.dataset.instanceId);
        
        card.dispatchEvent(new DragEvent('dragstart', {
          bubbles: true, cancelable: true, dataTransfer,
          clientX: cardRect.x + cardRect.width/2, clientY: cardRect.y + cardRect.height/2,
        }));
        
        targetCard.dispatchEvent(new DragEvent('dragover', {
          bubbles: true, cancelable: true, dataTransfer,
          clientX: targetRect.x + targetRect.width/2, clientY: targetRect.y + targetRect.height/2,
        }));
        
        targetCard.dispatchEvent(new DragEvent('drop', {
          bubbles: true, cancelable: true, dataTransfer,
          clientX: targetRect.x + targetRect.width/2, clientY: targetRect.y + targetRect.height/2,
        }));
        
        card.dispatchEvent(new DragEvent('dragend', {
          bubbles: true, cancelable: true, dataTransfer,
        }));
        
        return { success: true };
      }, {cardIdx: predDomIdx, targetFieldIdx: preyFieldIdx});
      
      log(`  Drag result: ${JSON.stringify(result)}`);
      await page.waitForTimeout(1000);
      
      const afterDirect = await page.evaluate(() => {
        const panel = document.getElementById('selection-panel');
        const s = window.__qa?.getState();
        return {
          panel: panel?.innerHTML?.substring(0, 500) || '',
          panelChildren: panel?.children?.length || 0,
          field: s?.players?.[0]?.field?.map(c => c ? `${c.name}(${c.type})` : 'empty'),
          extendedConsumption: !!s?.extendedConsumption,
          extendedData: s?.extendedConsumption ? JSON.stringify(s.extendedConsumption).substring(0, 300) : null,
          phase: s?.phase,
          hand: s?.players?.[0]?.hand?.length,
        };
      });
      
      log(`  Panel: ${afterDirect.panelChildren} children`);
      if (afterDirect.panel) log(`  HTML: ${afterDirect.panel.substring(0, 300)}`);
      log(`  Field: ${afterDirect.field?.join(', ')}`);
      log(`  Extended: ${afterDirect.extendedConsumption}`);
      if (afterDirect.extendedData) log(`  Extended data: ${afterDirect.extendedData}`);
      
      const markers = await page.evaluate(() => ({
        active: document.querySelectorAll('.extended-consumption-active').length,
        targets: document.querySelectorAll('.consumption-target').length,
      }));
      log(`  CSS markers: active=${markers.active} targets=${markers.targets}`);
      
      log('\n✅ DIRECT CONSUMPTION TESTED!');
      break;
    }
    
    // Default: play prey to build board
    if (preyInHand.length > 0 && emptySlots > 0) {
      const prey = preyInHand[0];
      const preyDomIdx = await page.evaluate((iid) => {
        const cards = document.querySelectorAll('.hand-grid .card');
        for (let i = 0; i < cards.length; i++) {
          if (cards[i].dataset.instanceId === iid) return i;
        }
        return -1;
      }, prey.instanceId);
      
      const emptySlotIdx = await page.evaluate(() => {
        const slots = document.querySelectorAll('.field-slot');
        for (let i = 3; i <= 5; i++) {
          if (!slots[i].querySelector('.card')) return i - 3;
        }
        return 0;
      });
      
      log(`  Playing prey: ${prey.name} → slot ${emptySlotIdx}`);
      await page.evaluate(({cardIdx, slotIdx}) => {
        const card = document.querySelectorAll('.hand-grid .card')[cardIdx];
        const slot = document.querySelectorAll('.field-slot')[slotIdx + 3];
        if (!card || !slot) return;
        const dt = new DataTransfer();
        dt.setData('text/plain', card.dataset.instanceId);
        const cr = card.getBoundingClientRect();
        const sr = slot.getBoundingClientRect();
        card.dispatchEvent(new DragEvent('dragstart', { bubbles:true, cancelable:true, dataTransfer:dt, clientX:cr.x+cr.width/2, clientY:cr.y+cr.height/2 }));
        slot.dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true, dataTransfer:dt, clientX:sr.x+sr.width/2, clientY:sr.y+sr.height/2 }));
        slot.dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer:dt, clientX:sr.x+sr.width/2, clientY:sr.y+sr.height/2 }));
        card.dispatchEvent(new DragEvent('dragend', { bubbles:true, cancelable:true, dataTransfer:dt }));
      }, {cardIdx: preyDomIdx, slotIdx: emptySlotIdx});
    } else {
      log(`  No play (no prey/no slots)`);
    }
    
    // End turn
    for (let i = 0; i < 8; i++) {
      const s = await page.evaluate(() => {
        const btn = document.getElementById('field-turn-btn');
        if (btn && btn.offsetHeight > 0) btn.click();
        return { phase: window.__qa?.getState()?.phase, myTurn: window.__qa?.getState()?.ui?.isMyTurn };
      });
      if (!s.myTurn) break;
      await page.waitForTimeout(300);
    }
    
    // Pass opponent turn
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => document.getElementById('pass-confirm')?.click());
      const s = await page.evaluate(() => ({
        phase: window.__qa?.getState()?.phase,
        myTurn: window.__qa?.getState()?.ui?.isMyTurn,
        over: window.__qa?.isGameOver()?.over,
      }));
      if (s.over || (s.myTurn && s.phase === 'Main 1')) break;
      await page.waitForTimeout(500);
    }
  }
  
  await browser.close();
  log('\n🏁 Done!');
})();
