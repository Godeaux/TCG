/**
 * Action Executor — Converts parsed LLM actions into real DOM interactions
 * 
 * All game actions go through DOM drag-and-drop / clicks.
 * QA API used ONLY for state verification, never for triggering actions.
 */

const { dragCardToField, dragAttack, dragAttackPlayer, scanUI } = require('../domInteraction.cjs');
const { handleSelectionUI, handleTargetingMode } = require('./selectionHandler.cjs');

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
  
  // Field full check — but predators CAN eat prey to make room
  if (targetSlot < 0 && card.type === 'Prey') {
    return { success: false, description: 'Field full', error: 'No empty slot for prey' };
  }
  if (targetSlot < 0 && card.type === 'Predator' && !eat?.length && !isDryDrop) {
    return { success: false, description: 'Field full', error: 'No empty slot (specify EAT to make room)' };
  }
  if (targetSlot < 0 && card.type === 'Predator' && eat?.length > 0) {
    // Predator will eat prey, freeing a slot — use the slot of first prey to be eaten
    targetSlot = eat[0];
  }
  if (targetSlot < 0) targetSlot = 0; // Spells don't need a slot
  
  // For targeted spells: drag directly onto an enemy creature (not onto field slot)
  // The game reverts targeted spells dropped on empty slots
  const isSpell = card.type === 'Spell' || card.type === 'Free Spell';
  if (isSpell) {
    // Check if this spell requires a target by looking for selectFromGroup or similar
    const needsTarget = await page.evaluate(({hi}) => {
      return window.__qa?.cardNeedsTarget?.(hi) ?? false;
    }, {hi: handIndex});
    
    if (needsTarget) {
      // Find enemy creatures to target
      const oppField = state?.players?.[1]?.field?.filter(c => c) || [];
      if (oppField.length === 0) {
        return { success: false, description: `Play ${card.name} (${card.type})`, error: 'No targets for targeted spell' };
      }
      
      // Ask LLM which enemy creature to target
      const selHP = [state?.players?.[0]?.hp ?? '?', state?.players?.[1]?.hp ?? '?'];
      const gameCtx = `HP: You ${selHP[0]} | Rival ${selHP[1]}. Casting ${card.name}${card.effectText ? ' — ' + card.effectText : ''}.`;
      const targetOptions = oppField.map((c, i) => ({ index: i, name: `${c.name} ${c.currentAtk}/${c.currentHp}${c.keywords?.length ? ' [' + c.keywords.join(',') + ']' : ''}` }));
      
      let targetSlotIdx = oppField[0].slot; // Default to first
      if (targetOptions.length > 1) {
        const { askLLMChoice } = require('./selectionHandler.cjs');
        const chosen = await askLLMChoice(`Target for ${card.name}`, targetOptions, gameCtx);
        targetSlotIdx = oppField[chosen]?.slot ?? oppField[0].slot;
      }
      
      // Drag spell card onto the enemy creature
      console.log(`  [SPELL-TARGET] ${card.name} → enemy slot ${targetSlotIdx}`);
      const spellResult = await page.evaluate(({hi, tSlot}) => {
        // Find hand card element
        const handCards = document.querySelectorAll('.hand .card, .hand-container .card');
        const visible = Array.from(handCards).filter(c => c.offsetHeight > 0);
        const cardEl = visible[hi];
        if (!cardEl) return { success: false, error: 'No hand card element' };
        
        // Find enemy creature element (opponent field is slots 0-2, our field is 3-5)
        const slots = document.querySelectorAll('.field-slot');
        const targetEl = slots[tSlot]?.querySelector('.card');
        if (!targetEl) return { success: false, error: `No enemy card at slot ${tSlot}` };
        
        const dt = new DataTransfer();
        const instanceId = cardEl.dataset.instanceId;
        if (instanceId) dt.setData('text/plain', instanceId);
        
        const sr = cardEl.getBoundingClientRect();
        const tr = targetEl.getBoundingClientRect();
        
        cardEl.dispatchEvent(new DragEvent('dragstart', { bubbles:true, cancelable:true, dataTransfer:dt, clientX:sr.x+sr.width/2, clientY:sr.y+sr.height/2 }));
        targetEl.dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true, dataTransfer:dt, clientX:tr.x+tr.width/2, clientY:tr.y+tr.height/2 }));
        targetEl.dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer:dt, clientX:tr.x+tr.width/2, clientY:tr.y+tr.height/2 }));
        cardEl.dispatchEvent(new DragEvent('dragend', { bubbles:true, cancelable:true, dataTransfer:dt }));
        
        return { success: true };
      }, {hi: handIndex, tSlot: targetSlotIdx});
      
      await page.waitForTimeout(800);
      const desc = `Play ${card.name} (${card.type}) → target slot ${targetSlotIdx}`;
      
      // Handle any follow-up selections after the targeted spell
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.waitForTimeout(400);
        const targeting = await handleTargetingMode(page, `spell:${card.name}`, gameCtx);
        if (targeting.handled) break;
        const selection = await handleSelectionUI(page, `spell:${card.name}`, gameCtx);
        if (selection.handled) break;
      }
      
      return { success: spellResult?.success || false, description: desc, error: spellResult?.error };
    }
  }
  
  // For non-targeted spells and creatures: drag to field slot
  const result = await dragCardToField(page, handIndex, targetSlot);
  await page.waitForTimeout(800);
  
  const desc = `Play ${card.name} (${card.type})`;
  
  if (!result?.success) {
    return { success: false, description: desc, error: result?.error || 'Drag failed' };
  }
  
  // Handle consumption if predator
  if (card.type === 'Predator') {
    // Wait for consumption prompt to appear
    let pending = null;
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(500);
      pending = await page.evaluate(() => window.__qa?.getState()?.pendingContext);
      if (pending?.type === 'pending_consumption') break;
    }
    
    if (pending?.type === 'pending_consumption') {
      if (isDryDrop || (!eat && pending.options?.length === 0)) {
        // Dry drop via QA API (modal response, not a game action)
        await page.evaluate(() => window.__qa?.act?.dryDrop());
        await page.waitForTimeout(500);
        return { success: true, description: `${desc} (dry drop)` };
      } else {
        // Map LLM's field slot indices to consumption option indices
        // The LLM says EAT 1,2 (field slots), but selectEatTargets wants 
        // sequential indices into the pending.options array
        let targetIndices = eat || [0];
        
        if (pending.options && pending.options.length > 0 && eat && eat.length > 0) {
          // Get the field creatures at the requested slots
          const myField = await page.evaluate(() => {
            const s = window.__qa?.getState();
            return s?.players?.[0]?.field?.map(c => c ? c.instanceId : null) || [];
          });
          
          // Map each requested field slot to its consumption option index
          const mapped = [];
          for (const slotIdx of eat) {
            const instanceId = myField[slotIdx];
            if (instanceId) {
              const optIdx = pending.options.findIndex(o => o.instanceId === instanceId);
              if (optIdx >= 0 && !mapped.includes(optIdx)) {
                mapped.push(optIdx);
              }
            }
          }
          
          // If mapping found valid indices, use them; otherwise fall back to sequential
          targetIndices = mapped.length > 0 ? mapped : eat.filter(i => i < pending.options.length);
          if (targetIndices.length === 0) targetIndices = [0]; // Last resort: eat first option
        }
        
        // Cap at 3 (max consumption)
        targetIndices = targetIndices.slice(0, 3);
        
        await page.evaluate(({t}) => window.__qa?.act?.selectEatTargets(t), {t: targetIndices});
        await page.waitForTimeout(500);
        const optionNames = targetIndices.map(i => pending.options?.[i]?.name || '?').join(', ');
        return { success: true, description: `${desc} (ate: ${optionNames})` };
      }
    }
  }
  
  // Handle any follow-up selection UI (spell targets, creature effects like Pistol Shrimp, etc.)
  // Build game context for LLM decision
  // Build rich context for follow-up LLM decisions
  const selMyField = state?.players?.[0]?.field?.filter(c => c)?.map(c => {
    const kw = c.keywords?.length ? ` [${c.keywords.join(', ')}]` : '';
    const eff = c.effectText ? ` — ${c.effectText}` : '';
    return `  ${c.name} ${c.currentAtk}/${c.currentHp}${kw}${eff}`;
  })?.join('\n') || '  (empty)';
  const selOppField = state?.players?.[1]?.field?.filter(c => c)?.map(c => {
    const kw = c.keywords?.length ? ` [${c.keywords.join(', ')}]` : '';
    const eff = c.effectText ? ` — ${c.effectText}` : '';
    return `  ${c.name} ${c.currentAtk}/${c.currentHp}${kw}${eff}`;
  })?.join('\n') || '  (empty)';
  const gameCtx = `HP: You ${state?.players?.[0]?.hp ?? '?'} | Rival ${state?.players?.[1]?.hp ?? '?'}
Your field:\n${selMyField}
Rival field:\n${selOppField}
You just played: ${card.name} (${card.type})${card.effectText ? ' — ' + card.effectText : ''}`;
  
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.waitForTimeout(400);
    // Check for targeting mode first (spell targets — click on field)
    const targeting = await handleTargetingMode(page, `play:${card.name}`, gameCtx);
    if (targeting.handled) break;
    // Then check for selection panel (consumption, choices)
    const selection = await handleSelectionUI(page, `play:${card.name}`, gameCtx);
    if (selection.handled) break;
    if (attempt >= 4) break;
  }
  
  return { success: true, description: desc };
}

/**
 * Execute attack via DOM drag-and-drop
 */
async function executeAttack(page, action, state) {
  const { attackerSlot, target } = action;
  
  const myCreature = state?.players?.[0]?.field?.[attackerSlot];
  
  if (target === 'player') {
    // DOM drag to opponent badge (dynamically resolved)
    let result = await dragAttackPlayer(page, attackerSlot);
    
    // Retry once if drag failed (synthetic DragEvent intermittent issue)
    if (result?.hpChanged === false) {
      console.log(`  [A1-DIAG] Face drag FAILED (attempt 1), retrying...`);
      await page.waitForTimeout(300);
      result = await dragAttackPlayer(page, attackerSlot);
      if (result?.hpChanged === false) {
        console.log(`  [A1-DIAG] Face drag FAILED (attempt 2): hp=${result.hpBefore}→${result.hpAfter} gameLog=${result.gameLogChanged}`);
      } else {
        console.log(`  [A1-DIAG] Retry succeeded!`);
      }
    }
    await page.waitForTimeout(800);
    
    const desc = `${myCreature?.name || 'Creature'} attacks Player`;
    return { success: result?.success || false, description: desc, error: result?.error, hpChanged: result?.hpChanged };
  } else {
    // DOM drag to enemy creature
    const result = await dragAttack(page, attackerSlot, target);
    await page.waitForTimeout(800);
    
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
