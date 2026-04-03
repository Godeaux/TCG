#!/usr/bin/env node
/**
 * Headless LLM-vs-LLM Game Engine for Food Chain TCG
 *
 * Runs a complete game using the engine directly (no browser, no DOM).
 * Two LLM players (via Ollama) make all decisions.
 *
 * Usage: node e2e/headless/headlessGame.cjs [deck1] [deck2] [model]
 *   deck1/deck2: fish, bird, reptile, amphibian, mammal (default: fish vs bird)
 *   model: Ollama model name (default: qwen3.5:9b)
 */

const path = require('path');
const fs = require('fs');

// Crash handlers — capture diagnostics before dying
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED_REJECTION]', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err);
  process.exit(1);
});

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const LOG_DIR = path.resolve(__dirname, '../logs');
const RUN_DIR = path.resolve(__dirname, '.run');

// Ensure .run/ directory exists
fs.mkdirSync(RUN_DIR, { recursive: true });

/**
 * Atomically write live game state to .run/live.json
 */
function writeLive(data) {
  try {
    const tmpPath = path.join(RUN_DIR, 'live.json.tmp');
    const finalPath = path.join(RUN_DIR, 'live.json');
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, finalPath);
  } catch (e) {
    // Non-fatal — TUI is optional
  }
}

/**
 * Build live state snapshot for TUI consumption
 */
// Persistent state so it survives across writeLive calls
let _lastReasoning = null;
let _actionLog = []; // Rolling action log for dashboard
const ACTION_LOG_MAX = 15;

function pushActionLog(text, success) {
  _actionLog.push({ text, success });
  if (_actionLog.length > ACTION_LOG_MAX) _actionLog.shift();
}

function buildLiveState(gameState, deckNames, extra = {}) {
  /**
   * Generate a short effect summary for a creature's effects
   */
  const summarizeEffects = (card) => {
    if (!card?.effects) return null;
    const parts = [];
    const eff = card.effects;
    for (const [trigger, def] of Object.entries(eff)) {
      if (!def) continue;
      const trigLabel = {
        onPlay: 'Play', onConsume: 'Eat', onEnd: 'End', onStart: 'Start',
        onSlain: 'Slain', onBeforeCombat: 'Pre-combat', onAfterCombat: 'Post-combat',
        onDefend: 'Defend', discardEffect: 'Discard', effect: 'Cast',
      }[trigger] || trigger;

      // Handle arrays of effects
      const defs = Array.isArray(def) ? def : [def];
      for (const d of defs) {
        const t = d.type || '';
        const p = d.params || {};
        if (t === 'damageRival') parts.push(`${trigLabel}: ${p.amount} dmg rival`);
        else if (t === 'damageAllEnemyCreatures') parts.push(`${trigLabel}: ${p.amount} dmg all enemies`);
        else if (t === 'heal') parts.push(`${trigLabel}: heal ${p.amount}`);
        else if (t === 'draw') parts.push(`${trigLabel}: draw ${p.count}`);
        else if (t === 'summonTokens') parts.push(`${trigLabel}: summon ${p.tokenIds?.length || '?'}`);
        else if (t === 'buffStats') parts.push(`${trigLabel}: buff +${p.stats?.attack || '?'}/+${p.stats?.health || '?'}`);
        else if (t === 'selectFromGroup' && p.effect?.kill) {
          const tg = p.targetGroup || '';
          const scope = tg.includes('prey') ? 'enemy prey' : tg.includes('friendly') ? 'friendly' : 'enemy';
          parts.push(`${trigLabel}: kill ${scope}`);
        }
        else if (t === 'selectFromGroup' && p.effect?.damage) {
          const tg = p.targetGroup || '';
          const scope = tg.includes('prey') ? 'enemy prey' : tg.includes('friendly') ? 'friendly' : 'enemy';
          parts.push(`${trigLabel}: ${p.effect.damage} dmg ${scope}`);
        }
        else if (t === 'selectFromGroup' && p.effect?.keyword) {
          const tg = p.targetGroup || '';
          const scope = tg.includes('friendly') ? 'friendly' : 'enemy';
          parts.push(`${trigLabel}: ${p.effect.keyword} ${scope}`);
        }
        else if (t === 'selectFromGroup') {
          const tg = p.targetGroup || '';
          const scope = tg.includes('prey') ? 'enemy prey' : tg.includes('friendly') ? 'friendly' : 'target';
          parts.push(`${trigLabel}: choose ${scope}`);
        }
        else if (t === 'addToHand') parts.push(`${trigLabel}: add card`);
        else if (t === 'tutorFromDeck') parts.push(`${trigLabel}: tutor`);
        else if (t === 'forceOpponentDiscard') parts.push(`${trigLabel}: force discard`);
        else if (t === 'copyStats') parts.push(`${trigLabel}: copy stats`);
        else if (t === 'damageCreature') parts.push(`${trigLabel}: ${p.amount} dmg creature`);
        else if (t === 'damageEnemiesAfterCombat') parts.push(`${trigLabel}: ${p.damage || '?'} dmg all enemies`);
        else if (t === 'regenOtherCreatures') parts.push(`${trigLabel}: regen allies`);
        else if (t === 'damageBothPlayers') parts.push(`${trigLabel}: ${p.amount || '?'} dmg both players`);
        else if (t === 'damageAllCreatures') parts.push(`${trigLabel}: ${p.amount || '?'} dmg all creatures`);
        else if (t === 'freezeAllCreatures') parts.push(`${trigLabel}: freeze all`);
        else if (t === 'returnAllEnemies') parts.push(`${trigLabel}: bounce all enemies`);
        else if (t === 'killAll') parts.push(`${trigLabel}: kill all enemies`);
        else if (t) parts.push(`${trigLabel}: ${t}`);
      }
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  /**
   * Build status emoji string for a creature
   */
  const getStatusEmojis = (card, turn) => {
    if (!card) return '';
    const emojis = [];
    if (card.hasBarrier) emojis.push('🛡️');
    if (card.frozen) emojis.push('❄️');
    if (card.isParalyzed) emojis.push('⚡');
    if (card.dryDropped) emojis.push('🍂');
    const hasSummoningSick = card.summonedTurn >= turn && !card.keywords?.includes('Haste');
    if (hasSummoningSick) emojis.push('💤');
    if (card.keywords?.includes('Haste')) emojis.push('🏃');
    if (card.keywords?.includes('Hidden')) emojis.push('👻');
    if (card.keywords?.includes('Invisible')) emojis.push('🫥');
    if (card.keywords?.includes('Lure')) emojis.push('🎯');
    if (card.keywords?.includes('Ambush')) emojis.push('🗡️');
    if (card.keywords?.includes('Immune')) emojis.push('✨');
    if (card.keywords?.includes('Passive')) emojis.push('😴');
    if (card.keywords?.includes('Toxic')) emojis.push('☠️');
    if (card.keywords?.includes('Neurotoxic')) emojis.push('🧪');
    if (card.keywords?.includes('Poisonous')) emojis.push('🐍');
    return emojis.join('');
  };

  const formatFieldCard = (card) => {
    if (!card) return null;
    const stats = `${card.currentAtk ?? card.atk}/${card.currentHp ?? card.hp}`;
    const nutr = card.nutrition ? ` (${card.nutrition})` : '';
    return `${card.name} ${stats}${nutr}`;
  };

  const formatFieldCardRich = (card, turn) => {
    if (!card) return null;
    return {
      name: card.name,
      type: card.type,
      atk: card.currentAtk ?? card.atk,
      hp: card.currentHp ?? card.hp,
      nutrition: card.nutrition || null,
      status: getStatusEmojis(card, turn),
      effect: summarizeEffects(card),
      keywords: (card.keywords || []).filter(k => k), // clean nulls
    };
  };

  const formatHandCard = (card, index) => {
    if (!card) return null;
    return {
      index,
      name: card.name,
      type: card.type,
      atk: card.atk,
      hp: card.hp,
      nutrition: card.nutrition || null,
      keywords: (card.keywords || []).filter(k => k),
    };
  };

  // Update persistent state when provided
  if (extra.lastReasoning !== undefined) _lastReasoning = extra.lastReasoning;
  // actionLog is pushed externally via pushActionLog(), not through extra

  const turn = gameState.turn;
  return {
    turn,
    phase: gameState.phase,
    activePlayer: gameState.activePlayerIndex,
    deck1: deckNames[0],
    deck2: deckNames[1],
    hp: [gameState.players[0].hp, gameState.players[1].hp],
    field: {
      p1: gameState.players[0].field.map(formatFieldCard),
      p2: gameState.players[1].field.map(formatFieldCard),
    },
    fieldRich: {
      p1: gameState.players[0].field.map(c => formatFieldCardRich(c, turn)),
      p2: gameState.players[1].field.map(c => formatFieldCardRich(c, turn)),
    },
    hands: [gameState.players[0].hand.length, gameState.players[1].hand.length],
    handCards: {
      p1: gameState.players[0].hand.map((c, i) => formatHandCard(c, i)),
      p2: gameState.players[1].hand.map((c, i) => formatHandCard(c, i)),
    },
    decks: [gameState.players[0].deck.length, gameState.players[1].deck.length],
    thinking: extra.thinking || null,
    lastReasoning: extra.lastReasoning !== undefined ? extra.lastReasoning : _lastReasoning,
    actionLog: _actionLog.slice(), // copy
    updatedAt: Date.now(),
  };
}

// ============================================================================
// ESM LOADER — dynamic import() for ES module game engine
// ============================================================================

let engine = null;

async function loadEngine() {
  const [
    gameIndex,
    stateModule,
    actionsModule,
    uiStateModule,
    cardTypesModule,
    keywordsModule,
    cardsIndex,
    selectorsModule,
    combatModule,
  ] = await Promise.all([
    import(path.join(PROJECT_ROOT, 'js/game/index.js')),
    import(path.join(PROJECT_ROOT, 'js/state/gameState.js')),
    import(path.join(PROJECT_ROOT, 'js/state/actions.js')),
    import(path.join(PROJECT_ROOT, 'js/state/uiState.js')),
    import(path.join(PROJECT_ROOT, 'js/cardTypes.js')),
    import(path.join(PROJECT_ROOT, 'js/keywords.js')),
    import(path.join(PROJECT_ROOT, 'js/cards/index.js')),
    import(path.join(PROJECT_ROOT, 'js/state/selectors.js')),
    import(path.join(PROJECT_ROOT, 'js/game/combat.js')),
  ]);

  engine = {
    GameController: gameIndex.GameController,
    createGameState: stateModule.createGameState,
    setPlayerDeck: stateModule.setPlayerDeck,
    drawCard: stateModule.drawCard,
    chooseFirstPlayer: stateModule.chooseFirstPlayer,
    initializeGameRandom: stateModule.initializeGameRandom,
    logMessage: stateModule.logMessage,
    createUIState: uiStateModule.createUIState,
    ActionTypes: actionsModule.ActionTypes,
    actions: actionsModule,
    createCardInstance: cardTypesModule.createCardInstance,
    isCreatureCard: cardTypesModule.isCreatureCard,
    keywords: keywordsModule,
    initializeCardRegistry: cardsIndex.initializeCardRegistry,
    getStarterDeck: cardsIndex.getStarterDeck,
    getDeckCategories: cardsIndex.getDeckCategories,
    selectors: selectorsModule,
    getValidTargets: combatModule.getValidTargets,
  };

  // Initialize card registry (must happen before any card lookups)
  engine.initializeCardRegistry();

  return engine;
}

// ============================================================================
// LLM INTEGRATION — reuse existing llmBrain + stateFormatter
// ============================================================================

const { getDecision, getDecisionStreaming } = require('../pvp/llmBrain.cjs');
const { formatStatePrompt, parseAction, parseAllAttacks } = require('../pvp/stateFormatter.cjs');

const OLLAMA_CHAT_URL = 'http://localhost:11434/api/chat';

/**
 * Call Ollama directly for non-game prompts (reflection, analysis)
 */
async function callOllama(prompt, model, { numPredict = 2000, temperature = 0.3 } = {}) {
  const isChatModel = [
    'qwen3.5:9b',
    'qwen3.5:2b',
    'qwen3.5:latest',
    'qwen3.5:122b-a10b',
    'qwen3.5-tuned:latest',
  ].some((m) => model.includes(m));

  const body = isChatModel
    ? {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        think: false,
        options: { temperature, num_predict: numPredict },
      }
    : {
        model,
        prompt,
        stream: false,
        options: { temperature, num_predict: numPredict },
      };

  const endpoint = isChatModel ? 'chat' : 'generate';
  const resp = await fetch(`http://localhost:11434/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return isChatModel ? data.message?.content || '' : data.response || '';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Execute an action and resolve any pending selections
 */
async function executeAndResolve(controller, action, state, playerIndex, deckName, model) {
  const result = controller.execute(action);
  
  // Resolve any pending selections (including selectFromGroup effects)
  while (_pendingSelection) {
    const sel = _pendingSelection;
    _pendingSelection = null;
    await resolveSelection(sel, state, playerIndex, deckName, model);
  }
  
  return result;
}

/**
 * Build a post-game reflection prompt from the game log.
 * The LLM reviews the full game for bugs, anomalies, and strategic observations.
 */
function buildPostGameReflection(gameLog, deckNames, result) {
  const lines = [];
  lines.push(
    'You just observed a complete game of Food Chain TCG. Review it for bugs and anomalies.'
  );
  lines.push(`Decks: P1=${deckNames[0]} vs P2=${deckNames[1]}`);
  lines.push(
    `Result: P${(result.winner ?? -1) + 1} wins | HP: ${result.finalHP[0]}/${result.finalHP[1]} | ${result.totalTurns} turns`
  );
  lines.push('');
  lines.push('FULL GAME LOG:');

  for (const turn of gameLog.turns || []) {
    lines.push(`\n--- Turn ${turn.turn} (P${turn.player + 1}) ---`);
    for (const a of turn.actions || []) {
      const act = a.action || {};
      const res = a.result || {};
      const ok = res.success !== false;
      const desc = res.description || JSON.stringify(act).substring(0, 80);
      lines.push(`  ${ok ? '✅' : '❌'} ${act.type}: ${desc}`);
      if (a.reasoning) lines.push(`     💭 ${a.reasoning.substring(0, 120)}`);
      if (!ok && res.error) lines.push(`     ⚠️ ${res.error}`);
    }
  }

  lines.push('\n\nANALYSIS REQUESTED:');
  lines.push(
    '1. BUGS: Did any card effects fail to proc, proc incorrectly, or cause errors? List each with the turn number and what went wrong.'
  );
  lines.push(
    "2. RULE VIOLATIONS: Did any action succeed that shouldn't have (e.g., attacking with summoning sickness, playing cards in wrong phase)? Or fail when it should have succeeded?"
  );
  lines.push(
    "3. ANOMALIES: Any suspicious HP changes, missing death triggers, incorrect stat calculations, or effects that didn't match the card text?"
  );
  lines.push(
    '4. STRATEGIC NOTES: Any obviously wrong decisions that suggest the game state was misleading?'
  );
  lines.push(
    '\nBe concise. Only report actual issues, not things that worked correctly. If everything looked clean, say "No issues found."'
  );

  return lines.join('\n');
}

/**
 * Build a QA-style state object from raw game state for the stateFormatter.
 * The formatter expects the structure that __qa.getState() provides in the browser.
 */
function buildQAState(state, playerIndex) {
  const me = state.players[playerIndex];
  const opp = state.players[1 - playerIndex];

  const mapFieldCard = (card, slotIndex, isMyField, myPlayerIndex) => {
    if (!card) return null;
    const canAttackCreatures =
      state.phase === 'Combat' &&
      state.activePlayerIndex === myPlayerIndex &&
      isMyField &&
      !card.hasAttacked &&
      !(card.attacksMadeThisTurn >= (card.multiStrike || 1)) &&
      !engine.keywords.cantAttack(card);

    const canAttackPlayer =
      canAttackCreatures && (card.summonedTurn < state.turn || engine.keywords.hasHaste(card));

    return {
      name: card.name,
      type: card.type,
      atk: card.atk,
      hp: card.hp,
      currentAtk: card.currentAtk ?? card.atk,
      currentHp: card.currentHp ?? card.hp,
      nutrition: card.nutrition || 0,
      keywords: card.keywords || [],
      effectText: card.effectText || '',
      instanceId: card.instanceId,
      slot: slotIndex,
      canAttack: canAttackCreatures,
      canAttackPlayer: canAttackPlayer,
      hasBarrier: card.hasBarrier || false,
      isFrozen: card.frozen || false,
      isParalyzed: card.paralyzed || false,
      isDryDropped: card.dryDropped || false,
    };
  };

  const myField = me.field.map((c, i) => mapFieldCard(c, i, true, playerIndex));
  const oppField = opp.field.map((c, i) => mapFieldCard(c, i, false, playerIndex));

  // Build pending context
  let pendingContext = null;

  if (state.pendingReaction && state.pendingReaction.reactingPlayerIndex === playerIndex) {
    pendingContext = {
      type: 'pending_reaction',
      reactions: state.pendingReaction.reactions.map((r, i) => ({
        name: r.card?.name || r.name || 'Trap',
        triggerType: r.triggerType || 'unknown',
        index: i,
      })),
    };
  }

  // pendingConsumption from uiState is handled separately

  return {
    phase: state.phase,
    turn: state.turn,
    activePlayer: state.activePlayerIndex,
    localPlayer: playerIndex,
    players: [
      {
        // "me" is always players[0] in QA state
        hp: me.hp,
        deckSize: me.deck.length,
        hand: me.hand.map((c) => ({
          name: c.name,
          type: c.type,
          atk: c.atk,
          hp: c.hp,
          currentAtk: c.currentAtk ?? c.atk,
          currentHp: c.currentHp ?? c.hp,
          nutrition: c.nutrition || 0,
          keywords: c.keywords || [],
          effectText: c.effectText || '',
          instanceId: c.instanceId,
        })),
        field: myField,
        carrion: me.carrion.map((c) => c.name),
        exile: me.exile.map((c) => c.name),
      },
      {
        // "opponent" is always players[1] in QA state
        hp: opp.hp,
        deckSize: opp.deck.length,
        handSize: opp.hand.length,
        field: oppField,
        carrion: opp.carrion.map((c) => c.name),
        exile: opp.exile.map((c) => c.name),
      },
    ],
    pendingContext,
    ui: {
      isMyTurn: state.activePlayerIndex === playerIndex,
      cardPlayedThisTurn: state.cardPlayedThisTurn || false,
    },
  };
}

// ============================================================================
// SELECTION HANDLER — handles onSelectionNeeded callbacks
// ============================================================================

let _pendingSelection = null;

function createSelectionHandler() {
  return {
    onSelectionNeeded: (selectionData) => {
      // Store the pending selection — the game loop will resolve it
      _pendingSelection = selectionData;
    },
    getPending: () => _pendingSelection,
    clear: () => {
      _pendingSelection = null;
    },
  };
}

/**
 * Ask LLM to pick from selection options
 */
async function askLLMForSelection(title, options, gameContext, model) {
  const optionList = options.map((o, i) => `  [${i}] ${o}`).join('\n');
  const prompt = `You are playing Food Chain TCG. A choice appeared.

${gameContext}

CHOICE: "${title}"
Options:
${optionList}

Think briefly (1 sentence), then reply with ONLY the number on the last line.`;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 90_000);
    const response = await fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'qwen3.5:9b',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        keep_alive: '30m',
        think: false,
        options: { temperature: 0.3, num_predict: 80 },
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    const data = await response.json();
    const text = data.message?.content?.trim() || '0';
    const match = text.match(/(\d+)\s*$/);
    const chosen = match ? parseInt(match[1]) : 0;
    return Math.min(Math.max(chosen, 0), options.length - 1);
  } catch (e) {
    const isTimeout = e.name === 'AbortError';
    console.error(`  [SELECTION_${isTimeout ? 'TIMEOUT' : 'ERROR'}] ${e.message}, defaulting to 0`);
    return 0;
  }
}

/**
 * Resolve a pending selection using the LLM
 */
async function resolveSelection(selectionData, state, playerIndex, deckName, model) {
  const qaState = buildQAState(state, playerIndex);
  const stateStr = `HP: You ${qaState.players[0].hp} | Rival ${qaState.players[1].hp}`;

  if (selectionData.selectTarget) {
    const { selectTarget, onSelect, onCancel } = selectionData;
    const candidates =
      typeof selectTarget.candidates === 'function'
        ? selectTarget.candidates()
        : selectTarget.candidates;

    if (!candidates || candidates.length === 0) {
      onCancel?.();
      return;
    }

    const optionNames = candidates.map((c) => {
      const val = c.value !== undefined ? c.value : c;
      if (val?.creature)
        return `${val.creature.name} ${val.creature.currentAtk}/${val.creature.currentHp}`;
      if (val?.card)
        return `${val.card.name} ${val.card.currentAtk ?? val.card.atk}/${val.card.currentHp ?? val.card.hp}`;
      if (val?.name) return val.name;
      if (val?.type === 'player') return `Player ${(val.playerIndex ?? 0) + 1}`;
      return String(val);
    });

    const chosenIdx = await askLLMForSelection(
      selectTarget.title || 'Choose target',
      optionNames,
      stateStr,
      model
    );

    const chosen = candidates[chosenIdx];
    const value = chosen?.value !== undefined ? chosen.value : chosen;
    onSelect(value);
    return;
  }

  if (selectionData.selectOption) {
    const { selectOption, onSelect, onCancel } = selectionData;
    const options = selectOption.options || [];

    if (options.length === 0) {
      onCancel?.();
      return;
    }

    const optionLabels = options.map((o) => o.label || String(o));
    const chosenIdx = await askLLMForSelection(
      selectOption.title || 'Choose option',
      optionLabels,
      stateStr,
      model
    );

    onSelect(options[chosenIdx]);
    return;
  }
}

// ============================================================================
// GAME STATE DIFFING
// ============================================================================

function snapshotState(state) {
  return {
    p1hp: state.players[0].hp,
    p2hp: state.players[1].hp,
    p1hand: state.players[0].hand.length,
    p2hand: state.players[1].hand.length,
    p1deck: state.players[0].deck.length,
    p2deck: state.players[1].deck.length,
    p1field: state.players[0].field.map((c) =>
      c ? `${c.name} ${c.currentAtk}/${c.currentHp}` : null
    ),
    p2field: state.players[1].field.map((c) =>
      c ? `${c.name} ${c.currentAtk}/${c.currentHp}` : null
    ),
    phase: state.phase,
    turn: state.turn,
    activePlayer: state.activePlayerIndex,
  };
}

function diffState(before, after) {
  const changes = {};
  for (const key of Object.keys(after)) {
    const b = JSON.stringify(before[key]);
    const a = JSON.stringify(after[key]);
    if (b !== a) changes[key] = { from: before[key], to: after[key] };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// ============================================================================
// VICTORY CHECK
// ============================================================================

function checkVictory(state) {
  const p1hp = state.players[0].hp;
  const p2hp = state.players[1].hp;
  if (p1hp <= 0 && p2hp <= 0) return { winner: -1, reason: 'draw' };
  if (p1hp <= 0) return { winner: 1, reason: 'hp' };
  if (p2hp <= 0) return { winner: 0, reason: 'hp' };
  return null;
}

// ============================================================================
// ACTION EXECUTION — translates LLM actions into controller.execute() calls
// ============================================================================

async function executeLLMAction(controller, state, uiState, action, playerIndex, model) {
  const me = state.players[playerIndex];
  const opp = state.players[1 - playerIndex];

  // Phase validation
  if (action.type === 'play' && state.phase !== 'Main 1' && state.phase !== 'Main 2') {
    return { success: false, error: 'Wrong phase' };
  }
  if (action.type === 'attack' && state.phase !== 'Combat') {
    return { success: false, error: 'Wrong phase' };
  }

  switch (action.type) {
    case 'play': {
      const card = me.hand[action.handIndex];
      if (!card) return { success: false, error: `No card at hand index ${action.handIndex}` };

      // Pre-validate: traps can't be played manually
      if (card.type === 'Trap') {
        return { success: false, error: 'Traps trigger automatically from hand' };
      }

      // Pre-validate: field full (unless spell)
      if (
        card.type !== 'Spell' &&
        card.type !== 'Free Spell' &&
        me.field.filter((c) => c !== null).length >= 3
      ) {
        // Exception: predator can eat to free a slot
        if (card.type === 'Predator' && action.eat && action.eat.length > 0) {
          // Allow — consumption will free slots
        } else {
          return { success: false, error: 'Field full' };
        }
      }

      // Handle predator consumption via eat targets
      let consumeTarget = null;
      let options = {};

      if (action.eat && action.eat.length > 0 && card.type === 'Predator') {
        // We need to handle consumption: play the card, then handle pendingConsumption
        const result = controller.execute({
          type: engine.ActionTypes.PLAY_CARD,
          payload: { card, slotIndex: null, options: {} },
        });

        if (result.needsSelection && uiState.pendingConsumption) {
          // Select the eat targets
          const pc = uiState.pendingConsumption;
          const preyToEat = action.eat
            .map((slotIdx) => me.field[slotIdx])
            .filter((c) => c !== null);

          // Also check carrion for scavenge
          controller.execute({
            type: engine.ActionTypes.SELECT_CONSUMPTION_TARGETS,
            payload: { predator: card, prey: preyToEat, carrion: [] },
          });

          // Resolve any pending selection that fired from effects
          while (_pendingSelection) {
            const sel = _pendingSelection;
            _pendingSelection = null;
            await resolveSelection(sel, state, playerIndex, '', model);
          }

          return {
            success: true,
            description: `Play ${card.name} eating ${preyToEat.map((p) => p.name).join(', ')}`,
          };
        }

        // Resolve any pending selection
        while (_pendingSelection) {
          const sel = _pendingSelection;
          _pendingSelection = null;
          await resolveSelection(sel, state, playerIndex, '', model);
        }

        return { success: result.success, description: `Play ${card.name}`, error: result.error };
      }

      if (action.dryDrop && card.type === 'Predator') {
        // Play predator, then dry drop
        const result = controller.execute({
          type: engine.ActionTypes.PLAY_CARD,
          payload: { card, slotIndex: null, options: {} },
        });

        if (result.needsSelection && uiState.pendingConsumption) {
          controller.execute({
            type: engine.ActionTypes.DRY_DROP,
            payload: { predator: card, slotIndex: null },
          });

          while (_pendingSelection) {
            const sel = _pendingSelection;
            _pendingSelection = null;
            await resolveSelection(sel, state, playerIndex, '', model);
          }

          return { success: true, description: `Play ${card.name} (dry drop)` };
        }

        while (_pendingSelection) {
          const sel = _pendingSelection;
          _pendingSelection = null;
          await resolveSelection(sel, state, playerIndex, '', model);
        }

        return { success: result.success, description: `Play ${card.name}`, error: result.error };
      }

      // Regular play (prey, spell, etc.)
      const result = controller.execute({
        type: engine.ActionTypes.PLAY_CARD,
        payload: { card, slotIndex: null, options: {} },
      });

      // If predator needs consumption and LLM didn't specify, auto-handle
      let autoAteNames = null;
      if (result.needsSelection && uiState.pendingConsumption) {
        const pc = uiState.pendingConsumption;
        if (pc.availablePrey.length > 0) {
          // Auto-eat first prey
          autoAteNames = [pc.availablePrey[0].name];
          controller.execute({
            type: engine.ActionTypes.SELECT_CONSUMPTION_TARGETS,
            payload: { predator: card, prey: [pc.availablePrey[0]], carrion: [] },
          });
        } else {
          // Dry drop
          controller.execute({
            type: engine.ActionTypes.DRY_DROP,
            payload: { predator: card, slotIndex: null },
          });
        }
      }

      // Resolve any pending selections (spell targets, onPlay effects, etc.)
      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, state, playerIndex, '', model);
      }

      const playDesc = autoAteNames
        ? `Play ${card.name} eating ${autoAteNames.join(', ')}`
        : `Play ${card.name}`;
      return { success: result.success, description: playDesc, error: result.error };
    }

    case 'attack': {
      const attacker = me.field[action.attackerSlot];
      if (!attacker) return { success: false, error: `No creature at slot ${action.attackerSlot}` };

      // Check if creature already attacked this turn
      const maxStrikes = attacker.multiStrike || 1;
      if (attacker.attacksMadeThisTurn >= maxStrikes) {
        return { success: false, error: `${attacker.name} already attacked this turn` };
      }

      // Use the engine's canonical targeting validation (handles Hidden, Invisible, Lure, Acuity, summoning sickness)
      const validTargets = engine.getValidTargets(state, attacker, opp);

      let target;
      if (action.target === 'player') {
        if (!validTargets.player) {
          return { success: false, error: `${attacker.name} has summoning sickness` };
        }
        // If Lure creatures exist, must target them instead of player
        if (validTargets.creatures.length > 0 && !validTargets.player) {
          return { success: false, error: `Must target Lure creature` };
        }
        target = { type: 'player', player: opp };
      } else {
        const defender = opp.field[action.target];
        if (!defender)
          return { success: false, error: `No creature at enemy slot ${action.target}` };
        // Check if this specific creature is a valid target
        if (!validTargets.creatures.some((c) => c.instanceId === defender.instanceId)) {
          return { success: false, error: `${defender.name} cannot be targeted (Hidden/Invisible)` };
        }
        target = { type: 'creature', card: defender };
      }

      // Capture target name BEFORE attack resolves (defender may die)
      const targetName =
        action.target === 'player' ? 'Player' : opp.field[action.target]?.name || '?';

      const result = controller.execute({
        type: engine.ActionTypes.RESOLVE_ATTACK,
        payload: { attacker, target },
      });

      // Resolve any pending selections (beforeCombat effects, etc.)
      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, state, playerIndex, '', model);
      }
      return {
        success: result.success,
        description: `${attacker.name} attacks ${targetName}`,
        error: result.error,
      };
    }

    case 'advance': {
      const phaseBefore = state.phase;
      const result = controller.execute({
        type: engine.ActionTypes.ADVANCE_PHASE,
        payload: {},
      });

      // Don't process End phase here — the structured turn loop handles it.
      // Just resolve any immediate selections from the advance itself.
      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, state, playerIndex, '', model);
      }

      return { success: true, description: `${phaseBefore} → ${state.phase}` };
    }

    case 'endTurn': {
      // Just dispatch END_TURN — the structured turn loop handles End phase processing.
      controller.execute({
        type: engine.ActionTypes.END_TURN,
        payload: {},
      });

      // Resolve any immediate selections from the END_TURN dispatch itself.
      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, state, playerIndex, '', model);
      }

      return { success: true, description: 'End turn' };
    }

    case 'eat': {
      // Standalone eat (for pending consumption)
      if (!uiState.pendingConsumption) return { success: false, error: 'No pending consumption' };
      const pc = uiState.pendingConsumption;
      const targets = (action.targets || [0]).map((i) => pc.availablePrey[i]).filter(Boolean);

      controller.execute({
        type: engine.ActionTypes.SELECT_CONSUMPTION_TARGETS,
        payload: { predator: pc.predator, prey: targets, carrion: [] },
      });

      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, state, playerIndex, '', model);
      }

      return { success: true, description: `Ate ${targets.map((t) => t.name).join(', ')}` };
    }

    case 'dryDrop': {
      if (!uiState.pendingConsumption) return { success: false, error: 'No pending consumption' };
      const pc = uiState.pendingConsumption;

      controller.execute({
        type: engine.ActionTypes.DRY_DROP,
        payload: { predator: pc.predator, slotIndex: null },
      });

      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, state, playerIndex, '', model);
      }

      return { success: true, description: 'Dry drop' };
    }

    case 'activate': {
      // Activate trap
      controller.execute({
        type: engine.ActionTypes.RESOLVE_PLAY_TRAP,
        payload: { activated: true, reactionIndex: action.index || 0 },
      });

      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, state, playerIndex, '', model);
      }

      return { success: true, description: `Activated trap #${action.index || 0}` };
    }

    case 'pass': {
      // Pass on trap or skip turn
      if (state.pendingReaction) {
        controller.execute({
          type: engine.ActionTypes.RESOLVE_PLAY_TRAP,
          payload: { activated: false },
        });
        return { success: true, description: 'Passed on trap' };
      }
      // During main phase: advance
      const result = controller.execute({
        type: engine.ActionTypes.ADVANCE_PHASE,
        payload: {},
      });
      return { success: true, description: 'Passed (advanced phase)' };
    }

    default:
      return { success: false, error: `Unknown action type: ${action.type}` };
  }
}

// ============================================================================
// TRAP REACTION HANDLING
// ============================================================================

async function handlePendingReaction(controller, state, model, deckNames) {
  if (!state.pendingReaction) return false;

  const reactingIdx = state.pendingReaction.reactingPlayerIndex;
  const reactions = state.pendingReaction.reactions || [];

  console.log(`  [TRAP] Player ${reactingIdx + 1} has ${reactions.length} trap(s) available`);

  // Build QA state for the reacting player
  const qaState = buildQAState(state, reactingIdx);
  qaState.pendingContext = {
    type: 'pending_reaction',
    reactions: reactions.map((r, i) => ({
      name: r.card?.name || r.name || 'Trap',
      triggerType: r.triggerType || 'unknown',
      index: i,
    })),
  };

  // Ask the reacting player's LLM
  const decision = await getDecision(qaState, reactingIdx, deckNames[reactingIdx], { model });
  console.log(`  [TRAP] P${reactingIdx + 1} decides: ${JSON.stringify(decision.action)}`);

  if (decision.action.type === 'activate') {
    controller.execute({
      type: engine.ActionTypes.RESOLVE_PLAY_TRAP,
      payload: { activated: true, reactionIndex: decision.action.index || 0 },
    });
  } else {
    controller.execute({
      type: engine.ActionTypes.RESOLVE_PLAY_TRAP,
      payload: { activated: false },
    });
  }

  // Resolve any selection from trap effects
  while (_pendingSelection) {
    const sel = _pendingSelection;
    _pendingSelection = null;
    await resolveSelection(sel, state, reactingIdx, '', model);
  }

  return true;
}

// ============================================================================
// MAIN GAME LOOP
// ============================================================================

async function runGame(deck1Name, deck2Name, modelName, { streaming = false } = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Food Chain TCG — Headless LLM Game`);
  console.log(`P1: ${deck1Name} | P2: ${deck2Name} | Model: ${modelName}`);
  console.log(`${'='.repeat(60)}\n`);

  await loadEngine();

  const deckNames = [deck1Name, deck2Name];

  // Create game state
  const gameState = engine.createGameState();
  const uiState = engine.createUIState();

  // Initialize PRNG
  const seed = Date.now();
  engine.initializeGameRandom(seed);

  // Build 20-card decks per CORE-RULES.md §1 (singleton, 20 cards)
  // Ratio matches the game's built-in random deck builder:
  // 7 Prey / 6 Predator / 4 Spell / 2 Free Spell / 1 Trap = 20
  const buildDeck20 = (catalog) => {
    const byType = {};
    for (const card of catalog) {
      const t = card.type || '?';
      if (!byType[t]) byType[t] = [];
      byType[t].push(card);
    }
    // Shuffle each pool
    const shuffleArr = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const take = (pool, n) => shuffleArr(pool || []).slice(0, n);
    return [
      ...take(byType['Prey'], 7),
      ...take(byType['Predator'], 6),
      ...take(byType['Spell'], 4),
      ...take(byType['Free Spell'], 2),
      ...take(byType['Trap'], 1),
    ];
  };

  const catalog1 = engine.getStarterDeck(deck1Name);
  const catalog2 = engine.getStarterDeck(deck2Name);

  if (catalog1.length === 0 || catalog2.length === 0) {
    console.error(`Invalid deck names. Available: ${engine.getDeckCategories().join(', ')}`);
    process.exit(1);
  }

  const deck1 = buildDeck20(catalog1);
  const deck2 = buildDeck20(catalog2);

  engine.setPlayerDeck(gameState, 0, deck1);
  engine.setPlayerDeck(gameState, 1, deck2);
  gameState.players[0].name = `P1 (${deck1Name})`;
  gameState.players[1].name = `P2 (${deck2Name})`;

  // Simulate coin flip — random first player
  const firstPlayer = Math.random() < 0.5 ? 0 : 1;
  engine.chooseFirstPlayer(gameState, firstPlayer);
  console.log(`Coin flip: Player ${firstPlayer + 1} goes first\n`);

  // Set up selection handler
  const selHandler = createSelectionHandler();

  // Create controller
  const controller = new engine.GameController(gameState, uiState, {
    onStateChange: () => {},
    onBroadcast: () => {},
    onSelectionNeeded: selHandler.onSelectionNeeded,
    onSelectionComplete: () => {},
  });

  // Draw opening hands (5 cards each per CORE-RULES.md §1)
  for (let i = 0; i < 5; i++) {
    engine.drawCard(gameState, 0);
    engine.drawCard(gameState, 1);
  }

  // Write initial live state
  // Reset persistent live state for new game
  _lastReasoning = null;
  _actionLog = [];
  writeLive(buildLiveState(gameState, deckNames, { thinking: 'Game starting...' }));

  // Advance to first player's Main 1 phase
  // The first advance goes Start → Draw → Main 1 (auto-advancing)
  controller.execute({ type: engine.ActionTypes.ADVANCE_PHASE, payload: {} });

  // Game log
  const gameLog = {
    seed,
    deck1: deck1Name,
    deck2: deck2Name,
    model: modelName,
    firstPlayer,
    startTime: new Date().toISOString(),
    turns: [],
    result: null,
  };

  // Main game loop
  const MAX_TURNS = 80;
  const MAX_ACTIONS_PER_TURN = 30;
  let totalActions = 0;
  let consecutiveErrors = 0;

  let lastProcessedTurn = -1;
  while (!checkVictory(gameState) && gameState.turn <= MAX_TURNS) {
    const currentTurn = gameState.turn;
    const activeIdx = gameState.activePlayerIndex;

    // Guard: never process the same turn twice (prevents loop re-entry)
    if (currentTurn === lastProcessedTurn) {
      // This should never happen if the structured turn loop works correctly.
      // Safety: force advance and log a warning.
      console.warn(`  ⚠️ Guard fired: turn ${currentTurn} already processed, forcing advance`);
      controller.execute({ type: engine.ActionTypes.ADVANCE_PHASE, payload: {} });
      // If stuck in End phase, process remaining effects
      if (gameState.phase === 'End' && (gameState.endOfTurnQueue.length > 0 || gameState.endOfTurnProcessing)) {
        controller.execute({ type: engine.ActionTypes.PROCESS_END_PHASE, payload: {} });
        while (_pendingSelection) {
          const sel = _pendingSelection;
          _pendingSelection = null;
          await resolveSelection(sel, gameState, activeIdx, deckNames[activeIdx], modelName);
        }
      }
      continue;
    }
    lastProcessedTurn = currentTurn;

    console.log(
      `\n--- Turn ${currentTurn} | Player ${activeIdx + 1} (${deckNames[activeIdx]}) | Phase: ${gameState.phase} ---`
    );
    console.log(`  HP: P1=${gameState.players[0].hp} P2=${gameState.players[1].hp}`);
    console.log(
      `  Hands: P1=${gameState.players[0].hand.length} P2=${gameState.players[1].hand.length}`
    );

    const turnLog = {
      turn: currentTurn,
      player: activeIdx,
      actions: [],
    };

    let actionsThisTurn = 0;

    // ========================================================================
    // STRUCTURED TURN LOOP — follows the actual phase order:
    //   Start → Draw → Main 1 → Combat → Main 2 → End
    // Each phase is handled explicitly. No blind advance-and-hope.
    // ========================================================================

    // Helper: resolve any pending UI (traps, selections, consumption)
    const resolvePending = async () => {
      while (gameState.pendingReaction) {
        await handlePendingReaction(controller, gameState, modelName, deckNames);
        if (checkVictory(gameState)) return;
      }
      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, gameState, activeIdx, deckNames[activeIdx], modelName);
      }
      if (uiState.pendingConsumption) {
        const pc = uiState.pendingConsumption;
        const qaState = buildQAState(gameState, activeIdx);
        qaState.pendingContext = {
          type: 'pending_consumption',
          predator: pc.predator.name,
          options: pc.availablePrey.map((p) => ({
            name: p.name,
            source: 'field',
            nutrition: p.nutrition || 1,
            instanceId: p.instanceId,
          })),
          canDryDrop: true,
        };
        const decision = await getDecision(qaState, activeIdx, deckNames[activeIdx], { model: modelName });
        console.log(`  [CONSUMPTION] P${activeIdx + 1}: ${JSON.stringify(decision.action)}`);
        if (decision.action.type === 'dryDrop' || decision.action.type === 'pass') {
          controller.execute({ type: engine.ActionTypes.DRY_DROP, payload: { predator: pc.predator, slotIndex: null } });
        } else if (decision.action.type === 'eat') {
          const targets = (decision.action.targets || [0]).map((i) => pc.availablePrey[i]).filter(Boolean);
          controller.execute({ type: engine.ActionTypes.SELECT_CONSUMPTION_TARGETS, payload: { predator: pc.predator, prey: targets, carrion: [] } });
        } else {
          controller.execute({ type: engine.ActionTypes.SELECT_CONSUMPTION_TARGETS, payload: { predator: pc.predator, prey: [pc.availablePrey[0]], carrion: [] } });
        }
        while (_pendingSelection) {
          const sel = _pendingSelection;
          _pendingSelection = null;
          await resolveSelection(sel, gameState, activeIdx, deckNames[activeIdx], modelName);
        }
      }
      if (uiState.pendingPlacement) {
        controller.execute({ type: engine.ActionTypes.FINALIZE_PLACEMENT, payload: { additionalPrey: [] } });
        while (_pendingSelection) {
          const sel = _pendingSelection;
          _pendingSelection = null;
          await resolveSelection(sel, gameState, activeIdx, '', modelName);
        }
      }
    };

    // Helper: check if Main phase has anything the LLM can do
    const canPlayInMain = () => {
      if (gameState.cardPlayedThisTurn) return false;
      const hand = gameState.players[activeIdx].hand;
      const playable = hand.filter((c) => c.type !== 'Trap');
      if (playable.length === 0 || hand.length === 0) return false;
      const fieldFull = gameState.players[activeIdx].field.filter((c) => c !== null).length >= 3;
      if (!fieldFull) return true;
      // Field full — can still play spells or predators that eat
      if (hand.some((c) => c.type === 'Spell' || c.type === 'Free Spell')) return true;
      if (hand.some((c) => c.type === 'Predator') &&
          gameState.players[activeIdx].field.some((c) => c && (c.type === 'Prey' || (c.type === 'Predator' && c.keywords?.includes('Edible'))))) return true;
      return false;
    };

    // Helper: ask LLM for a decision, execute it, log it
    const askAndExecute = async () => {
      const stateBefore = snapshotState(gameState);
      const qaState = buildQAState(gameState, activeIdx);

      // Don't clear lastReasoning here — TUI lingers on it for 4s via completedAt
      writeLive(buildLiveState(gameState, deckNames, { thinking: `P${activeIdx + 1} thinking...` }));

      let decision;
      if (streaming) {
        // Streaming mode: update live.json with tokens as they arrive
        let lastWriteTime = 0;
        decision = await getDecisionStreaming(qaState, activeIdx, deckNames[activeIdx], { model: modelName }, (partialText) => {
          const now = Date.now();
          if (now - lastWriteTime >= 80) { // Throttle writes to ~12/sec
            lastWriteTime = now;
            writeLive(buildLiveState(gameState, deckNames, {
              thinking: partialText.substring(0, 900),
            }));
          }
        });
      } else {
        decision = await getDecision(qaState, activeIdx, deckNames[activeIdx], { model: modelName });
      }

      console.log(`  P${activeIdx + 1} [${gameState.phase}]: ${decision.action.type} ${JSON.stringify(decision.action).substring(0, 80)}`);

      if (decision.action.type === 'unknown') {
        console.log(`  ⚠️ Unknown action, skipping`);
        return { skipped: true };
      }

      const execResult = await executeLLMAction(controller, gameState, uiState, decision.action, activeIdx, modelName);
      await resolvePending();

      const stateAfter = snapshotState(gameState);
      const diff = diffState(stateBefore, stateAfter);

      turnLog.actions.push({
        action: decision.action,
        reasoning: decision.reasoning?.substring(0, 200),
        result: { success: execResult.success, description: execResult.description, error: execResult.error },
        diff,
        timeMs: decision.timeMs,
      });
      actionsThisTurn++;
      totalActions++;

      // Build action text with HP deltas
      let actionDesc = execResult.description || `${decision.action.type}`;
      // Enrich bare action types with context from the decision
      if (!execResult.description) {
        const act = decision.action;
        if (act.type === 'play' && act.handIndex !== undefined) {
          const cardName = gameState.players[activeIdx].hand[act.handIndex]?.name;
          actionDesc = cardName ? `Play ${cardName}` : `play #${act.handIndex}`;
        } else if (act.type === 'attack') {
          actionDesc = `attack slot ${act.attackerSlot} → ${act.target}`;
        }
      }
      if (execResult.error) {
        actionDesc += ` [${execResult.error}]`;
      }
      const p1hpBefore = stateBefore.p1hp;
      const p2hpBefore = stateBefore.p2hp;
      const p1hpAfter = gameState.players[0].hp;
      const p2hpAfter = gameState.players[1].hp;
      const p1delta = p1hpAfter - p1hpBefore;
      const p2delta = p2hpAfter - p2hpBefore;
      let hpTag = '';
      if (p1delta !== 0 || p2delta !== 0) {
        const parts = [];
        if (p1delta !== 0) parts.push(`P1 ${p1delta > 0 ? '+' : ''}${p1delta}`);
        if (p2delta !== 0) parts.push(`P2 ${p2delta > 0 ? '+' : ''}${p2delta}`);
        hpTag = ` (${parts.join(' ')})`;
      }
      const actionText = `P${activeIdx + 1}: ${actionDesc}${hpTag}`;
      const actionSuccess = execResult.success !== false;
      pushActionLog(actionText, actionSuccess);

      // Write live state: post-decision with reasoning and action log
      const reasoningText = decision.reasoning ? decision.reasoning.substring(0, 900) : null;
      const liveState = buildLiveState(gameState, deckNames, {
        thinking: null,
        lastReasoning: reasoningText,
      });
      liveState.completedAt = Date.now();
      writeLive(liveState);

      return { ...execResult, diff, actionType: decision.action.type };
    };

    // --- PHASE 1: Start + Draw (automatic) ---
    if (gameState.phase === 'Start' || gameState.phase === 'Draw' || gameState.phase === 'Main 1') {
      // Advance through Start/Draw automatically (the engine handles draw logic)
      while ((gameState.phase === 'Start' || gameState.phase === 'Draw') && !checkVictory(gameState)) {
        controller.execute({ type: engine.ActionTypes.ADVANCE_PHASE, payload: {} });
        await resolvePending();
        actionsThisTurn++;
      }
      writeLive(buildLiveState(gameState, deckNames));
    }
    if (checkVictory(gameState)) { gameLog.turns.push(turnLog); continue; }

    // --- PHASE 2: Main 1 ---
    if (gameState.turn !== currentTurn) { gameLog.turns.push(turnLog); continue; }
    if (gameState.phase === 'Main 1' && canPlayInMain()) {
      const MAX_MAIN_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_MAIN_ATTEMPTS && canPlayInMain() && !checkVictory(gameState); attempt++) {
        const result = await askAndExecute();
        if (checkVictory(gameState)) break;
        if (result.skipped) break;
        if (result.success) break; // Played a card — Main 1 done (1 card limit)
        // Failed — let the LLM try again (e.g., tried to play a trap, can retry with a real card)
      }
    }
    // Advance past Main 1 to Combat
    while (gameState.phase === 'Main 1' && !checkVictory(gameState)) {
      controller.execute({ type: engine.ActionTypes.ADVANCE_PHASE, payload: {} });
      await resolvePending();
      actionsThisTurn++;
    }
    writeLive(buildLiveState(gameState, deckNames));
    if (checkVictory(gameState)) { gameLog.turns.push(turnLog); continue; }

    // --- PHASE 3: Combat ---
    if (gameState.turn !== currentTurn) { gameLog.turns.push(turnLog); continue; }
    if (gameState.phase === 'Combat') {
      let combatDone = false;
      // Track failed attack targets per attacker slot across the entire combat phase
      // Key: attackerSlot, Value: Set of target slots/player that failed
      const failedTargets = {};
      while (!combatDone && gameState.phase === 'Combat' && !checkVictory(gameState)) {
        // Check which creatures can still attack
        const eligibleAttackers = gameState.players[activeIdx].field.filter((c) => {
          if (!c) return false;
          const maxStrikes = c.multiStrike || 1;
          const canStillAttack = (c.attacksMadeThisTurn || 0) < maxStrikes;
          const isPassive = c.keywords?.includes('Passive') || c.frozen || c.isParalyzed;
          return canStillAttack && !isPassive;
        });

        if (eligibleAttackers.length === 0) break;

        const enemyCreatures = gameState.players[1 - activeIdx].field.filter((c) => c !== null);

        // Filter out attackers who have exhausted ALL possible targets (failed on every enemy + player)
        const attackersWithTargets = eligibleAttackers.filter((c) => {
          const slotIdx = gameState.players[activeIdx].field.indexOf(c);
          const failed = failedTargets[slotIdx];
          if (!failed || failed.size === 0) return true; // No failures yet, still eligible
          const canHitPlayer = c.summonedTurn < gameState.turn || engine.keywords.hasHaste(c);
          const playerFailed = failed.has('player');
          // Check if there are any enemy slots NOT yet failed
          const enemySlots = gameState.players[1 - activeIdx].field
            .map((ec, i) => ec ? String(i) : null)
            .filter((s) => s !== null);
          const allEnemiesFailed = enemySlots.every((s) => failed.has(s));
          // If all enemies failed AND (can't hit player OR player also failed), this attacker is done
          if (allEnemiesFailed && (!canHitPlayer || playerFailed)) return false;
          return true;
        });

        if (attackersWithTargets.length === 0) {
          console.log(`  [Combat] All attackers have exhausted valid targets — ending combat.`);
          break;
        }

        const canDoAnything = attackersWithTargets.some((c) => {
          const canHitPlayer = c.summonedTurn < gameState.turn || engine.keywords.hasHaste(c);
          return enemyCreatures.length > 0 || canHitPlayer;
        });

        if (!canDoAnything) break;

        // Ask LLM for combat decisions — it can output multiple ATTACK commands
        const stateBefore = snapshotState(gameState);
        const qaState = buildQAState(gameState, activeIdx);
        writeLive(buildLiveState(gameState, deckNames, { thinking: `P${activeIdx + 1} thinking...` }));

        let decision;
        if (streaming) {
          let lastWriteTime = 0;
          decision = await getDecisionStreaming(qaState, activeIdx, deckNames[activeIdx], { model: modelName }, (partialText) => {
            const now = Date.now();
            if (now - lastWriteTime >= 80) {
              lastWriteTime = now;
              writeLive(buildLiveState(gameState, deckNames, { thinking: partialText.substring(0, 900) }));
            }
          });
        } else {
          decision = await getDecision(qaState, activeIdx, deckNames[activeIdx], { model: modelName });
        }

        // Try to parse multiple attacks from the response
        const batchAttacks = parseAllAttacks(decision.rawResponse || '');

        if (batchAttacks && batchAttacks.length > 0) {
          // Execute each attack sequentially
          const errors = [];
          for (const attackAction of batchAttacks) {
            if (checkVictory(gameState)) break;

            // Capture attacker/defender stats BEFORE combat
            const me = gameState.players[activeIdx];
            const opp = gameState.players[1 - activeIdx];
            const attackerBefore = me.field[attackAction.attackerSlot];
            const atkStatsBefore = attackerBefore ? `${attackerBefore.currentAtk}/${attackerBefore.currentHp}` : null;
            const atkName = attackerBefore?.name || '?';
            let defStatsBefore = null, defName = null;
            if (attackAction.target !== 'player' && typeof attackAction.target === 'number') {
              const defBefore = opp.field[attackAction.target];
              defStatsBefore = defBefore ? `${defBefore.currentAtk}/${defBefore.currentHp}` : null;
              defName = defBefore?.name || '?';
            }

            const snapBefore = snapshotState(gameState);
            const execResult = await executeLLMAction(controller, gameState, uiState, attackAction, activeIdx, modelName);
            await resolvePending();

            // Capture stats AFTER combat
            const attackerAfter = me.field[attackAction.attackerSlot];
            const atkStatsAfter = attackerAfter ? `${attackerAfter.currentAtk}/${attackerAfter.currentHp}` : '💀';
            let defStatsAfter = null;
            if (attackAction.target !== 'player' && typeof attackAction.target === 'number') {
              const defAfter = opp.field[attackAction.target];
              defStatsAfter = defAfter ? `${defAfter.currentAtk}/${defAfter.currentHp}` : '💀';
            }

            const diff = diffState(snapBefore, snapshotState(gameState));

            console.log(`  P${activeIdx + 1} [Combat]: attack ${JSON.stringify(attackAction).substring(0, 80)}`);

            turnLog.actions.push({
              action: attackAction,
              reasoning: turnLog.actions.length === 0 ? decision.reasoning?.substring(0, 200) : undefined,
              result: { success: execResult.success, description: execResult.description, error: execResult.error },
              diff,
              timeMs: turnLog.actions.length === 0 ? decision.timeMs : 0,
            });
            actionsThisTurn++;
            totalActions++;

            // Build rich action description with combat outcome
            let actionDesc = execResult.description || `attack slot ${attackAction.attackerSlot} → ${attackAction.target}`;
            if (execResult.error) {
              actionDesc += ` [${execResult.error}]`;
            } else if (execResult.success && attackAction.target === 'player') {
              // Face attack — show HP change
              const oppHpDelta = gameState.players[1 - activeIdx].hp - snapBefore[`p${2 - activeIdx}hp`];
              if (oppHpDelta !== 0) actionDesc += ` (${oppHpDelta} HP)`;
            } else if (execResult.success && defStatsBefore) {
              // Creature combat — show before→after for both
              actionDesc += ` (${atkStatsBefore}→${atkStatsAfter} vs ${defStatsBefore}→${defStatsAfter})`;
            }
            pushActionLog(`P${activeIdx + 1}: ${actionDesc}`, execResult.success !== false);

            if (!execResult.success && execResult.error) {
              errors.push(`ATTACK ${attackAction.attackerSlot} ${attackAction.target === 'player' ? 'PLAYER' : attackAction.target} failed: ${execResult.error}`);
              // Track this failed target for this attacker
              const atkSlot = attackAction.attackerSlot;
              if (!failedTargets[atkSlot]) failedTargets[atkSlot] = new Set();
              failedTargets[atkSlot].add(String(attackAction.target));
            }
          }

          // After batch, write reasoning to live state
          const reasoningText = decision.reasoning ? decision.reasoning.substring(0, 900) : null;
          const liveState = buildLiveState(gameState, deckNames, { thinking: null, lastReasoning: reasoningText });
          liveState.completedAt = Date.now();
          writeLive(liveState);

          // If attacks failed, re-prompt with error context for remaining eligible attackers
          if (errors.length > 0 && !checkVictory(gameState) && gameState.phase === 'Combat') {
            const stillEligible = gameState.players[activeIdx].field.filter((c) => {
              if (!c) return false;
              const maxStrikes = c.multiStrike || 1;
              return (c.attacksMadeThisTurn || 0) < maxStrikes && !c.keywords?.includes('Passive') && !c.frozen && !c.isParalyzed;
            });
            if (stillEligible.length > 0) {
              // Build accumulated failure summary from ALL combat attempts, not just this batch
              const failureSummary = Object.entries(failedTargets).map(([slot, targets]) => {
                const targetList = [...targets].map(t => t === 'player' ? 'PLAYER' : `slot ${t}`).join(', ');
                return `Slot ${slot} has already failed against: ${targetList}`;
              }).join('\n');
              const correction = `Your previous attacks had errors:\n${errors.join('\n')}\n${failureSummary ? `\nAccumulated failures this combat:\n${failureSummary}` : ''}\nYou still have ${stillEligible.length} creature(s) that can attack. Try different targets or ADVANCE to end combat.\nHidden creatures cannot be attacked. Invisible creatures cannot be targeted at all. Do NOT retry targets that already failed.`;
              const retryQa = buildQAState(gameState, activeIdx);
              writeLive(buildLiveState(gameState, deckNames, { thinking: `P${activeIdx + 1} retrying...` }));
              const retryDecision = await getDecision(retryQa, activeIdx, deckNames[activeIdx], { model: modelName, systemOverride: correction });
              const retryAttacks = parseAllAttacks(retryDecision.rawResponse || '');
              // If retry says ADVANCE/PASS (no valid attacks), end combat
              if (!retryAttacks && (retryDecision.action.type === 'advance' || retryDecision.action.type === 'pass' || retryDecision.action.type === 'endTurn')) {
                combatDone = true;
              } else if (retryAttacks) {
                for (const ra of retryAttacks) {
                  if (checkVictory(gameState)) break;
                  const snapB = snapshotState(gameState);
                  const rr = await executeLLMAction(controller, gameState, uiState, ra, activeIdx, modelName);
                  await resolvePending();
                  console.log(`  P${activeIdx + 1} [Combat retry]: attack ${JSON.stringify(ra).substring(0, 80)}`);
                  turnLog.actions.push({
                    action: ra,
                    reasoning: retryDecision.reasoning?.substring(0, 200),
                    result: { success: rr.success, description: rr.description, error: rr.error },
                    diff: diffState(snapB, snapshotState(gameState)),
                    timeMs: retryDecision.timeMs,
                  });
                  actionsThisTurn++;
                  totalActions++;
                  const desc2 = rr.description || `attack slot ${ra.attackerSlot} → ${ra.target}`;
                  pushActionLog(`P${activeIdx + 1}: ${desc2}${rr.error ? ` [${rr.error}]` : ''}`, rr.success !== false);
                  // Track retry failures too
                  if (!rr.success && rr.error) {
                    if (!failedTargets[ra.attackerSlot]) failedTargets[ra.attackerSlot] = new Set();
                    failedTargets[ra.attackerSlot].add(String(ra.target));
                  }
                }
              }
              const retryReasoning = retryDecision.reasoning ? retryDecision.reasoning.substring(0, 900) : null;
              writeLive(buildLiveState(gameState, deckNames, { thinking: null, lastReasoning: retryReasoning }));
            }
          }
        } else {
          // No attacks parsed — might be ADVANCE/PASS/END_TURN
          const action = decision.action;
          if (action.type === 'advance' || action.type === 'endTurn' || action.type === 'pass' || action.type === 'unknown') {
            combatDone = true;
          } else {
            // Single non-batch action (shouldn't happen often in combat)
            const execResult = await executeLLMAction(controller, gameState, uiState, action, activeIdx, modelName);
            await resolvePending();
            turnLog.actions.push({
              action,
              reasoning: decision.reasoning?.substring(0, 200),
              result: { success: execResult.success, description: execResult.description, error: execResult.error },
              diff: diffState(stateBefore, snapshotState(gameState)),
              timeMs: decision.timeMs,
            });
            actionsThisTurn++;
            totalActions++;
            if (!execResult.success) combatDone = true;
          }
        }
      }
    }
    // Advance past Combat to Main 2
    while (gameState.phase === 'Combat' && !checkVictory(gameState)) {
      controller.execute({ type: engine.ActionTypes.ADVANCE_PHASE, payload: {} });
      await resolvePending();
      actionsThisTurn++;
    }
    writeLive(buildLiveState(gameState, deckNames));
    if (checkVictory(gameState)) { gameLog.turns.push(turnLog); continue; }

    // --- PHASE 4: Main 2 (only if nothing played in Main 1) ---
    if (gameState.turn !== currentTurn) { gameLog.turns.push(turnLog); continue; }
    if (gameState.phase === 'Main 2' && canPlayInMain()) {
      const MAX_MAIN_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_MAIN_ATTEMPTS && canPlayInMain() && !checkVictory(gameState); attempt++) {
        const result = await askAndExecute();
        if (checkVictory(gameState)) break;
        if (result.skipped) break;
        if (result.success) break;
      }
    }
    // Advance past Main 2 to End
    while (gameState.phase === 'Main 2' && !checkVictory(gameState)) {
      controller.execute({ type: engine.ActionTypes.ADVANCE_PHASE, payload: {} });
      await resolvePending();
      actionsThisTurn++;
    }
    writeLive(buildLiveState(gameState, deckNames));
    if (checkVictory(gameState)) { gameLog.turns.push(turnLog); continue; }

    // --- PHASE 5: End ---
    // Process all queued end-of-turn effects
    while (gameState.phase === 'End' && gameState.turn === currentTurn && !checkVictory(gameState)) {
      if (gameState.endOfTurnQueue.length > 0 || gameState.endOfTurnProcessing) {
        controller.execute({ type: engine.ActionTypes.PROCESS_END_PHASE, payload: {} });
        await resolvePending();
      } else if (!gameState.endOfTurnFinalized) {
        // Queue empty — call PROCESS_END_PHASE once more to trigger finalizeEndPhase
        controller.execute({ type: engine.ActionTypes.PROCESS_END_PHASE, payload: {} });
      } else {
        // Finalized — use END_TURN to advance (not ADVANCE_PHASE, which re-queues)
        controller.execute({ type: engine.ActionTypes.END_TURN, payload: {} });
        await resolvePending();
      }
      actionsThisTurn++;
      if (actionsThisTurn > MAX_ACTIONS_PER_TURN) break;
    }

    gameLog.turns.push(turnLog);

    if (actionsThisTurn >= MAX_ACTIONS_PER_TURN) {
      console.log(`  ⚠️ Max actions reached, forcing end turn`);
      await executeLLMAction(
        controller,
        gameState,
        uiState,
        { type: 'endTurn' },
        activeIdx,
        modelName
      );
    }
  }

  // Game result
  const victory = checkVictory(gameState);
  const result = {
    winner: victory?.winner ?? -1,
    reason: victory?.reason || (gameState.turn > MAX_TURNS ? 'timeout' : 'unknown'),
    finalHP: [gameState.players[0].hp, gameState.players[1].hp],
    totalTurns: gameState.turn,
    totalActions,
    duration: Date.now() - new Date(gameLog.startTime).getTime(),
  };

  gameLog.result = result;
  gameLog.endTime = new Date().toISOString();

  // Mark the last action as the winning move
  if (_actionLog.length > 0) {
    const lastAction = _actionLog[_actionLog.length - 1];
    lastAction.text = '⭐️ ' + lastAction.text;
    lastAction.winning = true;
  }

  // Write final live state with gameOver timestamp for dashboard hold
  const endThinking = result.winner >= 0
    ? `🏆 Player ${result.winner + 1} (${deckNames[result.winner]}) wins!`
    : result.reason === 'draw' ? '🤝 Draw!' : `Game ended: ${result.reason}`;
  const finalState = buildLiveState(gameState, deckNames, {
    thinking: endThinking,
  });
  finalState.gameOver = true;
  finalState.gameOverAt = Date.now();
  finalState.winner = result.winner;
  finalState.winnerDeck = result.winner >= 0 ? deckNames[result.winner] : null;
  writeLive(finalState);

  console.log(`\n${'='.repeat(60)}`);
  if (result.winner >= 0) {
    console.log(`🏆 Player ${result.winner + 1} (${deckNames[result.winner]}) WINS!`);
  } else if (result.reason === 'draw') {
    console.log(`🤝 DRAW!`);
  } else {
    console.log(`⏰ Game ended: ${result.reason}`);
  }
  console.log(`Final HP: P1=${result.finalHP[0]} P2=${result.finalHP[1]}`);
  console.log(
    `Turns: ${result.totalTurns} | Actions: ${result.totalActions} | Time: ${(result.duration / 1000).toFixed(1)}s`
  );
  console.log(`${'='.repeat(60)}\n`);

  // Post-game reflection disabled — local models can't reliably meta-reflect.
  // Only Opus 4.6 (cloud) produces actionable bug analysis.
  // Structured cross-game analysis of state diffs is far more effective.
  gameLog.reflection = null;

  // Save log
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `game_${Date.now()}.json`);
  fs.writeFileSync(logFile, JSON.stringify(gameLog, null, 2));
  console.log(`Log saved: ${logFile}`);

  return result;
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

const args = process.argv.slice(2);
const flagArgs = args.filter(a => a.startsWith('--'));
const posArgs = args.filter(a => !a.startsWith('--'));
const deck1 = posArgs[0] || 'fish';
const deck2 = posArgs[1] || 'bird';
const model = posArgs[2] || 'qwen3.5:9b';
const streaming = flagArgs.includes('--stream') || process.env.FCTCG_STREAM === '1';

runGame(deck1, deck2, model, { streaming }).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
