/**
 * Smart Player v2 — Improved strategy + mechanic verification
 * 
 * Changes from v1:
 * - Better card evaluation (consider HP trading, keywords)
 * - Don't attack into bad trades (my 1/1 into their 3/3)
 * - Verify game rules after key events
 * - Track and report suspicious behavior
 */

const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState, playCard, selectEatTargets, dryDrop, attackCreature, attackPlayer, advancePhase, endTurn } = require('./gameHelpers.cjs');

function log(msg) { console.log(msg); }

const anomalies = []; // Track anything that looks wrong

function reportAnomaly(msg, details) {
  anomalies.push({ msg, details });
  log(`  ⚠️ ANOMALY: ${msg}`);
}

function evaluateCard(card, state) {
  const myField = state.myField?.filter(c => c) || [];
  const oppField = state.oppField?.filter(c => c) || [];
  const emptySlots = 3 - myField.length;
  
  if ((card.type === 'Prey' || card.type === 'Predator') && emptySlots === 0) return -1;
  if (card.type === 'Trap') return -1;
  
  let score = 0;
  
  if (card.type === 'Prey') {
    score = 10 + (card.atk || 0) * 2 + (card.hp || 0) * 2;
    if (card.effectText) score += 5;
    if (myField.length === 0) score += 25; // Urgent: need board presence
    // Higher HP prey survive trades better
    if (card.hp >= 3) score += 5;
    // Prey with keywords are valuable
    if (card.keywords?.includes('Ambush')) score += 8;
    if (card.keywords?.includes('Haste')) score += 7;
    if (card.keywords?.includes('Barrier')) score += 6;
    if (card.keywords?.includes('Immune')) score += 5;
  }
  
  if (card.type === 'Predator') {
    const preyOnField = myField.filter(c => c.type === 'Prey');
    if (preyOnField.length > 0) {
      // Great: predator + prey to eat = big creature
      const bestNut = Math.max(...preyOnField.map(c => c.nutrition || 1));
      score = 20 + (card.atk || 0) * 2 + (card.hp || 0) * 2 + bestNut * 3;
    } else {
      // Dry drop — only if we really need board or predator is big enough alone
      score = 3 + (card.atk || 0) + (card.hp || 0);
      if (emptySlots === 3 && oppField.length > 0) score += 8; // Desperate
    }
  }
  
  if (card.type === 'Spell') {
    score = 6;
    // Heal: value scales with damage taken
    const missingHP = 10 - state.myHP;
    if (missingHP > 3) score += missingHP * 2;
    // Board buffs: value with board
    if (myField.length > 0) score += myField.length * 3;
  }
  
  if (card.type === 'Free Spell') {
    // Free spells don't consume limit — always decent
    // BUT: spells with targets need selection which our harness handles via QA API
    score = 8;
  }
  
  return score;
}

function pickAttack(attacker, oppCreatures, canAttackPlayer, oppHP) {
  // Lethal check
  if (canAttackPlayer && attacker.currentAtk >= oppHP) {
    return { type: 'player', reason: 'LETHAL' };
  }
  
  if (oppCreatures.length > 0) {
    // Can we kill something without dying?
    const favorableTrades = oppCreatures.filter(c => 
      c.currentHp <= attacker.currentAtk && c.currentAtk < attacker.currentHp
    );
    if (favorableTrades.length > 0) {
      // Kill the biggest threat
      favorableTrades.sort((a, b) => (b.currentAtk || 0) - (a.currentAtk || 0));
      return { type: 'creature', target: favorableTrades[0], reason: 'favorable trade' };
    }
    
    // Can we kill something even if we die? (even trade)
    const evenTrades = oppCreatures.filter(c => c.currentHp <= attacker.currentAtk);
    if (evenTrades.length > 0) {
      // Only take even trades if opponent creature is more valuable than ours
      const bestTrade = evenTrades.sort((a, b) => (b.currentAtk || 0) - (a.currentAtk || 0))[0];
      if (bestTrade.currentAtk >= attacker.currentAtk) {
        return { type: 'creature', target: bestTrade, reason: 'even trade (worth it)' };
      }
    }
    
    // Direct attack if possible and opponent has weak creatures
    if (canAttackPlayer && attacker.currentAtk >= 3) {
      return { type: 'player', reason: 'face damage (big hitter)' };
    }
    
    // Chip at weakest
    if (oppCreatures.length > 0) {
      const weakest = oppCreatures.sort((a, b) => (a.currentHp || 99) - (b.currentHp || 99))[0];
      return { type: 'creature', target: weakest, reason: 'chip damage' };
    }
  }
  
  if (canAttackPlayer) {
    return { type: 'player', reason: 'face damage (empty board)' };
  }
  
  return null;
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log('🃏 Smart Player v2 — Bird vs AI (Amphibian)\n');
  await setupGame(p, 'reptile');
  log('✅ Game ready\n');
  
  let prevState = null;
  
  for (let round = 0; round < 40; round++) {
    let state;
    try { state = await getState(p); } catch(e) { log('\n🏆 GAME OVER (page closed)'); break; }
    if (!state) break;
    if (state.gameOver?.over) {
      const winner = state.gameOver.winner === 0 ? 'ME' : 'OPPONENT';
      log(`\n🏆 GAME OVER — ${winner} WINS at turn ${state.turn}`);
      log(`   Final HP: me=${state.myHP} opp=${state.oppHP}`);
      break;
    }
    if (!state.myTurn || state.phase !== 'Main 1') {
      let s;
      try { s = await waitForMyTurn(p); } catch(e) { log('\n🏆 GAME OVER (page closed mid-wait)'); break; }
      if (s?.gameOver?.over) {
        log(`\n🏆 GAME OVER: ${JSON.stringify(s.gameOver)}`);
        break;
      }
      continue;
    }
    
    const myField = state.myField?.filter(c => c) || [];
    const oppField = state.oppField?.filter(c => c) || [];
    
    // === VERIFY: Check for anomalies from last turn ===
    if (prevState) {
      // HP should not go above 10
      if (state.myHP > 10) reportAnomaly('My HP above 10', { hp: state.myHP });
      if (state.oppHP > 10) reportAnomaly('Opponent HP above 10', { hp: state.oppHP });
      
      // Dead creatures should have been removed
      for (const c of myField) {
        if (c.currentHp <= 0) reportAnomaly('Dead creature on my field', { name: c.name, hp: c.currentHp });
      }
      for (const c of oppField) {
        if (c.currentHp <= 0) reportAnomaly('Dead creature on opponent field', { name: c.name, hp: c.currentHp });
      }
      
      // Hand should not exceed deck + hand total from start
      if (state.hand?.length > 15) reportAnomaly('Hand too large', { size: state.hand?.length });
    }
    
    log('═══════════════════════════════════════');
    log(`  T${state.turn} | HP ${state.myHP}-${state.oppHP} | Board ${myField.length}v${oppField.length}`);
    log('═══════════════════════════════════════');
    
    const hand = state.hand || [];
    log('Hand: ' + hand.map((c, i) => {
      const s = evaluateCard(c, state);
      return `[${i}]${c.name}(${c.type[0]}${c.atk || ''}${c.atk ? '/' + c.hp : ''})=${s}`;
    }).join(' '));
    
    if (myField.length > 0) log('My board: ' + myField.map(c => `${c.name}(${c.currentAtk}/${c.currentHp})`).join(', '));
    if (oppField.length > 0) log('Opp board: ' + oppField.map(c => `${c.name}(${c.currentAtk}/${c.currentHp}[${c.keywords?.join(',')}])`).join(', '));
    
    // === MAIN PHASE ===
    const cardIdx = hand.reduce((best, card, i) => {
      const s = evaluateCard(card, state);
      return s > best.score ? { idx: i, score: s } : best;
    }, { idx: -1, score: -1 });
    
    if (cardIdx.idx >= 0 && cardIdx.score > 0) {
      const card = hand[cardIdx.idx];
      log(`\n▶ Play: ${card.name} (${card.type}) [score ${cardIdx.score}]`);
      
      const result = await playCard(p, cardIdx.idx);
      if (result?.success) {
        const pending = result?.newState?.pendingContext;
        if (pending?.type === 'pending_consumption') {
          if (pending.options?.length > 0) {
            // Eat highest nutrition
            const sorted = [...pending.options].sort((a, b) => (b.nutrition || 0) - (a.nutrition || 0));
            log(`  🍖 Eating: ${sorted[0].name} (nut ${sorted[0].nutrition})`);
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
        // If card play failed with "Wrong phase", that's potentially a bug
        if (result?.error === 'Wrong phase') {
          reportAnomaly('Card play failed with Wrong phase during Main 1', { card: card.name, phase: state.phase });
        }
      }
    }
    
    // === COMBAT ===
    await advancePhase(p);
    await p.waitForTimeout(300);
    
    const cs = await getState(p);
    if (cs?.phase === 'Combat') {
      const myCreatures = cs.myField?.filter(c => c && c.canAttack) || [];
      const oppCreatures = [...(cs.oppField?.filter(c => c) || [])];
      
      for (const c of myCreatures) {
        const decision = pickAttack(c, oppCreatures, c.canAttackPlayer, cs.oppHP);
        if (!decision) {
          log(`  ${c.name}: no good attack`);
          continue;
        }
        
        if (decision.type === 'player') {
          log(`  ⚔ ${c.name}(${c.currentAtk}) → Player [${decision.reason}]`);
          const r = await attackPlayer(p, c.slot);
          log(`  ${r?.success ? '💥 Direct!' : '❌ ' + r?.error}`);
        } else {
          const t = decision.target;
          log(`  ⚔ ${c.name}(${c.currentAtk}/${c.currentHp}) → ${t.name}(${t.currentAtk}/${t.currentHp}) [${decision.reason}]`);
          const r = await attackCreature(p, c.slot, t.slot);
          log(`  ${r?.success ? '💥' : '❌ ' + r?.error}`);
          if (r?.success) {
            const idx = oppCreatures.findIndex(x => x.slot === t.slot);
            if (idx >= 0) oppCreatures.splice(idx, 1);
          }
        }
        await p.waitForTimeout(200);
      }
    }
    
    // Save state for next-turn verification
    prevState = cs || state;
    
    // === END TURN ===
    await endTurn(p);
    try {
      await p.waitForTimeout(1500);
      const turnResult = await waitForMyTurn(p);
      if (turnResult?.gameOver?.over) {
        const winner = turnResult.gameOver.winner === 0 ? 'ME' : 'OPPONENT';
        log(`\n🏆 GAME OVER — ${winner} WINS`);
        break;
      }
    } catch (e) {
      // Page/browser may close on game-over
      log(`\n🏆 GAME OVER (page closed — likely game ended during opponent's turn)`);
      break;
    }
  }
  
  // === SUMMARY ===
  log('\n═══════════════════════════════════════');
  log('  ANOMALY REPORT');
  log('═══════════════════════════════════════');
  if (anomalies.length === 0) {
    log('  No anomalies detected ✅');
  } else {
    anomalies.forEach(a => log(`  ⚠️ ${a.msg}: ${JSON.stringify(a.details)}`));
  }
  
  await browser.close();
})();
