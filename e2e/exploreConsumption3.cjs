/**
 * Consumption Explorer v3 — Multiple games until consumption is triggered
 * 
 * Runs multiple games with different decks, specifically targeting
 * the consumption panel DOM flow. Plays prey, then predators when prey survive.
 * 
 * DOM drag-and-drop for all actions. QA API only for state.
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

/**
 * Full scan of #selection-panel — adapted for actual DOM structure
 */
async function scanPanel(page) {
  return page.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    if (!panel || panel.children.length === 0) return null;
    
    // Check if panel has content (not just empty)
    if (panel.innerHTML.trim() === '') return null;
    
    const result = { visible: true };
    
    // Header
    const header = panel.querySelector('.selection-header');
    result.title = header?.querySelector('strong')?.textContent || '';
    
    // Content area
    const content = panel.querySelector('.selection-content');
    const list = panel.querySelector('.selection-list');
    
    // Get ALL buttons in the panel (direct children of list, or nested)
    const allButtons = Array.from(panel.querySelectorAll('button')).filter(b => b.offsetHeight > 0);
    result.buttons = allButtons.map(b => ({
      text: b.textContent.trim(),
      className: b.className,
    }));
    
    // Get ALL checkboxes
    const checkboxes = Array.from(panel.querySelectorAll('input[type="checkbox"]'));
    result.checkboxes = checkboxes.map(cb => ({
      value: cb.value,
      checked: cb.checked,
      label: cb.parentElement?.querySelector('span')?.textContent || '',
    }));
    
    // Get ALL labels (selection items)
    const labels = Array.from(panel.querySelectorAll('.selection-item'));
    result.items = labels.map(l => ({
      text: l.textContent.trim().substring(0, 100),
      innerHTML: l.innerHTML.substring(0, 200),
    }));
    
    result.html = panel.innerHTML.substring(0, 1500);
    return result;
  });
}

/**
 * Click a button in #selection-panel by partial text
 */
async function clickButton(page, text) {
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

/**
 * Check checkboxes and click confirm
 */
async function checkAndConfirm(page, indices) {
  return page.evaluate((idxs) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return { success: false, error: 'no panel' };
    const cbs = panel.querySelectorAll('input[type="checkbox"]');
    if (cbs.length === 0) return { success: false, error: 'no checkboxes' };
    for (const i of idxs) {
      if (cbs[i]) {
        cbs[i].checked = true;
        cbs[i].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    // Click Confirm
    const buttons = Array.from(panel.querySelectorAll('button')).filter(b => b.offsetHeight > 0);
    for (const b of buttons) {
      if (b.textContent.trim().toLowerCase().includes('confirm')) {
        b.click();
        return { success: true, checked: idxs, totalCbs: cbs.length };
      }
    }
    return { success: false, error: 'no confirm button', checked: idxs };
  }, indices);
}

/**
 * Wait for panel to appear
 */
async function waitPanel(page, ms = 2000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const p = await scanPanel(page);
    if (p) return p;
    await page.waitForTimeout(150);
  }
  return null;
}

async function passOpponentTurn(page) {
  for (let i = 0; i < 20; i++) {
    const r = await page.evaluate(() => {
      const btn = document.getElementById('pass-confirm');
      if (btn && btn.offsetHeight > 0) { btn.click(); return true; }
      return false;
    });
    if (!r) break;
    await page.waitForTimeout(300);
  }
}

async function playOneGame(browser, deckType) {
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log(`\n${'='.repeat(60)}`);
  log(`  GAME: ${deckType} deck`);
  log(`${'='.repeat(60)}`);
  
  await setupGame(p, deckType);
  log('  Setup complete\n');
  
  const results = { consumption: false, dryDrop: false, spellTarget: false, panelDetails: [] };
  
  for (let round = 0; round < 40; round++) {
    const state = await getState(p);
    if (!state) break;
    if (state.gameOver?.over) {
      log(`  🏆 GAME OVER T${state.turn} — ${state.gameOver.winner === 0 ? 'WIN' : 'LOSS'} (${state.myHP}-${state.oppHP})\n`);
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
    const preyOnField = myField.filter(c => c.type === 'Prey');
    const predInHand = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Predator');
    const preyInHand = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Prey');
    
    log(`  T${state.turn} | HP ${state.myHP}-${state.oppHP} | ${myField.length}v${oppField.length} | prey-field:${preyOnField.length} pred-hand:${predInHand.length} prey-hand:${preyInHand.length}`);
    
    // === PRIORITY: Play predator when prey is on field ===
    if (predInHand.length > 0 && preyOnField.length > 0 && emptySlots > 0) {
      const pred = predInHand[0];
      log(`  🍖 PREDATOR → slot (prey on field: ${preyOnField.map(c => c.name).join(',')})`);
      const slot = await findEmptySlot(p);
      await dragCardToField(p, pred.idx, slot >= 0 ? slot : 0);
      await p.waitForTimeout(800);
      
      const panel = await scanPanel(p);
      if (panel) {
        log(`  📊 PANEL: title="${panel.title}" buttons=[${panel.buttons.map(b => b.text).join(', ')}] checkboxes=${panel.checkboxes.length}`);
        log(`     HTML: ${panel.html?.substring(0, 400)}`);
        results.panelDetails.push({ context: 'predator_with_prey', panel });
        
        // Try clicking Consume
        if (panel.buttons.some(b => b.text.toLowerCase().includes('consume'))) {
          log(`  → Clicking "Consume"`);
          await clickButton(p, 'consume');
          await p.waitForTimeout(500);
          
          const cbPanel = await waitPanel(p, 2000);
          if (cbPanel) {
            log(`  📊 CHECKBOX PANEL: title="${cbPanel.title}" checkboxes=[${cbPanel.checkboxes.map(c => `${c.label}(${c.value})`).join(', ')}] buttons=[${cbPanel.buttons.map(b => b.text).join(', ')}]`);
            log(`     HTML: ${cbPanel.html?.substring(0, 400)}`);
            results.panelDetails.push({ context: 'consumption_checkboxes', panel: cbPanel });
            
            if (cbPanel.checkboxes.length > 0) {
              const r = await checkAndConfirm(p, [0]);
              log(`  → Check + Confirm: ${JSON.stringify(r)}`);
              results.consumption = true;
            }
          }
        }
      } else {
        // Check if consumption was auto-resolved (direct drag onto prey?)
        const pending = await p.evaluate(() => window.__qa?.getState()?.pendingContext);
        log(`  ⚠️ No panel appeared. Pending: ${JSON.stringify(pending)?.substring(0, 200)}`);
      }
    }
    // Play predator as dry drop (no prey on field)
    else if (predInHand.length > 0 && preyOnField.length === 0 && emptySlots > 0) {
      const pred = predInHand[0];
      log(`  🍂 PREDATOR dry drop: ${pred.name}`);
      const slot = await findEmptySlot(p);
      await dragCardToField(p, pred.idx, slot >= 0 ? slot : 0);
      await p.waitForTimeout(800);
      
      const panel = await scanPanel(p);
      if (panel) {
        log(`  📊 PANEL: title="${panel.title}" buttons=[${panel.buttons.map(b => b.text).join(', ')}]`);
        results.panelDetails.push({ context: 'predator_no_prey', panel });
        
        // Should just be "Dry drop" or auto-resolve
        if (panel.buttons.some(b => b.text.toLowerCase().includes('dry'))) {
          await clickButton(p, 'dry');
          results.dryDrop = true;
          log(`  → Dry drop clicked`);
        }
      } else {
        log(`  → No panel (auto dry drop?)`);
      }
    }
    // Play prey to build board
    else if (preyInHand.length > 0 && emptySlots > 0) {
      const prey = preyInHand[0];
      log(`  🐦 Prey: ${prey.name}`);
      const slot = await findEmptySlot(p);
      await dragCardToField(p, prey.idx, slot >= 0 ? slot : 0);
      await p.waitForTimeout(500);
      
      // Handle any panel that appears (e.g. onPlay effects)
      const panel = await scanPanel(p);
      if (panel) {
        log(`  📊 Panel for prey: title="${panel.title}" buttons=[${panel.buttons.map(b => b.text).join(', ')}]`);
        // Dismiss: click first non-hide button or confirm
        if (panel.buttons.some(b => b.text.toLowerCase().includes('confirm'))) {
          await clickButton(p, 'confirm');
        }
      }
    }
    // Play any spell
    else {
      const spells = hand.map((c, i) => ({ ...c, idx: i })).filter(c => c.type === 'Spell' || c.type === 'Free Spell');
      if (spells.length > 0) {
        const spell = spells[0];
        log(`  ✨ Spell: ${spell.name}`);
        const slot = await findEmptySlot(p);
        await dragCardToField(p, spell.idx, slot >= 0 ? slot : 0);
        await p.waitForTimeout(500);
        
        const panel = await scanPanel(p);
        if (panel) {
          log(`  📊 Spell panel: title="${panel.title}" buttons=[${panel.buttons.map(b => b.text).join(', ')}]`);
          results.panelDetails.push({ context: 'spell', panel });
          if (panel.items.length > 0) {
            results.spellTarget = true;
          }
          // Click first available
          const nonHide = panel.buttons.filter(b => !b.text.toLowerCase().includes('hide'));
          if (nonHide.length > 0) await clickButton(p, nonHide[0].text);
        }
      } else {
        log(`  ⏭ No play`);
      }
    }
    
    // === COMBAT: Don't attack with prey if we have predators in hand ===
    await clickPhaseButton(p);
    await p.waitForTimeout(500);
    
    let cs = await getState(p);
    if (cs?.phase === 'Combat') {
      const attackers = cs.myField?.filter(c => c && c.canAttack) || [];
      const opponents = cs.oppField?.filter(c => c) || [];
      
      for (const c of attackers) {
        // Protect prey from dying in combat if we have predators to play
        const futurePredInHand = cs.hand?.filter(h => h.type === 'Predator') || [];
        if (c.type === 'Prey' && futurePredInHand.length > 0) {
          log(`  🛡 Protecting ${c.name} (prey)`);
          continue;
        }
        
        if (opponents.length > 0) {
          const target = [...opponents].sort((a, b) => a.currentHp - b.currentHp)[0];
          if (c.currentAtk >= target.currentHp || c.currentHp > target.currentAtk) {
            await dragAttack(p, c.slot, target.slot);
            await p.waitForTimeout(300);
          } else if (c.canAttackPlayer) {
            await dragAttackPlayer(p, c.slot);
            await p.waitForTimeout(300);
          }
        } else if (c.canAttackPlayer) {
          await dragAttackPlayer(p, c.slot);
          await p.waitForTimeout(300);
        }
      }
    }
    
    // End turn
    for (let i = 0; i < 4; i++) {
      await clickPhaseButton(p);
      await p.waitForTimeout(300);
    }
    
    await passOpponentTurn(p);
    await waitForMyTurn(p);
    
    if (results.consumption && results.dryDrop) break;
  }
  
  await p.close();
  return results;
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  
  log('🔍 Consumption Explorer v3 — Multi-game approach\n');
  
  const decks = ['mammal', 'reptile', 'amphibian', 'bird', 'fish'];
  const allResults = [];
  
  for (const deck of decks) {
    try {
      const result = await playOneGame(browser, deck);
      allResults.push({ deck, ...result });
      log(`  Summary: consumption=${result.consumption} dryDrop=${result.dryDrop} spellTarget=${result.spellTarget}`);
      
      if (result.consumption) {
        log('\n✅✅ CONSUMPTION FLOW FULLY MAPPED! Stopping.\n');
        break;
      }
    } catch (e) {
      log(`  ❌ Game error: ${e.message}`);
      allResults.push({ deck, error: e.message });
    }
  }
  
  log('\n' + '='.repeat(60));
  log('  FINAL RESULTS');
  log('='.repeat(60));
  for (const r of allResults) {
    log(`  ${r.deck}: consumption=${r.consumption || false} dryDrop=${r.dryDrop || false} spell=${r.spellTarget || false} ${r.error ? '(ERROR: ' + r.error + ')' : ''}`);
  }
  
  // Log any panel details found
  const panels = allResults.flatMap(r => r.panelDetails || []);
  if (panels.length > 0) {
    log('\n  PANEL DOM DETAILS:');
    for (const p of panels) {
      log(`  [${p.context}]`);
      log(`    title: "${p.panel.title}"`);
      log(`    buttons: ${p.panel.buttons?.map(b => `"${b.text}"(${b.className})`).join(', ')}`);
      log(`    checkboxes: ${p.panel.checkboxes?.map(c => `"${c.label}"=${c.value}`).join(', ') || 'none'}`);
    }
  }
  
  await browser.close();
  log('\n🏁 Done!');
})();
