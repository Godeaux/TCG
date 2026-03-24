const { webkit } = require('@playwright/test');

async function setupGame(p) {
  await p.click('#menu-other', { force: true }); await p.waitForTimeout(300);
  await p.click('#other-ai', { force: true }); await p.waitForTimeout(300);
  await p.click('#ai-deck-random', { force: true }); await p.waitForTimeout(1000);
  await p.click('.deck-select-panel--bird', { force: true }); await p.waitForTimeout(1000);
  await p.click('#deck-random', { force: true }); await p.waitForTimeout(500);
  await p.click('#deck-confirm', { force: true }); await p.waitForTimeout(3000);
  
  // Roll
  await p.evaluate(() => {
    document.querySelectorAll('.setup-overlay button').forEach(b => {
      if (b.innerText.includes('Roll') && b.offsetHeight > 0) b.click();
    });
  });
  await p.waitForTimeout(3000);
  
  // Handle choice if P1 won
  await p.evaluate(() => {
    document.querySelectorAll('.setup-overlay button').forEach(b => {
      if (b.innerText.includes('Player 1 goes first') && b.offsetHeight > 0) b.click();
    });
  });
  await p.waitForTimeout(2000);
  
  // Wait for Main 1, dismiss pass overlays
  for (let i = 0; i < 30; i++) {
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    const s = await p.evaluate(() => ({ 
      phase: window.__qa?.getState()?.phase, 
      myTurn: window.__qa?.getState()?.ui?.isMyTurn 
    }));
    if (s.myTurn && s.phase === 'Main 1') return;
    await p.waitForTimeout(500);
  }
}

function log(msg) { console.log(msg); }

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  await setupGame(p);
  
  // === PLAY MULTIPLE TURNS ===
  for (let turnNum = 0; turnNum < 5; turnNum++) {
    const state = await p.evaluate(() => {
      const s = window.__qa?.getState();
      return {
        compact: window.__qa?.getCompactState(),
        phase: s?.phase, turn: s?.turn, myTurn: s?.ui?.isMyTurn,
        hand: s?.players?.[0]?.hand,
        myField: s?.players?.[0]?.field,
        oppField: s?.players?.[1]?.field,
        myHP: s?.players?.[0]?.hp, oppHP: s?.players?.[1]?.hp,
        pending: s?.pendingContext,
        gameOver: window.__qa?.isGameOver(),
      };
    });
    
    if (state.gameOver?.over) {
      log('\n🏆 GAME OVER: ' + JSON.stringify(state.gameOver));
      break;
    }
    
    log('\n════════════════════════════════════════');
    log(`  TURN ${state.turn} - ${state.phase}`);
    log('════════════════════════════════════════');
    log(state.compact);
    log('Hand: ' + state.hand?.map(c => `${c.name}(${c.type[0]})`).join(', '));
    
    if (!state.myTurn || state.phase !== 'Main 1') {
      log('Not my turn, skipping...');
      continue;
    }
    
    // === MAIN PHASE: Play a card ===
    const hand = state.hand || [];
    // Pick best card: Free Spell > Prey > Spell > Predator
    let playIdx = hand.findIndex(c => c.type === 'Free Spell');
    if (playIdx < 0) playIdx = hand.findIndex(c => c.type === 'Prey');
    if (playIdx < 0) playIdx = hand.findIndex(c => c.type === 'Spell');
    if (playIdx < 0) playIdx = hand.findIndex(c => c.type === 'Predator');
    
    if (playIdx >= 0) {
      const card = hand[playIdx];
      log(`\n▶ Playing: ${card.name} (${card.type})`);
      const result = await p.evaluate((idx) => window.__qa?.act?.playCard(idx), playIdx);
      
      if (result?.success) {
        log('  ✅ Played successfully');
        
        // Handle consumption prompt
        const pending = result?.newState?.pendingContext;
        if (pending?.type === 'pending_consumption') {
          log('  🍖 Consumption prompt: ' + pending.options?.map(o => o.name).join(', '));
          if (pending.options?.length > 0) {
            const eatResult = await p.evaluate(() => window.__qa?.act?.selectEatTargets([0]));
            log('  ✅ Ate ' + pending.options[0].name + ': ' + eatResult?.success);
          } else {
            await p.evaluate(() => window.__qa?.act?.dryDrop());
            log('  🍂 Dry dropped');
          }
        }
        
        // Handle selection prompts (spells with targets)
        if (result?.newState?.pendingContext?.type === 'pending_selection' || 
            result?.newState?.ui?.pendingSelection) {
          log('  🎯 Selection needed');
          // For now, just log it
        }
      } else {
        log('  ❌ Failed: ' + result?.error);
      }
    }
    
    // === COMBAT PHASE ===
    log('\n▶ Advancing to Combat');
    await p.evaluate(() => window.__qa?.act?.advancePhase());
    await p.waitForTimeout(300);
    
    const combatState = await p.evaluate(() => {
      const s = window.__qa?.getState();
      return {
        phase: s?.phase,
        myCreatures: s?.players?.[0]?.field?.filter(c => c)?.map(c => ({
          name: c.name, slot: c.slot, atk: c.currentAtk, hp: c.currentHp,
          canAttack: c.canAttack, canAttackPlayer: c.canAttackPlayer, keywords: c.keywords,
        })),
        oppCreatures: s?.players?.[1]?.field?.filter(c => c)?.map(c => ({
          name: c.name, slot: c.slot, atk: c.currentAtk, hp: c.currentHp, keywords: c.keywords,
        })),
      };
    });
    
    if (combatState.phase === 'Combat') {
      for (const c of (combatState.myCreatures || [])) {
        if (!c.canAttack) continue;
        
        if (combatState.oppCreatures?.length > 0) {
          const t = combatState.oppCreatures[0];
          log(`  ⚔️ ${c.name}(${c.atk}/${c.hp}) → ${t.name}(${t.atk}/${t.hp})`);
          const atkResult = await p.evaluate((a, t) => window.__qa?.act?.attack(a, 'creature', t), c.slot, t.slot);
          log('  ' + (atkResult?.success ? '💥 Hit!' : '❌ ' + atkResult?.error));
        } else if (c.canAttackPlayer) {
          log(`  ⚔️ ${c.name}(${c.atk}/${c.hp}) → Player!`);
          const atkResult = await p.evaluate((a) => window.__qa?.act?.attack(a, 'player'), c.slot);
          log('  ' + (atkResult?.success ? '💥 Direct hit!' : '❌ ' + atkResult?.error));
        }
        await p.waitForTimeout(300);
      }
    }
    
    // === END TURN ===
    log('\n▶ Ending turn');
    await p.evaluate(() => window.__qa?.act?.endTurn());
    await p.waitForTimeout(2000);
    
    // Wait for AI turn + my turn to come back
    for (let i = 0; i < 30; i++) {
      await p.evaluate(() => document.getElementById('pass-confirm')?.click());
      const s = await p.evaluate(() => ({
        phase: window.__qa?.getState()?.phase,
        myTurn: window.__qa?.getState()?.ui?.isMyTurn,
        gameOver: window.__qa?.isGameOver(),
      }));
      if (s.gameOver?.over) break;
      if (s.myTurn && s.phase === 'Main 1') break;
      await p.waitForTimeout(500);
    }
  }
  
  // === FINAL STATE ===
  const final = await p.evaluate(() => ({
    compact: window.__qa?.getCompactState(),
    gameOver: window.__qa?.isGameOver(),
    log: window.__qa?.getLog(20)?.map(l => typeof l === 'string' ? l : l.message),
  }));
  log('\n════════════════════════════════════════');
  log('  FINAL STATE');
  log('════════════════════════════════════════');
  log(final.compact);
  log('Game over: ' + JSON.stringify(final.gameOver));
  log('\nGame log:');
  final.log?.forEach(l => log('  ' + l));
  
  await browser.close();
})();
