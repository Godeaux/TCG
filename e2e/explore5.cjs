const { webkit } = require('@playwright/test');

// Robust helper to get through setup
async function completeSetup(p) {
  // Wait for setup overlay to be active
  await p.waitForTimeout(1000);
  
  // Check if we need to roll
  let setup = await p.evaluate(() => window.__qa?.act?.menu?.getMenuState()?.setup);
  console.log('Setup state:', setup);
  
  // If P1 hasn't rolled, click Roll button
  if (setup?.rolls?.[0] === null) {
    // Find roll button by scanning for it
    const rolled = await p.evaluate(() => {
      const buttons = document.querySelectorAll('.setup-overlay button');
      for (const btn of buttons) {
        if (btn.innerText.includes('Roll') && btn.offsetHeight > 0) {
          btn.click();
          return btn.innerText.trim();
        }
      }
      return null;
    });
    console.log('Clicked roll:', rolled);
    await p.waitForTimeout(2000);
  }
  
  // Check setup again
  setup = await p.evaluate(() => window.__qa?.act?.menu?.getMenuState()?.setup);
  console.log('After roll:', setup);
  
  // If there's a choice to make (who goes first)
  if (setup?.stage === 'choice') {
    const chosen = await p.evaluate(() => {
      const buttons = document.querySelectorAll('.setup-overlay button');
      for (const btn of buttons) {
        if (btn.innerText.includes('goes first') && btn.offsetHeight > 0) {
          btn.click();
          return btn.innerText.trim();
        }
      }
      return null;
    });
    console.log('Chose:', chosen);
    await p.waitForTimeout(2000);
  }
  
  // Wait for setup to complete
  for (let i = 0; i < 20; i++) {
    setup = await p.evaluate(() => window.__qa?.act?.menu?.getMenuState()?.setup);
    const phase = await p.evaluate(() => window.__qa?.getState()?.phase);
    if (setup?.stage === 'complete' || phase === 'Main 1' || phase === 'Main1') {
      console.log('Setup complete! Phase:', phase);
      break;
    }
    // Dismiss pass overlays
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    await p.waitForTimeout(500);
  }
}

// Wait for player's turn at Main 1
async function waitForMyTurn(p, maxWait = 20) {
  for (let i = 0; i < maxWait; i++) {
    const s = await p.evaluate(() => {
      const st = window.__qa?.getState();
      return { phase: st?.phase, myTurn: st?.ui?.isMyTurn, turn: st?.turn };
    });
    if (s.myTurn && (s.phase === 'Main 1' || s.phase === 'Main1')) {
      return s;
    }
    // Dismiss any pass overlays
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    await p.waitForTimeout(500);
  }
  throw new Error('Timeout waiting for my turn');
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  // === SETUP ===
  await p.click('#menu-other', { force: true }); await p.waitForTimeout(300);
  await p.click('#other-ai', { force: true }); await p.waitForTimeout(300);
  await p.click('#ai-deck-random', { force: true }); await p.waitForTimeout(1000);
  await p.click('.deck-select-panel--bird', { force: true }); await p.waitForTimeout(1000);
  await p.click('#deck-random', { force: true }); await p.waitForTimeout(500);
  await p.click('#deck-confirm', { force: true }); await p.waitForTimeout(2000);
  
  await completeSetup(p);
  const turnState = await waitForMyTurn(p);
  
  console.log('\n========================================');
  console.log('  GAME READY - Turn', turnState.turn);
  console.log('========================================\n');
  
  // === PLAY A FULL TURN ===
  let state = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      hand: s?.players?.[0]?.hand,
      myField: s?.players?.[0]?.field,
      oppField: s?.players?.[1]?.field,
      myHP: s?.players?.[0]?.hp,
      oppHP: s?.players?.[1]?.hp,
    };
  });
  console.log(state.compact);
  console.log('\nMy hand:');
  state.hand?.forEach((c, i) => {
    const stats = c.atk ? ` ${c.atk}/${c.hp}` : '';
    const kw = c.keywords?.length ? ` [${c.keywords.join(', ')}]` : '';
    console.log(`  [${i}] ${c.name} (${c.type})${stats}${kw}`);
  });
  console.log('My field:', state.myField?.map(c => c ? `${c.name} ${c.currentAtk}/${c.currentHp}` : '_').join(' | '));
  console.log('Opp field:', state.oppField?.map(c => c ? `${c.name} ${c.currentAtk}/${c.currentHp}` : '_').join(' | '));
  console.log('HP: me=' + state.myHP + ' opp=' + state.oppHP);
  
  // === PLAY: Pick best card from hand ===
  // Priority: Free Spell (free card) > Prey with effects > Prey > Predator (need prey first)
  const hand = state.hand || [];
  let cardToPlay = hand.findIndex(c => c.type === 'Free Spell');
  if (cardToPlay < 0) cardToPlay = hand.findIndex(c => c.type === 'Prey');
  if (cardToPlay < 0) cardToPlay = hand.findIndex(c => c.type === 'Spell');
  if (cardToPlay < 0) cardToPlay = 0;
  
  const chosen = hand[cardToPlay];
  console.log(`\n>>> Playing: ${chosen.name} (${chosen.type}) at index ${cardToPlay}`);
  
  const playResult = await p.evaluate((idx) => window.__qa?.act?.playCard(idx), cardToPlay);
  console.log('Result:', playResult?.success ? 'SUCCESS' : 'FAILED - ' + playResult?.error);
  
  // Handle pending consumption if predator
  if (playResult?.newState?.pendingContext?.type === 'pending_consumption') {
    const ctx = playResult.newState.pendingContext;
    console.log('\n>>> Consumption prompt! Options:', ctx.options.map(o => o.name).join(', '));
    if (ctx.options.length > 0) {
      console.log('>>> Eating:', ctx.options[0].name);
      const eatResult = await p.evaluate(() => window.__qa?.act?.selectEatTargets([0]));
      console.log('Eat result:', eatResult?.success);
    } else if (ctx.canDryDrop) {
      console.log('>>> Dry dropping');
      const dropResult = await p.evaluate(() => window.__qa?.act?.dryDrop());
      console.log('Dry drop result:', dropResult?.success);
    }
  }
  
  // Check state after play
  state = await p.evaluate(() => ({
    compact: window.__qa?.getCompactState(),
    phase: window.__qa?.getState()?.phase,
    myField: window.__qa?.getState()?.players?.[0]?.field?.map(c => c ? `${c.name} ${c.currentAtk}/${c.currentHp} [${c.keywords}]` : '_'),
  }));
  console.log('\nAfter play:', state.compact);
  console.log('Field:', state.myField?.join(' | '));
  
  // === ADVANCE TO COMBAT ===
  console.log('\n>>> Advancing to Combat');
  await p.evaluate(() => window.__qa?.act?.advancePhase());
  await p.waitForTimeout(500);
  
  state = await p.evaluate(() => {
    const s = window.__qa?.getState();
    return {
      compact: window.__qa?.getCompactState(),
      phase: s?.phase,
      myCreatures: s?.players?.[0]?.field?.filter(c => c)?.map(c => ({
        name: c.name, slot: c.slot, atk: c.currentAtk, hp: c.currentHp,
        canAttack: c.canAttack, canAttackPlayer: c.canAttackPlayer,
      })),
      oppCreatures: s?.players?.[1]?.field?.filter(c => c)?.map(c => ({
        name: c.name, slot: c.slot, atk: c.currentAtk, hp: c.currentHp,
      })),
    };
  });
  console.log(state.compact);
  
  // Attack with each creature that can
  for (const creature of (state.myCreatures || [])) {
    if (!creature.canAttack) {
      console.log(`  ${creature.name}: can't attack (summoning sickness?)`);
      continue;
    }
    
    if (state.oppCreatures?.length > 0 && !creature.canAttackPlayer) {
      // Must attack a creature
      const target = state.oppCreatures[0];
      console.log(`\n>>> Attack: ${creature.name} (${creature.atk}/${creature.hp}) → ${target.name} (${target.atk}/${target.hp})`);
      const result = await p.evaluate((a, t) => window.__qa?.act?.attack(a, 'creature', t), creature.slot, target.slot);
      console.log('Result:', result?.success ? 'HIT' : 'FAILED - ' + result?.error);
    } else if (creature.canAttackPlayer) {
      console.log(`\n>>> Direct attack: ${creature.name} (${creature.atk}/${creature.hp}) → Player`);
      const result = await p.evaluate((a) => window.__qa?.act?.attack(a, 'player'), creature.slot);
      console.log('Result:', result?.success ? 'HIT' : 'FAILED - ' + result?.error);
    }
    await p.waitForTimeout(500);
  }
  
  // === END TURN ===
  console.log('\n>>> Ending turn');
  await p.evaluate(() => window.__qa?.act?.endTurn());
  await p.waitForTimeout(2000);
  
  // Dismiss pass, wait for next turn
  for (let i = 0; i < 10; i++) {
    await p.evaluate(() => document.getElementById('pass-confirm')?.click());
    await p.waitForTimeout(500);
  }
  
  const finalState = await p.evaluate(() => ({
    compact: window.__qa?.getCompactState(),
    gameOver: window.__qa?.isGameOver(),
    log: window.__qa?.getLog(15)?.map(l => typeof l === 'string' ? l : l.message),
  }));
  
  console.log('\n========================================');
  console.log('  TURN COMPLETE');
  console.log('========================================');
  console.log(finalState.compact);
  console.log('Game over:', finalState.gameOver);
  console.log('\nGame log:');
  finalState.log?.forEach(l => console.log('  ', l));
  
  await browser.close();
})();
