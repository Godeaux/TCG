/**
 * Smart Player — Makes strategic decisions based on board state
 * 
 * This is the "brain" that evaluates hand, board, and opponent to pick actions.
 * It understands CORE-RULES-S.md and plays like a real player would.
 */

const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState, playCard, selectEatTargets, dryDrop, attackCreature, attackPlayer, advancePhase, endTurn } = require('./gameHelpers.cjs');

function log(msg) { console.log(msg); }

/**
 * Evaluate a card's value for playing this turn
 * Higher = better to play now
 */
function evaluateCard(card, state) {
  const myField = state.myField?.filter(c => c) || [];
  const oppField = state.oppField?.filter(c => c) || [];
  const emptySlots = 3 - myField.length;
  
  // Can't play creatures if field is full
  if ((card.type === 'Prey' || card.type === 'Predator') && emptySlots === 0) {
    return -1;
  }
  
  let score = 0;
  
  switch (card.type) {
    case 'Prey':
      // Prey is good for board presence
      score = 10 + (card.atk || 0) + (card.hp || 0);
      // Prey with effects are better
      if (card.effectText) score += 5;
      // If we have no board, prey is urgent
      if (myField.length === 0) score += 20;
      break;
      
    case 'Predator':
      // Predators need prey to eat for value
      const preyOnField = myField.filter(c => c.type === 'Prey');
      if (preyOnField.length > 0) {
        score = 15 + (card.atk || 0) + (card.hp || 0);
        // Bigger predators are better when we have prey to consume
        score += preyOnField.length * 3;
      } else {
        // Dry drop is weak but might be needed if opponent has big threats
        score = 5;
        if (oppField.length > 0 && myField.length === 0) score += 10;
      }
      break;
      
    case 'Spell':
      // Spells: evaluate based on board state
      score = 8;
      // Board buffs are better with more creatures
      if (card.name?.includes('Food') || card.name?.includes('Shower') || card.name?.includes('Milk')) {
        score += myField.length * 5;
      }
      // Heal spells are better when low HP
      if (card.name?.includes('Heal') || card.name?.includes('Swan Song')) {
        score += Math.max(0, (10 - state.myHP) * 2);
      }
      // Removal spells are better vs big threats
      if (card.name?.includes('Shotgun') || card.name?.includes('Flood')) {
        score += oppField.length * 4;
      }
      break;
      
    case 'Free Spell':
      // Free spells are good but skip if they need targets we can't provide
      score = 12;
      break;
      
    case 'Trap':
      // Can't actively play traps - they trigger from hand
      return -1;
  }
  
  return score;
}

/**
 * Pick the best card to play from hand
 */
function pickCardToPlay(hand, state) {
  let bestIdx = -1;
  let bestScore = -1;
  
  for (let i = 0; i < hand.length; i++) {
    const score = evaluateCard(hand[i], state);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  
  return bestIdx;
}

/**
 * Pick best attack target
 */
function pickAttackTarget(attacker, oppCreatures, canAttackPlayer, oppHP) {
  // If we can kill the opponent, do it
  if (canAttackPlayer && attacker.currentAtk >= oppHP) {
    return { type: 'player' };
  }
  
  // If opponent has creatures, attack the one we can kill (or weakest)
  if (oppCreatures.length > 0) {
    // Can we kill any?
    const killable = oppCreatures.filter(c => c.currentHp <= attacker.currentAtk);
    if (killable.length > 0) {
      // Kill the most valuable one (highest ATK)
      killable.sort((a, b) => (b.currentAtk || 0) - (a.currentAtk || 0));
      return { type: 'creature', target: killable[0] };
    }
    // Attack weakest to chip
    oppCreatures.sort((a, b) => (a.currentHp || 99) - (b.currentHp || 99));
    return { type: 'creature', target: oppCreatures[0] };
  }
  
  // Direct attack if nothing else
  if (canAttackPlayer) {
    return { type: 'player' };
  }
  
  return null;
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log('🃏 Smart Player — Bird vs AI\n');
  await setupGame(p, 'bird');
  log('✅ Game ready\n');
  
  for (let round = 0; round < 40; round++) {
    const state = await getState(p);
    if (!state) break;
    if (state.gameOver?.over) {
      log(`\n🏆 GAME OVER at turn ${state.turn}:`);
      log(`   Winner: ${state.gameOver.winner === 0 ? 'ME' : 'OPPONENT'}`);
      log(`   HP: me=${state.myHP} opp=${state.oppHP}`);
      break;
    }
    if (!state.myTurn || state.phase !== 'Main 1') {
      const s = await waitForMyTurn(p);
      if (s?.gameOver?.over) {
        log(`\n🏆 GAME OVER: ${JSON.stringify(s.gameOver)}`);
        break;
      }
      continue;
    }
    
    const myField = state.myField?.filter(c => c) || [];
    const oppField = state.oppField?.filter(c => c) || [];
    
    log('═══════════════════════════════════════');
    log(`  Turn ${state.turn} | HP ${state.myHP}-${state.oppHP} | Board ${myField.length}v${oppField.length}`);
    log('═══════════════════════════════════════');
    log(state.compact);
    
    // === MAIN PHASE ===
    const hand = state.hand || [];
    const cardIdx = pickCardToPlay(hand, state);
    
    if (cardIdx >= 0) {
      const card = hand[cardIdx];
      log(`▶ Play: ${card.name} (${card.type} ${card.atk || '-'}/${card.hp || '-'}) [score: ${evaluateCard(card, state)}]`);
      
      const result = await playCard(p, cardIdx);
      if (result?.success) {
        // Handle consumption
        const pending = result?.newState?.pendingContext;
        if (pending?.type === 'pending_consumption') {
          if (pending.options?.length > 0) {
            // Eat the highest nutrition target
            const sorted = [...pending.options].sort((a, b) => (b.nutrition || 0) - (a.nutrition || 0));
            log(`  🍖 Eating: ${sorted[0].name} (nut: ${sorted[0].nutrition})`);
            const eatIdx = pending.options.findIndex(o => o.instanceId === sorted[0].instanceId);
            await selectEatTargets(p, [eatIdx]);
          } else {
            log('  🍂 Dry drop');
            await dryDrop(p);
          }
        }
        log('  ✅');
      } else {
        log(`  ❌ ${result?.error}`);
      }
    } else {
      log('⏭ No good play');
    }
    
    // === COMBAT ===
    await advancePhase(p);
    await p.waitForTimeout(300);
    
    const cs = await getState(p);
    if (cs?.phase === 'Combat') {
      const creatures = cs.myField?.filter(c => c && c.canAttack) || [];
      const oppCreatures = cs.oppField?.filter(c => c) || [];
      
      for (const c of creatures) {
        const decision = pickAttackTarget(c, oppCreatures, c.canAttackPlayer, cs.oppHP);
        if (!decision) continue;
        
        if (decision.type === 'player') {
          log(`  ⚔ ${c.name}(${c.currentAtk}) → Player (${cs.oppHP}hp)`);
          const r = await attackPlayer(p, c.slot);
          log(`  ${r?.success ? '💥 Direct!' : '❌ ' + r?.error}`);
        } else {
          const t = decision.target;
          log(`  ⚔ ${c.name}(${c.currentAtk}/${c.currentHp}) → ${t.name}(${t.currentAtk}/${t.currentHp})`);
          const r = await attackCreature(p, c.slot, t.slot);
          log(`  ${r?.success ? '💥 Hit!' : '❌ ' + r?.error}`);
          // Update oppCreatures to avoid attacking dead creatures
          if (r?.success) {
            const idx = oppCreatures.findIndex(x => x.slot === t.slot);
            if (idx >= 0) oppCreatures.splice(idx, 1);
          }
        }
        await p.waitForTimeout(200);
      }
    }
    
    // === END TURN ===
    await endTurn(p);
    await p.waitForTimeout(1500);
    await waitForMyTurn(p);
  }
  
  // Final summary
  const final = await getState(p);
  log('\n═══════════════════════════════════════');
  log('  GAME SUMMARY');
  log('═══════════════════════════════════════');
  log(final?.compact || 'no state');
  
  const gameLog = await p.evaluate(() => window.__qa?.getLog(20)?.map(l => typeof l === 'string' ? l : l.message));
  log('\nLast 20 log entries:');
  gameLog?.forEach(l => log('  ' + l));
  
  await browser.close();
})();
