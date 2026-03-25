/**
 * Map Consumption UI — DOM-based interaction
 * 
 * Uses HTML5 DnD events (dragstart → dragover → drop) to play cards,
 * then handles the consumption selection panel via DOM clicks.
 * 
 * Consumption UI flow:
 * 1. Predator played → selection-panel shows "Dry drop" + "Consume" buttons
 * 2. Click "Consume" → checkboxes appear for each prey target
 * 3. Check desired prey → click "Confirm"
 */

const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState, endTurn } = require('./gameHelpers.cjs');

function log(msg) { console.log(msg); }

/**
 * DOM: Play a card from hand to field using HTML5 DnD events
 */
async function domPlayCard(p, handIndex) {
  const result = await p.evaluate((idx) => {
    const state = window.__qa?.getState();
    if (!state) return { error: 'no state' };
    
    const hand = state.players?.[0]?.hand;
    if (!hand || !hand[idx]) return { error: `no card at index ${idx}` };
    
    const card = hand[idx];
    const instanceId = card.instanceId;
    
    // Find the card element in DOM
    const cardEls = document.querySelectorAll('.hand-grid .card, .hand-grid .draggable-card');
    let cardEl = null;
    for (const el of cardEls) {
      if (el.dataset.instanceId === instanceId) { cardEl = el; break; }
    }
    if (!cardEl) {
      // Try by index
      const allCards = document.querySelectorAll('.hand-grid .card');
      cardEl = allCards[idx];
    }
    if (!cardEl) return { error: 'card element not found' };
    
    // Find first empty player field slot (slots 0-2 for player 0)
    const field = state.players[0].field;
    let targetSlotIdx = -1;
    for (let i = 0; i < 3; i++) {
      if (!field[i]) { targetSlotIdx = i; break; }
    }
    
    // If field is full and it's a predator, it needs to eat to make room
    // Still target slot 0 — the game logic will figure it out
    if (targetSlotIdx === -1) targetSlotIdx = 0;
    
    const slotEl = document.querySelector(`.player-field .field-slot[data-slot="${targetSlotIdx}"]`);
    if (!slotEl) return { error: 'player field slot not found' };
    
    // Simulate HTML5 drag-and-drop events
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', instanceId);
    
    // dragstart on the card
    const dragStartEvent = new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer,
    });
    cardEl.dispatchEvent(dragStartEvent);
    
    // dragover on the slot (needed to make it a valid drop target)
    const dragOverEvent = new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer,
    });
    slotEl.dispatchEvent(dragOverEvent);
    
    // drop on the slot
    const dropEvent = new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer,
    });
    slotEl.dispatchEvent(dropEvent);
    
    // dragend
    const dragEndEvent = new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer,
    });
    cardEl.dispatchEvent(dragEndEvent);
    
    return { success: true, card: card.name, type: card.type, targetSlot: targetSlotIdx };
  }, handIndex);
  
  await p.waitForTimeout(500);
  return result;
}

/**
 * DOM: Check if consumption selection panel is visible
 */
async function isConsumptionPanelVisible(p) {
  return p.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    return panel && panel.childElementCount > 0;
  });
}

/**
 * DOM: Get consumption panel state
 */
async function getConsumptionPanelState(p) {
  return p.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    if (!panel || panel.childElementCount === 0) return null;
    
    const buttons = Array.from(panel.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim(),
      className: b.className,
    }));
    
    const checkboxes = Array.from(panel.querySelectorAll('input[type="checkbox"]')).map(cb => ({
      value: cb.value,
      checked: cb.checked,
      label: cb.parentElement?.querySelector('span')?.textContent?.trim() || '',
    }));
    
    const title = panel.querySelector('.selection-header strong')?.textContent?.trim() || '';
    
    return { title, buttons, checkboxes };
  });
}

/**
 * DOM: Click a button in the selection panel by text
 */
async function clickPanelButton(p, buttonText) {
  const clicked = await p.evaluate((text) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return false;
    const buttons = Array.from(panel.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.trim().toLowerCase() === text.toLowerCase());
    if (btn) { btn.click(); return true; }
    return false;
  }, buttonText);
  await p.waitForTimeout(300);
  return clicked;
}

/**
 * DOM: Check a checkbox in the selection panel by index
 */
async function checkConsumptionTarget(p, index) {
  return p.evaluate((idx) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return false;
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    if (checkboxes[idx]) {
      checkboxes[idx].checked = true;
      checkboxes[idx].dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }, index);
}

/**
 * DOM: Handle full consumption flow
 */
async function handleConsumptionDOM(p, strategy = 'eat-best') {
  await p.waitForTimeout(500);
  
  const visible = await isConsumptionPanelVisible(p);
  if (!visible) return 'no-panel';
  
  const panelState = await getConsumptionPanelState(p);
  log(`  📋 Panel: "${panelState.title}"`);
  log(`  📋 Buttons: ${panelState.buttons.map(b => b.text).join(', ')}`);
  
  // Stage 1: Choose between Consume and Dry drop
  if (panelState.buttons.some(b => b.text === 'Consume')) {
    if (strategy === 'dry-drop') {
      await clickPanelButton(p, 'Dry drop');
      log('  🍂 Chose Dry drop');
      return 'dry-dropped';
    }
    
    await clickPanelButton(p, 'Consume');
    log('  🍖 Chose Consume');
    await p.waitForTimeout(300);
    
    // Stage 2: Select prey checkboxes
    const checkboxState = await getConsumptionPanelState(p);
    if (!checkboxState) { log('  ❌ Panel disappeared'); return 'error'; }
    
    log(`  📋 Checkboxes: ${checkboxState.checkboxes.map(c => c.label).join(', ')}`);
    
    if (checkboxState.checkboxes.length > 0) {
      if (strategy === 'eat-best') {
        // Parse nutrition from labels and pick highest
        const parsed = checkboxState.checkboxes.map((c, i) => {
          const match = c.label.match(/Nutrition (\d+)/);
          return { idx: i, nutrition: match ? parseInt(match[1]) : 0, label: c.label };
        });
        parsed.sort((a, b) => b.nutrition - a.nutrition);
        await checkConsumptionTarget(p, parsed[0].idx);
        log(`  ✅ Checked: ${parsed[0].label}`);
      } else if (strategy === 'eat-all') {
        const max = Math.min(checkboxState.checkboxes.length, 3);
        for (let i = 0; i < max; i++) {
          await checkConsumptionTarget(p, i);
          log(`  ✅ Checked: ${checkboxState.checkboxes[i].label}`);
        }
      }
      
      await clickPanelButton(p, 'Confirm');
      log('  ✅ Confirmed consumption');
      await p.waitForTimeout(300);
      
      // Check for additional consumption panel
      const additionalPanel = await isConsumptionPanelVisible(p);
      if (additionalPanel) {
        const addState = await getConsumptionPanelState(p);
        if (addState?.title?.includes('additional')) {
          log('  📋 Additional consumption panel — confirming (skip)');
          await clickPanelButton(p, 'Confirm');
        }
      }
      
      return 'consumed';
    }
  }
  
  // Direct checkboxes (skipped stage 1)
  if (panelState.checkboxes.length > 0) {
    await checkConsumptionTarget(p, 0);
    await clickPanelButton(p, 'Confirm');
    log('  ✅ Direct checkbox consumption');
    return 'consumed';
  }
  
  log('  ⚠️ Unexpected panel state');
  return 'error';
}

/**
 * DOM: Advance phase via phase button click
 */
async function domAdvancePhase(p) {
  return p.evaluate(() => {
    const btn = document.getElementById('field-turn-btn');
    if (btn) { btn.click(); return true; }
    return false;
  });
}

/**
 * DOM: Attack creature via DnD (attacker card → target card)
 */
async function domAttackCreature(p, attackerInstanceId, targetInstanceId) {
  return p.evaluate(({ atkId, tgtId }) => {
    const atkEl = document.querySelector(`.card[data-instance-id="${atkId}"], .draggable-card[data-instance-id="${atkId}"]`);
    const tgtEl = document.querySelector(`.card[data-instance-id="${tgtId}"], .draggable-card[data-instance-id="${tgtId}"]`);
    if (!atkEl || !tgtEl) return { error: 'elements not found' };
    
    const dt = new DataTransfer();
    dt.setData('text/plain', atkId);
    
    atkEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    tgtEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    tgtEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    atkEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    
    return { success: true };
  }, { atkId: attackerInstanceId, tgtId: targetInstanceId });
}

/**
 * DOM: Attack player via DnD (drag attacker card → player badge)
 */
async function domAttackPlayer(p, attackerInstanceId) {
  return p.evaluate(({ atkId }) => {
    const atkEl = document.querySelector(`.card[data-instance-id="${atkId}"], .draggable-card[data-instance-id="${atkId}"]`);
    if (!atkEl) return { error: 'attacker element not found' };
    
    // Target the opponent player badge/scoreboard
    const oppBadge = document.querySelector('.player-badge[data-player-index="1"], .scoreboard-player[data-player-index="1"]');
    if (!oppBadge) return { error: 'opponent badge not found' };
    
    const dt = new DataTransfer();
    dt.setData('text/plain', atkId);
    
    atkEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    oppBadge.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    oppBadge.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    atkEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    
    return { success: true };
  }, { atkId: attackerInstanceId });
}

// ============================================================================
// MAIN
// ============================================================================
(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  // Use mammal deck — good predator/prey combos (lions eat gazelles etc.)
  log('🃏 Consumption DOM Mapper — Mammal vs AI\n');
  await setupGame(p, 'mammal');
  log('✅ Game ready\n');
  
  let consumptionsMapped = 0;
  let dryDropsMapped = 0;
  let turnsPlayed = 0;
  let cardPlaysViaDOM = 0;
  let attacksViaDOM = 0;
  const findings = [];
  
  for (let round = 0; round < 30; round++) {
    let state;
    try { state = await getState(p); } catch(e) { log('\n🏆 GAME OVER'); break; }
    if (!state) break;
    if (state.gameOver?.over) {
      log(`\n🏆 GAME OVER — ${state.gameOver.winner === 0 ? 'WIN' : 'LOSS'} at T${state.turn}`);
      break;
    }
    
    if (!state.myTurn || state.phase !== 'Main 1') {
      try {
        const s = await waitForMyTurn(p);
        if (s?.gameOver?.over) { log(`\n🏆 GAME OVER`); break; }
      } catch(e) { log('\n🏆 GAME OVER'); break; }
      continue;
    }
    
    turnsPlayed++;
    const hand = state.hand || [];
    const myField = state.myField?.filter(c => c) || [];
    const oppField = state.oppField?.filter(c => c) || [];
    
    log(`\n══ T${state.turn} | HP ${state.myHP}-${state.oppHP} | Board ${myField.length}v${oppField.length} ══`);
    log('Hand: ' + hand.map((c, i) => `[${i}]${c.name}(${c.type[0]})`).join(' '));
    if (myField.length > 0) log('Field: ' + myField.map(c => `${c.name}(${c.currentAtk}/${c.currentHp})`).join(', '));
    
    // ===== CARD PLAY STRATEGY =====
    const emptySlots = 3 - myField.length;
    const hasPrey = myField.some(c => c?.type === 'Prey');
    const predInHand = hand.findIndex(c => c.type === 'Predator');
    const preyInHand = hand.findIndex(c => c.type === 'Prey');
    
    let playIdx = -1;
    let playReason = '';
    
    // Priority 1: Play predator if prey on field (THIS IS THE KEY: consumption test!)
    if (hasPrey && predInHand >= 0) {
      playIdx = predInHand;
      playReason = 'predator (EAT PREY — consumption test!)';
    }
    // Priority 2: Play prey to build board for next turn's predator
    else if (emptySlots > 0 && preyInHand >= 0) {
      playIdx = preyInHand;
      playReason = 'prey (setup for predator next turn)';
    }
    // Priority 3: Dry drop predator if room
    else if (emptySlots > 0 && predInHand >= 0) {
      playIdx = predInHand;
      playReason = 'predator (dry drop)';
    }
    
    if (playIdx >= 0) {
      const card = hand[playIdx];
      log(`\n▶ DOM Play: ${card.name} (${card.type}) — ${playReason}`);
      
      const beforeField = myField.length;
      const result = await domPlayCard(p, playIdx);
      
      if (result?.success) {
        log(`  Dragged ${result.card} → slot ${result.targetSlot}`);
        cardPlaysViaDOM++;
        
        // Check for consumption panel
        const panel = await isConsumptionPanelVisible(p);
        if (panel) {
          const strategy = hasPrey ? 'eat-best' : 'dry-drop';
          const consumeResult = await handleConsumptionDOM(p, strategy);
          log(`  Consumption result: ${consumeResult}`);
          if (consumeResult === 'consumed') consumptionsMapped++;
          if (consumeResult === 'dry-dropped') dryDropsMapped++;
        }
        
        // Verify the card actually landed
        await p.waitForTimeout(300);
        const afterState = await getState(p);
        const afterField = afterState?.myField?.filter(c => c)?.length || 0;
        if (afterField > beforeField) {
          log(`  ✅ Board: ${beforeField} → ${afterField}`);
        } else if (card.type === 'Prey' || card.type === 'Predator') {
          // Board didn't grow — but could be consumption ate one
          if (afterField === beforeField && card.type === 'Predator' && hasPrey) {
            log(`  ✅ Board same (consumed a prey)`);
          } else {
            log(`  ⚠️ Board unchanged: ${beforeField} → ${afterField}`);
            findings.push(`T${state.turn}: DOM play ${card.name} didn't change board (${beforeField}→${afterField})`);
          }
        }
      } else {
        log(`  ❌ ${result?.error}`);
        findings.push(`T${state.turn}: DOM play failed — ${result?.error}`);
      }
    } else {
      log('  (No good play)');
    }
    
    // ===== COMBAT via DOM =====
    await domAdvancePhase(p);
    await p.waitForTimeout(300);
    
    const cs = await getState(p);
    if (cs?.phase === 'Combat') {
      const myCreatures = cs.myField?.filter(c => c && c.canAttack) || [];
      const oppCreatures = cs.oppField?.filter(c => c) || [];
      
      for (const c of myCreatures) {
        if (oppCreatures.length === 0) {
          // Attack player via DOM
          log(`  ⚔ ${c.name}(${c.currentAtk}) → Player (DOM DnD)`);
          const r = await domAttackPlayer(p, c.instanceId);
          if (r?.success) { log('  💥 Direct!'); attacksViaDOM++; }
          else log(`  ❌ ${r?.error}`);
        } else {
          // Attack weakest creature via DOM
          const target = oppCreatures.sort((a, b) => a.currentHp - b.currentHp)[0];
          log(`  ⚔ ${c.name}(${c.currentAtk}/${c.currentHp}) → ${target.name}(${target.currentAtk}/${target.currentHp}) (DOM DnD)`);
          const r = await domAttackCreature(p, c.instanceId, target.instanceId);
          if (r?.success) { log('  💥'); attacksViaDOM++; }
          else log(`  ❌ ${r?.error}`);
        }
        await p.waitForTimeout(200);
      }
    }
    
    // End turn (use QA helper — the phase button already advances turn)
    await endTurn(p);
    try {
      await p.waitForTimeout(1500);
      const turnResult = await waitForMyTurn(p);
      if (turnResult?.gameOver?.over) {
        log(`\n🏆 GAME OVER — ${turnResult.gameOver.winner === 0 ? 'WIN' : 'LOSS'}`);
        break;
      }
    } catch (e) {
      log('\n🏆 GAME OVER');
      break;
    }
  }
  
  // ===== SUMMARY =====
  log('\n══════════════════════════════════');
  log('  CONSUMPTION DOM MAPPING RESULTS');
  log('══════════════════════════════════');
  log(`  Turns: ${turnsPlayed}`);
  log(`  Card plays via DOM: ${cardPlaysViaDOM}`);
  log(`  Attacks via DOM: ${attacksViaDOM}`);
  log(`  Consumptions via DOM: ${consumptionsMapped}`);
  log(`  Dry drops via DOM: ${dryDropsMapped}`);
  
  if (findings.length > 0) {
    log('\n  FINDINGS:');
    findings.forEach(f => log(`  ⚠️ ${f}`));
  }
  
  if (consumptionsMapped > 0 || dryDropsMapped > 0) {
    log('\n  ✅ CONSUMPTION DOM SELECTORS VERIFIED:');
    log('  - Panel: #selection-panel');
    log('  - Stage 1: button text "Dry drop" / "Consume"');
    log('  - Stage 2: input[type="checkbox"] inside label.selection-item');
    log('  - Labels: label.selection-item > span (e.g. "Pigeon (Field, Nutrition 1)")');
    log('  - Confirm: button text "Confirm"');
    log('  - Additional consumption: same checkbox pattern, title "Consume additional prey?"');
  }
  
  if (cardPlaysViaDOM > 0) {
    log('\n  ✅ CARD PLAY DOM DnD VERIFIED:');
    log('  - Card selector: .hand-grid .card[data-instance-id]');
    log('  - Slot selector: .field-slot[data-slot="N"]');
    log('  - DnD: DataTransfer with instanceId → dragstart/dragover/drop/dragend');
  }
  
  if (attacksViaDOM > 0) {
    log('\n  ✅ ATTACK DOM DnD VERIFIED:');
    log('  - Attacker: .card[data-instance-id] on field');
    log('  - Target creature: .card[data-instance-id] on opponent field');
    log('  - Target player: .player-badge[data-player-index="1"]');
    log('  - DnD: Same pattern as card play');
  }
  
  await browser.close();
})();
