/**
 * PvP Game Orchestrator — Two LLM players, two browsers, full multiplayer
 * 
 * Architecture:
 * - Two Playwright browser contexts connected via Supabase lobby
 * - Each player has an independent LLM brain (Qwen3 Coder)
 * - All actions via DOM drag-and-drop (real player simulation)
 * - State verification via __qa API only
 * - Full game log with reasoning for each decision
 */

const { webkit, chromium } = require('@playwright/test');
const { getDecision } = require('./llmBrain.cjs');
const { executeAction, dismissPassOverlay } = require('./actionExecutor.cjs');
const { createRecording } = require('./gameRecorder.cjs');

const GAME_URL = 'http://localhost:3000';

const _t0 = Date.now();
function log(msg) { console.log(msg); }
function logP(player, msg) { console.log(`  [P${player + 1}] ${msg}`); }
function dbg(msg) { console.log(`  ⏱ ${((Date.now()-_t0)/1000).toFixed(1)}s ${msg}`); }

// ============================================================================
// PLAYER SETUP
// ============================================================================

async function createPlayer(browser, index, deckName) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  
  // Error listeners — catch crashes immediately
  page.on('crash', () => log(`💥 P${index + 1} PAGE CRASHED`));
  page.on('pageerror', (err) => log(`🔴 P${index + 1} JS ERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') log(`🟡 P${index + 1} console.error: ${msg.text().substring(0, 100)}`);
  });
  
  await page.goto(GAME_URL);
  await page.waitForTimeout(1000);
  
  return {
    index,
    deckName,
    page,
    context,
    
    async getState() {
      return page.evaluate(() => window.__qa?.getState());
    },
    
    async getCompact() {
      return page.evaluate(() => window.__qa?.getCompactState());
    },
    
    async isMyTurn() {
      return page.evaluate(() => window.__qa?.getState()?.ui?.isMyTurn);
    },
    
    async getPhase() {
      return page.evaluate(() => window.__qa?.getState()?.phase);
    },
    
    async isGameOver() {
      return page.evaluate(() => window.__qa?.isGameOver());
    },
  };
}

// ============================================================================
// LOBBY SETUP (Supabase multiplayer)
// ============================================================================

async function loginPlayer(page, username, pin) {
  await page.click('#menu-other', { force: true }); await page.waitForTimeout(300);
  await page.click('#other-multiplayer', { force: true }); await page.waitForTimeout(300);
  await page.click('#multiplayer-auth', { force: true }); await page.waitForTimeout(1000);
  await page.fill('#login-username', username);
  await page.fill('#login-pin', pin);
  try { await page.click('#login-create'); } catch { await page.click('#login-submit'); }
  await page.waitForTimeout(1000);
}

async function createLobby(page) {
  await page.click('#menu-other', { force: true }); await page.waitForTimeout(300);
  await page.click('#other-multiplayer', { force: true }); await page.waitForTimeout(300);
  await page.click('#lobby-create', { force: true }); await page.waitForTimeout(1500);
  return page.evaluate(() => window.__qa?.act?.menu?.getMenuState()?.lobby?.code);
}

async function joinLobby(page, code) {
  await page.click('#menu-other', { force: true }); await page.waitForTimeout(300);
  await page.click('#other-multiplayer', { force: true }); await page.waitForTimeout(300);
  await page.click('#lobby-join', { force: true }); await page.waitForTimeout(1000);
  // Fill code and submit the join form
  await page.evaluate(({lobbyCode}) => {
    const input = document.getElementById('lobby-code');
    if (input) { input.value = lobbyCode; input.dispatchEvent(new Event('input', {bubbles: true})); }
    // Click the submit button (more reliable than form.submit event)
    const form = document.getElementById('lobby-join-form');
    const btn = form?.querySelector('button[type="submit"]');
    if (btn) btn.click();
  }, {lobbyCode: code});
  await page.waitForTimeout(5000);
}

async function continueTaGame(page) {
  // Wait for Continue button to become visible (means both players are in lobby)
  for (let i = 0; i < 20; i++) {
    const visible = await page.evaluate(() => {
      const btn = document.getElementById('lobby-continue');
      return btn && btn.offsetHeight > 0;
    });
    if (visible) {
      await page.click('#lobby-continue');
      dbg('continueTaGame: clicked');
      await page.waitForTimeout(1000);
      return;
    }
    await page.waitForTimeout(500);
  }
  dbg('continueTaGame: button never became visible — lobby join may have failed');
}

// ============================================================================
// DECK SELECTION (multiplayer — each player picks independently)
// ============================================================================

async function selectDeck(page, deckName) {
  // Wait for deck selection overlay
  for (let i = 0; i < 10; i++) {
    const active = await page.evaluate(() => document.querySelector('.deck-select-overlay.active') !== null);
    if (active) break;
    await page.waitForTimeout(500);
  }
  
  // Step 1: Click 'Create a deck (Not saved)' (multiplayer mode)
  await page.evaluate(() => {
    document.querySelectorAll('#deck-select-grid button').forEach(b => {
      if (b.innerText.includes('Create a deck') && b.offsetHeight > 0) b.click();
    });
  });
  await page.waitForTimeout(1000);
  
  // Step 2: Click deck category panel
  await page.evaluate(({name}) => {
    document.querySelectorAll('.deck-select-panel--' + name).forEach(p => {
      if (p.offsetHeight > 0) p.click();
    });
  }, {name: deckName});
  await page.waitForTimeout(1000);
  
  // Step 3: Click 'CONFIRM DECK & READY UP' (dynamically created in grid)
  await page.evaluate(() => {
    const grid = document.getElementById('deck-select-grid');
    (grid?.querySelectorAll('button') || []).forEach(b => {
      if (b.innerText.includes('CONFIRM') && b.offsetHeight > 0) b.click();
    });
  });
  await page.waitForTimeout(1000);
  
  // AI mode fallback: RANDOM + static CONFIRM
  const needsRandom = await page.evaluate(() => document.getElementById('deck-random')?.offsetHeight > 0);
  if (needsRandom) {
    await page.evaluate(() => document.getElementById('deck-random')?.click());
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('deck-confirm')?.click());
    await page.waitForTimeout(1000);
  }
}

// ============================================================================
// SETUP FLOW (roll + choice)
// ============================================================================

async function completeSetup(page) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const setup = await page.evaluate(() => window.__qa?.act?.menu?.getMenuState()?.setup);
    const phase = await page.evaluate(() => window.__qa?.getState()?.phase);
    
    if (setup?.stage === 'complete' || (phase && phase !== 'Setup')) return;
    
    // Click roll buttons
    await page.evaluate(() => {
      document.querySelectorAll('.setup-overlay button').forEach(b => {
        if (b.innerText.includes('Roll') && b.offsetHeight > 0) b.click();
      });
    });
    await page.waitForTimeout(1500);
    
    // Click "goes first" buttons
    await page.evaluate(() => {
      document.querySelectorAll('.setup-overlay button').forEach(b => {
        if (b.innerText.includes('goes first') && b.offsetHeight > 0) b.click();
      });
    });
    await page.waitForTimeout(1000);
    
    await dismissPassOverlay(page);
  }
}

// ============================================================================
// MAIN GAME LOOP
// ============================================================================

async function waitForPlayerTurn(player, maxWait = 30) {
  for (let i = 0; i < maxWait; i++) {
    await dismissPassOverlay(player.page);
    const myTurn = await player.isMyTurn();
    const phase = await player.getPhase();
    const gameOver = await player.isGameOver();
    if (gameOver?.over) return { gameOver };
    // Handle Start phase (beginning of turn, before draw) — advance to Main 1
    if (myTurn && (phase === 'Start' || phase === 'Setup' || phase === 'Draw')) {
      // Auto-advance through non-interactive phases
      await player.page.evaluate(() => document.getElementById('field-turn-btn')?.click());
      await player.page.waitForTimeout(300);
      await player.page.evaluate(() => window.__qa?.act?.advancePhase());
      await player.page.waitForTimeout(500);
      continue; // Re-check phase
    }
    // Only accept Main 1 as valid turn start. If we're at Combat/Main 2, advance past them.
    if (myTurn && phase === 'Main 1') return { ready: true, phase };
    if (myTurn && (phase === 'Combat' || phase === 'Main 2' || phase === 'End')) {
      // We're mid-turn in the wrong phase — advance to end this turn
      await player.page.evaluate(() => window.__qa?.act?.advancePhase());
      await player.page.waitForTimeout(500);
      continue; // Re-check
    }
    if (i === 0) {
      const activeIdx = await player.page.evaluate(() => window.__qa?.getState()?.activePlayer);
      dbg(`P${player.index+1} waiting: myTurn=${myTurn} phase=${phase} activePlayer=${activeIdx}`);
    }
    await player.page.waitForTimeout(500);
  }
  dbg(`P${player.index+1} wait TIMEOUT after ${maxWait} checks`);
  return { timeout: true };
}

const path = require('path');
const { createCanvas, loadImage } = (() => { try { return require('canvas'); } catch { return {}; } })();
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function screenshotBoth(p1Page, p2Page, label) {
  const fs = require('fs');
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const ts = Date.now();
  const p1Path = path.join(SCREENSHOT_DIR, `_tmp_p1_${ts}.png`);
  const p2Path = path.join(SCREENSHOT_DIR, `_tmp_p2_${ts}.png`);
  const combinedPath = path.join(SCREENSHOT_DIR, `${label}_${ts}.png`);
  
  await Promise.all([
    p1Page.screenshot({ path: p1Path, fullPage: false }),
    p2Page.screenshot({ path: p2Path, fullPage: false }),
  ]);
  
  // Combine side by side using canvas (if available) or just keep separate
  if (createCanvas && loadImage) {
    try {
      const [img1, img2] = await Promise.all([loadImage(p1Path), loadImage(p2Path)]);
      const gap = 6;
      const canvas = createCanvas(img1.width + gap + img2.width, Math.max(img1.height, img2.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img1, 0, 0);
      ctx.drawImage(img2, img1.width + gap, 0);
      // Add labels with background for readability
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(0, 0, 220, 40);
      ctx.fillRect(img1.width + gap, 0, 220, 40);
      ctx.fillStyle = '#00ff00'; ctx.fillText('P1 (HOST) ←', 10, 30);
      ctx.fillStyle = '#ffff00'; ctx.fillText('P2 (GUEST) →', img1.width + gap + 10, 30);
      fs.writeFileSync(combinedPath, canvas.toBuffer('image/png'));
      fs.unlinkSync(p1Path); fs.unlinkSync(p2Path);
      dbg(`📸 ${combinedPath}`);
    } catch (e) {
      dbg(`📸 Separate: ${p1Path} + ${p2Path} (canvas error: ${e.message})`);
    }
  } else {
    // No canvas — just keep both files
    fs.renameSync(p1Path, path.join(SCREENSHOT_DIR, `${label}_P1_${ts}.png`));
    fs.renameSync(p2Path, path.join(SCREENSHOT_DIR, `${label}_P2_${ts}.png`));
    dbg(`📸 ${label}_P1/P2_${ts}.png (no canvas for combining)`);
  }
}

/**
 * Pre-validate a Main phase action before executing
 */
function validateMainAction(action, state) {
  if (!action || action.type === 'unknown' || action.type === 'advance' || action.type === 'endTurn' || action.type === 'pass') {
    return { valid: true }; // These are handled separately
  }
  
  if (action.type === 'attack') {
    return { valid: false, fatal: true, reason: 'Cannot ATTACK during Main phase. Attacks happen in Combat phase.', suggestion: 'PLAY a card or PASS.' };
  }
  
  if (action.type === 'play') {
    const hand = state.players?.[0]?.hand || [];
    const field = state.players?.[0]?.field || [];
    const handIndex = action.handIndex;
    
    // Check card limit (1 card per turn, Free Spells don't consume but need available)
    if (state.ui?.cardPlayedThisTurn) {
      const card = hand[handIndex];
      const isFree = card?.type === 'Free Spell' || card?.keywords?.includes('Free Play');
      if (!isFree) {
        return { valid: false, reason: 'Card limit already used this turn. You already played a card.', suggestion: 'PASS or play a Free Spell if you have one.' };
      }
    }
    
    // Check hand index
    if (handIndex === undefined || handIndex < 0 || handIndex >= hand.length) {
      return { valid: false, reason: `Hand index ${handIndex} is out of range. You have ${hand.length} cards (indices 0-${hand.length - 1}).`, suggestion: `PLAY 0 through PLAY ${hand.length - 1}, or PASS.` };
    }
    
    const card = hand[handIndex];
    
    // Check EAT targets for predators
    if (action.eat && action.eat.length > 0) {
      const fieldCreatures = field.map((c, i) => c ? { name: c.name, slot: i, type: c.type } : null).filter(Boolean);
      const invalidEats = [];
      const validSlots = [];
      
      for (const eatSlot of action.eat) {
        const creature = field[eatSlot];
        if (!creature) {
          invalidEats.push(eatSlot);
        }
      }
      
      if (invalidEats.length > 0) {
        const availablePrey = fieldCreatures.filter(c => c.type === 'Prey');
        const suggestion = availablePrey.length > 0 
          ? `Available prey to eat: ${availablePrey.map(p => `slot ${p.slot} (${p.name})`).join(', ')}. Use: PLAY ${handIndex} EAT ${availablePrey.map(p => p.slot).join(',')}`
          : `No prey on your field to eat. Use: PLAY ${handIndex} DRY_DROP (loses keywords) or play a different card.`;
        return { valid: false, reason: `No creature at slot(s) ${invalidEats.join(', ')} to eat.`, suggestion };
      }
    }
    
    // Check field full for creatures
    if ((card.type === 'Prey' || card.type === 'Predator') && !action.eat?.length && !action.dryDrop) {
      const emptySlots = field.filter(c => !c).length;
      if (emptySlots === 0 && card.type === 'Prey') {
        return { valid: false, reason: 'Field is full (3/3 slots). Cannot play creatures.', suggestion: 'PASS, or play a spell from hand.' };
      }
    }
  }
  
  return { valid: true };
}

async function playTurn(player, turnNum, model, recorder, otherPlayer) {
  const stateBefore = await player.getState();
  if (!stateBefore) return { error: 'No state' };
  
  // Quick state fingerprint for polling state changes
  const quickSnap = (s) => s ? `${s.players?.[0]?.hp}-${s.players?.[0]?.hand?.length ?? s.players?.[0]?.handSize}-${s.players?.[0]?.field?.filter(c=>c).length}-${s.players?.[1]?.hp}-${s.players?.[1]?.field?.filter(c=>c).length}` : '';
  
  const actions = [];
  let stepNum = 0;
  const shot = async (label) => {
    if (!otherPlayer) return;
    stepNum++;
    // Always P1 (index 0) on left, P2 (index 1) on right — consistent layout
    const p1Page = player.index === 0 ? player.page : otherPlayer.page;
    const p2Page = player.index === 0 ? otherPlayer.page : player.page;
    await screenshotBoth(p1Page, p2Page, `T${turnNum}_P${player.index+1}_${String(stepNum).padStart(2,'0')}_${label}`);
  };
  
  // === MAIN PHASE ===
  if (stateBefore.phase === 'Main 1') {
    await shot('main_BEFORE');
    let decision = await getDecision(stateBefore, 0, player.deckName, { model });
    const retryTag = decision.retried ? ' [RETRY]' : '';
    logP(player.index, `Think (${decision.timeMs}ms)${retryTag}: ${decision.rawResponse?.substring(0, 120) || decision.reasoning?.substring(0, 120)}`);
    logP(player.index, `Action: ${JSON.stringify(decision.action)}`);
    
    // Pre-validate and retry loop (up to 2 retries with corrective context)
    let validAction = decision.action;
    for (let retryAttempt = 0; retryAttempt < 2; retryAttempt++) {
      const validation = validateMainAction(validAction, stateBefore);
      if (validation.valid) break;
      
      // Invalid action — ask LLM again with corrective feedback
      logP(player.index, `⚠️ Invalid: ${validation.reason}`);
      const correctionPrompt = `Your action was invalid: ${validation.reason}\n\nValid options: ${validation.suggestion}\n\nTry again. Reply with ONLY the action command.`;
      
      const { getDecision: getRetry } = require('./llmBrain.cjs');
      const retryDecision = await getRetry(stateBefore, 0, player.deckName, { model, systemOverride: correctionPrompt });
      logP(player.index, `Retry ${retryAttempt + 1}: ${JSON.stringify(retryDecision.action)}`);
      validAction = retryDecision.action;
      decision = retryDecision;
    }
    
    // Final validation
    const finalValidation = validateMainAction(validAction, stateBefore);
    
    if (validAction.type === 'attack' || (finalValidation && !finalValidation.valid && finalValidation.fatal)) {
      logP(player.index, '⚠️ Action invalid after retries — passing');
      if (recorder) recorder.recordAction(turnNum, player.index, 'Main 1', `invalid_action ${JSON.stringify(validAction)}`, decision.rawResponse, stateBefore, stateBefore);
    } else if (validAction.type === 'unknown') {
      logP(player.index, '⚠️ Parse failed — passing');
      if (recorder) recorder.recordAction(turnNum, player.index, 'Main 1', `parse_fail`, decision.rawResponse, stateBefore, stateBefore);
    } else if (validAction.type === 'advance' || validAction.type === 'endTurn' || validAction.type === 'pass') {
      if (recorder) recorder.recordAction(turnNum, player.index, 'Main 1', `skip`, decision.rawResponse, stateBefore, stateBefore);
    } else {
      const result = await executeAction(player.page, validAction, stateBefore);
      logP(player.index, `Result: ${result.description} — ${result.success ? '✅' : '❌ ' + result.error}`);
      actions.push({ decision, result });
      
      await shot('main_AFTER');
      
      // Poll until state changes (max 2s — Supabase sync)
      let stateAfter = null;
      const beforeSnap = quickSnap(stateBefore);
      for (let wait = 0; wait < 4; wait++) {
        await player.page.waitForTimeout(500);
        stateAfter = await player.getState();
        if (quickSnap(stateAfter) !== beforeSnap) break;
      }
      if (recorder) {
        const { entry, suspicious } = recorder.recordAction(
          turnNum, player.index, 'Main 1',
          `${decision.action.type} ${JSON.stringify(decision.action)}`,
          decision.rawResponse, stateBefore, stateAfter
        );
        if (!entry.diff || entry.diff.length === 0) {
          logP(player.index, '⚠️ Action had NO EFFECT — game likely rejected it');
        }
        if (suspicious?.length > 0) {
          logP(player.index, `🚨 SUSPICIOUS: ${suspicious.join(', ')}`);
        }
      }
    }
  }
  
  // === ADVANCE TO COMBAT ===
  const preAdvPhase = await player.page.evaluate(() => window.__qa?.getState()?.phase);
  dbg(`P${player.index+1} advance: ${preAdvPhase} → Combat (DOM click)`);
  await player.page.evaluate(() => document.getElementById('field-turn-btn')?.click());
  await player.page.waitForTimeout(800);
  let combatState = await player.getState();
  dbg(`P${player.index+1} now in: ${combatState?.phase}`);
  await shot(`phase_${combatState?.phase?.replace(/\s/g,'') || 'unknown'}`);
  
  // === COMBAT PHASE ===
  if (combatState?.phase === 'Combat') {
    const attackedSlots = new Set(); // Track which slots already attacked this turn
    
    // Attack up to 3 times (max creatures), refreshing state each time
    for (let attackNum = 0; attackNum < 3; attackNum++) {
      combatState = await player.getState(); // FRESH state each attack
      const allField = combatState.players?.[0]?.field || [];
      const fieldDebug = allField.map(c => c ? `${c.name}:s${c.slot},atk=${c.canAttack},atkP=${c.canAttackPlayer}` : '_');
      const attackers = allField.filter(c => c && c.canAttack && !attackedSlots.has(c.slot));
      dbg(`P${player.index+1} combat#${attackNum}: field=[${fieldDebug}] attackedSlots=[${[...attackedSlots]}] eligible=${attackers.length}`);
      if (attackers.length === 0) break;
      
      const atkDecision = await getDecision(combatState, 0, player.deckName, { model });
      logP(player.index, `Combat (${atkDecision.timeMs}ms): ${atkDecision.rawResponse?.substring(0, 100)}`);
      
      // Re-verify phase after LLM think time (host may have synced a phase change)
      const freshPhase = await player.page.evaluate(() => window.__qa?.getState()?.phase);
      if (freshPhase !== 'Combat') {
        logP(player.index, `⚠️ Phase changed during LLM think: ${freshPhase} (was Combat) — aborting combat`);
        break;
      }
      
      // ONLY accept ATTACK actions during combat — reject anything else
      if (atkDecision.action.type === 'attack') {
        // Verify the chosen slot is actually eligible for the chosen target
        const chosenSlot = atkDecision.action.attackerSlot;
        const chosenTarget = atkDecision.action.target;
        const isEligible = attackers.some(c => c.slot === chosenSlot && (chosenTarget !== 'player' || c.canAttackPlayer));
        if (!isEligible) {
          logP(player.index, `⚠️ LLM chose slot ${chosenSlot} but it's not eligible — skipping`);
          attackedSlots.add(chosenSlot); // Prevent retry
          if (recorder) recorder.recordAction(turnNum, player.index, 'Combat', `invalid_slot ${chosenSlot}`, atkDecision.rawResponse, combatState, combatState);
          continue;
        }
        const combatBefore = await player.getState();
        
        // A1 DEBUG: snapshot key state values before attack
        const beforeHP = [combatBefore.players?.[0]?.hp, combatBefore.players?.[1]?.hp];
        const beforeField0 = combatBefore.players?.[0]?.field?.map(c => c ? `${c.name}:${c.currentHp}hp` : '_') || [];
        const beforeField1 = combatBefore.players?.[1]?.field?.map(c => c ? `${c.name}:${c.currentHp}hp` : '_') || [];
        
        const isFaceAtk = chosenTarget === 'player';
        
        await shot('combat_BEFORE');
        const result = await executeAction(player.page, atkDecision.action, combatState);
        logP(player.index, `Attack: ${result.description} — ${result.success ? '💥' : '❌ ' + result.error}`);
        actions.push({ decision: atkDecision, result });
        await shot(isFaceAtk && result?.hpChanged === false ? 'face_FAILED' : 'combat_AFTER');
        
        // Track this slot as attacked to prevent duplicates
        attackedSlots.add(atkDecision.action.attackerSlot);
        
        // Poll until state changes (max 1.5s)
        const combatSnap = quickSnap(combatBefore);
        for (let wait = 0; wait < 3; wait++) {
          await player.page.waitForTimeout(500);
          const s = await player.getState();
          if (quickSnap(s) !== combatSnap) break;
        }
        
        if (recorder) {
          const combatAfter = await player.getState();
          
          // A1 DEBUG: snapshot key state values after attack
          const afterHP = [combatAfter.players?.[0]?.hp, combatAfter.players?.[1]?.hp];
          const afterField0 = combatAfter.players?.[0]?.field?.map(c => c ? `${c.name}:${c.currentHp}hp` : '_') || [];
          const afterField1 = combatAfter.players?.[1]?.field?.map(c => c ? `${c.name}:${c.currentHp}hp` : '_') || [];
          
          const { entry } = recorder.recordAction(turnNum, player.index, 'Combat',
            `attack ${JSON.stringify(atkDecision.action)}`,
            atkDecision.rawResponse, combatBefore, combatAfter);
          if (!entry.diff || entry.diff.length === 0) {
            logP(player.index, '⚠️ A1 DEBUG — NO DIFF detected');
            logP(player.index, `  BEFORE: HP=[${beforeHP}] myField=[${beforeField0}] oppField=[${beforeField1}]`);
            logP(player.index, `  AFTER:  HP=[${afterHP}] myField=[${afterField0}] oppField=[${afterField1}]`);
            logP(player.index, `  quickSnap before: ${combatSnap}`);
            logP(player.index, `  quickSnap after:  ${quickSnap(combatAfter)}`);
          }
        }
      } else if (atkDecision.action.type === 'advance' || atkDecision.action.type === 'endTurn') {
        logP(player.index, 'Skipping remaining attacks');
        break;
      } else {
        // LLM output non-attack action during combat — skip it
        logP(player.index, `⚠️ Non-attack action in combat (${atkDecision.action.type}) — skipping`);
        break;
      }
    }
  }
  
  // === END TURN ===
  const startTurn = await player.page.evaluate(() => window.__qa?.getState()?.turn);
  const startPhase = await player.page.evaluate(() => window.__qa?.getState()?.phase);
  dbg(`P${player.index+1} end-turn: T${startTurn} phase=${startPhase}`);
  
  for (let click = 0; click < 4; click++) {
    const s = await player.page.evaluate(() => {
      const s = window.__qa?.getState();
      return { turn: s?.turn, isMyTurn: s?.ui?.isMyTurn, phase: s?.phase };
    });
    if (s.turn !== startTurn || !s.isMyTurn) {
      dbg(`P${player.index+1} turn ended: T${s.turn} phase=${s.phase} myTurn=${s.isMyTurn}`);
      await shot('turn_END');
      break;
    }
    
    const phaseBefore = s.phase;
    await player.page.evaluate(() => document.getElementById('field-turn-btn')?.click());
    await player.page.waitForTimeout(600);
    
    const phaseAfter = await player.page.evaluate(() => window.__qa?.getState()?.phase);
    dbg(`P${player.index+1} click ${click+1}: ${phaseBefore} → ${phaseAfter}`);
    
    if (phaseAfter === phaseBefore) {
      dbg(`P${player.index+1} DOM stuck at ${phaseBefore}, QA fallback`);
      await player.page.evaluate(() => window.__qa?.act?.advancePhase());
      await player.page.waitForTimeout(400);
      const afterQA = await player.page.evaluate(() => window.__qa?.getState()?.phase);
      dbg(`P${player.index+1} after QA: ${afterQA}`);
    }
  }
  
  return { actions, turnEnded: true };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const deck1 = process.argv[2] || 'bird';
  const deck2 = process.argv[3] || 'fish';
  const model = process.argv[4] || 'qwen3-coder-next:latest';
  
  log(`\n🃏 PvP Match: ${deck1.toUpperCase()} vs ${deck2.toUpperCase()}`);
  log(`   Model: ${model}\n`);
  
  // Pre-warm LLM model to avoid cold-start latency
  try {
    const CHAT_MODELS = new Set(['qwen3.5:9b', 'qwen3.5:2b', 'qwen3.5:latest']);
    const url = CHAT_MODELS.has(model) ? 'http://localhost:11434/api/chat' : 'http://localhost:11434/api/generate';
    const body = CHAT_MODELS.has(model)
      ? { model, messages: [{ role: 'user', content: 'ready' }], stream: false, keep_alive: '30m', think: false, options: { num_predict: 1 } }
      : { model, prompt: 'ready', stream: false, keep_alive: '30m', options: { num_predict: 1 } };
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    dbg('Model pre-warmed');
  } catch (e) { dbg(`Model warm failed: ${e.message}`); }
  
  // Both Chromium — non-headless for screenshot debugging
  const headless = process.env.PVP_HEADLESS !== 'false';
  const browser1 = await chromium.launch({ headless });
  const browser2 = await chromium.launch({ headless });
  let recorder = null;
  
  try {
    // Create players on separate browser engines
    const p1 = await createPlayer(browser1, 0, deck1);
    const p2 = await createPlayer(browser2, 1, deck2);
    log('✅ P1 (Chromium) + P2 (Chromium) launched');
    
    // Login
    const ts = Date.now();
    await loginPlayer(p1.page, `P1_${ts}`, '1111');
    await loginPlayer(p2.page, `P2_${ts}`, '2222');
    log('✅ Both logged in');
    
    // Create + join lobby
    const code = await createLobby(p1.page);
    log(`✅ Lobby: ${code}`);
    await joinLobby(p2.page, code);
    log('✅ P2 joined');
    
    // Continue to game
    await continueTaGame(p1.page);
    await continueTaGame(p2.page);
    log('✅ Both in game');
    
    // Select decks — in multiplayer, need to build decks in the selection screen
    // The deck-select overlay shows after Continue, with saved deck list
    await selectDeck(p1.page, deck1);
    log(`✅ P1 selected ${deck1}`);
    await selectDeck(p2.page, deck2);
    log(`✅ P2 selected ${deck2}`);
    
    // Wait for both decks to sync (multiplayer needs both ready)
    await p1.page.waitForTimeout(1500);
    await p2.page.waitForTimeout(1000);
    
    // Debug: check deck state
    const d1 = await p1.page.evaluate(() => {
      const s = window.__qa?.getState();
      return { hand: s?.players?.[0]?.hand?.length, deck: s?.players?.[0]?.deckSize, phase: s?.phase };
    });
    const d2 = await p2.page.evaluate(() => {
      const s = window.__qa?.getState();
      return { hand: s?.players?.[0]?.hand?.length, deck: s?.players?.[0]?.deckSize, phase: s?.phase };
    });
    log(`  P1 deck state: hand=${d1.hand} deck=${d1.deck} phase=${d1.phase}`);
    log(`  P2 deck state: hand=${d2.hand} deck=${d2.deck} phase=${d2.phase}`);
    
    // Complete setup (roll, choose)
    // Complete setup — both players may need to roll/choose, interleave
    for (let attempt = 0; attempt < 20; attempt++) {
      const phase1 = await p1.page.evaluate(() => window.__qa?.getState()?.phase);
      const phase2 = await p2.page.evaluate(() => window.__qa?.getState()?.phase);
      if (phase1 !== 'Setup' && phase2 !== 'Setup') break;
      
      // Click any roll/choice buttons on both sides
      for (const page of [p1.page, p2.page]) {
        await page.evaluate(() => {
          document.querySelectorAll('.setup-overlay button').forEach(b => {
            if ((b.innerText.includes('Roll') || b.innerText.includes('goes first')) && b.offsetHeight > 0) b.click();
          });
          document.getElementById('pass-confirm')?.click();
        });
      }
      await p1.page.waitForTimeout(1000);
    }
    log('✅ Setup complete\n');
    
    // === GAME LOOP ===
    const gameLog = [];
    
    // Debug: check initial state for both players
    const p1Init = await p1.getCompact();
    const p2Init = await p2.getCompact();
    log(`P1 sees: ${p1Init}`);
    log(`P2 sees: ${p2Init}`);
    
    // Create game recorder
    recorder = createRecording(deck1, deck2, model);
    
    let lastTurn = 0;
    let sameCount = 0;
    let forceAttempts = 0;
    
    for (let round = 0; round < 50; round++) {
      // Determine whose turn it is — check active player first
      const activeIdx = await p1.page.evaluate(() => window.__qa?.getState()?.activePlayer);
      const turnOrder = activeIdx === 1 ? [p2, p1] : [p1, p2];
      
      for (const player of turnOrder) {
        const waitResult = await waitForPlayerTurn(player, 10);
        
        if (waitResult.gameOver) {
          const go = waitResult.gameOver;
          const compact = await player.getCompact();
          const finalState = await player.getState();
          
          log(`\n🏆 GAME OVER at turn ${round + 1}`);
          log(`   Winner: Player ${(go.winner ?? -1) + 1} | ${go.reason}`);
          log(`   ${compact}`);
          
          // Save recording
          recorder.setResult(go.winner, go.reason, finalState, player.index);
          const logPath = recorder.save();
          const summary = recorder.getSummary();
          
          log('\n═══ GAME LOG ═══');
          gameLog.forEach(entry => {
            log(`  T${entry.turn} P${entry.player + 1}: ${entry.summary}`);
          });
          
          log(`\n═══ RECORDING ═══`);
          log(`  File: ${logPath}`);
          log(`  Actions: ${summary.actions}`);
          log(`  Suspicious: ${summary.suspicious}`);
          if (summary.suspiciousDetails.length > 0) {
            log('  Flags:');
            summary.suspiciousDetails.forEach(s => {
              log(`    T${s.turn} ${s.action}: ${s.flags.join(', ')}`);
            });
          }
          return;
        }
        
        if (waitResult.timeout) {
          // This player's turn hasn't come, try the other player
          continue;
        }
        
        if (waitResult.ready) {
          const state = await player.getState();
          const compact = await player.getCompact();
          const turnNum = state?.turn || 0;
          
          // Guard: detect stuck turns (max 2 replays before forcing advance)
          if (turnNum === lastTurn) {
            sameCount++;
            if (sameCount > 2) {
              forceAttempts++;
              log(`⚠️ CRITICAL: Turn ${turnNum} replayed ${sameCount}x (force attempt #${forceAttempts}) — forcing advance`);
              
              if (forceAttempts >= 2) {
                // Already force-advanced once and still stuck — game is broken
                log(`🛑 STUCK: Turn ${turnNum} unrecoverable after ${forceAttempts} force attempts. Ending game.`);
                recorder.setResult(null, 'stuck', await player.page.evaluate(() => window.__qa?.getState()), player.index);
                const logPath = recorder.save();
                log(`  Recording saved: ${logPath}`);
                return { result: 'stuck', turn: turnNum, player: player.index };
              }
              
              // Force advance through ALL remaining phases to the next turn
              for (let force = 0; force < 6; force++) {
                await player.page.evaluate(() => window.__qa?.act?.advancePhase());
                await player.page.waitForTimeout(300);
                const fs = await player.page.evaluate(() => {
                  const s = window.__qa?.getState();
                  return { turn: s?.turn, phase: s?.phase, myTurn: s?.ui?.isMyTurn };
                });
                if (fs.turn !== turnNum || !fs.myTurn) { forceAttempts = 0; break; }
              }
              sameCount = 0;
              break;
            }
          } else {
            lastTurn = turnNum;
            sameCount = 0;
            forceAttempts = 0;
          }
          
          log(`\n──── Turn ${turnNum} | P${player.index + 1} (${player.deckName}) ────`);
          log(`  ${compact}`);
          
          const other = player === p1 ? p2 : p1;
          const turnResult = await playTurn(player, turnNum, model, recorder, other);
          
          const summary = turnResult.actions?.map(a => a.result?.description).join(', ') || 'no actions';
          gameLog.push({ turn: turnNum, player: player.index, summary });
          
          await player.page.waitForTimeout(500);
          break; // Only one player acts per iteration
        }
      }
      
      // If neither player got a turn, wait for Supabase sync
      const p1Turn = await p1.isMyTurn();
      const p2Turn = await p2.isMyTurn();
      if (!p1Turn && !p2Turn) {
        // Check if stuck at Start phase — try advancing
        const p1Phase = await p1.getPhase();
        const p2Phase = await p2.getPhase();
        dbg(`Neither player has turn — P1 phase=${p1Phase} P2 phase=${p2Phase}`);
        
        if (p1Phase === 'Start' || p2Phase === 'Start') {
          // Try clicking the turn button on both pages to advance past Start
          for (const p of [p1, p2]) {
            await p.page.evaluate(() => document.getElementById('field-turn-btn')?.click());
          }
          await p1.page.waitForTimeout(1000);
          // Also try QA advancePhase on both
          for (const p of [p1, p2]) {
            await p.page.evaluate(() => window.__qa?.act?.advancePhase());
          }
          await p1.page.waitForTimeout(1000);
        } else {
          await p1.page.waitForTimeout(3000);
        }
        
        // Desync recovery: if both players see different activePlayer, force Supabase re-fetch
        const p1Active = await p1.page.evaluate(() => window.__qa?.getState()?.activePlayerIndex);
        const p2Active = await p2.page.evaluate(() => window.__qa?.getState()?.activePlayerIndex);
        if (p1Active !== undefined && p2Active !== undefined && p1Active !== p2Active) {
          dbg(`⚠️ DESYNC detected! P1 sees active=${p1Active}, P2 sees active=${p2Active}. Forcing Supabase re-fetch...`);
          // Force both browsers to re-fetch authoritative state from Supabase
          for (const p of [p1, p2]) {
            const result = await p.page.evaluate(() => window.__qa?.act?.resyncState?.());
            dbg(`  P${p.index+1} resync: ${JSON.stringify(result)}`);
          }
          await p1.page.waitForTimeout(2000);
          
          // Check if resync fixed it
          const p1MyTurn2 = await p1.isMyTurn();
          const p2MyTurn2 = await p2.isMyTurn();
          if (p1MyTurn2 || p2MyTurn2) {
            dbg(`✅ Desync resolved! P1=${p1MyTurn2} P2=${p2MyTurn2}`);
          } else {
            dbg(`⚠️ Still desync'd after re-fetch. Forcing advancePhase on both...`);
            for (const p of [p1, p2]) {
              await p.page.evaluate(() => window.__qa?.act?.advancePhase());
              await p.page.waitForTimeout(500);
            }
          }
        }
        
        // Check for game over
        const go1 = await p1.isGameOver();
        const go2 = await p2.isGameOver();
        if (go1?.over || go2?.over) {
          const go = go1?.over ? go1 : go2;
          log(`\n🏆 GAME OVER (detected during sync wait)`);
          recorder.setResult(go.winner, go.reason, await p1.getState(), 0);
          const logPath = recorder.save();
          log(`  File: ${logPath}`);
          return;
        }
      }
    }
    
  } finally {
    // Save recording even if game didn't finish (crash/timeout)
    if (recorder) {
      if (!recorder.recording.result) {
        recorder.setResult(null, 'incomplete', null);
      }
      const logPath = recorder.save();
      const summary = recorder.getSummary();
      log(`\n📝 Recording saved: ${logPath}`);
      log(`   Actions: ${summary.actions} | Suspicious: ${summary.suspicious}`);
    }
    
    await browser1.close().catch(() => {});
    await browser2.close().catch(() => {});
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
