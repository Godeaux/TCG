const { webkit } = require('@playwright/test');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  // === FAST SETUP ===
  await p.click('#menu-other', { force: true }); await p.waitForTimeout(300);
  await p.click('#other-ai', { force: true }); await p.waitForTimeout(300);
  await p.click('#ai-deck-random', { force: true }); await p.waitForTimeout(1000);
  await p.click('.deck-select-panel--bird', { force: true }); await p.waitForTimeout(1000);
  await p.click('#deck-random', { force: true }); await p.waitForTimeout(500);
  await p.click('#deck-confirm', { force: true }); await p.waitForTimeout(2000);
  await p.click('text="Roll for Player 1"', { force: true }); await p.waitForTimeout(3000);
  
  // Wait for my turn
  for (let i = 0; i < 30; i++) {
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    const s = await p.evaluate(() => ({ phase: window.__qa?.getState()?.phase, myTurn: window.__qa?.getState()?.ui?.isMyTurn }));
    if (s.myTurn && s.phase === 'Main 1') break;
    await p.waitForTimeout(500);
  }
  
  // === GET STATE ===
  let state = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      hand: s?.players?.[0]?.hand,
      opponentField: s?.players?.[1]?.field?.filter(c => c),
    };
  });
  console.log('=== TURN START ===');
  console.log(state.compact);
  console.log('Hand:', state.hand?.map(c => `${c.name}(${c.type})`).join(', '));
  console.log('Opponent field:', state.opponentField?.map(c => `${c.name} ${c.currentAtk}/${c.currentHp} [${c.keywords}]`).join(', '));
  
  // === PLAY A PREY ===
  const preyIdx = state.hand?.findIndex(c => c.type === 'Prey');
  if (preyIdx >= 0) {
    const card = state.hand[preyIdx];
    console.log(`\n--- Playing: ${card.name} (${card.type} ${card.atk}/${card.hp}) ---`);
    const result = await p.evaluate((idx) => window.__qa?.act?.playCard(idx), preyIdx);
    console.log('Success:', result?.success, result?.error || '');
    
    // Check for pending consumption (if it was a predator)
    const pending = await p.evaluate(() => window.__qa?.getState()?.pendingContext);
    if (pending) console.log('Pending:', pending.type, pending);
  }
  
  // === CHECK COMBAT OPTIONS ===
  state = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      myField: s?.players?.[0]?.field?.filter(c => c)?.map(c => ({
        name: c.name, slot: c.slot, atk: c.currentAtk, hp: c.currentHp, 
        canAttack: c.canAttack, canAttackPlayer: c.canAttackPlayer, keywords: c.keywords
      })),
    };
  });
  console.log('\n=== AFTER PLAY ===');
  console.log(state.compact);
  console.log('My field:', state.myField);
  
  // === ADVANCE TO COMBAT ===
  console.log('\n--- Advancing to Combat ---');
  await p.evaluate(() => window.__qa?.act?.advancePhase());
  await p.waitForTimeout(500);
  
  state = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      phase: s?.phase,
      myField: s?.players?.[0]?.field?.filter(c => c)?.map(c => ({
        name: c.name, slot: c.slot, atk: c.currentAtk, hp: c.currentHp,
        canAttack: c.canAttack, canAttackPlayer: c.canAttackPlayer, keywords: c.keywords
      })),
      opponentField: s?.players?.[1]?.field?.filter(c => c)?.map(c => ({
        name: c.name, slot: c.slot, atk: c.currentAtk, hp: c.currentHp, keywords: c.keywords
      })),
    };
  });
  console.log(state.compact);
  console.log('Phase:', state.phase);
  console.log('My field:', JSON.stringify(state.myField));
  console.log('Opp field:', JSON.stringify(state.opponentField));
  
  // === ATTACK ===
  const attacker = state.myField?.find(c => c.canAttack);
  const target = state.opponentField?.[0];
  
  if (attacker && target) {
    console.log(`\n--- Attacking: ${attacker.name} (${attacker.atk}/${attacker.hp}) → ${target.name} (${target.atk}/${target.hp}) ---`);
    console.log(`Keywords: attacker=[${attacker.keywords}] defender=[${target.keywords}]`);
    
    const attackResult = await p.evaluate((aSlot, tSlot) => {
      return window.__qa?.act?.attack(aSlot, 'creature', tSlot);
    }, attacker.slot, target.slot);
    
    console.log('Attack result:', attackResult?.success, attackResult?.error || '');
    
    await p.waitForTimeout(1000);
    
    // Check aftermath
    const aftermath = await p.evaluate(() => {
      const s = window.__qa?.getState();
      return {
        compact: window.__qa?.getCompactState(),
        myField: s?.players?.[0]?.field?.map(c => c ? `${c.name} ${c.currentAtk}/${c.currentHp}` : '_'),
        oppField: s?.players?.[1]?.field?.map(c => c ? `${c.name} ${c.currentAtk}/${c.currentHp}` : '_'),
        myHP: s?.players?.[0]?.hp,
        oppHP: s?.players?.[1]?.hp,
        log: s?.recentLog?.slice(0, 8),
      };
    });
    console.log('\n=== AFTERMATH ===');
    console.log(aftermath.compact);
    console.log('My field:', aftermath.myField);
    console.log('Opp field:', aftermath.oppField);
    console.log('HP: me=' + aftermath.myHP + ' opp=' + aftermath.oppHP);
    console.log('Log:', aftermath.log?.map(l => typeof l === 'string' ? l : l.message).join('\n  '));
  } else {
    console.log('\nNo attack possible:', { attacker: !!attacker, target: !!target });
    
    // Skip combat, end turn
    console.log('Ending turn...');
    await p.evaluate(() => window.__qa?.act?.endTurn());
    await p.waitForTimeout(500);
    console.log(await p.evaluate(() => window.__qa?.getCompactState()));
  }
  
  // === END TURN ===
  console.log('\n--- Ending turn ---');
  await p.evaluate(() => window.__qa?.act?.advancePhase()); // Main 2
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__qa?.act?.endTurn()); // End turn
  await p.waitForTimeout(2000);
  
  // Dismiss pass overlay
  await p.evaluate(() => document.getElementById('pass-confirm')?.click());
  await p.waitForTimeout(500);
  
  // Wait for AI turn to complete
  for (let i = 0; i < 20; i++) {
    const s = await p.evaluate(() => ({ myTurn: window.__qa?.getState()?.ui?.isMyTurn, phase: window.__qa?.getState()?.phase }));
    if (s.myTurn) break;
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    await p.waitForTimeout(500);
  }
  
  const finalState = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      turn: s?.turn,
      phase: s?.phase,
      myHP: s?.players?.[0]?.hp,
      oppHP: s?.players?.[1]?.hp,
      gameOver: window.__qa?.isGameOver(),
    };
  });
  console.log('\n=== NEXT TURN ===');
  console.log(finalState.compact);
  console.log('Turn:', finalState.turn, '| Phase:', finalState.phase);
  console.log('HP: me=' + finalState.myHP + ' opp=' + finalState.oppHP);
  console.log('Game over:', finalState.gameOver);
  
  await browser.close();
})();
