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

function log(msg) { console.log(msg); }
function logP(player, msg) { console.log(`  [P${player + 1}] ${msg}`); }

// ============================================================================
// PLAYER SETUP
// ============================================================================

async function createPlayer(browser, index, deckName) {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Error listeners — catch crashes immediately
  page.on('crash', () => log(`💥 P${index + 1} PAGE CRASHED`));
  page.on('pageerror', (err) => log(`🔴 P${index + 1} JS ERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') log(`🟡 P${index + 1} console.error: ${msg.text().substring(0, 100)}`);
  });
  
  await page.goto(GAME_URL);
  await page.waitForTimeout(2000);
  
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
  await page.waitForTimeout(2000);
}

async function createLobby(page) {
  await page.click('#menu-other', { force: true }); await page.waitForTimeout(300);
  await page.click('#other-multiplayer', { force: true }); await page.waitForTimeout(300);
  await page.click('#lobby-create', { force: true }); await page.waitForTimeout(3000);
  return page.evaluate(() => window.__qa?.act?.menu?.getMenuState()?.lobby?.code);
}

async function joinLobby(page, code) {
  await page.click('#menu-other', { force: true }); await page.waitForTimeout(300);
  await page.click('#other-multiplayer', { force: true }); await page.waitForTimeout(300);
  await page.click('#lobby-join', { force: true }); await page.waitForTimeout(1000);
  // Use evaluate to fill + submit (avoids visibility timing issues)
  await page.evaluate(({lobbyCode}) => {
    const input = document.getElementById('lobby-code');
    if (input) { input.value = lobbyCode; input.dispatchEvent(new Event('input', {bubbles: true})); }
    const form = document.getElementById('lobby-join-form');
    if (form) form.dispatchEvent(new Event('submit', {bubbles: true}));
  }, {lobbyCode: code});
  await page.waitForTimeout(5000);
}

async function continueTaGame(page) {
  await page.click('#lobby-continue', { force: true });
  await page.waitForTimeout(2000);
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
  await page.waitForTimeout(2000);
  
  // Step 3: Click 'CONFIRM DECK & READY UP' (dynamically created in grid)
  await page.evaluate(() => {
    const grid = document.getElementById('deck-select-grid');
    (grid?.querySelectorAll('button') || []).forEach(b => {
      if (b.innerText.includes('CONFIRM') && b.offsetHeight > 0) b.click();
    });
  });
  await page.waitForTimeout(2000);
  
  // AI mode fallback: RANDOM + static CONFIRM
  const needsRandom = await page.evaluate(() => document.getElementById('deck-random')?.offsetHeight > 0);
  if (needsRandom) {
    await page.evaluate(() => document.getElementById('deck-random')?.click());
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('deck-confirm')?.click());
    await page.waitForTimeout(2000);
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
    if (myTurn && phase === 'Main 1') return { ready: true, phase };
    await player.page.waitForTimeout(500);
  }
  return { timeout: true };
}

async function playTurn(player, turnNum, model, recorder) {
  const stateBefore = await player.getState();
  if (!stateBefore) return { error: 'No state' };
  
  // Quick state fingerprint for polling state changes
  const quickSnap = (s) => s ? `${s.players?.[0]?.hp}-${s.players?.[0]?.hand?.length ?? s.players?.[0]?.handSize}-${s.players?.[0]?.field?.filter(c=>c).length}-${s.players?.[1]?.hp}-${s.players?.[1]?.field?.filter(c=>c).length}` : '';
  
  const actions = [];
  
  // === MAIN PHASE ===
  if (stateBefore.phase === 'Main 1') {
    const decision = await getDecision(stateBefore, 0, player.deckName, { model });
    const retryTag = decision.retried ? ' [RETRY]' : '';
    logP(player.index, `Think (${decision.timeMs}ms)${retryTag}: ${decision.rawResponse?.substring(0, 120) || decision.reasoning?.substring(0, 120)}`);
    logP(player.index, `Action: ${JSON.stringify(decision.action)}`);
    
    // Pre-validate: reject ATTACK during Main phase (LLM confusion)
    if (decision.action.type === 'attack') {
      logP(player.index, '⚠️ ATTACK during Main phase — skipping (attacks only in Combat)');
    } else if (decision.action.type !== 'unknown' && decision.action.type !== 'advance' && decision.action.type !== 'endTurn') {
      const result = await executeAction(player.page, decision.action, stateBefore);
      logP(player.index, `Result: ${result.description} — ${result.success ? '✅' : '❌ ' + result.error}`);
      actions.push({ decision, result });
      
      // Poll until state changes or timeout (Supabase sync can be slow)
      let stateAfter = null;
      const beforeSnap = quickSnap(stateBefore);
      for (let wait = 0; wait < 8; wait++) {
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
  // Single DOM button click to advance from Main 1 → Combat
  await player.page.evaluate(() => document.getElementById('field-turn-btn')?.click());
  await player.page.waitForTimeout(800);
  let combatState = await player.getState();
  
  // === COMBAT PHASE ===
  if (combatState?.phase === 'Combat') {
    const attackedSlots = new Set(); // Track which slots already attacked this turn
    
    // Attack up to 3 times (max creatures), refreshing state each time
    for (let attackNum = 0; attackNum < 3; attackNum++) {
      combatState = await player.getState(); // FRESH state each attack
      const attackers = combatState.players?.[0]?.field?.filter(c => c && c.canAttack && !attackedSlots.has(c.slot)) || [];
      if (attackers.length === 0) break;
      
      const atkDecision = await getDecision(combatState, 0, player.deckName, { model });
      logP(player.index, `Combat (${atkDecision.timeMs}ms): ${atkDecision.rawResponse?.substring(0, 100)}`);
      
      // ONLY accept ATTACK actions during combat — reject anything else
      if (atkDecision.action.type === 'attack') {
        const combatBefore = await player.getState();
        const result = await executeAction(player.page, atkDecision.action, combatState);
        logP(player.index, `Attack: ${result.description} — ${result.success ? '💥' : '❌ ' + result.error}`);
        actions.push({ decision: atkDecision, result });
        
        // Track this slot as attacked to prevent duplicates
        attackedSlots.add(atkDecision.action.attackerSlot);
        
        // Poll until state changes (Supabase sync)
        const combatSnap = quickSnap(combatBefore);
        for (let wait = 0; wait < 6; wait++) {
          await player.page.waitForTimeout(500);
          const s = await player.getState();
          if (quickSnap(s) !== combatSnap) break;
        }
        
        if (recorder) {
          const combatAfter = await player.getState();
          const { entry } = recorder.recordAction(turnNum, player.index, 'Combat',
            `attack ${JSON.stringify(atkDecision.action)}`,
            atkDecision.rawResponse, combatBefore, combatAfter);
          if (!entry.diff || entry.diff.length === 0) {
            logP(player.index, '⚠️ Attack had NO DIFF — state may not have synced');
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
  // End turn — DOM button clicks only, max 2 (skip combat + end turn)
  const startTurn = await player.page.evaluate(() => window.__qa?.getState()?.turn);
  const isMyTurn = await player.page.evaluate(() => window.__qa?.getState()?.ui?.isMyTurn);
  
  if (isMyTurn) {
    // Click 1: advance from current phase (Combat → Main 2 or Main 2 → End)
    await player.page.evaluate(() => document.getElementById('field-turn-btn')?.click());
    await player.page.waitForTimeout(1000);
    
    let state = await player.page.evaluate(() => {
      const s = window.__qa?.getState();
      return { turn: s?.turn, isMyTurn: s?.ui?.isMyTurn };
    });
    
    // Click 2 only if still our turn (need to advance one more phase)
    if (state.turn === startTurn && state.isMyTurn) {
      await player.page.evaluate(() => document.getElementById('field-turn-btn')?.click());
      await player.page.waitForTimeout(1000);
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
  
  // P1: Chromium (most stable), P2: WebKit (Safari — tests cross-browser)
  const browser1 = await chromium.launch({ headless: true });
  const browser2 = await webkit.launch({ headless: true });
  let recorder = null;
  
  try {
    // Create players on separate browser engines
    const p1 = await createPlayer(browser1, 0, deck1);
    const p2 = await createPlayer(browser2, 1, deck2);
    log('✅ P1 (Chromium) + P2 (WebKit) launched');
    
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
    await p1.page.waitForTimeout(3000);
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
    
    for (let round = 0; round < 50; round++) {
      // Determine whose turn it is
      for (const player of [p1, p2]) {
        const waitResult = await waitForPlayerTurn(player, 15);
        
        if (waitResult.gameOver) {
          const go = waitResult.gameOver;
          const compact = await player.getCompact();
          const finalState = await player.getState();
          
          log(`\n🏆 GAME OVER at turn ${round + 1}`);
          log(`   Winner: Player ${(go.winner ?? -1) + 1} | ${go.reason}`);
          log(`   ${compact}`);
          
          // Save recording
          recorder.setResult(go.winner, go.reason, finalState);
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
          
          // Guard: detect stuck turns
          if (turnNum === lastTurn) {
            sameCount++;
            if (sameCount > 3) {
              log(`⚠️ Stuck on turn ${turnNum} — forcing end turn`);
              await player.page.evaluate(() => window.__qa?.act?.endTurn());
              await player.page.waitForTimeout(1000);
              sameCount = 0;
              break;
            }
          } else {
            lastTurn = turnNum;
            sameCount = 0;
          }
          
          log(`\n──── Turn ${turnNum} | P${player.index + 1} (${player.deckName}) ────`);
          log(`  ${compact}`);
          
          const turnResult = await playTurn(player, turnNum, model, recorder);
          
          const summary = turnResult.actions?.map(a => a.result?.description).join(', ') || 'no actions';
          gameLog.push({ turn: turnNum, player: player.index, summary });
          
          await player.page.waitForTimeout(1000);
          break; // Only one player acts per iteration
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
