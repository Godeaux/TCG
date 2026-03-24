/**
 * UI Explorer — Play cards and map every modal/overlay that appears
 * 
 * Goal: discover every UI state a player encounters during gameplay
 * so we can handle them all in the harness.
 */

const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState, advancePhase, endTurn } = require('./gameHelpers.cjs');

function log(msg) { console.log(msg); }

/**
 * Scan the DOM for any visible overlay/modal/selection UI
 */
async function scanForUI(p) {
  return p.evaluate(() => {
    const results = [];
    
    // Check for selection panel (target selection)
    const selPanel = document.querySelector('.selection-panel, .selection-overlay, .select-panel');
    if (selPanel && selPanel.offsetHeight > 0) {
      const options = Array.from(selPanel.querySelectorAll('.selection-option, .card, button')).filter(e => e.offsetHeight > 0);
      results.push({
        type: 'selection_panel',
        title: selPanel.querySelector('.selection-title, h2, h3')?.innerText?.trim(),
        options: options.map(o => ({
          text: o.innerText?.trim()?.substring(0, 40),
          classes: o.className?.substring(0, 40),
          tag: o.tagName,
        })),
      });
    }
    
    // Check for reaction overlay (trap prompt)
    const reactionOverlay = document.querySelector('.reaction-overlay');
    if (reactionOverlay?.classList.contains('active') || (reactionOverlay && reactionOverlay.offsetHeight > 0 && window.getComputedStyle(reactionOverlay).opacity !== '0')) {
      results.push({
        type: 'reaction_prompt',
        content: reactionOverlay.innerText?.substring(0, 200),
        buttons: Array.from(reactionOverlay.querySelectorAll('button')).filter(b => b.offsetHeight > 0).map(b => b.innerText.trim()),
      });
    }
    
    // Check for choice modal (chooseOption)
    const choiceModal = document.querySelector('.choice-modal, .option-modal, [class*=choice]');
    if (choiceModal && choiceModal.offsetHeight > 0) {
      results.push({
        type: 'choice_modal',
        content: choiceModal.innerText?.substring(0, 200),
        buttons: Array.from(choiceModal.querySelectorAll('button')).filter(b => b.offsetHeight > 0).map(b => b.innerText.trim()),
      });
    }
    
    // Check for consumption panel
    const consumePanel = document.querySelector('.consumption-panel, [class*=consume], [class*=eat-select]');
    if (consumePanel && consumePanel.offsetHeight > 0) {
      results.push({
        type: 'consumption_panel',
        content: consumePanel.innerText?.substring(0, 200),
      });
    }
    
    // Check for pass overlay
    const passOverlay = document.querySelector('.pass-overlay');
    if (passOverlay?.classList.contains('active')) {
      results.push({ type: 'pass_overlay' });
    }
    
    // Check for victory overlay
    const victoryOverlay = document.querySelector('.victory-overlay');
    if (victoryOverlay && victoryOverlay.offsetHeight > 0 && window.getComputedStyle(victoryOverlay).opacity !== '0') {
      results.push({ type: 'victory_overlay', content: victoryOverlay.innerText?.substring(0, 200) });
    }
    
    // Check QA API for pending context
    const qaState = window.__qa?.getState();
    if (qaState?.pendingContext) {
      results.push({ type: 'qa_pending', context: qaState.pendingContext });
    }
    
    // Check for any active overlays we haven't caught
    const activeOverlays = Array.from(document.querySelectorAll('.overlay.active')).map(o => o.className.substring(0, 60));
    if (activeOverlays.length > 0) {
      results.push({ type: 'active_overlays', overlays: activeOverlays });
    }
    
    // Check for card tooltip (expanded card view)
    const tooltip = document.querySelector('.card-tooltip, .expanded-card, [class*=tooltip]');
    if (tooltip && tooltip.offsetHeight > 0 && window.getComputedStyle(tooltip).opacity !== '0') {
      results.push({ type: 'card_tooltip', content: tooltip.innerText?.substring(0, 100) });
    }
    
    return results;
  });
}

/**
 * Try playing a card via DOM interaction (not QA API) 
 * This is what a real player does: click card in hand, drag or click to play
 */
async function playCardViaDOM(p, cardIndex) {
  // Get the card element
  const cardInfo = await p.evaluate(({idx}) => {
    const cards = document.querySelectorAll('.hand-grid .card');
    const card = cards[idx];
    if (!card) return null;
    return {
      rect: card.getBoundingClientRect(),
      name: card.querySelector('[class*=name]')?.innerText?.trim(),
      instanceId: card.dataset.instanceId,
      classes: card.className,
    };
  }, {idx: cardIndex});
  
  if (!cardInfo) return { success: false, error: 'Card not found in DOM' };
  
  log(`  DOM: Found card "${cardInfo.name}" at (${Math.round(cardInfo.rect.x)}, ${Math.round(cardInfo.rect.y)})`);
  
  // Get empty field slot position (my slots are bottom row)
  const slotInfo = await p.evaluate(() => {
    const slots = document.querySelectorAll('.field-slot');
    // Bottom row slots (player's field)
    for (let i = 3; i < 6; i++) {
      const slot = slots[i];
      if (slot && !slot.querySelector('.card')) {
        return { index: i, rect: slot.getBoundingClientRect() };
      }
    }
    return null;
  });
  
  if (!slotInfo && (cardInfo.classes.includes('type-prey') || cardInfo.classes.includes('type-predator'))) {
    return { success: false, error: 'No empty field slot' };
  }
  
  // For spells, just click the card (no field slot needed)
  if (cardInfo.classes.includes('type-spell')) {
    const fromX = cardInfo.rect.x + cardInfo.rect.width / 2;
    const fromY = cardInfo.rect.y + cardInfo.rect.height / 2;
    await p.mouse.click(fromX, fromY);
    await p.waitForTimeout(500);
    return { success: true, method: 'click' };
  }
  
  // For creatures: drag from hand to field slot
  if (slotInfo) {
    const fromX = cardInfo.rect.x + cardInfo.rect.width / 2;
    const fromY = cardInfo.rect.y + cardInfo.rect.height / 2;
    const toX = slotInfo.rect.x + slotInfo.rect.width / 2;
    const toY = slotInfo.rect.y + slotInfo.rect.height / 2;
    
    log(`  DOM: Dragging from (${Math.round(fromX)}, ${Math.round(fromY)}) to (${Math.round(toX)}, ${Math.round(toY)})`);
    
    await p.mouse.move(fromX, fromY);
    await p.waitForTimeout(100);
    await p.mouse.down();
    await p.waitForTimeout(100);
    for (let step = 0; step <= 15; step++) {
      const x = fromX + (toX - fromX) * step / 15;
      const y = fromY + (toY - fromY) * step / 15;
      await p.mouse.move(x, y);
      await p.waitForTimeout(20);
    }
    await p.mouse.up();
    await p.waitForTimeout(500);
    return { success: true, method: 'drag' };
  }
  
  return { success: false, error: 'Unknown card type' };
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log('🔍 UI Explorer — Mapping all game modals\n');
  await setupGame(p, 'bird');
  log('✅ Game ready\n');
  
  for (let round = 0; round < 10; round++) {
    const state = await getState(p);
    if (!state || state.gameOver?.over) break;
    if (!state.myTurn || state.phase !== 'Main 1') {
      await waitForMyTurn(p);
      continue;
    }
    
    const hand = state.hand || [];
    log(`\n═══ T${state.turn} | HP ${state.myHP}-${state.oppHP} ═══`);
    log('Hand: ' + hand.map((c, i) => `[${i}]${c.name}(${c.type[0]})`).join(' '));
    
    // Scan UI before playing
    let ui = await scanForUI(p);
    if (ui.length > 0) log('UI before play: ' + JSON.stringify(ui));
    
    // Try playing via DOM (real player interaction)
    // Pick a prey card first
    let playIdx = hand.findIndex(c => c.type === 'Prey');
    if (playIdx < 0) playIdx = hand.findIndex(c => c.type === 'Free Spell');
    if (playIdx < 0) playIdx = 0;
    
    log(`\n▶ Playing [${playIdx}] ${hand[playIdx].name} via DOM...`);
    const playResult = await playCardViaDOM(p, playIdx);
    log(`  Result: ${JSON.stringify(playResult)}`);
    
    await p.waitForTimeout(1000);
    
    // Scan UI after playing — this is where modals appear
    ui = await scanForUI(p);
    if (ui.length > 0) {
      log('UI after play:');
      ui.forEach(u => log('  ' + JSON.stringify(u)));
    }
    
    // Check if the card was actually played (verify state changed)
    const afterState = await getState(p);
    const newField = afterState?.myField?.filter(c => c) || [];
    const prevField = state.myField?.filter(c => c) || [];
    if (newField.length > prevField.length) {
      log('  ✅ Card placed on field: ' + newField[newField.length - 1]?.name);
    } else if (afterState?.hand?.length < hand.length) {
      log('  ✅ Card left hand (spell cast)');
    } else {
      log('  ❓ No state change detected — card may need selection interaction');
      
      // Take screenshot for debugging
      const fs = require('fs');
      if (!fs.existsSync('e2e/screenshots')) fs.mkdirSync('e2e/screenshots', { recursive: true });
      await p.screenshot({ path: `e2e/screenshots/ui-after-play-t${state.turn}.png` });
      log('  📸 Screenshot saved');
    }
    
    // Advance and end turn
    await advancePhase(p);
    await p.waitForTimeout(300);
    await endTurn(p);
    await p.waitForTimeout(1500);
    await waitForMyTurn(p);
  }
  
  await browser.close();
})();
