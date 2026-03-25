/**
 * DOM Interaction Helpers — Simulate real player actions via DOM events
 * 
 * These trigger the SAME code paths as a real player using mouse/touch.
 * No QA API for actions — only for state verification after.
 */

/**
 * Simulate an HTML5 drag-and-drop from one element to another.
 * This dispatches real dragstart/dragover/drop/dragend events.
 */
async function dragAndDrop(page, fromSelector, toSelector) {
  return page.evaluate(({from, to}) => {
    const fromEl = typeof from === 'string' ? document.querySelector(from) : from;
    const toEl = typeof to === 'string' ? document.querySelector(to) : to;
    
    if (!fromEl || !toEl) {
      return { success: false, error: `Element not found: from=${!!fromEl} to=${!!toEl}` };
    }
    
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    
    // Create a DataTransfer
    const dataTransfer = new DataTransfer();
    
    // dragstart on source
    const dragStartEvent = new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: fromRect.x + fromRect.width / 2,
      clientY: fromRect.y + fromRect.height / 2,
    });
    fromEl.dispatchEvent(dragStartEvent);
    
    // dragover on target (required to allow drop)
    const dragOverEvent = new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: toRect.x + toRect.width / 2,
      clientY: toRect.y + toRect.height / 2,
    });
    toEl.dispatchEvent(dragOverEvent);
    
    // drop on target
    const dropEvent = new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: toRect.x + toRect.width / 2,
      clientY: toRect.y + toRect.height / 2,
    });
    toEl.dispatchEvent(dropEvent);
    
    // dragend on source
    const dragEndEvent = new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer,
    });
    fromEl.dispatchEvent(dragEndEvent);
    
    return { success: true };
  }, {from: fromSelector, to: toSelector});
}

/**
 * Drag a card from hand to a field slot by card index and slot index.
 * Uses real HTML5 drag events that trigger the game's drag-and-drop handlers.
 */
async function dragCardToField(page, cardIndex, slotIndex) {
  return page.evaluate(({cardIdx, slotIdx}) => {
    // Find the card in hand
    const handCards = document.querySelectorAll('.hand-grid .card');
    const card = handCards[cardIdx];
    if (!card) return { success: false, error: `No card at hand index ${cardIdx}` };
    
    // Find the target field slot (player's slots are 3,4,5 in the DOM)
    const slots = document.querySelectorAll('.field-slot');
    const targetSlot = slots[slotIdx + 3]; // Offset by 3 for player's field
    if (!targetSlot) return { success: false, error: `No field slot at index ${slotIdx}` };
    
    const cardRect = card.getBoundingClientRect();
    const slotRect = targetSlot.getBoundingClientRect();
    
    const dataTransfer = new DataTransfer();
    
    // The game's handleDragStart reads instanceId from dataset
    const instanceId = card.dataset.instanceId;
    if (instanceId) {
      dataTransfer.setData('text/plain', instanceId);
    }
    
    card.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: cardRect.x + cardRect.width / 2,
      clientY: cardRect.y + cardRect.height / 2,
    }));
    
    targetSlot.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: slotRect.x + slotRect.width / 2,
      clientY: slotRect.y + slotRect.height / 2,
    }));
    
    targetSlot.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: slotRect.x + slotRect.width / 2,
      clientY: slotRect.y + slotRect.height / 2,
    }));
    
    card.dispatchEvent(new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer,
    }));
    
    return { success: true, cardName: card.querySelector('[class*=name]')?.innerText?.trim() };
  }, {cardIdx: cardIndex, slotIdx: slotIndex});
}

/**
 * Drag a creature from field to attack an enemy creature.
 * Attacker slot (0-2) → enemy creature on opponent's field
 */
async function dragAttack(page, attackerSlot, targetSlot) {
  return page.evaluate(({aSlot, tSlot}) => {
    const slots = document.querySelectorAll('.field-slot');
    // Player's creatures are in slots 3,4,5
    const attackerEl = slots[aSlot + 3]?.querySelector('.card');
    // Opponent's creatures are in slots 0,1,2
    const targetEl = slots[tSlot]?.querySelector('.card');
    
    if (!attackerEl) return { success: false, error: `No card in my slot ${aSlot}` };
    if (!targetEl) return { success: false, error: `No card in opponent slot ${tSlot}` };
    
    const aRect = attackerEl.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    
    const dataTransfer = new DataTransfer();
    const instanceId = attackerEl.dataset.instanceId;
    if (instanceId) dataTransfer.setData('text/plain', instanceId);
    
    attackerEl.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: aRect.x + aRect.width / 2, clientY: aRect.y + aRect.height / 2,
    }));
    
    targetEl.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: tRect.x + tRect.width / 2, clientY: tRect.y + tRect.height / 2,
    }));
    
    targetEl.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: tRect.x + tRect.width / 2, clientY: tRect.y + tRect.height / 2,
    }));
    
    attackerEl.dispatchEvent(new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer,
    }));
    
    return { success: true };
  }, {aSlot: attackerSlot, tSlot: targetSlot});
}

/**
 * Drag a creature to attack the opponent player directly.
 * Drags to the opponent's scoreboard/player badge.
 */
async function dragAttackPlayer(page, attackerSlot) {
  return page.evaluate(({aSlot}) => {
    const slots = document.querySelectorAll('.field-slot');
    const attackerEl = slots[aSlot + 3]?.querySelector('.card');
    if (!attackerEl) return { success: false, error: `No card in my slot ${aSlot}` };
    
    // Determine opponent index dynamically (NOT hardcoded to "1")
    const localPlayerIndex = window.__qa?.getState()?.localPlayer ?? 0;
    const opponentIndex = 1 - localPlayerIndex;
    
    // Target: opponent's player badge
    const target = document.querySelector(`.player-badge[data-player-index="${opponentIndex}"]`);
    if (!target) return { success: false, error: `No opponent badge found (opponent index ${opponentIndex})` };
    
    const aRect = attackerEl.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    
    const dataTransfer = new DataTransfer();
    const instanceId = attackerEl.dataset.instanceId;
    if (instanceId) dataTransfer.setData('text/plain', instanceId);
    
    attackerEl.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: aRect.x + aRect.width / 2, clientY: aRect.y + aRect.height / 2,
    }));
    
    target.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: tRect.x + tRect.width / 2, clientY: tRect.y + tRect.height / 2,
    }));
    
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer,
      clientX: tRect.x + tRect.width / 2, clientY: tRect.y + tRect.height / 2,
    }));
    
    attackerEl.dispatchEvent(new DragEvent('dragend', {
      bubbles: true, cancelable: true, dataTransfer,
    }));
    
    return { success: true };
  }, {aSlot: attackerSlot});
}

/**
 * Scan for any visible selection/modal UI and return what's showing
 */
async function scanUI(page) {
  return page.evaluate(() => {
    const results = [];
    
    // Selection panel (card target selection)
    const selectionCards = document.querySelectorAll('.selection-panel .card, .selection-overlay .card');
    const visibleSelections = Array.from(selectionCards).filter(c => c.offsetHeight > 0);
    if (visibleSelections.length > 0) {
      results.push({
        type: 'selection',
        count: visibleSelections.length,
        options: visibleSelections.map(c => ({
          name: c.querySelector('[class*=name]')?.innerText?.trim(),
          instanceId: c.dataset?.instanceId,
        })),
      });
    }
    
    // Reaction/trap overlay
    const reaction = document.querySelector('.reaction-overlay.active, .reaction-overlay[style*="opacity: 1"]');
    if (reaction) {
      const btns = Array.from(reaction.querySelectorAll('button')).filter(b => b.offsetHeight > 0);
      results.push({
        type: 'reaction',
        buttons: btns.map(b => ({ text: b.innerText.trim(), id: b.id })),
      });
    }
    
    // Pass overlay
    if (document.querySelector('.pass-overlay.active')) {
      results.push({ type: 'pass' });
    }
    
    // QA pending context (most reliable)
    const qa = window.__qa?.getState();
    if (qa?.pendingContext) {
      results.push({ type: 'qa_pending', ...qa.pendingContext });
    }
    
    return results;
  });
}

module.exports = {
  dragAndDrop,
  dragCardToField,
  dragAttack,
  dragAttackPlayer,
  scanUI,
};
