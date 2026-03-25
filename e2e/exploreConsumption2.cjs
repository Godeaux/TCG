/**
 * Consumption Explorer v2 — Focused on triggering consumption panel
 * 
 * Strategy:
 * - Turn 1+: Play prey to get something on field
 * - Next turn: If prey survived, play PREDATOR to trigger consumption
 * - Map the full DOM flow of the consumption selection panel
 * 
 * Uses DOM drag-and-drop for all game actions.
 * QA API ONLY for state verification.
 */

const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState } = require('./gameHelpers.cjs');
const { dragCardToField, dragAttack, dragAttackPlayer, scanUI } = require('./domInteraction.cjs');

function log(msg) { console.log(msg); }
const findings = [];

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

/**
 * Detailed scan of #selection-panel
 */
async function scanSelectionPanel(page) {
  return page.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    if (!panel || panel.children.length === 0 || panel.offsetHeight === 0) return null;
    
    const result = {
      visible: panel.offsetHeight > 0,
      childCount: panel.children.length,
    };
    
    // Header
    const header = panel.querySelector('.selection-header');
    if (header) {
      result.title = header.querySelector('strong')?.textContent || header.textContent?.trim();
    }
    
    // All items (checkboxes / buttons)
    const items = panel.querySelectorAll('.selection-item');
    result.items = Array.from(items).map(item => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const span = item.querySelector('span');
      const button = item.querySelector('button');
      return {
        hasCheckbox: !!checkbox,
        checkboxId: checkbox?.id,
        checkboxValue: checkbox?.value,
        checkboxChecked: checkbox?.checked,
        label: span?.textContent || '',
        hasButton: !!button,
        buttonText: button?.textContent?.trim(),
        buttonClass: button?.className,
        innerHTML: item.innerHTML.substring(0, 200),
      };
    });
    
    // All visible buttons
    const buttons = panel.querySelectorAll('button');
    result.allButtons = Array.from(buttons).filter(b => b.offsetHeight > 0).map(b => ({
      text: b.textContent.trim(),
      className: b.className,
      id: b.id,
      disabled: b.disabled,
    }));
    
    // Raw HTML
    result.html = panel.innerHTML.substring(0, 2000);
    
    return result;
  });
}

/**
 * Click a button in #selection-panel by text
 */
async function clickPanelButton(page, buttonText) {
  return page.evaluate((text) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return { success: false, error: 'No panel' };
    const buttons = panel.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim().includes(text) && btn.offsetHeight > 0) {
        btn.click();
        return { success: true, clicked: btn.textContent.trim() };
      }
    }
    return { success: false, error: `No "${text}" button`, available: Array.from(buttons).map(b => b.textContent.trim()) };
  }, buttonText);
}

/**
 * Check checkboxes by indices (dispatching change events) and click Confirm
 */
async function checkAndConfirm(page, indices) {
  return page.evaluate((idxs) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return { success: false, error: 'No panel' };
    
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length === 0) return { success: false, error: 'No checkboxes found' };
    
    const checked = [];
    for (const idx of idxs) {
      if (checkboxes[idx]) {
        checkboxes[idx].checked = true;
        checkboxes[idx].dispatchEvent(new Event('change', { bubbles: true }));
        checked.push(idx);
      }
    }
    
    // Find and click Confirm
    const buttons = panel.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim().includes('Confirm') && btn.offsetHeight > 0) {
        btn.click();
        return { success: true, checked, totalCheckboxes: checkboxes.length };
      }
    }
    return { success: false, error: 'No Confirm button', checked };
  }, indices);
}

/**
 * Wait for selection panel to appear
 */
async function waitForPanel(page, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const panel = await scanSelectionPanel(page);
    if (panel) return panel;
    await page.waitForTimeout(200);
  }
  return null;
}

/**
 * Also check QA pending context for consumption state
 */
async function getPendingContext(page) {
  return page.evaluate(() => {
    const s = window.__qa?.getState();
    return s?.pendingContext || null;
  });
}

/**
 * Handle the full consumption flow via DOM
 */
async function handleConsumptionPanel(page) {
  let panel = await waitForPanel(page, 3000);
  if (!panel) {
    // Check QA API for pending state
    const pending = await getPendingContext(page);
    if (pending) {
      log(`    📋 QA pending context: ${JSON.stringify(pending).substring(0, 300)}`);
    }
    return { handled: false, type: 'no_panel', pending };
  }
  
  log(`    📊 Panel appeared!`);
  log(`       Title: "${panel.title}"`);
  log(`       Buttons: ${panel.allButtons.map(b => `"${b.text}"(${b.className}${b.disabled ? ',disabled' : ''})`).join(', ')}`);
  log(`       Items: ${panel.items.map(i => `${i.hasCheckbox ? '☐' : i.hasButton ? '🔘' : '?'} "${i.label || i.buttonText}"`).join(', ')}`);
  log(`       HTML snippet: ${panel.html?.substring(0, 400)}`);
  
  // Look for Consume / Dry drop buttons
  const hasConsume = panel.allButtons.some(b => b.text.includes('Consume'));
  const hasDryDrop = panel.allButtons.some(b => b.text.includes('Dry') || b.text.includes('dry'));
  const hasCheckboxes = panel.items.some(i => i.hasCheckbox);
  
  if (hasConsume) {
    log(`    🍖 CONSUMPTION CHOICE DETECTED!`);
    log(`       → Clicking "Consume"`);
    const r = await clickPanelButton(page, 'Consume');
    log(`       Result: ${JSON.stringify(r)}`);
    await page.waitForTimeout(500);
    
    // Should now show checkboxes for selecting prey
    const cbPanel = await waitForPanel(page, 2000);
    if (cbPanel) {
      log(`    📊 Checkbox panel:`);
      log(`       Title: "${cbPanel.title}"`);
      log(`       Items: ${cbPanel.items.map(i => `${i.hasCheckbox ? '☐' : '?'} "${i.label}" val=${i.checkboxValue}`).join(', ')}`);
      log(`       Buttons: ${cbPanel.allButtons.map(b => `"${b.text}"`).join(', ')}`);
      log(`       HTML: ${cbPanel.html?.substring(0, 500)}`);
      
      if (cbPanel.items.some(i => i.hasCheckbox)) {
        log(`    → Selecting first checkbox and confirming`);
        const confirmResult = await checkAndConfirm(page, [0]);
        log(`    → Confirm result: ${JSON.stringify(confirmResult)}`);
        await page.waitForTimeout(500);
        
        // Verify the panel is gone
        const afterPanel = await scanSelectionPanel(page);
        log(`    → Panel after confirm: ${afterPanel ? 'STILL SHOWING' : 'DISMISSED ✅'}`);
        
        return { handled: true, type: 'consumption_with_checkboxes', cbPanel };
      }
    }
    return { handled: true, type: 'consumption_no_checkbox_panel' };
  }
  
  if (hasDryDrop && !hasConsume) {
    log(`    🍂 DRY DROP ONLY (no prey to consume)`);
    const r = await clickPanelButton(page, 'Dry');
    log(`       Result: ${JSON.stringify(r)}`);
    return { handled: true, type: 'dry_drop_only' };
  }
  
  if (hasCheckboxes) {
    log(`    ☐ DIRECT CHECKBOXES (no consume/dry choice)`);
    const confirmResult = await checkAndConfirm(page, [0]);
    log(`    → Confirm result: ${JSON.stringify(confirmResult)}`);
    return { handled: true, type: 'direct_checkboxes' };
  }
  
  // Spell target or other panel
  if (panel.items.some(i => i.hasButton)) {
    log(`    🎯 BUTTON SELECTION PANEL (spell target?)`);
    const firstBtn = panel.items.find(i => i.hasButton);
    if (firstBtn) {
      const r = await clickPanelButton(page, firstBtn.buttonText);
      log(`    → Clicked "${firstBtn.buttonText}": ${JSON.stringify(r)}`);
      return { handled: true, type: 'button_selection' };
    }
  }
  
  log(`    ⚠️ UNKNOWN PANEL TYPE`);
  return { handled: false, type: 'unknown', panel };
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log('🔍 Consumption Explorer v2 — Focused on triggering consumption\n');
  
  // Bird deck has prey + predators
  await setupGame(p, 'bird');
  log('✅ Game setup complete (Bird deck)\n');
  
  let consumptionSeen = false;
  let dryDropSeen = false;
  let spellTargetSeen = false;
  let preyPlayedLastTurn = false;
  
  for (let round = 0; round < 60; round++) {
    const state = await getState(p);
    if (!state) { log('❌ No state'); break; }
    if (state.gameOver?.over) {
      log(`\n🏆 GAME OVER — ${state.gameOver.winner === 0 ? 'ME' : 'OPP'} WINS at T${state.turn} (${state.myHP}-${state.oppHP})`);
      break;
    }
    if (!state.myTurn || state.phase !== 'Main 1') {
      await waitForMyTurn(p);
      continue;
    }
    
    const hand = state.hand || [];
    const myField = state.myField?.filter(c => c) || [];
    const oppField = state.oppField?.filter(c => c) || [];
    const emptySlots = 3 - myField.length;
    
    const preyInHand = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Prey');
    const predInHand = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Predator');
    const spellInHand = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Spell' || c.type === 'Free Spell');
    const preyOnField = myField.filter(c => c.type === 'Prey');
    
    log(`\n═══ T${state.turn} | HP ${state.myHP}-${state.oppHP} | Board ${myField.length}v${oppField.length} | Empty: ${emptySlots} ═══`);
    log('Hand: ' + hand.map((c, i) => `[${i}]${c.name}(${c.type})`).join(' '));
    if (myField.length > 0) log('Field: ' + myField.map(c => `${c.name}(${c.type} ${c.currentAtk}/${c.currentHp})`).join(', '));
    log(`Prey on field: ${preyOnField.length} | Pred in hand: ${predInHand.length} | Prey in hand: ${preyInHand.length}`);
    
    let played = false;
    
    // === PRIORITY 1: If prey is on field AND we have a predator, PLAY PREDATOR ===
    if (preyOnField.length > 0 && predInHand.length > 0 && emptySlots > 0) {
      const pred = predInHand[0];
      log(`\n  🍖 PREDATOR PLAY: ${pred.name} — prey on field: ${preyOnField.map(c => c.name).join(', ')}`);
      const slot = await findEmptySlot(p);
      const dragResult = await dragCardToField(p, pred.idx, slot >= 0 ? slot : 0);
      log(`    Drag result: ${JSON.stringify(dragResult)}`);
      
      const result = await handleConsumptionPanel(p);
      log(`    Panel result: ${JSON.stringify({ handled: result.handled, type: result.type })}`);
      
      if (result.type?.includes('consumption')) consumptionSeen = true;
      if (result.type?.includes('dry_drop')) dryDropSeen = true;
      played = true;
    }
    // === PRIORITY 2: Play prey to build field (so predator can eat next turn) ===
    else if (preyInHand.length > 0 && emptySlots > 0) {
      const prey = preyInHand[0];
      log(`\n  🐦 PREY PLAY: ${prey.name}`);
      const slot = await findEmptySlot(p);
      const dragResult = await dragCardToField(p, prey.idx, slot >= 0 ? slot : 0);
      log(`    Drag result: ${JSON.stringify(dragResult)}`);
      
      const result = await handleConsumptionPanel(p);
      if (result.handled) log(`    Panel result: ${result.type}`);
      played = true;
      preyPlayedLastTurn = true;
    }
    // === PRIORITY 3: Play predator even without prey (dry drop) ===
    else if (predInHand.length > 0 && emptySlots > 0) {
      const pred = predInHand[0];
      log(`\n  🍂 PREDATOR DRY DROP: ${pred.name} (no prey on field)`);
      const slot = await findEmptySlot(p);
      const dragResult = await dragCardToField(p, pred.idx, slot >= 0 ? slot : 0);
      log(`    Drag result: ${JSON.stringify(dragResult)}`);
      
      const result = await handleConsumptionPanel(p);
      log(`    Panel result: ${JSON.stringify({ handled: result.handled, type: result.type })}`);
      
      if (result.type?.includes('dry_drop')) dryDropSeen = true;
      if (result.type?.includes('consumption')) consumptionSeen = true;
      played = true;
    }
    // === PRIORITY 4: Play spell ===
    else if (spellInHand.length > 0) {
      const spell = spellInHand[0];
      log(`\n  ✨ SPELL PLAY: ${spell.name}`);
      const slot = await findEmptySlot(p);
      const dragResult = await dragCardToField(p, spell.idx, slot >= 0 ? slot : 0);
      log(`    Drag result: ${JSON.stringify(dragResult)}`);
      
      const result = await handleConsumptionPanel(p);
      if (result.handled) {
        log(`    Panel result: ${result.type}`);
        if (result.type === 'button_selection') spellTargetSeen = true;
      }
      played = true;
    }
    else {
      log(`\n  ⏭ SKIP: No playable cards`);
    }
    
    // === COMBAT ===
    await clickPhaseButton(p);
    await p.waitForTimeout(500);
    
    let cs = await getState(p);
    if (cs?.phase === 'Combat') {
      const myCreatures = cs.myField?.filter(c => c && c.canAttack) || [];
      const oppCreatures = cs.oppField?.filter(c => c) || [];
      
      for (const c of myCreatures) {
        // Don't attack with prey if we want to preserve it for consumption
        if (c.type === 'Prey' && predInHand.length > 0) {
          log(`  🛡 Protecting ${c.name} (prey) for future consumption`);
          continue;
        }
        
        if (oppCreatures.length > 0) {
          const weakest = [...oppCreatures].sort((a, b) => a.currentHp - b.currentHp)[0];
          // Only attack if favorable
          if (c.currentAtk >= weakest.currentHp || c.currentHp > weakest.currentAtk) {
            log(`  ⚔ ${c.name}(${c.currentAtk}/${c.currentHp}) → ${weakest.name}(${weakest.currentAtk}/${weakest.currentHp})`);
            await dragAttack(p, c.slot, weakest.slot);
            await p.waitForTimeout(300);
          } else if (c.canAttackPlayer) {
            log(`  ⚔ ${c.name}(${c.currentAtk}) → Player`);
            await dragAttackPlayer(p, c.slot);
            await p.waitForTimeout(300);
          }
        } else if (c.canAttackPlayer) {
          log(`  ⚔ ${c.name}(${c.currentAtk}) → Player (open board)`);
          await dragAttackPlayer(p, c.slot);
          await p.waitForTimeout(300);
        }
      }
    }
    
    // === END TURN ===
    await clickPhaseButton(p); // → Main 2 or End
    await p.waitForTimeout(300);
    await clickPhaseButton(p); // → End
    await p.waitForTimeout(300);
    await clickPhaseButton(p); // extra
    await p.waitForTimeout(300);
    
    // Pass through opponent's turn
    for (let i = 0; i < 20; i++) {
      const passResult = await p.evaluate(() => {
        const btn = document.getElementById('pass-confirm');
        if (btn && btn.offsetHeight > 0) { btn.click(); return true; }
        return false;
      });
      if (!passResult) break;
      await p.waitForTimeout(300);
    }
    
    await waitForMyTurn(p);
    
    // Early exit if we've mapped everything
    if (consumptionSeen && dryDropSeen) {
      log('\n✅✅ CONSUMPTION + DRY DROP BOTH MAPPED!');
      break;
    }
  }
  
  // === FINAL SUMMARY ===
  log('\n═══════════════════════════════════════════');
  log('  CONSUMPTION UI MAPPING RESULTS');
  log('═══════════════════════════════════════════');
  log(`  Consumption checkboxes: ${consumptionSeen ? '✅ MAPPED' : '❌ NOT SEEN'}`);
  log(`  Dry drop button:        ${dryDropSeen ? '✅ MAPPED' : '❌ NOT SEEN'}`);
  log(`  Spell target selection:  ${spellTargetSeen ? '✅ MAPPED' : '❌ NOT SEEN'}`);
  
  if (findings.length > 0) {
    log('\n  FINDINGS:');
    findings.forEach(f => log(`  [${f.severity}] ${f.what}: ${f.actual}`));
  }
  
  await browser.close();
  log('\n🏁 Done!');
})();
