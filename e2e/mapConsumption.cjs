/**
 * Map Consumption UI — Focused exploration of the consumption checkbox panel
 * 
 * Two consumption paths in the drag-and-drop system:
 * 1. Drag predator to EMPTY field slot → "Play predator" panel (Consume/Dry drop)
 *    → "Select up to 3 prey" checkbox panel + Confirm
 * 2. Drag predator ONTO prey on field → direct consumption (single prey, no panel)
 * 
 * Strategy: Play prey early, protect them (no attacking), survive until we draw a predator.
 * 
 * DOM drag-and-drop for all actions. QA API only for state verification.
 */

const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState } = require('./gameHelpers.cjs');
const { dragCardToField, dragAttack, dragAttackPlayer } = require('./domInteraction.cjs');

function log(msg) { console.log(msg); }

async function clickPhaseButton(page) {
  return page.evaluate(() => {
    const btn = document.getElementById('field-turn-btn');
    if (!btn || btn.offsetHeight === 0) return { success: false };
    btn.click();
    return { success: true, text: btn.textContent.trim() };
  });
}

async function findEmptySlot(page) {
  return page.evaluate(() => {
    const slots = document.querySelectorAll('.field-slot');
    for (let i = 3; i <= 5; i++) {
      if (slots[i] && !slots[i].querySelector('.card')) return i - 3;
    }
    return -1;
  });
}

async function scanPanel(page) {
  return page.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    if (!panel || panel.innerHTML.trim() === '') return null;
    
    const result = { visible: true };
    const header = panel.querySelector('.selection-header');
    result.title = header?.querySelector('strong')?.textContent || '';
    
    const allButtons = Array.from(panel.querySelectorAll('button')).filter(b => b.offsetHeight > 0);
    result.buttons = allButtons.map(b => ({
      text: b.textContent.trim(),
      className: b.className,
    }));
    
    const checkboxes = Array.from(panel.querySelectorAll('input[type="checkbox"]'));
    result.checkboxes = checkboxes.map(cb => ({
      value: cb.value,
      checked: cb.checked,
      label: cb.parentElement?.querySelector('span')?.textContent || '',
    }));
    
    result.html = panel.innerHTML.substring(0, 2000);
    return result;
  });
}

async function waitPanel(page, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const p = await scanPanel(page);
    if (p) return p;
    await page.waitForTimeout(100);
  }
  return null;
}

async function clickPanelButton(page, text) {
  return page.evaluate((txt) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return { success: false, error: 'no panel' };
    const buttons = Array.from(panel.querySelectorAll('button')).filter(b => b.offsetHeight > 0);
    for (const b of buttons) {
      if (b.textContent.trim().toLowerCase().includes(txt.toLowerCase())) {
        b.click();
        return { success: true, clicked: b.textContent.trim() };
      }
    }
    return { success: false, available: buttons.map(b => b.textContent.trim()) };
  }, text);
}

async function checkAndConfirm(page, indices) {
  return page.evaluate((idxs) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return { success: false, error: 'no panel' };
    const cbs = Array.from(panel.querySelectorAll('input[type="checkbox"]'));
    if (cbs.length === 0) return { success: false, error: 'no checkboxes' };
    
    const checked = [];
    for (const i of idxs) {
      if (cbs[i]) {
        cbs[i].checked = true;
        cbs[i].dispatchEvent(new Event('change', { bubbles: true }));
        checked.push({ idx: i, value: cbs[i].value });
      }
    }
    
    const buttons = Array.from(panel.querySelectorAll('button')).filter(b => b.offsetHeight > 0);
    for (const b of buttons) {
      if (b.textContent.trim().toLowerCase().includes('confirm')) {
        b.click();
        return { success: true, checked, totalCbs: cbs.length };
      }
    }
    return { success: false, error: 'no confirm button', checked };
  }, indices);
}

async function dragPredatorOntoPrey(page, handCardIdx, fieldSlotIdx) {
  return page.evaluate(({cardIdx, slotIdx}) => {
    const handCards = document.querySelectorAll('.hand-grid .card');
    const card = handCards[cardIdx];
    if (!card) return { success: false, error: `No card at hand index ${cardIdx}` };
    
    const slots = document.querySelectorAll('.field-slot');
    const targetSlot = slots[slotIdx + 3];
    const targetCard = targetSlot?.querySelector('.card');
    if (!targetCard) return { success: false, error: `No card in field slot ${slotIdx}` };
    
    const cardRect = card.getBoundingClientRect();
    const targetRect = targetCard.getBoundingClientRect();
    
    const dataTransfer = new DataTransfer();
    const instanceId = card.dataset.instanceId;
    if (instanceId) dataTransfer.setData('text/plain', instanceId);
    
    card.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: cardRect.x + cardRect.width / 2,
      clientY: cardRect.y + cardRect.height / 2,
    }));
    
    targetCard.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: targetRect.x + targetRect.width / 2,
      clientY: targetRect.y + targetRect.height / 2,
    }));
    
    targetCard.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: targetRect.x + targetRect.width / 2,
      clientY: targetRect.y + targetRect.height / 2,
    }));
    
    card.dispatchEvent(new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer,
    }));
    
    return { success: true, predator: card.querySelector('[class*=name]')?.innerText?.trim(),
             target: targetCard.querySelector('[class*=name]')?.innerText?.trim() };
  }, {cardIdx: handCardIdx, slotIdx: fieldSlotIdx});
}

async function passAndWait(page) {
  for (let i = 0; i < 30; i++) {
    const r = await page.evaluate(() => {
      const btn = document.getElementById('pass-confirm');
      if (btn && btn.offsetHeight > 0) { btn.click(); return 'pass'; }
      return null;
    });
    
    const s = await page.evaluate(() => ({
      phase: window.__qa?.getState()?.phase,
      myTurn: window.__qa?.getState()?.ui?.isMyTurn,
      over: window.__qa?.isGameOver()?.over,
    }));
    
    if (s.over) return 'gameover';
    if (s.myTurn && s.phase === 'Main 1') return 'ready';
    await page.waitForTimeout(400);
  }
  return 'timeout';
}

async function endTurnSafe(page) {
  // Click through phases until opponent's turn, then pass through
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => ({
      phase: window.__qa?.getState()?.phase,
      myTurn: window.__qa?.getState()?.ui?.isMyTurn,
      over: window.__qa?.isGameOver()?.over,
    }));
    if (s.over) return 'gameover';
    if (!s.myTurn) break;
    await clickPhaseButton(page);
    await page.waitForTimeout(300);
  }
  return await passAndWait(page);
}

async function runGame(page, deckType) {
  log(`\n${'='.repeat(60)}`);
  log(`  GAME: ${deckType} deck`);
  log(`${'='.repeat(60)}\n`);
  
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(1000);
  await setupGame(page, deckType);
  log('  Setup complete');
  
  const results = { panelConsumption: false, directConsumption: false, dryDrop: false, panels: [] };
  
  for (let turn = 0; turn < 30; turn++) {
    const state = await getState(page);
    if (!state) { log('  ⚠️ No state'); break; }
    if (state.gameOver?.over) {
      log(`  🏆 GAME OVER T${state.turn} — ${state.gameOver.winner === 0 ? 'WIN' : 'LOSS'} (${state.myHP}-${state.oppHP})`);
      break;
    }
    if (!state.myTurn || state.phase !== 'Main 1') {
      const r = await passAndWait(page);
      if (r === 'gameover') break;
      continue;
    }
    
    const hand = state.hand || [];
    const myField = state.myField || [];
    const myCreatures = myField.filter(c => c);
    const emptySlots = 3 - myCreatures.length;
    
    const prey = hand.map((c, i) => ({...c, idx: i})).filter(c => c.type === 'Prey');
    const preds = hand.map((c, i) => ({...c, idx: i})).filter(c => c.type === 'Predator');
    const preyOnField = myCreatures.filter(c => c.type === 'Prey');
    const preySlotIndices = [];
    for (let i = 0; i < 3; i++) {
      if (myField[i] && myField[i].type === 'Prey') preySlotIndices.push(i);
    }
    
    log(`  T${state.turn} | HP ${state.myHP}-${state.oppHP} | Field: ${myCreatures.map(c => `${c.name}(${c.type[0]})`).join(',')} | Prey-field: ${preyOnField.length} | Pred-hand: ${preds.length} | Prey-hand: ${prey.length} | Empty: ${emptySlots}`);
    
    // === PRIORITY 1: Predator + prey on field + empty slot → panel consumption test ===
    if (!results.panelConsumption && preds.length > 0 && preyOnField.length > 0 && emptySlots > 0) {
      const pred = preds[0];
      const emptySlot = await findEmptySlot(page);
      log(`\n  🧪 PANEL TEST: ${pred.name} → empty slot ${emptySlot}`);
      log(`     Prey: ${preyOnField.map(c => c.name).join(', ')}`);
      
      await dragCardToField(page, pred.idx, emptySlot);
      await page.waitForTimeout(1000);
      
      let panel = await waitPanel(page, 3000);
      if (panel) {
        log(`  📊 PANEL: "${panel.title}"`);
        log(`     Buttons: [${panel.buttons.map(b => `"${b.text}"(${b.className})`).join(', ')}]`);
        results.panels.push({ stage: 'play-predator', ...panel });
        
        if (panel.buttons.some(b => b.text.toLowerCase().includes('consume'))) {
          log(`  → Clicking "Consume"`);
          await clickPanelButton(page, 'consume');
          await page.waitForTimeout(500);
          
          let cbPanel = await waitPanel(page, 3000);
          if (cbPanel) {
            log(`  📊 CHECKBOX PANEL: "${cbPanel.title}"`);
            log(`     Checkboxes: [${cbPanel.checkboxes.map(c => `"${c.label}" val=${c.value}`).join(', ')}]`);
            log(`     Buttons: [${cbPanel.buttons.map(b => `"${b.text}"(${b.className})`).join(', ')}]`);
            results.panels.push({ stage: 'consume-checkboxes', ...cbPanel });
            
            if (cbPanel.checkboxes.length > 0) {
              log(`  → Checking first checkbox + Confirm`);
              const cr = await checkAndConfirm(page, [0]);
              log(`     Result: ${JSON.stringify(cr)}`);
              await page.waitForTimeout(1000);
              
              // Check for additional consumption
              let addPanel = await waitPanel(page, 2000);
              if (addPanel) {
                log(`  📊 ADDITIONAL: "${addPanel.title}"`);
                log(`     Checkboxes: [${addPanel.checkboxes.map(c => `"${c.label}"`).join(', ')}]`);
                results.panels.push({ stage: 'additional-consumption', ...addPanel });
                await clickPanelButton(page, 'confirm');
                await page.waitForTimeout(500);
              }
              
              results.panelConsumption = true;
              log(`  ✅ PANEL CONSUMPTION MAPPED!\n`);
            }
          } else {
            log(`  ⚠️ No checkbox panel appeared`);
          }
        } else if (panel.buttons.some(b => b.text.toLowerCase().includes('dry'))) {
          log(`  → Only Dry drop available (no valid prey?)`);
          await clickPanelButton(page, 'dry');
          results.dryDrop = true;
        }
      } else {
        log(`  ⚠️ No panel appeared — checking state`);
        const ns = await getState(page);
        log(`     Phase: ${ns?.phase} Pending: ${JSON.stringify(ns?.pending)?.substring(0,200)}`);
      }
      
      const r = await endTurnSafe(page);
      if (r === 'gameover') break;
      continue;
    }
    
    // === PRIORITY 2: Direct consumption (drag pred onto prey, full field) ===
    if (!results.directConsumption && preds.length > 0 && preyOnField.length > 0 && emptySlots === 0 && preySlotIndices.length > 0) {
      const pred = preds[0];
      const targetSlot = preySlotIndices[0];
      log(`\n  🧪 DIRECT TEST: ${pred.name} → prey at slot ${targetSlot} (full field)`);
      
      const dragResult = await dragPredatorOntoPrey(page, pred.idx, targetSlot);
      log(`     Result: ${JSON.stringify(dragResult)}`);
      await page.waitForTimeout(1000);
      
      const panel = await scanPanel(page);
      if (panel) {
        log(`  📊 PANEL: "${panel.title}" buttons=[${panel.buttons.map(b => b.text).join(',')}]`);
        results.panels.push({ stage: 'direct-consumption', ...panel });
        if (panel.buttons.some(b => b.text.toLowerCase().includes('confirm'))) {
          await clickPanelButton(page, 'confirm');
        }
      }
      
      // Check for extended consumption CSS markers
      const ext = await page.evaluate(() => {
        const active = document.querySelector('.extended-consumption-active');
        const targets = document.querySelectorAll('.consumption-target');
        return {
          hasActive: !!active,
          targetCount: targets.length,
          targets: Array.from(targets).map(t => t.querySelector('[class*=name]')?.innerText?.trim()),
        };
      });
      log(`     Extended: active=${ext.hasActive} targets=${ext.targetCount} [${ext.targets.join(',')}]`);
      
      results.directConsumption = true;
      log(`  ✅ DIRECT CONSUMPTION ATTEMPTED!\n`);
      
      const r = await endTurnSafe(page);
      if (r === 'gameover') break;
      continue;
    }
    
    // === PRIORITY 3: Dry drop (predator, no prey on field) ===
    if (!results.dryDrop && preds.length > 0 && preyOnField.length === 0 && emptySlots > 0) {
      const pred = preds[0];
      const emptySlot = await findEmptySlot(page);
      log(`\n  🧪 DRY DROP TEST: ${pred.name} → slot ${emptySlot}`);
      
      await dragCardToField(page, pred.idx, emptySlot);
      await page.waitForTimeout(800);
      
      const panel = await waitPanel(page, 2000);
      if (panel) {
        log(`  📊 PANEL: "${panel.title}" buttons=[${panel.buttons.map(b => `"${b.text}"(${b.className})`).join(',')}]`);
        results.panels.push({ stage: 'dry-drop', ...panel });
        
        if (panel.buttons.some(b => b.text.toLowerCase().includes('dry'))) {
          await clickPanelButton(page, 'dry');
          results.dryDrop = true;
          log(`  ✅ DRY DROP MAPPED!\n`);
        } else if (panel.buttons.some(b => b.text.toLowerCase().includes('consume'))) {
          log(`  ⚠️ Consume button visible even with no prey? Checking carrion...`);
          results.panels.push({ stage: 'dry-drop-has-consume', note: 'carrion might be available', ...panel });
          await clickPanelButton(page, 'dry');
          results.dryDrop = true;
        }
      } else {
        log(`  → No panel appeared, checking field`);
        const ns = await getState(page);
        const nf = ns?.myField?.filter(c => c) || [];
        if (nf.length > myCreatures.length) {
          results.dryDrop = true;
          log(`  ✅ Auto dry drop (field grew)\n`);
        }
      }
      
      const r = await endTurnSafe(page);
      if (r === 'gameover') break;
      continue;
    }
    
    // === Default: Play highest-HP prey to survive ===
    if (prey.length > 0 && emptySlots > 0) {
      // Sort by HP descending — pick toughest prey to survive AI attacks
      const sorted = [...prey].sort((a, b) => (b.currentHp || b.hp || 0) - (a.currentHp || a.hp || 0));
      const p = sorted[0];
      const slot = await findEmptySlot(page);
      log(`  🐦 Play prey: ${p.name} (HP ${p.currentHp || p.hp || '?'}) → slot ${slot}`);
      await dragCardToField(page, p.idx, slot);
      await page.waitForTimeout(500);
      
      const panel = await scanPanel(page);
      if (panel) {
        log(`     Panel: "${panel.title}" buttons=[${panel.buttons.map(b => b.text).join(',')}]`);
        if (panel.buttons.some(b => b.text.toLowerCase().includes('confirm'))) {
          await clickPanelButton(page, 'confirm');
        }
      }
    } else if (preds.length > 0 && emptySlots > 0 && preyOnField.length === 0) {
      // No prey — dry drop a predator
      const pred = preds[0];
      const slot = await findEmptySlot(page);
      log(`  🍂 Dry drop: ${pred.name} → slot ${slot}`);
      await dragCardToField(page, pred.idx, slot);
      await page.waitForTimeout(800);
      const panel = await waitPanel(page, 2000);
      if (panel && panel.buttons.some(b => b.text.toLowerCase().includes('dry'))) {
        await clickPanelButton(page, 'dry');
      }
    } else {
      log(`  ⏭ No play`);
    }
    
    // Skip combat — don't attack to preserve prey on field
    const r = await endTurnSafe(page);
    if (r === 'gameover') break;
    
    if (results.panelConsumption && results.directConsumption && results.dryDrop) {
      log('\n  🎉 ALL PATHS MAPPED!');
      break;
    }
  }
  
  return results;
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();
  
  log('🔍 Consumption UI Mapper\n');
  
  const decks = ['mammal', 'reptile', 'amphibian', 'bird', 'fish'];
  let allResults = [];
  
  for (const deck of decks) {
    try {
      const results = await runGame(page, deck);
      allResults.push({ deck, ...results });
      
      log(`\n  ${deck}: panel=${results.panelConsumption} direct=${results.directConsumption} dry=${results.dryDrop}`);
      
      if (results.panelConsumption) {
        log('\n✅ Panel consumption flow fully mapped! Details:');
        for (const p of results.panels) {
          log(`  [${p.stage}] "${p.title}"`);
          if (p.buttons) log(`    Buttons: ${p.buttons.map(b => `"${b.text}"(${b.className})`).join(', ')}`);
          if (p.checkboxes?.length) log(`    Checkboxes: ${p.checkboxes.map(c => `"${c.label}" val=${c.value}`).join(', ')}`);
        }
        break;
      }
    } catch (e) {
      log(`  ❌ Error: ${e.message}`);
      allResults.push({ deck, error: e.message });
    }
  }
  
  log('\n' + '='.repeat(60));
  log('  FINAL RESULTS');
  log('='.repeat(60));
  for (const r of allResults) {
    log(`  ${r.deck}: panel=${r.panelConsumption || false} direct=${r.directConsumption || false} dry=${r.dryDrop || false} ${r.error ? '❌ ' + r.error : ''}`);
  }
  
  await browser.close();
  log('\n🏁 Done!');
})();
