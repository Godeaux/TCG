/**
 * Action Executor — Converts parsed LLM actions into real DOM interactions
 * 
 * All game actions go through DOM drag-and-drop / clicks.
 * QA API used ONLY for state verification, never for triggering actions.
 */

const { dragCardToField, dragAttack, dragAttackPlayer, scanUI } = require('../domInteraction.cjs');

/**
 * Execute a parsed action from the LLM brain
 * 
 * @param {Object} page - Playwright page
 * @param {Object} action - Parsed action from parseAction()
 * @param {Object} state - Current game state from __qa
 * @returns {Object} { success, description, error? }
 */
async function executeAction(page, action, state) {
  switch (action.type) {
    case 'play':
      return executePlay(page, action, state);
    case 'attack':
      return executeAttack(page, action, state);
    case 'advance':
      return executeAdvance(page);
    case 'endTurn':
      return executeEndTurn(page);
    case 'eat':
      return executeEat(page, action);
    case 'dryDrop':
      return executeDryDrop(page);
    case 'activate':
      return executeActivate(page, action);
    case 'pass':
      return executePass(page);
    default:
      return { success: false, description: 'Unknown action', error: `Can't execute: ${action.type}` };
  }
}

/**
 * Play a card from hand via DOM drag-and-drop
 */
async function executePlay(page, action, state) {
  const { handIndex, eat, dryDrop: isDryDrop } = action;
  const hand = state?.players?.[0]?.hand;
  const card = hand?.[handIndex];
  
  if (!card) {
    return { success: false, description: `No card at index ${handIndex}`, error: 'Invalid hand index' };
  }
  
  // Find first empty field slot
  const myField = state?.players?.[0]?.field || [];
  let targetSlot = myField.findIndex(c => c === null);
  if (targetSlot < 0 && (card.type === 'Prey' || card.type === 'Predator')) {
    return { success: false, description: 'Field full', error: 'No empty slot' };
  }
  if (targetSlot < 0) targetSlot = 0; // Spells don't need a slot
  
  // For spells: drag to the field area (they resolve on drop)
  // For creatures: drag to specific slot
  const result = await dragCardToField(page, handIndex, targetSlot);
  await page.waitForTimeout(800);
  
  const desc = `Play ${card.name} (${card.type})`;
  
  if (!result?.success) {
    return { success: false, description: desc, error: result?.error || 'Drag failed' };
  }
  
  // Handle consumption if specified
  if (card.type === 'Predator') {
    await page.waitForTimeout(500);
    
    // Check for consumption prompt
    const pending = await page.evaluate(() => window.__qa?.getState()?.pendingContext);
    
    if (pending?.type === 'pending_consumption') {
      if (isDryDrop) {
        return await executeDryDrop(page, desc);
      } else if (eat && eat.length > 0) {
        return await executeEat(page, { targets: eat }, desc);
      } else {
        // No eat specified — check if there are options
        if (pending.options?.length > 0) {
          // Default: eat the highest nutrition target
          return await executeEat(page, { targets: [0] }, desc);
        } else {
          return await executeDryDrop(page, desc);
        }
      }
    }
  }
  
  // Handle spell target selection
  if (card.type === 'Spell' || card.type === 'Free Spell') {
    await page.waitForTimeout(500);
    const ui = await scanUI(page);
    const selection = ui.find(u => u.type === 'selection');
    if (selection && selection.count > 0) {
      // Click the first available target (simple heuristic for now)
      await clickFirstSelectionOption(page);
      await page.waitForTimeout(500);
    }
  }
  
  return { success: true, description: desc };
}

/**
 * Execute attack via DOM drag-and-drop
 */
async function executeAttack(page, action, state) {
  const { attackerSlot, target } = action;
  
  if (target === 'player') {
    const result = await dragAttackPlayer(page, attackerSlot);
    await page.waitForTimeout(800);
    
    const myCreature = state?.players?.[0]?.field?.[attackerSlot];
    const desc = `${myCreature?.name || 'Creature'} attacks Player`;
    return { success: result?.success || false, description: desc, error: result?.error };
  } else {
    const result = await dragAttack(page, attackerSlot, target);
    await page.waitForTimeout(800);
    
    const myCreature = state?.players?.[0]?.field?.[attackerSlot];
    const oppCreature = state?.players?.[1]?.field?.[target];
    const desc = `${myCreature?.name || '?'} → ${oppCreature?.name || '?'}`;
    
    // Check for trap reactions after attack
    await handleTrapReaction(page);
    
    return { success: result?.success || false, description: desc, error: result?.error };
  }
}

/**
 * Advance to next phase via DOM click
 */
async function executeAdvance(page) {
  await page.evaluate(() => document.getElementById('field-turn-btn')?.click());
  await page.waitForTimeout(500);
  const phase = await page.evaluate(() => window.__qa?.getState()?.phase);
  return { success: true, description: `Advanced to ${phase}` };
}

/**
 * End turn via DOM (advance through remaining phases)
 */
async function executeEndTurn(page) {
  const startTurn = await page.evaluate(() => window.__qa?.getState()?.turn);
  
  // Click phase button repeatedly until turn changes
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => document.getElementById('field-turn-btn')?.click());
    await page.waitForTimeout(300);
    const turn = await page.evaluate(() => window.__qa?.getState()?.turn);
    if (turn !== startTurn) break;
  }
  
  return { success: true, description: 'Ended turn' };
}

/**
 * Handle consumption selection via DOM
 * Clicks checkboxes in the selection panel, then confirms
 */
async function executeEat(page, action, parentDesc = '') {
  const targets = action?.targets || [0];
  
  // Find and click checkboxes in the selection panel
  const result = await page.evaluate(({indices}) => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return { success: false, error: 'No selection panel' };
    
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length === 0) return { success: false, error: 'No checkboxes' };
    
    // Check the requested indices
    for (const idx of indices) {
      if (idx < checkboxes.length) {
        checkboxes[idx].checked = true;
        checkboxes[idx].dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    // Click confirm button
    const confirm = panel.querySelector('button');
    if (confirm) {
      confirm.click();
      return { success: true, checked: indices.length };
    }
    
    return { success: false, error: 'No confirm button' };
  }, {indices: targets});
  
  await page.waitForTimeout(500);
  
  const desc = parentDesc ? `${parentDesc} (ate ${targets.length})` : `Ate ${targets.length} prey`;
  return { success: result?.success || false, description: desc, error: result?.error };
}

/**
 * Execute dry drop via DOM
 */
async function executeDryDrop(page, parentDesc = '') {
  // Look for dry drop / skip button in the selection panel or action bar
  const result = await page.evaluate(() => {
    // Try selection panel first
    const panel = document.getElementById('selection-panel');
    if (panel) {
      const buttons = panel.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.innerText.toLowerCase();
        if (text.includes('skip') || text.includes('dry') || text.includes('none') || text.includes('pass')) {
          btn.click();
          return { success: true, clicked: btn.innerText.trim() };
        }
      }
      // If there's a confirm with no checkboxes checked = dry drop
      const confirm = panel.querySelector('button');
      if (confirm) {
        confirm.click();
        return { success: true, clicked: 'confirm (no selection = dry drop)' };
      }
    }
    
    // Try action bar
    const bar = document.getElementById('action-bar');
    if (bar) {
      const buttons = bar.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.innerText.toLowerCase();
        if (text.includes('skip') || text.includes('dry') || text.includes('none')) {
          btn.click();
          return { success: true, clicked: btn.innerText.trim() };
        }
      }
    }
    
    return { success: false, error: 'No dry drop button found' };
  });
  
  await page.waitForTimeout(500);
  
  const desc = parentDesc ? `${parentDesc} (dry drop)` : 'Dry drop';
  return { success: result?.success || false, description: desc, error: result?.error };
}

/**
 * Activate a trap via DOM
 */
async function executeActivate(page, action) {
  const result = await page.evaluate(({idx}) => {
    const overlay = document.querySelector('.reaction-overlay.active, .reaction-overlay');
    if (!overlay) return { success: false, error: 'No reaction overlay' };
    
    const buttons = overlay.querySelectorAll('button');
    const activateBtn = Array.from(buttons).find(b => 
      b.innerText.toLowerCase().includes('activate') || b.innerText.toLowerCase().includes('yes')
    );
    
    if (activateBtn) {
      activateBtn.click();
      return { success: true };
    }
    return { success: false, error: 'No activate button' };
  }, {idx: action.index || 0});
  
  await page.waitForTimeout(500);
  return { success: result?.success || false, description: 'Activated trap', error: result?.error };
}

/**
 * Pass on trap activation via DOM
 */
async function executePass(page) {
  const result = await page.evaluate(() => {
    const overlay = document.querySelector('.reaction-overlay.active, .reaction-overlay');
    if (!overlay) return { success: true }; // No overlay = nothing to pass on
    
    const buttons = overlay.querySelectorAll('button');
    const passBtn = Array.from(buttons).find(b => 
      b.innerText.toLowerCase().includes('pass') || b.innerText.toLowerCase().includes('no') || b.innerText.toLowerCase().includes('decline')
    );
    
    if (passBtn) {
      passBtn.click();
      return { success: true };
    }
    return { success: false, error: 'No pass button' };
  });
  
  await page.waitForTimeout(500);
  return { success: result?.success || false, description: 'Passed on trap', error: result?.error };
}

/**
 * Handle trap reaction if one appears (check opponent's side)
 */
async function handleTrapReaction(page) {
  const reaction = await page.evaluate(() => {
    const state = window.__qa?.getState();
    return state?.pendingContext?.type === 'pending_reaction' ? state.pendingContext : null;
  });
  
  if (reaction) {
    // For now, always pass on traps (the LLM brain should decide this in future)
    await executePass(page);
  }
}

/**
 * Click the first option in a selection panel (for spells that need targets)
 */
async function clickFirstSelectionOption(page) {
  await page.evaluate(() => {
    const panel = document.getElementById('selection-panel');
    if (!panel) return;
    
    // Look for clickable cards or buttons
    const options = panel.querySelectorAll('.selection-item .card, .card, button');
    for (const opt of options) {
      if (opt.offsetHeight > 0) {
        opt.click();
        return;
      }
    }
  });
}

/**
 * Dismiss pass overlay if showing
 */
async function dismissPassOverlay(page) {
  await page.evaluate(() => document.getElementById('pass-confirm')?.click());
  await page.waitForTimeout(300);
}

module.exports = { executeAction, dismissPassOverlay, handleTrapReaction };
