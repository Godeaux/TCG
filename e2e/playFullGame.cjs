const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState, playCard, selectEatTargets, dryDrop, attackCreature, attackPlayer, advancePhase, endTurn } = require('./gameHelpers.cjs');

function log(msg) { console.log(msg); }

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log('🃏 Starting Bird vs AI game...\n');
  await setupGame(p, 'bird');
  log('✅ Setup complete!\n');
  
  // Play up to 30 turns
  for (let round = 0; round < 30; round++) {
    const state = await getState(p);
    if (!state) { log('❌ No state'); break; }
    if (state.gameOver?.over) {
      log('\n🏆 GAME OVER: ' + JSON.stringify(state.gameOver));
      break;
    }
    if (!state.myTurn || state.phase !== 'Main 1') {
      log(`⏳ Not my turn (phase=${state.phase}, myTurn=${state.myTurn})`);
      await waitForMyTurn(p);
      continue;
    }
    
    log('═══════════════════════════════════════');
    log(`  Turn ${state.turn} | HP: me=${state.myHP} opp=${state.oppHP}`);
    log('═══════════════════════════════════════');
    log(state.compact);
    
    const hand = state.hand || [];
    log('Hand: ' + hand.map((c, i) => `[${i}]${c.name}(${c.type[0]})`).join(' '));
    
    // === MAIN PHASE: Pick and play a card ===
    // Strategy: Free Spell first (free), then Prey (build board), then cheap Predator
    let playIdx = hand.findIndex(c => c.type === 'Free Spell');
    if (playIdx < 0) playIdx = hand.findIndex(c => c.type === 'Prey');
    if (playIdx < 0) playIdx = hand.findIndex(c => c.type === 'Spell');
    if (playIdx < 0) playIdx = hand.findIndex(c => c.type === 'Predator');
    
    if (playIdx >= 0) {
      const card = hand[playIdx];
      log(`\n▶ Play: ${card.name} (${card.type} ${card.atk || '-'}/${card.hp || '-'})`);
      const result = await playCard(p, playIdx);
      
      if (result?.success) {
        // Handle consumption
        const pending = result?.newState?.pendingContext;
        if (pending?.type === 'pending_consumption') {
          if (pending.options?.length > 0) {
            log(`  🍖 Eating: ${pending.options[0].name}`);
            await selectEatTargets(p, [0]);
          } else {
            log('  🍂 Dry drop');
            await dryDrop(p);
          }
        }
        log('  ✅ Success');
      } else {
        log('  ❌ ' + result?.error);
      }
    } else {
      log('\n⏭ No playable cards');
    }
    
    // === COMBAT PHASE ===
    await advancePhase(p);
    await p.waitForTimeout(300);
    
    const combatState = await getState(p);
    if (combatState?.phase === 'Combat') {
      const myCreatures = combatState.myField?.filter(c => c) || [];
      const oppCreatures = combatState.oppField?.filter(c => c) || [];
      
      for (const c of myCreatures) {
        if (!c.canAttack) continue;
        
        if (oppCreatures.length > 0) {
          // Attack weakest enemy creature
          const target = oppCreatures.sort((a, b) => (a.currentHp || 99) - (b.currentHp || 99))[0];
          log(`  ⚔ ${c.name}(${c.currentAtk}/${c.currentHp}) → ${target.name}(${target.currentAtk}/${target.currentHp})`);
          const r = await attackCreature(p, c.slot, target.slot);
          if (r?.success) log('  💥 Hit!');
          else log('  ❌ ' + r?.error);
        } else if (c.canAttackPlayer) {
          log(`  ⚔ ${c.name}(${c.currentAtk}/${c.currentHp}) → Player!`);
          const r = await attackPlayer(p, c.slot);
          if (r?.success) log('  💥 Direct!');
          else log('  ❌ ' + r?.error);
        }
        await p.waitForTimeout(200);
      }
    }
    
    // === END TURN ===
    await endTurn(p);
    await p.waitForTimeout(1500);
    
    // Wait for next turn
    const nextTurn = await waitForMyTurn(p);
    if (nextTurn?.gameOver?.over) {
      log('\n🏆 GAME OVER: ' + JSON.stringify(nextTurn.gameOver));
      break;
    }
  }
  
  // Final state
  const final = await getState(p);
  log('\n═══════════════════════════════════════');
  log('  FINAL');
  log('═══════════════════════════════════════');
  log(final?.compact || 'no state');
  log('Game over: ' + JSON.stringify(final?.gameOver));
  
  // Show last 15 log entries
  const gameLog = await p.evaluate(() => window.__qa?.getLog(15)?.map(l => typeof l === 'string' ? l : l.message));
  log('\nGame log:');
  gameLog?.forEach(l => log('  ' + l));
  
  await browser.close();
})();
