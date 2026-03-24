/**
 * QA Agent — Main Loop
 *
 * The core loop: read state → LLM decides → execute → LLM verifies → log or report bug.
 * All intelligence is in the LLM. This file is just plumbing.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appendFileSync, mkdirSync, existsSync } from 'fs';

import {
  launchBrowsers,
  navigateToGame,
  login,
  setupMultiplayerGame,
  selectDecks,
  waitForGameStart,
  readState,
  readCompactState,
  executeAction,
  checkGameOver,
  getGameLog,
  cleanup,
} from './browser.js';
import { chatCompletion, parseJsonResponse } from './llm.js';
import { fileBugReport, getBugCount } from './bugs.js';
import config from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, 'logs');
if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

// Load system prompt + rules
const systemPrompt = readFileSync(join(__dirname, 'prompts', 'system.md'), 'utf-8');
const coreRules = readFileSync(join(__dirname, '..', 'CORE-RULES.md'), 'utf-8');

const SYSTEM_MESSAGE = {
  role: 'system',
  content: `${systemPrompt}\n\n---\n\n# Full Rules Reference\n\n${coreRules}`,
};

// ============================================================================
// GAME LOG
// ============================================================================

function createGameLog(gameId) {
  const filepath = join(LOGS_DIR, `${gameId}.jsonl`);
  return {
    append(entry) {
      appendFileSync(filepath, JSON.stringify(entry) + '\n');
    },
  };
}

// ============================================================================
// LLM INTERACTION
// ============================================================================

/**
 * Ask the LLM to decide an action given the current board state.
 */
async function askForAction(state, recentHistory = []) {
  const stateStr = JSON.stringify(state, null, 2);

  const messages = [
    SYSTEM_MESSAGE,
    ...recentHistory,
    {
      role: 'user',
      content: `Here is the current board state:\n\n\`\`\`json\n${stateStr}\n\`\`\`\n\nIt is ${state.activePlayer === state.localPlayer ? 'YOUR' : "your OPPONENT's"} turn.\nPhase: ${state.phase}, Turn: ${state.turn}\n\nWhat action do you want to take? Respond with JSON: { "action": "...", "args": [...], "reasoning": "...", "expectation": "..." }\n\nAvailable action types: playCard(handIndex, fieldSlot), selectEatTargets([indices]), dryDrop(), attack(attackerSlot, targetType, targetSlot), advancePhase(), endTurn(), respondToReaction(choice), extendConsumption(preyInstanceId), finalizePlacement(), menu.surrender()`,
    },
  ];

  const response = await chatCompletion(messages, { temperature: 0.8, maxTokens: 1000 });
  return { raw: response, parsed: parseJsonResponse(response) };
}

/**
 * Ask the LLM to verify the outcome of an action.
 */
async function askForVerification(beforeState, action, afterState, expectation) {
  const messages = [
    SYSTEM_MESSAGE,
    {
      role: 'user',
      content: `You just took an action. Verify the outcome against the game rules.

## Before State (summary)
Phase: ${beforeState.phase}, Turn: ${beforeState.turn}
Your HP: ${beforeState.players[0].hp}, Rival HP: ${beforeState.players[1].hp}
Your field: ${JSON.stringify(beforeState.players[0].field?.filter(Boolean).map((c) => `${c.name} ${c.currentAtk}/${c.currentHp}`) || [])}
Rival field: ${JSON.stringify(beforeState.players[1].field?.filter(Boolean).map((c) => `${c.name} ${c.currentAtk}/${c.currentHp}`) || [])}

## Action Taken
${JSON.stringify(action)}

## Your Expectation
${expectation}

## After State (summary)
Phase: ${afterState.phase}, Turn: ${afterState.turn}
Your HP: ${afterState.players[0].hp}, Rival HP: ${afterState.players[1].hp}
Your field: ${JSON.stringify(afterState.players[0].field?.filter(Boolean).map((c) => `${c.name} ${c.currentAtk}/${c.currentHp} ${c.keywords?.length ? '[' + c.keywords.join(',') + ']' : ''} ${c.isParalyzed ? 'PARALYZED' : ''} ${c.isFrozen ? 'FROZEN' : ''} ${c.hasBarrier ? 'BARRIER' : ''}`.trim()) || [])}
Rival field: ${JSON.stringify(afterState.players[1].field?.filter(Boolean).map((c) => `${c.name} ${c.currentAtk}/${c.currentHp} ${c.keywords?.length ? '[' + c.keywords.join(',') + ']' : ''} ${c.isParalyzed ? 'PARALYZED' : ''} ${c.isFrozen ? 'FROZEN' : ''} ${c.hasBarrier ? 'BARRIER' : ''}`.trim()) || [])}
Your hand size: ${beforeState.players[0].hand?.length || '?'} → ${afterState.players[0].hand?.length || '?'}
Recent log: ${JSON.stringify(afterState.recentLog?.slice(0, 5) || [])}

## Full After State
\`\`\`json
${JSON.stringify(afterState, null, 2)}
\`\`\`

Did the outcome match the rules? Check damage math, zone changes, keyword effects, status effects.
Respond with JSON: { "ok": true/false, "notes": "...", "bug": { ... } if not ok }`,
    },
  ];

  const response = await chatCompletion(messages, { temperature: 0.3, maxTokens: 1500 });
  return { raw: response, parsed: parseJsonResponse(response) };
}

// ============================================================================
// MAIN GAME LOOP
// ============================================================================

/**
 * Play a single game, with the LLM controlling one side.
 * Returns game summary.
 */
async function playGame(page, gameId) {
  const log = createGameLog(gameId);
  const conversationHistory = []; // rolling context for the LLM
  let actionCount = 0;
  let bugsThisGame = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Agent] Starting game ${gameId}`);
  console.log(`${'='.repeat(60)}`);

  while (true) {
    // Check if game is over
    const gameOver = await checkGameOver(page);
    if (gameOver.over) {
      console.log(`[Agent] Game over! Winner: ${gameOver.winner}, Reason: ${gameOver.reason}`);
      log.append({ type: 'game_over', ...gameOver });
      return { gameId, actions: actionCount, bugs: bugsThisGame, result: gameOver };
    }

    // Read current state
    const state = await readState(page);
    const compact = await readCompactState(page);
    console.log(`[Agent] ${compact}`);

    // If it's not our turn, wait
    if (!state.ui.isMyTurn) {
      console.log('[Agent] Waiting for opponent turn...');
      await new Promise((r) => setTimeout(r, config.actionDelay));
      continue;
    }

    // If there's a pending context (consumption, reaction), include it
    if (state.pendingContext) {
      console.log(`[Agent] Pending context: ${state.pendingContext.type}`);
    }

    // Ask LLM for action
    let decision;
    try {
      decision = await askForAction(state, conversationHistory.slice(-6));
    } catch (err) {
      console.error(`[Agent] LLM error: ${err.message}`);
      // Fallback: advance phase or end turn
      await executeAction(page, 'advancePhase');
      await new Promise((r) => setTimeout(r, config.actionDelay));
      continue;
    }

    if (!decision.parsed) {
      console.error(`[Agent] Could not parse LLM response: ${decision.raw.slice(0, 200)}`);
      await executeAction(page, 'advancePhase');
      await new Promise((r) => setTimeout(r, config.actionDelay));
      continue;
    }

    const { action, args = [], reasoning, expectation } = decision.parsed;
    console.log(`[Agent] Action: ${action}(${JSON.stringify(args)}) — ${reasoning || ''}`);

    // Save before state
    const beforeState = state;

    // Execute action
    let result;
    try {
      result = await executeAction(page, action, args);
    } catch (err) {
      console.error(`[Agent] Action execution error: ${err.message}`);
      log.append({ type: 'action_error', action, args, error: err.message });
      await new Promise((r) => setTimeout(r, config.actionDelay));
      continue;
    }

    // Wait for state to settle
    await new Promise((r) => setTimeout(r, config.actionDelay));

    // Read after state
    const afterState = await readState(page);
    actionCount++;

    log.append({
      type: 'action',
      turn: beforeState.turn,
      phase: beforeState.phase,
      action,
      args,
      reasoning,
      expectation,
      result: result?.success,
      error: result?.error,
    });

    // Add to conversation history for context
    conversationHistory.push({
      role: 'assistant',
      content: JSON.stringify(decision.parsed),
    });
    conversationHistory.push({
      role: 'user',
      content: `Action result: ${result?.success ? 'SUCCESS' : 'FAILED — ' + (result?.error || 'unknown')}. ${result?.error ? 'The game rejected your action.' : ''}`,
    });

    // Ask LLM to verify outcome
    let verification;
    try {
      verification = await askForVerification(
        beforeState,
        { action, args, result: result?.success, error: result?.error },
        afterState,
        expectation || 'No specific expectation stated'
      );
    } catch (err) {
      console.error(`[Agent] Verification error: ${err.message}`);
      continue;
    }

    if (verification.parsed) {
      if (verification.parsed.ok === false && verification.parsed.bug) {
        const bug = verification.parsed.bug;
        console.log(`\n🐛 BUG DETECTED: ${bug.title}`);
        console.log(`   Expected: ${bug.expected}`);
        console.log(`   Actual: ${bug.actual}`);
        console.log(`   Severity: ${bug.severity}\n`);

        const filed = fileBugReport(bug, {
          gameId,
          turn: beforeState.turn,
          phase: beforeState.phase,
          beforeState,
          afterState,
          action: { action, args },
        });

        if (filed) bugsThisGame++;

        log.append({
          type: 'bug',
          bug,
          filed: !!filed,
        });
      } else if (verification.parsed.notes) {
        console.log(`[Agent] Verify: ✅ ${verification.parsed.notes}`);
      }
    }

    // Keep conversation history manageable
    if (conversationHistory.length > 20) {
      conversationHistory.splice(0, conversationHistory.length - 12);
    }
  }
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Run the full QA session.
 * Sets up browsers, plays games in a loop.
 */
async function main() {
  console.log('[QA Harness] Starting...');
  console.log(`[QA Harness] Model: ${config.llm.model}`);
  console.log(`[QA Harness] Game limit: ${config.gameLimit || 'unlimited'}`);

  let browser, page1, page2;
  let gamesPlayed = 0;
  let totalBugs = 0;

  try {
    // Launch browsers
    console.log('[QA Harness] Launching browsers...');
    ({ browser, page1, page2 } = await launchBrowsers());

    // Navigate both to the game
    await Promise.all([navigateToGame(page1), navigateToGame(page2)]);

    // Login both accounts
    await login(page1, config.accounts.player1);
    await login(page2, config.accounts.player2);

    // Game loop
    while (config.gameLimit === null || gamesPlayed < config.gameLimit) {
      const gameId = `game-${Date.now()}`;

      try {
        // Set up multiplayer match
        await setupMultiplayerGame(page1, page2);
        await selectDecks(page1, page2);

        // Wait for both to be in game
        await Promise.all([waitForGameStart(page1), waitForGameStart(page2)]);

        // Play the game (LLM controls player 1's perspective)
        const result = await playGame(page1, gameId);
        gamesPlayed++;
        totalBugs += result.bugs;

        console.log(`\n[QA Harness] Game ${gamesPlayed} complete`);
        console.log(`  Result: ${JSON.stringify(result.result)}`);
        console.log(`  Actions: ${result.actions}`);
        console.log(`  Bugs this game: ${result.bugs}`);
        console.log(`  Total bugs found: ${totalBugs} (${getBugCount()} unique)`);
      } catch (err) {
        console.error(`[QA Harness] Game error: ${err.message}`);
        console.error(err.stack);
      }

      // Delay between games
      await new Promise((r) => setTimeout(r, config.gameDelay));

      // Reload pages for clean state
      try {
        await Promise.all([navigateToGame(page1), navigateToGame(page2)]);
        await login(page1, config.accounts.player1);
        await login(page2, config.accounts.player2);
      } catch (err) {
        console.error(`[QA Harness] Page reload error: ${err.message}`);
        break;
      }
    }
  } catch (err) {
    console.error(`[QA Harness] Fatal error: ${err.message}`);
    console.error(err.stack);
  } finally {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[QA Harness] Session complete`);
    console.log(`  Games played: ${gamesPlayed}`);
    console.log(`  Total bugs: ${totalBugs} (${getBugCount()} unique)`);
    console.log(`${'='.repeat(60)}`);

    await cleanup(browser);
  }
}

// Run
main().catch(console.error);
