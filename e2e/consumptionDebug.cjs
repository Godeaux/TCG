/**
 * Consumption Debug — Diagnose why panel isn't appearing
 * 
 * Steps:
 * 1. Setup game with mammal deck (has predators + prey)
 * 2. Play prey first (via DOM drag)
 * 3. Wait a turn for prey to survive
 * 4. Then play predator (via DOM drag) and observe panel
 * 5. Log everything about the state at each step
 */
const { webkit } = require('@playwright/test');

function log(msg) { console.log(msg); }

(async () => {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();
  
  // Listen for console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('consume') || text.includes('Consume') || text.includes('prey') || 
        text.includes('predator') || text.includes('drop') || text.includes('selection') ||
        text.includes('handlePlay') || text.includes('handleField') ||
        text.includes('drag')) {
      log(`  [CONSOLE] ${text.substring(0, 200)}`);
    }
  });
  
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  
  // Setup game
  log('=== SETUP ===');
  await page.click('#menu-other', { force: true }); await page.waitForTimeout(300);
  await page.click('#other-ai', { force: true }); await page.waitForTimeout(300);
  await page.click('#ai-deck-random', { force: true }); await page.waitForTimeout(1000);
  await page.click('.deck-select-panel--mammal', { force: true }); await page.waitForTimeout(1000);
  await page.click('#deck-random', { force: true }); await page.waitForTimeout(500);
  await page.click('#deck-confirm', { force: true }); await page.waitForTimeout(3000);
  
  // Complete setup (roll + choose)
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
  
  // Get initial state
  const state = await page.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      phase: s?.phase,
      turn: s?.turn,
      myTurn: s?.ui?.isMyTurn,
      hand: s?.players?.[0]?.hand?.map(c => ({ name: c.name, type: c.type, instanceId: c.instanceId })),
      field: s?.players?.[0]?.field?.map(c => c ? { name: c.name, type: c.type } : null),
      hp: [s?.players?.[0]?.hp, s?.players?.[1]?.hp],
    };
  });
  
  log(`Turn ${state.turn} | Phase: ${state.phase} | HP: ${state.hp.join('-')}`);
  log(`Hand: ${state.hand?.map(c => `${c.name}(${c.type})`).join(', ')}`);
  log(`Field: ${state.field?.map(c => c ? c.name : 'empty').join(', ')}`);
  
  // Find prey and predator in hand
  const preyIdx = state.hand?.findIndex(c => c.type === 'Prey');
  const predIdx = state.hand?.findIndex(c => c.type === 'Predator');
  
  log(`\nPrey at idx ${preyIdx}, Predator at idx ${predIdx}`);
  
  if (preyIdx === -1) {
    log('❌ No prey in hand. Trying different approach...');
    await browser.close();
    return;
  }
  
  // STEP 1: Play prey to slot 0
  log('\n=== STEP 1: PLAY PREY ===');
  
  // Debug: Check what DOM elements exist
  const domInfo = await page.evaluate(() => {
    const handCards = document.querySelectorAll('.hand-grid .card');
    const slots = document.querySelectorAll('.field-slot');
    return {
      handCardCount: handCards.length,
      handCards: Array.from(handCards).map((c, i) => ({
        idx: i,
        instanceId: c.dataset.instanceId,
        draggable: c.draggable,
        name: c.querySelector('[class*=name]')?.innerText?.trim(),
      })),
      slotCount: slots.length,
      slots: Array.from(slots).map((s, i) => ({
        idx: i,
        slot: s.dataset.slot,
        hasCard: !!s.querySelector('.card'),
      })),
    };
  });
  
  log(`DOM: ${domInfo.handCardCount} hand cards, ${domInfo.slotCount} field slots`);
  log(`Hand DOM: ${domInfo.handCards.map(c => `[${c.idx}]${c.name}(${c.instanceId?.substring(0,8)}...) drag=${c.draggable}`).join(', ')}`);
  log(`Slots: ${domInfo.slots.map(s => `[${s.idx}]slot=${s.slot} card=${s.hasCard}`).join(', ')}`);
  
  // Drag prey to slot 0 (player slots are index 3,4,5 in DOM)
  const dragResult = await page.evaluate(({cardIdx}) => {
    const handCards = document.querySelectorAll('.hand-grid .card');
    const card = handCards[cardIdx];
    if (!card) return { error: 'no card at index' };
    
    const slots = document.querySelectorAll('.field-slot');
    const targetSlot = slots[3]; // Player slot 0
    if (!targetSlot) return { error: 'no target slot' };
    
    const cardRect = card.getBoundingClientRect();
    const slotRect = targetSlot.getBoundingClientRect();
    
    const dataTransfer = new DataTransfer();
    const instanceId = card.dataset.instanceId;
    if (instanceId) dataTransfer.setData('text/plain', instanceId);
    
    card.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: cardRect.x + cardRect.width/2, clientY: cardRect.y + cardRect.height/2,
    }));
    
    targetSlot.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: slotRect.x + slotRect.width/2, clientY: slotRect.y + slotRect.height/2,
    }));
    
    targetSlot.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: slotRect.x + slotRect.width/2, clientY: slotRect.y + slotRect.height/2,
    }));
    
    card.dispatchEvent(new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer,
    }));
    
    return { 
      success: true, 
      cardName: card.querySelector('[class*=name]')?.innerText?.trim(),
      instanceId,
      slotDataset: targetSlot.dataset.slot,
    };
  }, {cardIdx: preyIdx});
  
  log(`Drag result: ${JSON.stringify(dragResult)}`);
  await page.waitForTimeout(1000);
  
  // Check state after play
  const afterPlay = await page.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      phase: s?.phase,
      turn: s?.turn,
      hand: s?.players?.[0]?.hand?.map(c => `${c.name}(${c.type})`),
      field: s?.players?.[0]?.field?.map(c => c ? `${c.name}(${c.type})` : 'empty'),
      cardPlayed: s?.ui?.cardPlayed,
      pending: s?.pendingContext,
    };
  });
  log(`After prey play: phase=${afterPlay.phase} hand=${afterPlay.hand?.length} field=${afterPlay.field?.join(',')} cardPlayed=${afterPlay.cardPlayed}`);
  log(`Pending: ${JSON.stringify(afterPlay.pending)}`);
  
  // Check panel
  const panel1 = await page.evaluate(() => {
    const p = document.getElementById('selection-panel');
    return p ? { html: p.innerHTML.substring(0, 500), children: p.children.length } : null;
  });
  log(`Panel after prey: ${JSON.stringify(panel1)}`);
  
  if (!afterPlay.field?.some(f => f && f !== 'empty' && !f.includes('empty'))) {
    log('❌ Prey was NOT played to field! Drag did not work.');
    
    // Try using QA API to check if drag system is initialized
    const dragInit = await page.evaluate(() => {
      return {
        hasQA: !!window.__qa,
        hasAct: !!window.__qa?.act,
        qaState: window.__qa?.getState()?.phase,
      };
    });
    log(`QA: ${JSON.stringify(dragInit)}`);
    
    await browser.close();
    return;
  }
  
  // STEP 2: End turn (advance phases)
  log('\n=== STEP 2: END TURN ===');
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => {
      const btn = document.getElementById('field-turn-btn');
      if (btn && btn.offsetHeight > 0) btn.click();
      return {
        phase: window.__qa?.getState()?.phase,
        myTurn: window.__qa?.getState()?.ui?.isMyTurn,
      };
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
      gameOver: window.__qa?.isGameOver()?.over,
    }));
    if (s.gameOver) { log('Game over!'); await browser.close(); return; }
    if (s.myTurn && s.phase === 'Main 1') break;
    await page.waitForTimeout(500);
  }
  
  // STEP 3: Check state - do we have prey on field + predator in hand?
  log('\n=== STEP 3: CHECK FOR CONSUMPTION SETUP ===');
  const state2 = await page.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      phase: s?.phase,
      turn: s?.turn,
      hand: s?.players?.[0]?.hand?.map(c => ({ name: c.name, type: c.type, instanceId: c.instanceId })),
      field: s?.players?.[0]?.field?.map(c => c ? { name: c.name, type: c.type, instanceId: c.instanceId } : null),
      hp: [s?.players?.[0]?.hp, s?.players?.[1]?.hp],
    };
  });
  
  log(`Turn ${state2.turn} | Phase: ${state2.phase} | HP: ${state2.hp.join('-')}`);
  log(`Hand: ${state2.hand?.map(c => `${c.name}(${c.type})`).join(', ')}`);
  log(`Field: ${state2.field?.map(c => c ? `${c.name}(${c.type})` : 'empty').join(', ')}`);
  
  const preyOnField = state2.field?.filter(c => c && c.type === 'Prey');
  const predInHand = state2.hand?.filter(c => c.type === 'Predator');
  const emptySlots = state2.field?.filter(c => !c);
  
  log(`Prey on field: ${preyOnField?.length}, Pred in hand: ${predInHand?.length}, Empty slots: ${emptySlots?.length}`);
  
  if (!predInHand?.length || !preyOnField?.length || !emptySlots?.length) {
    log('❌ Need: prey on field + predator in hand + empty slot. Missing one.');
    await browser.close();
    return;
  }
  
  // STEP 4: Play predator to empty slot
  log('\n=== STEP 4: PLAY PREDATOR (EXPECTING CONSUMPTION PANEL) ===');
  
  const pred = predInHand[0];
  log(`Playing: ${pred.name} (${pred.instanceId})`);
  
  // Find the predator's index in hand DOM
  const predDomIdx = await page.evaluate((instanceId) => {
    const cards = document.querySelectorAll('.hand-grid .card');
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].dataset.instanceId === instanceId) return i;
    }
    return -1;
  }, pred.instanceId);
  
  // Find empty slot
  const emptySlotIdx = await page.evaluate(() => {
    const slots = document.querySelectorAll('.field-slot');
    for (let i = 3; i <= 5; i++) {
      if (slots[i] && !slots[i].querySelector('.card')) return i - 3;
    }
    return -1;
  });
  
  log(`Predator at hand DOM idx ${predDomIdx}, target empty slot ${emptySlotIdx}`);
  
  const dragResult2 = await page.evaluate(({cardIdx, slotIdx}) => {
    const handCards = document.querySelectorAll('.hand-grid .card');
    const card = handCards[cardIdx];
    if (!card) return { error: `no card at idx ${cardIdx}` };
    
    const slots = document.querySelectorAll('.field-slot');
    const targetSlot = slots[slotIdx + 3];
    if (!targetSlot) return { error: `no slot at idx ${slotIdx + 3}` };
    
    const cardRect = card.getBoundingClientRect();
    const slotRect = targetSlot.getBoundingClientRect();
    
    const dataTransfer = new DataTransfer();
    const instanceId = card.dataset.instanceId;
    if (instanceId) dataTransfer.setData('text/plain', instanceId);
    
    card.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: cardRect.x + cardRect.width/2, clientY: cardRect.y + cardRect.height/2,
    }));
    
    targetSlot.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: slotRect.x + slotRect.width/2, clientY: slotRect.y + slotRect.height/2,
    }));
    
    targetSlot.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: slotRect.x + slotRect.width/2, clientY: slotRect.y + slotRect.height/2,
    }));
    
    card.dispatchEvent(new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer,
    }));
    
    return { 
      success: true, 
      cardName: card.querySelector('[class*=name]')?.innerText?.trim(),
      instanceId,
    };
  }, {cardIdx: predDomIdx, slotIdx: emptySlotIdx});
  
  log(`Drag result: ${JSON.stringify(dragResult2)}`);
  
  // Wait and check for panel
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300);
    
    const panelState = await page.evaluate(() => {
      const panel = document.getElementById('selection-panel');
      const uiState = window.__qa?.getState()?.ui;
      return {
        panelExists: !!panel,
        panelChildren: panel?.children?.length || 0,
        panelHtml: panel?.innerHTML?.substring(0, 500) || '',
        pendingConsumption: !!window.gameController?.uiState?.pendingConsumption,
        phase: window.__qa?.getState()?.phase,
        cardPlayed: uiState?.cardPlayed,
      };
    });
    
    log(`  [${i}] panel=${panelState.panelChildren} phase=${panelState.phase} cardPlayed=${panelState.cardPlayed} pending=${panelState.pendingConsumption}`);
    if (panelState.panelHtml) log(`  HTML: ${panelState.panelHtml.substring(0, 300)}`);
    
    if (panelState.panelChildren > 0) {
      log('\n✅ PANEL APPEARED!');
      
      // Scan buttons
      const buttons = await page.evaluate(() => {
        const panel = document.getElementById('selection-panel');
        return Array.from(panel.querySelectorAll('button')).filter(b => b.offsetHeight > 0).map(b => ({
          text: b.textContent.trim(),
          className: b.className,
        }));
      });
      log(`Buttons: ${buttons.map(b => `"${b.text}"(${b.className})`).join(', ')}`);
      
      // Scan checkboxes
      const cbs = await page.evaluate(() => {
        const panel = document.getElementById('selection-panel');
        return Array.from(panel.querySelectorAll('input[type="checkbox"]')).map(cb => ({
          value: cb.value,
          label: cb.parentElement?.querySelector('span')?.textContent,
        }));
      });
      log(`Checkboxes: ${cbs.map(c => `"${c.label}" val=${c.value}`).join(', ')}`);
      
      // Test: Click "Consume" button
      if (buttons.some(b => b.text.toLowerCase().includes('consume'))) {
        log('\n=== CLICKING CONSUME ===');
        await page.evaluate(() => {
          const panel = document.getElementById('selection-panel');
          const btns = Array.from(panel.querySelectorAll('button'));
          const consume = btns.find(b => b.textContent.trim().toLowerCase().includes('consume'));
          if (consume) consume.click();
        });
        await page.waitForTimeout(500);
        
        // Check for checkbox panel
        const cbPanel = await page.evaluate(() => {
          const panel = document.getElementById('selection-panel');
          if (!panel) return null;
          return {
            html: panel.innerHTML.substring(0, 1000),
            children: panel.children.length,
            buttons: Array.from(panel.querySelectorAll('button')).filter(b => b.offsetHeight > 0).map(b => b.textContent.trim()),
            checkboxes: Array.from(panel.querySelectorAll('input[type="checkbox"]')).map(cb => ({
              value: cb.value,
              label: cb.parentElement?.querySelector('span')?.textContent,
            })),
          };
        });
        
        if (cbPanel) {
          log(`Checkbox panel: ${cbPanel.children} children, ${cbPanel.checkboxes.length} checkboxes`);
          log(`Buttons: [${cbPanel.buttons.join(', ')}]`);
          log(`Checkboxes: ${cbPanel.checkboxes.map(c => `"${c.label}"`).join(', ')}`);
          
          if (cbPanel.checkboxes.length > 0) {
            log('\n=== SELECTING FIRST CHECKBOX + CONFIRM ===');
            const result = await page.evaluate(() => {
              const panel = document.getElementById('selection-panel');
              const cbs = panel.querySelectorAll('input[type="checkbox"]');
              if (cbs[0]) {
                cbs[0].checked = true;
                cbs[0].dispatchEvent(new Event('change', { bubbles: true }));
              }
              const confirmBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'confirm');
              if (confirmBtn) {
                confirmBtn.click();
                return { success: true };
              }
              return { error: 'no confirm button' };
            });
            log(`Confirm result: ${JSON.stringify(result)}`);
            await page.waitForTimeout(1000);
            
            // Check state after consumption
            const afterConsume = await page.evaluate(() => {
              const s = window.__qa?.getState();
              return {
                phase: s?.phase,
                field: s?.players?.[0]?.field?.map(c => c ? `${c.name}(${c.type})` : 'empty'),
                hand: s?.players?.[0]?.hand?.length,
                panel: document.getElementById('selection-panel')?.innerHTML?.substring(0, 300) || '',
              };
            });
            log(`After consume: phase=${afterConsume.phase} field=${afterConsume.field?.join(',')}`);
            log(`Panel: ${afterConsume.panel || '(empty)'}`);
            
            log('\n🎉 CONSUMPTION FLOW FULLY MAPPED!');
          }
        }
      }
      break;
    }
  }
  
  await page.waitForTimeout(1000);
  await browser.close();
  log('\n🏁 Done!');
})();
