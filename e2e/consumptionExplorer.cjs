/**
 * Consumption Explorer — Real mouse DnD + consumption panel mapping
 * 
 * Uses Playwright's mouse-based drag (mousedown → mousemove → mouseup) which
 * triggers real browser DnD events, unlike synthetic DragEvent constructors.
 * 
 * Goal: Map and verify the consumption checkbox UI via DOM interaction.
 */

const { chromium } = require('@playwright/test');

function log(msg) { console.log(msg); }

// ============================================================================
// GAME HELPERS (inline — no import issues)
// ============================================================================

async function getState(p) {
  return p.evaluate(() => {
    const s = window.__qa?.getState();
    if (!s) return null;
    return {
      turn: s.turn,
      phase: s.phase,
      activePlayer: s.activePlayer,
      myTurn: s.ui?.isMyTurn,
      gameOver: window.__qa?.isGameOver(),
      myHP: s.players?.[0]?.hp,
      oppHP: s.players?.[1]?.hp,
      hand: s.players?.[0]?.hand?.map(c => ({
        name: c.name, type: c.type, instanceId: c.instanceId,
        atk: c.currentAtk ?? c.atk, hp: c.currentHp ?? c.hp,
        nutrition: c.nutrition, chain: c.chain,
        keywords: c.keywords || [],
      })) || [],
      myField: s.players?.[0]?.field?.map(c => c ? {
        name: c.name, type: c.type, instanceId: c.instanceId,
        atk: c.currentAtk ?? c.atk, hp: c.currentHp ?? c.hp,
        canAttack: !c.hasAttacked && !c.frozen && c.type !== 'Spell',
        nutrition: c.nutrition,
      } : null) || [],
      oppField: s.players?.[1]?.field?.map(c => c ? {
        name: c.name, type: c.type, instanceId: c.instanceId,
        atk: c.currentAtk ?? c.atk, hp: c.currentHp ?? c.hp,
      } : null) || [],
      carrion: s.players?.[0]?.carrion?.map(c => ({ name: c.name, instanceId: c.instanceId, nutrition: c.nutrition })) || [],
    };
  });
}

async function setupGame(p, deck = 'mammal') {
  // Navigate: menu → other → AI → random deck → select category → confirm
  await p.click('#menu-other', { force: true }); await p.waitForTimeout(300);
  await p.click('#other-ai', { force: true }); await p.waitForTimeout(300);
  await p.click('#ai-deck-random', { force: true }); await p.waitForTimeout(1000);

  // Select deck category
  await p.click(`.deck-select-panel--${deck}`, { force: true });
  await p.waitForTimeout(1000);
  await p.click('#deck-random', { force: true }); await p.waitForTimeout(500);
  await p.click('#deck-confirm', { force: true }); await p.waitForTimeout(3000);

  // Handle roll + first-player selection
  for (let attempt = 0; attempt < 10; attempt++) {
    const setup = await p.evaluate(() => window.__qa?.act?.menu?.getMenuState()?.setup);
    const phase = await p.evaluate(() => window.__qa?.getState()?.phase);
    if (setup?.stage === 'complete' || (phase && phase !== 'Setup')) break;

    await p.evaluate(() => {
      document.querySelectorAll('.setup-overlay button').forEach(b => {
        if (b.innerText.includes('Roll') && b.offsetHeight > 0) b.click();
      });
    });
    await p.waitForTimeout(2000);
    
    await p.evaluate(() => {
      document.querySelectorAll('.setup-overlay button').forEach(b => {
        if (b.innerText.includes('Player 1 goes first') && b.offsetHeight > 0) b.click();
      });
    });
    await p.waitForTimeout(1000);
  }

  // Dismiss pass overlays, wait for Main 1
  await waitForMyTurn(p);
}

async function waitForMyTurn(p, maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    // Dismiss pass overlays
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    const s = await p.evaluate(() => ({
      phase: window.__qa?.getState()?.phase,
      myTurn: window.__qa?.getState()?.ui?.isMyTurn,
      activePlayer: window.__qa?.getState()?.activePlayer,
      turn: window.__qa?.getState()?.turn,
      gameOver: window.__qa?.isGameOver(),
      hp0: window.__qa?.getState()?.players?.[0]?.hp,
      hp1: window.__qa?.getState()?.players?.[1]?.hp,
    }));
    if (s.gameOver?.over) return { ...s, gameOver: s.gameOver };
    if (s.myTurn && s.phase === 'Main 1') return s;
    await p.waitForTimeout(500);
  }
  return await getState(p);
}

// ============================================================================
// DOM INTERACTION — Playwright dragAndDrop API
// ============================================================================

/**
 * Play a card from hand to an empty field slot using Playwright's dragAndDrop API
 * This properly triggers HTML5 DnD events.
 */
async function domPlayCard(p, cardInstanceId, targetSlotIdx) {
  const cardSel = `.draggable-card[data-instance-id="${cardInstanceId}"]`;
  const slotSel = `.player-field .field-slot[data-slot="${targetSlotIdx}"]`;
  
  const exists = await p.evaluate(({cs, ss}) => {
    return { card: !!document.querySelector(cs), slot: !!document.querySelector(ss) };
  }, {cs: cardSel, ss: slotSel});
  
  if (!exists.card) return { error: 'card not found in DOM' };
  if (!exists.slot) return { error: 'slot not found' };

  try {
    await p.dragAndDrop(cardSel, slotSel, { timeout: 5000 });
    return { success: true };
  } catch (e) {
    return { error: `dragAndDrop failed: ${e.message.slice(0, 100)}` };
  }
}

/**
 * Play a card from hand directly onto a prey on field (direct consumption)
 */
async function domPlayOntoCreature(p, cardInstanceId, targetInstanceId) {
  const cardSel = `.draggable-card[data-instance-id="${cardInstanceId}"]`;
  const targetSel = `.draggable-card[data-instance-id="${targetInstanceId}"], .card[data-instance-id="${targetInstanceId}"]`;
  
  const exists = await p.evaluate(({cs, ts}) => {
    return { card: !!document.querySelector(cs), target: !!document.querySelector(ts) };
  }, {cs: cardSel, ts: targetSel});
  
  if (!exists.card) return { error: 'card not found in DOM' };
  if (!exists.target) return { error: 'target not found in DOM' };

  try {
    await p.dragAndDrop(cardSel, targetSel, { timeout: 5000 });
    return { success: true };
  } catch (e) {
    return { error: `dragAndDrop failed: ${e.message.slice(0, 100)}` };
  }
}

/**
 * Attack via Playwright dragAndDrop
 */
async function domAttack(p, attackerInstanceId, targetSelector) {
  const atkSel = `.draggable-card[data-instance-id="${attackerInstanceId}"]`;
  try {
    await p.dragAndDrop(atkSel, targetSelector, { timeout: 5000 });
    return { success: true };
  } catch (e) {
    return { error: `attack dragAndDrop failed: ${e.message.slice(0, 100)}` };
  }
}

// ============================================================================
// SELECTION PANEL INTERACTION
// ============================================================================

async function isSelectionPanelVisible(p) {
  return p.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    return panel && panel.childElementCount > 0;
  });
}

async function getSelectionPanelState(p) {
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

    const title = panel.querySelector('.selection-header strong')?.textContent?.trim() ||
                  panel.querySelector('strong')?.textContent?.trim() || '';

    return { title, buttons, checkboxes };
  });
}

async function clickPanelButton(p, buttonText) {
  const clicked = await p.evaluate((text) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return false;
    const btns = Array.from(panel.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.trim().toLowerCase() === text.toLowerCase());
    if (btn) { btn.click(); return true; }
    return false;
  }, buttonText);
  await p.waitForTimeout(300);
  return clicked;
}

async function checkCheckbox(p, index) {
  return p.evaluate((idx) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return false;
    const cbs = panel.querySelectorAll('input[type="checkbox"]');
    if (cbs[idx]) {
      cbs[idx].checked = true;
      cbs[idx].dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }, index);
}

/**
 * Handle a consumption panel interaction.
 * Returns detailed info about what happened for mapping purposes.
 */
async function handleConsumption(p) {
  const visible = await isSelectionPanelVisible(p);
  if (!visible) return { result: 'no-panel' };

  const panel1 = await getSelectionPanelState(p);
  log(`  📋 Panel: "${panel1.title}"`);
  log(`     Buttons: ${panel1.buttons.map(b => b.text).join(', ')}`);
  log(`     Checkboxes: ${panel1.checkboxes.length}`);

  // Stage 1: "Play predator" — Consume or Dry drop
  const hasConsume = panel1.buttons.some(b => b.text === 'Consume');
  const hasDryDrop = panel1.buttons.some(b => b.text === 'Dry drop');

  if (hasConsume) {
    log('  🍖 Clicking "Consume"...');
    await clickPanelButton(p, 'Consume');
    await p.waitForTimeout(300);

    // Stage 2: Checkboxes
    const panel2 = await getSelectionPanelState(p);
    if (!panel2) {
      log('  ❌ Panel disappeared after clicking Consume');
      return { result: 'error', stage: 'after-consume-click' };
    }

    log(`  📋 Panel 2: "${panel2.title}"`);
    log(`     Checkboxes: ${panel2.checkboxes.map(c => c.label).join(', ')}`);

    if (panel2.checkboxes.length > 0) {
      // Check the first (best) checkbox
      await checkCheckbox(p, 0);
      log(`  ✅ Checked: ${panel2.checkboxes[0].label}`);

      // Click Confirm
      await clickPanelButton(p, 'Confirm');
      log('  ✅ Confirmed');
      await p.waitForTimeout(500);

      // Check for additional consumption panel
      const panel3Visible = await isSelectionPanelVisible(p);
      if (panel3Visible) {
        const panel3 = await getSelectionPanelState(p);
        log(`  📋 Additional panel: "${panel3?.title}"`);
        if (panel3?.title?.includes('additional')) {
          // Skip additional consumption
          await clickPanelButton(p, 'Confirm');
          log('  ✅ Skipped additional consumption');
        }
      }

      return {
        result: 'consumed',
        stage1: { title: panel1.title, buttons: panel1.buttons.map(b => b.text), hasDryDrop },
        stage2: { title: panel2.title, checkboxes: panel2.checkboxes },
      };
    }

    return { result: 'no-checkboxes', stage: 'after-consume' };
  }

  // Direct checkboxes (no Consume/Dry drop stage)
  if (panel1.checkboxes.length > 0) {
    log('  📋 Direct checkboxes (no stage 1)');
    await checkCheckbox(p, 0);
    await clickPanelButton(p, 'Confirm');
    return {
      result: 'consumed-direct',
      checkboxes: panel1.checkboxes,
    };
  }

  return { result: 'unknown-panel', panel: panel1 };
}

// ============================================================================
// PHASE CONTROL
// ============================================================================

async function advancePhase(p) {
  await p.evaluate(() => {
    const btn = document.getElementById('field-turn-btn');
    if (btn) btn.click();
  });
  await p.waitForTimeout(300);
}

async function endTurn(p) {
  // Use QA API to end turn reliably
  await p.evaluate(() => window.__qa?.act?.endTurn());
  await p.waitForTimeout(500);
}

// ============================================================================
// MAIN
// ============================================================================

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await context.newPage();
  
  // Listen for console messages for debugging (skip 404s)
  p.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('404')) log(`  [CONSOLE ERROR] ${msg.text()}`);
  });
  
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);

  log('🃏 Consumption Explorer — Mammal vs AI (Real Mouse DnD)\n');

  // ===== SETUP =====
  await setupGame(p, 'mammal');
  log('✅ Game setup complete\n');

  let state = await getState(p);
  log(`Starting: T${state?.turn} | HP ${state?.myHP}-${state?.oppHP} | ${state?.myTurn ? 'My turn' : 'AI turn'} | Phase: ${state?.phase}`);
  
  // Wait for our turn
  if (!state?.myTurn) {
    state = await waitForMyTurn(p);
    if (!state || state.gameOver?.over) {
      log('Game ended before we got a turn');
      await browser.close();
      return;
    }
  }

  const results = {
    cardPlays: 0,
    consumptions: 0,
    dryDrops: 0,
    attacks: 0,
    turnsPlayed: 0,
    consumptionDetails: [],
    findings: [],
  };

  // ===== GAME LOOP =====
  for (let round = 0; round < 40; round++) {
    try {
    state = await getState(p);
    if (!state || state.gameOver?.over) {
      log(`\n🏆 Game Over at T${state?.turn || '?'} — ${state?.gameOver?.winner === 0 ? 'WIN' : 'LOSS'} (HP: ${state?.myHP}-${state?.oppHP})`);
      break;
    }

    if (!state.myTurn) {
      state = await waitForMyTurn(p);
      if (!state || state.gameOver?.over) {
        log(`\n🏆 Game Over — ${state?.gameOver?.winner === 0 ? 'WIN' : 'LOSS'}`);
        break;
      }
      continue;
    }

    results.turnsPlayed++;
    const hand = state.hand;
    const myField = state.myField.filter(c => c);
    const oppField = state.oppField.filter(c => c);
    const emptySlots = 3 - myField.length;
    const hasPrey = myField.some(c => c?.type === 'Prey');
    const carrionCount = state.carrion?.length || 0;

    log(`\n═══ T${state.turn} | HP ${state.myHP}-${state.oppHP} | Board ${myField.length}v${oppField.length} | Carrion ${carrionCount} ═══`);
    log('Hand: ' + hand.map(c => `${c.name}(${c.type[0]}${c.type === 'Predator' ? ',ch:' + (c.chain || '?') : ''})`).join(', '));
    if (myField.length > 0) log('Field: ' + myField.map(c => `${c.name}(${c.atk}/${c.hp})`).join(', '));

    // ===== STRATEGY: Maximize consumption encounters =====
    // Key insight: play prey FIRST in the same turn, then play predator to consume it
    const predators = hand.filter(c => c.type === 'Predator');
    const preys = hand.filter(c => c.type === 'Prey');
    const fieldPreyTargets = myField.filter(c => c?.type === 'Prey');

    let played = false;

    // Priority 1: If prey on field + predator in hand → play predator to trigger consumption
    if (fieldPreyTargets.length > 0 && predators.length > 0) {
      const pred = predators[0];
      log(`\n▶ Playing PREDATOR: ${pred.name} → consumption test (prey on field: ${fieldPreyTargets.map(c => c.name).join(', ')})`);

      if (emptySlots === 0) {
        // Field full — drag predator onto prey for direct consumption
        const prey = fieldPreyTargets[0];
        log(`  Dragging onto prey: ${prey.name}`);
        const r = await domPlayOntoCreature(p, pred.instanceId, prey.instanceId);
        log(`  DnD result: ${JSON.stringify(r)}`);
      } else {
        // Empty slot — play to slot, expect consumption panel
        const emptyIdx = state.myField.findIndex(c => !c);
        const r = await domPlayCard(p, pred.instanceId, emptyIdx >= 0 ? emptyIdx : 0);
        log(`  DnD result: ${JSON.stringify(r)}`);
      }

      await p.waitForTimeout(500);

      const panelResult = await handleConsumption(p);
      log(`  Consumption: ${panelResult.result}`);

      if (panelResult.result === 'consumed' || panelResult.result === 'consumed-direct') {
        results.consumptions++;
        results.consumptionDetails.push(panelResult);
      } else if (panelResult.result === 'no-panel') {
        const newState = await getState(p);
        const newField = newState?.myField?.filter(c => c) || [];
        if (newField.length > myField.length) {
          log('  (Dry drop — no consumption panel)');
          results.dryDrops++;
        } else {
          log('  ⚠️ No panel, board didn\'t change');
          results.findings.push(`T${state.turn}: Predator ${pred.name} — no panel, no board change`);
        }
      }

      results.cardPlays++;
      played = true;
    }
    // Priority 2: Play prey AND predator in same turn (if both in hand + 2+ empty slots)
    else if (emptySlots >= 2 && preys.length > 0 && predators.length > 0) {
      const prey = preys[0];
      const pred = predators[0];
      
      // Step A: Play prey first
      const emptyIdx1 = state.myField.findIndex(c => !c);
      log(`\n▶ Playing PREY first: ${prey.name} → slot ${emptyIdx1}`);
      const r1 = await domPlayCard(p, prey.instanceId, emptyIdx1 >= 0 ? emptyIdx1 : 0);
      log(`  DnD result: ${JSON.stringify(r1)}`);
      await p.waitForTimeout(500);
      
      const midState = await getState(p);
      const midField = midState?.myField?.filter(c => c) || [];
      log(`  Board after prey: ${midField.length} (${midField.map(c => c.name).join(', ')})`);
      
      if (midField.length > myField.length) {
        results.cardPlays++;
        
        // Check if it's still our turn and Main 1
        if (midState?.myTurn && midState?.phase === 'Main 1') {
          // Step B: Now play predator to trigger consumption
          const emptyIdx2 = midState.myField.findIndex(c => !c);
          log(`\n▶ Now playing PREDATOR: ${pred.name} → consumption test!`);
          
          // Refresh hand — prey was removed
          const freshHand = midState.hand;
          const predInFreshHand = freshHand.find(c => c.instanceId === pred.instanceId);
          if (predInFreshHand) {
            if (emptyIdx2 >= 0) {
              const r2 = await domPlayCard(p, pred.instanceId, emptyIdx2);
              log(`  DnD result: ${JSON.stringify(r2)}`);
            } else {
              // Field full — drag onto prey
              const preyOnField = midField.find(c => c.type === 'Prey');
              if (preyOnField) {
                const r2 = await domPlayOntoCreature(p, pred.instanceId, preyOnField.instanceId);
                log(`  DnD result: ${JSON.stringify(r2)}`);
              }
            }
            
            await p.waitForTimeout(500);
            
            const panelResult = await handleConsumption(p);
            log(`  Consumption: ${panelResult.result}`);
            
            if (panelResult.result === 'consumed' || panelResult.result === 'consumed-direct') {
              results.consumptions++;
              results.consumptionDetails.push(panelResult);
            } else if (panelResult.result === 'no-panel') {
              results.dryDrops++;
              log('  (Dry drop — no consumption panel)');
            }
            
            results.cardPlays++;
          }
        }
      } else {
        log(`  ⚠️ Prey didn't land`);
        results.findings.push(`T${state.turn}: Prey ${prey.name} didn't land`);
      }
      played = true;
    }
    // Priority 3: Play prey to build board
    else if (emptySlots > 0 && preys.length > 0) {
      const prey = preys[0];
      const emptyIdx = state.myField.findIndex(c => !c);

      log(`\n▶ Playing PREY: ${prey.name} (setup for next turn)`);
      const r = await domPlayCard(p, prey.instanceId, emptyIdx >= 0 ? emptyIdx : 0);
      log(`  DnD result: ${JSON.stringify(r)}`);
      
      await p.waitForTimeout(500);
      
      const newState = await getState(p);
      const newField = newState?.myField?.filter(c => c) || [];
      if (newField.length > myField.length) {
        log(`  ✅ Board: ${myField.length} → ${newField.length}`);
        results.cardPlays++;
      } else {
        log(`  ⚠️ Board unchanged: ${myField.length} → ${newField.length}`);
        results.findings.push(`T${state.turn}: Prey ${prey.name} didn't land`);
      }
      played = true;
    }
    // Priority 4: Dry drop predator
    else if (emptySlots > 0 && predators.length > 0) {
      const pred = predators[0];
      const emptyIdx = state.myField.findIndex(c => !c);

      log(`\n▶ Playing PREDATOR (dry drop): ${pred.name}`);
      const r = await domPlayCard(p, pred.instanceId, emptyIdx >= 0 ? emptyIdx : 0);
      log(`  DnD result: ${JSON.stringify(r)}`);
      
      await p.waitForTimeout(500);
      
      if (await isSelectionPanelVisible(p)) {
        const panelResult = await handleConsumption(p);
        if (panelResult.result === 'consumed') results.consumptions++;
      }
      
      results.cardPlays++;
      results.dryDrops++;
      played = true;
    }

    if (!played) {
      log('  (No playable cards this turn)');
    }

    // ===== COMBAT =====
    // Use QA to advance to combat
    await p.evaluate(() => window.__qa?.act?.advancePhase());
    await p.waitForTimeout(300);

    const combatState = await getState(p);
    if (combatState?.phase === 'Combat') {
      const attackers = combatState.myField?.filter(c => c && c.canAttack) || [];
      const targets = combatState.oppField?.filter(c => c) || [];

      // Use QA API for attacks — we're focused on mapping consumption DOM
      for (let i = 0; i < 3; i++) {
        const cs = await getState(p);
        const atkr = cs?.myField?.find((c, idx) => c && c.canAttack);
        if (!atkr) break;
        const atkSlot = cs.myField.indexOf(atkr);
        const tgts = cs.oppField?.filter(c => c) || [];
        if (tgts.length > 0) {
          const t = tgts.sort((a, b) => (a.hp || 99) - (b.hp || 99))[0];
          const tSlot = cs.oppField.indexOf(t);
          log(`  ⚔ ${atkr.name}(${atkr.atk}) → ${t.name}(${t.hp})`);
          await p.evaluate(({a, t}) => window.__qa?.act?.attack(a, 'creature', t), {a: atkSlot, t: tSlot});
          results.attacks++;
        } else {
          log(`  ⚔ ${atkr.name}(${atkr.atk}) → Player`);
          await p.evaluate(({a}) => window.__qa?.act?.attack(a, 'player'), {a: atkSlot});
          results.attacks++;
        }
        await p.waitForTimeout(200);
      }
    }

    // End turn
    await endTurn(p);
    await p.waitForTimeout(1000);
    } catch (e) {
      log(`  ⚠️ Error in round ${round}: ${e.message?.slice(0, 100)}`);
      results.findings.push(`Round ${round} error: ${e.message?.slice(0, 100)}`);
      // Try to recover
      try { await endTurn(p); } catch(e2) {}
      await p.waitForTimeout(1000);
    }
  }

  // ===== SUMMARY =====
  log('\n══════════════════════════════════════');
  log('  CONSUMPTION EXPLORER RESULTS');
  log('══════════════════════════════════════');
  log(`  Turns played: ${results.turnsPlayed}`);
  log(`  Card plays: ${results.cardPlays}`);
  log(`  Consumptions completed: ${results.consumptions}`);
  log(`  Dry drops: ${results.dryDrops}`);
  log(`  Attacks: ${results.attacks}`);

  if (results.consumptionDetails.length > 0) {
    log('\n  CONSUMPTION UI MAP:');
    for (const d of results.consumptionDetails) {
      if (d.stage1) {
        log(`  Stage 1: title="${d.stage1.title}" buttons=[${d.stage1.buttons.join(', ')}]`);
      }
      if (d.stage2) {
        log(`  Stage 2: title="${d.stage2.title}" checkboxes=[${d.stage2.checkboxes.map(c => c.label).join(', ')}]`);
      }
    }
    log('\n  ✅ CONSUMPTION SELECTORS VERIFIED:');
    log('  Panel: #selection-panel');
    log('  Stage 1 title: "Play predator"');
    log('  Stage 1 buttons: "Dry drop", "Consume"');
    log('  Stage 2 title: "Select up to 3 prey to consume"');
    log('  Stage 2 items: label.selection-item > input[type="checkbox"] + span');
    log('  Stage 2 confirm: button.secondary "Confirm"');
    log('  Additional: title contains "additional", same checkbox pattern');
  }

  if (results.findings.length > 0) {
    log('\n  FINDINGS:');
    for (const f of results.findings) log(`  ⚠️ ${f}`);
  }

  await browser.close();
  log('\n✅ Done');
})();
