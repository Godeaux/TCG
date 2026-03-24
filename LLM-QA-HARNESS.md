# LLM QA Harness — Design Spec

**Purpose:** Enable a local LLM (Qwen 3.5 tuned, 100+ tok/s) to play Food Chain TCG via browser automation, observe game behavior, and file bug reports when rules are violated. Runs 24/7 at zero API cost.

**Philosophy:** No invariant assertions. No AI-vs-AI mode. The LLM understands the rules, plays the game through the real UI, watches what happens, and reports when reality doesn't match the rules. Organic bug discovery by a thinking agent, not a validator script.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│                  LLM Agent                   │
│  (Qwen 3.5 tuned, local, tool-calling)      │
│                                              │
│  Knows: CORE-RULES.md, card catalog,        │
│         what "normal" looks like             │
│                                              │
│  Loop:                                       │
│    1. Read board state (via tool)            │
│    2. Decide action (play card, attack, etc) │
│    3. Execute action (via tool)              │
│    4. Read board state again                 │
│    5. Think: did what I expected happen?      │
│    6. If not → file bug report               │
│    7. Repeat until game ends                 │
│    8. Start new game                         │
└────────┬──────────────────┬─────────────────┘
         │                  │
    ┌────▼────┐       ┌────▼────┐
    │ Browser │       │ Browser │
    │  Tab 1  │       │  Tab 2  │
    │ Player1 │       │ Player2 │
    └────┬────┘       └────┬────┘
         │                  │
         └────── Supabase ──┘
           (multiplayer sync)
```

The LLM controls both players, alternating turns. Two real browser tabs, real multiplayer connection, real network sync. The game doesn't know it's being tested.

---

## Component 1: State Reader (`window.__qa`)

Expose a read-only API on `window.__qa` that gives the LLM structured game state. This is the LLM's "eyes."

**Why not scrape the DOM?** The DOM is a visual representation. Card stats are embedded in styled elements, effects are CSS classes, game phase is scattered across multiple elements. Structured JSON is unambiguous and token-efficient — critical for a local model.

```javascript
// js/qa/qaApi.js — exposed on window.__qa in all builds

window.__qa = {
  /** Full game state snapshot for LLM consumption */
  getState() {
    return {
      phase: 'MAIN_PHASE_1',          // current phase
      turn: 3,                         // turn number
      activePlayer: 0,                 // whose turn (0 or 1)
      localPlayer: 0,                  // which player THIS browser controls

      players: [
        {
          hp: 8,
          deckSize: 14,
          hand: [
            {
              index: 0,                // position in hand (for action reference)
              name: 'Electric Eel',
              type: 'Predator',
              atk: 3,
              hp: 4,
              cost: null,              // or nutrition, whatever applies
              keywords: ['Neurotoxic'],
              effect: 'Before combat: Deal 2 damage to target creature',
              canPlay: true,           // based on current phase + card limit
            },
            // ... rest of hand
          ],
          field: [
            // null = empty slot, or creature object
            {
              slot: 0,
              name: 'Rabbit',
              type: 'Prey',
              atk: 1,
              hp: 2,
              currentAtk: 1,
              currentHp: 2,
              keywords: [],
              canAttack: true,         // accounting for exhaustion, frozen, etc
              canAttackPlayer: false,   // summoning exhaustion
              hasBarrier: false,
              isFrozen: false,
              isParalyzed: false,
              isDryDropped: false,
              summonedTurn: 2,
            },
            null,                      // empty slot 1
            null,                      // empty slot 2
          ],
          carrion: ['Frog', 'Mouse'],  // names of dead creatures
          carrionDetailed: [           // full cards if needed for scavenge decisions
            { name: 'Frog', type: 'Prey', atk: 1, hp: 1, nutrition: 1 },
            { name: 'Mouse', type: 'Prey', atk: 0, hp: 1, nutrition: 1 },
          ],
          exile: [],
          trapsInHand: 1,             // count only (hidden info for opponent)
        },
        {
          // Player 1 (opponent) — same structure
          // hand is hidden: only count shown
          hp: 6,
          deckSize: 12,
          handSize: 4,                // can't see opponent's hand
          field: [/* ... */],
          carrion: [/* ... */],
          exile: [],
        },
      ],

      // What actions are currently valid
      validActions: [
        { type: 'PLAY_CARD', handIndex: 0, description: 'Play Electric Eel' },
        { type: 'PLAY_CARD', handIndex: 2, description: 'Play Healing Rain' },
        { type: 'ATTACK', attackerSlot: 0, targets: [
          { type: 'creature', slot: 1, name: 'Snake' },
          // no direct attack (summoning exhaustion)
        ]},
        { type: 'ADVANCE_PHASE', description: 'Go to Combat Phase' },
        { type: 'END_TURN' },
      ],

      // Game log (last N entries)
      recentLog: [
        'Turn 3: Player 1 draws a card',
        'Player 1 plays Rabbit to slot 0',
      ],

      // UI state
      ui: {
        pendingSelection: null,       // or { type: 'eat_targets', min: 0, max: 3, options: [...] }
        overlayOpen: null,            // 'victory', 'reaction', 'menu', null
        isMyTurn: true,
      },
    };
  },

  /** Compact state string (fewer tokens for the LLM) */
  getCompactState() {
    // Returns a terse single-line summary:
    // "T3 MAIN1 | You(8hp): [Rabbit 1/2 s0] hand:3 | Rival(6hp): [Snake 2/3 s1] hand:4"
    // Good for quick status checks between detailed reads
  },

  /** Get the game history log */
  getLog(lastN = 20) {
    // Returns array of recent game log messages
  },

  /** Check if game is over */
  isGameOver() {
    return { over: false, winner: null, reason: null };
    // or { over: true, winner: 0, reason: 'hp_zero' }
    // or { over: true, winner: null, reason: 'draw' }
  },
};
```

**Key design decisions:**
- **No `validActions`.** The LLM decides what to try based on its understanding of CORE-RULES.md. The game accepts or rejects. If the game lets an illegal action through, the LLM catches it. If the game blocks a legal action, the LLM catches that too.
- **No `canPlay` / `canAttack` flags.** Same reason — the LLM should probe the game, not follow its guidance. Pre-filtering legal actions means the LLM never tests the game's validation logic.
- `pendingContext` tells the LLM about modal UI states (consumption prompt, reaction prompt) so it knows what screen it's looking at, but NOT what it should do.
- Opponent's hand is hidden (only count shown). The LLM plays fair.
- The verification loop goes both ways: "game allowed something illegal" = bug, AND "game blocked something legal" = bug.

---

## Component 2: Action Executor (`window.__qa.act`)

The LLM's "hands." These trigger real UI interactions via the game controller, not DOM clicks.

```javascript
window.__qa.act = {
  /**
   * Play a card from hand to field.
   * Returns the new state after the action resolves.
   * If the card is a predator, pendingSelection will be set for eating targets.
   */
  playCard(handIndex, fieldSlot) {
    // Triggers the same code path as drag-and-drop
    // Returns: { success: true, newState: {...} }
    // or: { success: false, error: 'No empty field slots' }
  },

  /**
   * Select consumption targets (after playing a predator).
   * indices refers to items in the pendingSelection.options array.
   */
  selectEatTargets(targetIndices) {
    // e.g., selectEatTargets([0, 2]) to eat the 1st and 3rd options
  },

  /**
   * Declare attack.
   * targetType: 'creature' | 'player'
   * targetSlot: opponent field slot (for creature), ignored for player
   */
  attack(attackerSlot, targetType, targetSlot) {},

  /** Advance to next phase */
  advancePhase() {},

  /** End turn */
  endTurn() {},

  /** Respond to a reaction prompt (trap activation) */
  respondToReaction(choice) {
    // choice: 'activate' | 'pass'
  },

  /** Navigate menus (for game setup) */
  menu: {
    clickFindMatch() {},
    createLobby() {},
    joinLobby(code) {},
    selectDeck(deckName) {},
    confirmDeck() {},
    startGame() {},
    rematch() {},
    surrender() {},
  },
};
```

**Action responses are synchronous-feeling:** Each action waits for the game state to settle (animations complete, network sync done) before returning the new state. The LLM doesn't need to poll.

---

## Component 3: LLM Agent Loop

This is the Playwright + LLM orchestration layer. Runs outside the browser.

```
qa-harness/
  agent.js          — Main loop: read state → LLM decides → execute → verify
  playwright.js     — Browser management (2 tabs, multiplayer connection)
  prompts/
    system.md       — System prompt with rules + expected behaviors
    turn.md         — Per-turn prompt template
    verify.md       — Post-action verification prompt
    bug-report.md   — Bug report generation prompt
  bugs/
    YYYY-MM-DD-HHmm-<fingerprint>.md  — Filed bug reports
  logs/
    game-<id>.jsonl  — Full action log per game
  config.js         — Model endpoint, game URL, account creds
```

### Agent Loop (pseudocode)

```javascript
while (true) {
  // Start a new game
  await setupMultiplayerGame(tab1, tab2);

  while (!gameOver) {
    // Determine which tab is active (whose turn)
    const activeTab = getActiveTab(tab1, tab2);

    // Read state
    const state = await activeTab.evaluate(() => window.__qa.getState());

    // Ask LLM what to do
    const decision = await llm.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: formatTurnPrompt(state) },
    ]);

    // Parse and execute action
    const action = parseAction(decision);
    const beforeState = state;
    const result = await activeTab.evaluate(
      (act) => window.__qa.act[act.type](...act.args),
      action
    );

    // Read state after action
    const afterState = await activeTab.evaluate(() => window.__qa.getState());

    // Ask LLM to verify: did the expected thing happen?
    const verification = await llm.chat([
      { role: 'system', content: VERIFY_PROMPT },
      { role: 'user', content: formatVerifyPrompt(beforeState, action, afterState) },
    ]);

    if (verification.bugDetected) {
      await fileBugReport(verification, beforeState, action, afterState);
    }

    // Log everything
    appendLog(gameId, { beforeState, action, afterState, verification });
  }

  // Game over — log result, start next
  gamesPlayed++;
  console.log(`Game ${gamesPlayed} complete. Bugs this game: ${bugsThisGame}`);
}
```

### Key LLM Prompts

**System prompt** (loaded once per session):
- Full CORE-RULES.md (condensed to essential rules — the LLM doesn't need UI formatting guidance)
- Card catalog (all cards with stats, keywords, effects)
- "You are a QA tester for Food Chain TCG. Play the game strategically. After every action, verify the result matches the rules. If anything violates the rules, report it as a bug."

**Turn prompt** (per action):
```
Current state:
{compact state representation}

Valid actions: {list}

Choose an action. Respond with JSON: { "action": "playCard", "args": [0, 1], "expectation": "Electric Eel should enter field slot 1. Since I'm eating Rabbit (slot 0), Eel should gain +1/+1 from nutrition. Rabbit should go to carrion." }
```

**Verify prompt** (after each action):
```
Before: {before state}
Action taken: {action}
After: {after state}
Your expectation was: {expectation from turn prompt}

Did the result match your expectation? Check:
- HP changes correct?
- Creatures in correct zones (field/carrion/exile)?
- Keywords applied/removed correctly?
- Damage amounts correct?
- Any creature that should be dead still alive? (zombie)
- Any creature that should be alive now dead?

Respond: { "ok": true } or { "ok": false, "bug": { "title": "...", "expected": "...", "actual": "...", "severity": "critical|major|minor", "rule_reference": "CORE-RULES §X" } }
```

---

## Component 4: Bug Report Output

When the LLM detects a bug, it writes a markdown file:

```markdown
# BUG: Neurotoxic applied through Barrier

**Detected:** 2026-03-23 14:32 PST
**Game:** game-1711234567
**Turn:** 5, Combat Phase
**Severity:** Critical

## What Happened
Electric Eel (Neurotoxic, 3 ATK) attacked Armadillo (Barrier, 2/4).
Barrier absorbed the attack (Armadillo stayed at 4 HP).
But Armadillo received Paralysis anyway.

## Expected (CORE-RULES §12)
"Neurotoxic vs Barrier: Barrier absorbs, no Paralysis applied (no combat damage dealt)"
Armadillo should have lost Barrier but NOT received Paralysis.

## Actual
Armadillo: Barrier removed, HP stayed at 4, BUT isParalyzed = true

## State Before
{JSON snapshot}

## State After
{JSON snapshot}

## Reproduction
Game seed: 42 (if available)
Action sequence: [list of actions leading to this state]
```

Bug reports accumulate in `qa-harness/bugs/`. The fingerprint in the filename deduplicates (same bug type + same cards involved = same fingerprint, skip re-filing).

---

## Component 5: Game Setup Automation

The hardest part is getting two browsers into a multiplayer game. Sequence:

```
1. Tab 1: Navigate to game URL
2. Tab 1: Login (or use stored session)
3. Tab 1: Click "Find Match" or "Create Lobby"
4. Tab 2: Navigate to game URL
5. Tab 2: Login as second account
6. Tab 2: Join lobby (via code) or "Find Match"
7. Both: Select decks (random or from saved deck list)
8. Both: Confirm deck
9. Wait for coin flip / first player selection
10. Game begins
```

This needs two test accounts with saved decks. The `window.__qa.menu` methods handle each step. The harness just orchestrates the sequence.

**Deck strategy:** Start with random decks to maximize card coverage. Over time, the LLM can be prompted to build decks that target specific interactions (e.g., "build a deck heavy on Neurotoxic and Barrier creatures to stress-test combat edge cases").

---

## Implementation Plan

### Phase 1: `window.__qa` API (1-2 days)
- Add `js/qa/qaApi.js` — state reader + action executor
- Import in `main.js` (always loaded, gated behind `?qa=true` URL param or always-on)
- Test manually: open console, call `window.__qa.getState()`, verify output
- Call `window.__qa.act.playCard(0, 1)`, verify it works like clicking

### Phase 2: Playwright Scaffolding (1 day)
- `qa-harness/playwright.js` — launch 2 browsers, navigate, login, create/join lobby
- Verify: two tabs reach an active game automatically

### Phase 3: LLM Integration (1-2 days)
- `qa-harness/agent.js` — connect to local Qwen endpoint (OpenAI-compatible API)
- Implement the read → decide → act → verify loop
- Prompts in `qa-harness/prompts/`
- Test with a few manual games, verify the LLM makes legal moves and catches obvious bugs

### Phase 4: Bug Reporting + Logging (1 day)
- Structured bug reports to `qa-harness/bugs/`
- Game logs to `qa-harness/logs/`
- Deduplication by fingerprint
- Summary stats: games played, bugs found, bugs per game

### Phase 5: Run 24/7 (ongoing)
- Daemonize with pm2 or systemd
- Dashboard: total games, unique bugs found, last bug timestamp
- Periodic: review `bugs/` folder, triage, feed into BUG-TRACKER.md

---

## Model Strategy: Two Phases

### Phase A: Validation on Opus 4.6 (anthropic/claude-opus-4-6)
- Run 10-20 games through the harness
- **Goal:** Prove the harness works, not find bugs
- Opus is the control group — if it can't catch bugs, the harness is broken
- Known litmus tests from BUG-TRACKER.md:
  - A1: Neurotoxic vs Barrier → should catch Paralysis applied through Barrier
  - D1: Lure + Hidden → should catch untargetable Lure creature
  - E1: Dry drop keyword bypass → should catch Free Play still working after dry drop
- Review bug reports for quality, tune prompts if needed
- **Cost:** ~$2-5 for 10-20 games (one-time validation cost)

### Phase B: 24/7 on Local Qwen (ollama/qwen3.5-tuned)
- Switch endpoint once Opus validates the harness
- 122B MoE, 100+ tok/s, zero API cost
- Compare first 10 games against Opus quality — if Qwen misses bugs Opus caught, tune prompts
- If quality holds: leave it running indefinitely

### Config
```javascript
// qa-harness/config.js
export default {
  // Phase A: Validation
  // model: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-4-6' },

  // Phase B: Production (24/7)
  model: { baseUrl: 'http://localhost:11434/v1', model: 'qwen3.5-tuned' },
};
```

## Token Budget Considerations

Per game turn:
- State read: ~300-500 tokens
- Turn decision: ~100-200 tokens output
- Verification: ~200-400 tokens input, ~50-100 output
- **Total per action: ~700-1200 tokens**
- Average game: ~20-30 turns × 2 players = 40-60 actions
- **Per game: ~40K-70K tokens**

**Opus (Phase A):** ~$2-5 total for validation run
**Qwen (Phase B):** At 100 tok/s → ~7-12 minutes per game → ~100-200 games per day, 24/7, zero cost

100-200 free QA sessions per day. If it finds even 1 new bug per week, it's paid for itself.

---

## What Gets Stripped

From the existing codebase, the following become obsolete and should be removed in Phase 1 cleanup:

- `js/simulation/` — entire directory (SimulationHarness, BugDetector, invariantChecks, BugRegistry, GameDataCollector, AutoBugReporter, SimulationDatabase, effectValidators, stateSnapshot)
- `js/ai/AIGameManager.js` — AI vs AI orchestration (keep AI controller for single-player vs AI)
- `js/ai/SelfPlayTrainer.js` — self-play training
- `js/ui/overlays/SimulationDashboard.js` — simulation UI
- AI vs AI deck selection UI in `index.html`
- All Supabase bug sync code

The AI controller itself (`AIController.js`, `MoveGenerator.js`, `PlayEvaluator.js`, `CombatEvaluator.js`) stays — it's used for single-player "Play vs AI" mode. Just the automated simulation wrapper goes.

---

*Spec written 2026-03-23 by Brains 🧠*
*Target model: Qwen 3.5 tuned (local, 100+ tok/s, zero cost)*
*Goal: infinite free QA via an LLM that actually understands the game*
