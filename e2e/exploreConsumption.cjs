/**
 * Explore Consumption UI — Map the DOM structure for predator consumption
 * 
 * Strategy: Play prey in Main 1, then predator in Main 2 (same turn)
 * to trigger consumption before prey dies to opponent attacks.
 * 
 * Uses QA API ONLY for state verification.
 */

const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState } = require('./gameHelpers.cjs');
const { dragCardToField, dragAttack, dragAttackPlayer, scanUI } = require('./domInteraction.cjs');

function log(msg) { console.log(msg); }

const findings = [];

/**
 * Scan the selection panel DOM structure in detail
 */
async function scanSelectionPanel(page) {
  return page.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    if (!panel || panel.children.length === 0) return null;
    
    const result = {
      visible: panel.offsetHeight > 0,
      childCount: panel.children.length,
    };
    
    // Header
    const header = panel.querySelector('.selection-header');
    if (header) {
      result.title = header.querySelector('strong')?.textContent;
    }
    
    // All items (checkboxes / buttons)
    const items = panel.querySelectorAll('.selection-item');
    result.items = Array.from(items).map(item => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const span = item.querySelector('span');
      const button = item.querySelector('button');
      return {
        hasCheckbox: !!checkbox,
        checkboxValue: checkbox?.value,
        label: span?.textContent || button?.textContent,
        hasButton: !!button,
        buttonText: button?.textContent,
        buttonClass: button?.className,
      };
    });
    
    // All buttons in panel
    const buttons = panel.querySelectorAll('button');
    result.allButtons = Array.from(buttons).filter(b => b.offsetHeight > 0).map(b => ({
      text: b.textContent.trim(),
      className: b.className,
    }));
    
    // Raw HTML for debugging
    result.html = panel.innerHTML.substring(0, 1500);
    
    return result;
  });
}

/**
 * Click a button in the selection panel by text
 */
async function clickPanelButton(page, buttonText) {
  return page.evaluate((text) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return { success: false, error: 'No panel' };
    const buttons = panel.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === text && btn.offsetHeight > 0) {
        btn.click();
        return { success: true };
      }
    }
    return { success: false, error: `No "${text}" button`, available: Array.from(buttons).map(b => b.textContent.trim()) };
  }, buttonText);
}

/**
 * Check checkboxes by index and click Confirm
 */
async function selectAndConfirm(page, indices) {
  return page.evaluate((idxs) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return { success: false, error: 'No panel' };
    
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length === 0) return { success: false, error: 'No checkboxes' };
    
    for (const idx of idxs) {
      if (checkboxes[idx]) checkboxes[idx].checked = true;
    }
    
    // Click Confirm
    const buttons = panel.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === 'Confirm' && btn.offsetHeight > 0) {
        btn.click();
        return { success: true, checked: idxs, totalCheckboxes: checkboxes.length };
      }
    }
    return { success: false, error: 'No Confirm button after checking' };
  }, indices);
}

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
 * Handle any selection panel that appears after a card play.
 * Returns what type of selection was handled.
 */
async function handleSelectionPanel(page, context = '') {
  await page.waitForTimeout(500);
  const panel = await scanSelectionPanel(page);
  if (!panel) return null;
  
  log(`    📊 Panel: "${panel.title}"`);
  log(`       Buttons: ${panel.allButtons.map(b => `"${b.text}"`).join(', ')}`);
  if (panel.items.length > 0) {
    log(`       Items: ${panel.items.map(i => `${i.hasCheckbox ? '☐' : '🔘'} "${i.label}"`).join(', ')}`);
  }
  
  // Case 1: Consume / Dry drop choice
  const hasConsume = panel.allButtons.some(b => b.text === 'Consume');
  const hasDryDrop = panel.allButtons.some(b => b.text === 'Dry drop');
  
  if (hasConsume) {
    log(`    → Clicking "Consume"`);
    await clickPanelButton(page, 'Consume');
    await page.waitForTimeout(500);
    
    // Now we should see checkboxes
    const cbPanel = await scanSelectionPanel(page);
    if (cbPanel) {
      log(`    📊 Checkbox panel: "${cbPanel.title}"`);
      log(`       Items: ${cbPanel.items.map(i => `${i.hasCheckbox ? '☐' : '🔘'} "${i.label}"`).join(', ')}`);
      
      if (cbPanel.items.some(i => i.hasCheckbox)) {
        // Select first prey
        const result = await selectAndConfirm(page, [0]);
        log(`    → Selected & confirmed: ${JSON.stringify(result)}`);
        return 'consumption_with_checkboxes';
      }
    }
    return 'consumption_no_checkboxes';
  }
  
  if (hasDryDrop && !hasConsume) {
    log(`    → Clicking "Dry drop"`);
    await clickPanelButton(page, 'Dry drop');
    return 'dry_drop';
  }
  
  // Case 2: Direct checkboxes (field full)
  if (panel.items.some(i => i.hasCheckbox)) {
    log(`    → Direct checkbox panel, selecting first`);
    const result = await selectAndConfirm(page, [0]);
    log(`    → ${JSON.stringify(result)}`);
    return 'direct_checkboxes';
  }
  
  // Case 3: Select target buttons (spell/effect targeting)  
  if (panel.items.some(i => i.hasButton && i.buttonText?.startsWith('Select'))) {
    log(`    → Target selection, clicking first`);
    const firstBtn = panel.items.find(i => i.hasButton);
    if (firstBtn) {
      await clickPanelButton(page, firstBtn.buttonText);
      return 'target_selection';
    }
  }
  
  // Unknown panel — log it
  log(`    ⚠️ Unknown panel type`);
  log(`       HTML: ${panel.html?.substring(0, 300)}`);
  return 'unknown';
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log('🔍 Consumption UI Explorer v2 — Play prey then predator same turn\n');
  
  // Use bird deck which has a mix of prey and predators
  await setupGame(p, 'bird');
  log('✅ Game setup complete (Bird deck)\n');
  
  let consumptionMapped = false;
  let dryDropMapped = false;
  let spellTargetMapped = false;
  
  for (let round = 0; round < 50; round++) {
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
    
    log(`\n═══ T${state.turn} | HP ${state.myHP}-${state.oppHP} | Board ${myField.length}v${oppField.length} ═══`);
    log('Hand: ' + hand.map((c, i) => `[${i}]${c.name}(${c.type})`).join(' '));
    if (myField.length > 0) log('Field: ' + myField.map(c => `${c.name}(${c.type} ${c.currentAtk}/${c.currentHp})`).join(', '));
    
    // === MAIN 1: Play prey or small creature ===
    const preyInHand = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Prey');
    const predInHand = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Predator');
    const spellInHand = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Spell' || c.type === 'Free Spell');
    const preyOnField = myField.filter(c => c.type === 'Prey');
    
    let playedMain1 = false;
    
    // Strategy: if we have prey + predator, play prey now, predator in Main 2
    if (preyInHand.length > 0 && predInHand.length > 0 && emptySlots > 0) {
      const prey = preyInHand[0];
      log(`\n  ▶ Main 1: Play prey ${prey.name} (saving predator for Main 2)`);
      const slot = await findEmptySlot(p);
      await dragCardToField(p, prey.idx, slot >= 0 ? slot : 0);
      const selType = await handleSelectionPanel(p, 'prey play');
      if (selType) log(`    Selection handled: ${selType}`);
      if (selType === 'target_selection') spellTargetMapped = true;
      playedMain1 = true;
    } else if (preyInHand.length > 0 && emptySlots > 0) {
      // Just play prey to build board
      const prey = preyInHand[0];
      log(`\n  ▶ Main 1: Play prey ${prey.name}`);
      const slot = await findEmptySlot(p);
      await dragCardToField(p, prey.idx, slot >= 0 ? slot : 0);
      const selType = await handleSelectionPanel(p, 'prey play');
      if (selType) log(`    Selection handled: ${selType}`);
      if (selType === 'target_selection') spellTargetMapped = true;
      playedMain1 = true;
    } else if (spellInHand.length > 0) {
      const spell = spellInHand[0];
      log(`\n  ▶ Main 1: Play spell ${spell.name}`);
      const slot = await findEmptySlot(p);
      await dragCardToField(p, spell.idx, slot >= 0 ? slot : 0);
      const selType = await handleSelectionPanel(p, 'spell play');
      if (selType) log(`    Selection handled: ${selType}`);
      if (selType === 'target_selection') spellTargetMapped = true;
      playedMain1 = true;
    }
    
    // === COMBAT ===
    await clickPhaseButton(p); // → Combat
    await p.waitForTimeout(500);
    
    let cs = await getState(p);
    if (cs?.phase === 'Combat') {
      const myCreatures = cs.myField?.filter(c => c && c.canAttack) || [];
      const oppCreatures = [...(cs.oppField?.filter(c => c) || [])];
      
      for (const c of myCreatures) {
        if (oppCreatures.length > 0) {
          const weakest = oppCreatures.sort((a, b) => a.currentHp - b.currentHp)[0];
          log(`  ⚔ ${c.name}(${c.currentAtk}) → ${weakest.name}(${weakest.currentHp}hp)`);
          await dragAttack(p, c.slot, weakest.slot);
          await p.waitForTimeout(300);
        } else if (c.canAttackPlayer) {
          log(`  ⚔ ${c.name}(${c.currentAtk}) → Player`);
          await dragAttackPlayer(p, c.slot);
          await p.waitForTimeout(300);
        }
      }
    }
    
    // === MAIN 2: Play predator to consume ===
    await clickPhaseButton(p); // → Main 2
    await p.waitForTimeout(500);
    
    cs = await getState(p);
    if (cs?.phase === 'Main 2') {
      const m2Hand = cs.hand || [];
      const m2Field = cs.myField?.filter(c => c) || [];
      const m2EmptySlots = 3 - m2Field.length;
      const m2PreyOnField = m2Field.filter(c => c.type === 'Prey');
      const m2PredInHand = m2Hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Predator');
      
      if (!playedMain1 && m2PredInHand.length > 0 && m2EmptySlots > 0) {
        // Play predator (dry drop since no prey consumed this turn)
        const pred = m2PredInHand[0];
        log(`\n  ▶ Main 2: Play predator ${pred.name} (dry drop)`);
        const slot = await findEmptySlot(p);
        await dragCardToField(p, pred.idx, slot >= 0 ? slot : 0);
        const selType = await handleSelectionPanel(p, 'predator dry drop');
        if (selType) log(`    Selection handled: ${selType}`);
        if (selType === 'dry_drop') dryDropMapped = true;
        if (selType?.startsWith('consumption')) consumptionMapped = true;
      } else if (m2PredInHand.length > 0 && m2PreyOnField.length > 0) {
        // PERFECT: predator + prey on field = consumption!
        const pred = m2PredInHand[0];
        log(`\n  ▶ Main 2: Play predator ${pred.name} — PREY ON FIELD: ${m2PreyOnField.map(c => c.name).join(', ')}`);
        const slot = await findEmptySlot(p);
        const targetSlot = slot >= 0 ? slot : 0;
        await dragCardToField(p, pred.idx, targetSlot);
        const selType = await handleSelectionPanel(p, 'predator consumption');
        if (selType) log(`    ✅ Selection handled: ${selType}`);
        if (selType?.startsWith('consumption')) consumptionMapped = true;
        if (selType === 'dry_drop') dryDropMapped = true;
      } else if (!playedMain1 && m2Hand.length > 0) {
        // Play anything available
        for (let i = 0; i < m2Hand.length; i++) {
          const card = m2Hand[i];
          if ((card.type === 'Prey' || card.type === 'Predator') && m2EmptySlots <= 0) continue;
          if (card.type === 'Trap') continue;
          log(`\n  ▶ Main 2: Play ${card.name} (${card.type})`);
          const slot = await findEmptySlot(p);
          await dragCardToField(p, i, slot >= 0 ? slot : 0);
          const selType = await handleSelectionPanel(p, 'fallback play');
          if (selType) log(`    Selection handled: ${selType}`);
          break;
        }
      }
    }
    
    // === END TURN ===
    await clickPhaseButton(p); // → End
    await p.waitForTimeout(500);
    await clickPhaseButton(p); // Extra
    await p.waitForTimeout(500);
    
    // Pass through opponent's turn
    for (let i = 0; i < 15; i++) {
      const passResult = await p.evaluate(() => {
        const btn = document.getElementById('pass-confirm');
        if (btn && btn.offsetHeight > 0) { btn.click(); return true; }
        return false;
      });
      if (!passResult) break;
      await p.waitForTimeout(300);
    }
    
    await waitForMyTurn(p);
    
    if (consumptionMapped && dryDropMapped) {
      log('\n\n✅✅ BOTH CONSUMPTION FLOWS MAPPED! Playing one more turn...');
      // Do one more loop to confirm, then stop
      if (round > 5) break; // Safety
    }
  }
  
  // === FINAL SUMMARY ===
  log('\n═══════════════════════════════════════════');
  log('  CONSUMPTION UI MAPPING RESULTS');
  log('═══════════════════════════════════════════');
  log(`  ✓ Consumption checkboxes: ${consumptionMapped ? '✅ MAPPED' : '❌ NOT YET'}`);
  log(`  ✓ Dry drop button:        ${dryDropMapped ? '✅ MAPPED' : '❌ NOT YET'}`);
  log(`  ✓ Spell target selection:  ${spellTargetMapped ? '✅ MAPPED' : '❌ NOT YET'}`);
  
  log('\n  DOM FLOW — Predator Consumption:');
  log('  1. Drag predator card from .hand-grid .card → .field-slot');
  log('  2. #selection-panel appears with title "Play predator"');
  log('  3a. If prey available + empty slot: "Consume" + "Dry drop" buttons');
  log('  3b. If no empty slot: must consume (checkboxes directly)');
  log('  4. Click "Consume" → panel updates to checkbox list:');
  log('     - .selection-item > input[type=checkbox] + span with prey name/nutrition');
  log('     - "Confirm" button (.secondary)');
  log('  5. Check desired checkboxes (up to 3) → click "Confirm"');
  log('  6. Predator placed, prey consumed, HP/stats applied');
  
  if (findings.length > 0) {
    log('\n  FINDINGS:');
    findings.forEach(f => log(`  [${f.severity}] ${f.what}: ${f.actual}`));
  }
  
  await browser.close();
  log('\n🏁 Done!');
})();
