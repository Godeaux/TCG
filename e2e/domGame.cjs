/**
 * Full game via DOM drag-and-drop ONLY
 * No QA API for actions — only for state reading + verification
 */

const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState } = require('./gameHelpers.cjs');
const { dragCardToField, dragAttack, dragAttackPlayer, scanUI } = require('./domInteraction.cjs');

function log(msg) { console.log(msg); }

function evaluateCard(card, state) {
  const myField = state.myField?.filter(c => c) || [];
  const oppField = state.oppField?.filter(c => c) || [];
  const emptySlots = 3 - myField.length;
  
  if ((card.type === 'Prey' || card.type === 'Predator') && emptySlots === 0) return -1;
  if (card.type === 'Trap') return -1;
  
  let score = 0;
  if (card.type === 'Prey') {
    score = 10 + (card.atk || 0) * 2 + (card.hp || 0) * 2;
    if (myField.length === 0) score += 25;
    if (card.hp >= 3) score += 5;
    if (card.keywords?.includes('Ambush')) score += 8;
    if (card.keywords?.includes('Haste')) score += 7;
    if (card.keywords?.includes('Barrier')) score += 6;
  } else if (card.type === 'Predator') {
    const preyOnField = myField.filter(c => c.type === 'Prey');
    if (preyOnField.length > 0) {
      score = 20 + (card.atk || 0) * 2 + (card.hp || 0) * 2;
    } else {
      score = 3 + (card.atk || 0) + (card.hp || 0);
      if (emptySlots === 3 && oppField.length > 0) score += 10;
    }
  } else if (card.type === 'Spell' || card.type === 'Free Spell') {
    score = 5;
    // Skip spells for now until we handle target selection
    // (Spells with selectFromGroup need UI interaction we haven't mapped yet)
  }
  
  return score;
}

/**
 * Click the phase/turn button via DOM
 */
async function clickPhaseButton(p) {
  await p.evaluate(() => {
    const btn = document.getElementById('field-turn-btn');
    if (btn) btn.click();
  });
  await p.waitForTimeout(500);
}

/**
 * End turn via DOM (click phase button until End phase, then click again)
 */
async function endTurnDOM(p) {
  // Keep advancing until turn changes
  const startTurn = await p.evaluate(() => window.__qa?.getState()?.turn);
  for (let i = 0; i < 5; i++) {
    await clickPhaseButton(p);
    await p.waitForTimeout(300);
    const phase = await p.evaluate(() => window.__qa?.getState()?.phase);
    const turn = await p.evaluate(() => window.__qa?.getState()?.turn);
    if (turn !== startTurn) break;
  }
}

/**
 * Handle any UI modals that appear
 */
async function handleModals(p) {
  const ui = await scanUI(p);
  for (const modal of ui) {
    if (modal.type === 'pass') {
      await p.evaluate(() => document.getElementById('pass-confirm')?.click());
      await p.waitForTimeout(300);
      log('  ↩ Dismissed pass overlay');
    }
    if (modal.type === 'qa_pending' && modal.type_inner === 'pending_consumption') {
      // Consumption modal — select first prey
      log('  🍖 Consumption modal appeared');
      // TODO: handle via DOM clicks on the consumption UI
    }
    if (modal.type === 'selection') {
      log(`  🎯 Selection modal: ${modal.count} options: ${modal.options?.map(o => o.name).join(', ')}`);
      // TODO: click on a selection option
    }
    if (modal.type === 'reaction') {
      log(`  ⚡ Reaction/trap prompt: ${modal.buttons?.map(b => b.text).join(', ')}`);
      // TODO: click activate or pass
    }
  }
  return ui;
}

const anomalies = [];

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log('🃏 Full DOM Game — Bird vs AI\n');
  await setupGame(p, 'bird');
  log('✅ Game ready\n');
  
  for (let round = 0; round < 40; round++) {
    // Handle any modals (pass overlays etc)
    await handleModals(p);
    
    const state = await getState(p);
    if (!state) break;
    if (state.gameOver?.over) {
      const w = state.gameOver.winner === 0 ? 'ME' : 'OPPONENT';
      log(`\n🏆 ${w} WINS at turn ${state.turn} | HP ${state.myHP}-${state.oppHP}`);
      break;
    }
    if (!state.myTurn || state.phase !== 'Main 1') {
      await waitForMyTurn(p);
      continue;
    }
    
    const myField = state.myField?.filter(c => c) || [];
    const oppField = state.oppField?.filter(c => c) || [];
    
    log('═══════════════════════════════════════');
    log(`  T${state.turn} | HP ${state.myHP}-${state.oppHP} | Board ${myField.length}v${oppField.length}`);
    log('═══════════════════════════════════════');
    
    const hand = state.hand || [];
    log('Hand: ' + hand.map((c, i) => {
      const s = evaluateCard(c, state);
      return `[${i}]${c.name}(${c.type[0]}${c.atk || ''}${c.atk ? '/' + c.hp : ''})=${s}`;
    }).join(' '));
    if (myField.length > 0) log('Board: ' + myField.map(c => `${c.name}(${c.currentAtk}/${c.currentHp})`).join(', '));
    if (oppField.length > 0) log('Enemy: ' + oppField.map(c => `${c.name}(${c.currentAtk}/${c.currentHp}[${c.keywords?.join(',')||''}])`).join(', '));
    
    // === MAIN PHASE: Play best card via drag ===
    const bestCard = hand.reduce((best, card, i) => {
      const s = evaluateCard(card, state);
      return s > best.score ? { idx: i, score: s, card } : best;
    }, { idx: -1, score: -1, card: null });
    
    if (bestCard.idx >= 0 && bestCard.score > 0) {
      // Find first empty slot
      const emptySlot = [0, 1, 2].find(i => !state.myField || !state.myField[i + 3] || state.myField[i] === null);
      const slotIdx = state.myField?.findIndex(c => c === null) ?? 0;
      
      log(`\n▶ Drag: ${bestCard.card.name} → slot ${slotIdx}`);
      const dragResult = await dragCardToField(p, bestCard.idx, slotIdx);
      
      await p.waitForTimeout(1000);
      
      // Check for modals after play
      const postPlayUI = await handleModals(p);
      
      // Verify the play happened
      const afterPlay = await getState(p);
      const newFieldCount = afterPlay?.myField?.filter(c => c)?.length || 0;
      const newHandCount = afterPlay?.hand?.length || 0;
      
      if (newFieldCount > myField.length || newHandCount < hand.length) {
        log(`  ✅ Played! Field: ${myField.length}→${newFieldCount} Hand: ${hand.length}→${newHandCount}`);
        
        // Check for consumption prompt
        const pending = await p.evaluate(() => window.__qa?.getState()?.pendingContext);
        if (pending?.type === 'pending_consumption') {
          log(`  🍖 Consumption prompt: ${pending.options?.map(o => o.name).join(', ')}`);
          // For now, use QA API for consumption since we need to map the consumption UI
          // TODO: replace with DOM interaction
          if (pending.options?.length > 0) {
            await p.evaluate(() => window.__qa?.act?.selectEatTargets([0]));
            log(`  ✅ Ate ${pending.options[0].name}`);
          } else {
            await p.evaluate(() => window.__qa?.act?.dryDrop());
            log('  🍂 Dry dropped');
          }
          await p.waitForTimeout(500);
        }
      } else {
        log(`  ❓ No change detected (field=${newFieldCount}, hand=${newHandCount})`);
        // The card might be a spell that needs target selection
        const pending = await p.evaluate(() => window.__qa?.getState()?.pendingContext);
        if (pending) log(`  Pending: ${JSON.stringify(pending)}`);
      }
    } else {
      log('⏭ No good play');
    }
    
    // === COMBAT via drag ===
    log('\n▶ Combat');
    await clickPhaseButton(p);
    await p.waitForTimeout(500);
    
    const combatState = await getState(p);
    if (combatState?.phase === 'Combat') {
      const myCreatures = combatState.myField?.filter(c => c && c.canAttack) || [];
      const oppCreatures = combatState.oppField?.filter(c => c) || [];
      
      for (const c of myCreatures) {
        if (oppCreatures.length > 0) {
          // Attack weakest killable target
          const sorted = [...oppCreatures].sort((a, b) => (a.currentHp || 99) - (b.currentHp || 99));
          const target = sorted.find(t => t.currentHp <= c.currentAtk) || sorted[0];
          
          log(`  ⚔ ${c.name}(${c.currentAtk}/${c.currentHp}) → ${target.name}(${target.currentAtk}/${target.currentHp})`);
          await dragAttack(p, c.slot, target.slot);
          await p.waitForTimeout(800);
          
          // Check for modals (trap reactions!)
          await handleModals(p);
          
          // Remove dead targets from list
          const afterAtk = await getState(p);
          const stillAlive = afterAtk?.oppField?.filter(c => c)?.map(c => c.slot) || [];
          for (let i = oppCreatures.length - 1; i >= 0; i--) {
            if (!stillAlive.includes(oppCreatures[i].slot)) {
              log(`  💀 ${oppCreatures[i].name} died`);
              oppCreatures.splice(i, 1);
            }
          }
        } else if (c.canAttackPlayer) {
          log(`  ⚔ ${c.name}(${c.currentAtk}) → Player!`);
          await dragAttackPlayer(p, c.slot);
          await p.waitForTimeout(800);
          await handleModals(p);
        } else {
          log(`  ${c.name}: can't attack`);
        }
      }
    } else {
      log(`  Phase is ${combatState?.phase}, not Combat`);
    }
    
    // === END TURN ===
    await endTurnDOM(p);
    await p.waitForTimeout(1500);
    
    // Wait for AI + dismiss pass overlays
    for (let i = 0; i < 30; i++) {
      await p.evaluate(() => document.getElementById('pass-confirm')?.click());
      const s = await p.evaluate(() => ({
        myTurn: window.__qa?.getState()?.ui?.isMyTurn,
        phase: window.__qa?.getState()?.phase,
        gameOver: window.__qa?.isGameOver(),
      }));
      if (s.gameOver?.over) break;
      if (s.myTurn && s.phase === 'Main 1') break;
      await p.waitForTimeout(500);
    }
  }
  
  // Final state
  const final = await getState(p);
  log('\n═══════════════════════════════════════');
  log('  FINAL');
  log('═══════════════════════════════════════');
  log(final?.compact || 'no state');
  
  const gameLog = await p.evaluate(() => window.__qa?.getLog(15)?.map(l => typeof l === 'string' ? l : l.message));
  log('\nGame log:');
  gameLog?.forEach(l => log('  ' + l));
  
  if (anomalies.length > 0) {
    log('\n⚠️ ANOMALIES:');
    anomalies.forEach(a => log('  ' + a));
  }
  
  await browser.close();
})();
