const { webkit } = require('@playwright/test');
const { setupGame, waitForMyTurn, getState, advancePhase, endTurn } = require('./gameHelpers.cjs');
const { dragCardToField, dragAttack, dragAttackPlayer, scanUI } = require('./domInteraction.cjs');

function log(msg) { console.log(msg); }

(async () => {
  const browser = await webkit.launch({ headless: true });
  const p = await browser.newPage();
  await p.goto('http://localhost:3000');
  await p.waitForTimeout(2000);
  
  log('🧪 Testing HTML5 drag-and-drop card play\n');
  await setupGame(p, 'bird');
  log('✅ Game ready\n');
  
  // Get initial state
  let state = await getState(p);
  log(`T${state.turn} | HP ${state.myHP}-${state.oppHP}`);
  log('Hand: ' + state.hand?.map((c, i) => `[${i}]${c.name}(${c.type[0]})`).join(' '));
  
  // Find a prey card
  const preyIdx = state.hand?.findIndex(c => c.type === 'Prey');
  if (preyIdx >= 0) {
    log(`\n▶ Dragging ${state.hand[preyIdx].name} (index ${preyIdx}) to field slot 0...`);
    const result = await dragCardToField(p, preyIdx, 0);
    log(`Drag result: ${JSON.stringify(result)}`);
    
    await p.waitForTimeout(1000);
    
    // Check for UI modals (consumption, selection, etc.)
    const ui = await scanUI(p);
    if (ui.length > 0) {
      log('UI modals appeared:');
      ui.forEach(u => log('  ' + JSON.stringify(u)));
    }
    
    // Verify state changed
    const after = await getState(p);
    const fieldBefore = state.myField?.filter(c => c).length || 0;
    const fieldAfter = after?.myField?.filter(c => c).length || 0;
    const handBefore = state.hand?.length || 0;
    const handAfter = after?.hand?.length || 0;
    
    log(`\nField: ${fieldBefore} → ${fieldAfter}`);
    log(`Hand: ${handBefore} → ${handAfter}`);
    
    if (fieldAfter > fieldBefore) {
      log('✅ Card placed on field!');
      const placed = after.myField.find(c => c && c.name === state.hand[preyIdx].name);
      if (placed) log(`  ${placed.name} (${placed.currentAtk}/${placed.currentHp}) [${placed.keywords?.join(',')}]`);
    } else {
      log('❌ Card NOT placed — investigating...');
      log('Compact:', after?.compact);
    }
    
    // Advance to combat
    if (fieldAfter > 0) {
      log('\n▶ Advancing to Combat...');
      // Use QA API for phase advance (phase buttons are fine)
      await p.evaluate(() => window.__qa?.act?.advancePhase());
      await p.waitForTimeout(500);
      
      state = await getState(p);
      log(`Phase: ${state.phase}`);
      
      if (state.phase === 'Combat') {
        const attackers = state.myField?.filter(c => c && c.canAttack) || [];
        const targets = state.oppField?.filter(c => c) || [];
        
        if (attackers.length > 0 && targets.length > 0) {
          const a = attackers[0];
          const t = targets[0];
          log(`\n▶ Dragging attack: ${a.name} → ${t.name}`);
          const atkResult = await dragAttack(p, a.slot, t.slot);
          log(`Attack drag result: ${JSON.stringify(atkResult)}`);
          
          await p.waitForTimeout(1000);
          
          const afterAtk = await getState(p);
          log(`After attack: ${afterAtk?.compact}`);
        } else if (attackers.length > 0 && attackers[0].canAttackPlayer) {
          const a = attackers[0];
          log(`\n▶ Dragging direct attack: ${a.name} → Player`);
          const atkResult = await dragAttackPlayer(p, a.slot);
          log(`Attack drag result: ${JSON.stringify(atkResult)}`);
          
          await p.waitForTimeout(1000);
          
          const afterAtk = await getState(p);
          log(`After attack: ${afterAtk?.compact}`);
        } else {
          log('No valid attacks (summoning sickness or no targets)');
        }
      }
    }
  } else {
    log('No prey in hand — trying predator...');
  }
  
  await browser.close();
})();
