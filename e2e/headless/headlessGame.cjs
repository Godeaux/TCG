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

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const LOG_DIR = path.resolve(__dirname, '../logs');

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
  ] = await Promise.all([
    import(path.join(PROJECT_ROOT, 'js/game/index.js')),
    import(path.join(PROJECT_ROOT, 'js/state/gameState.js')),
    import(path.join(PROJECT_ROOT, 'js/state/actions.js')),
    import(path.join(PROJECT_ROOT, 'js/state/uiState.js')),
    import(path.join(PROJECT_ROOT, 'js/cardTypes.js')),
    import(path.join(PROJECT_ROOT, 'js/keywords.js')),
    import(path.join(PROJECT_ROOT, 'js/cards/index.js')),
    import(path.join(PROJECT_ROOT, 'js/state/selectors.js')),
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
  };

  // Initialize card registry (must happen before any card lookups)
  engine.initializeCardRegistry();

  return engine;
}

// ============================================================================
// LLM INTEGRATION — reuse existing llmBrain + stateFormatter
// ============================================================================

const { getDecision } = require('../pvp/llmBrain.cjs');
const { formatStatePrompt, parseAction } = require('../pvp/stateFormatter.cjs');

const OLLAMA_CHAT_URL = 'http://localhost:11434/api/chat';

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
    });
    const data = await response.json();
    const text = data.message?.content?.trim() || '0';
    const match = text.match(/(\d+)\s*$/);
    const chosen = match ? parseInt(match[1]) : 0;
    return Math.min(Math.max(chosen, 0), options.length - 1);
  } catch (e) {
    console.log(`  [SELECTION] LLM error: ${e.message}, defaulting to 0`);
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

  switch (action.type) {
    case 'play': {
      const card = me.hand[action.handIndex];
      if (!card) return { success: false, error: `No card at hand index ${action.handIndex}` };

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
      if (result.needsSelection && uiState.pendingConsumption) {
        const pc = uiState.pendingConsumption;
        if (pc.availablePrey.length > 0) {
          // Auto-eat first prey
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

      return { success: result.success, description: `Play ${card.name}`, error: result.error };
    }

    case 'attack': {
      const attacker = me.field[action.attackerSlot];
      if (!attacker) return { success: false, error: `No creature at slot ${action.attackerSlot}` };

      let target;
      if (action.target === 'player') {
        target = { type: 'player', player: opp };
      } else {
        const defender = opp.field[action.target];
        if (!defender)
          return { success: false, error: `No creature at enemy slot ${action.target}` };
        target = { type: 'creature', card: defender };
      }

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

      const targetName =
        action.target === 'player' ? 'Player' : opp.field[action.target]?.name || '?';
      return {
        success: result.success,
        description: `${attacker.name} attacks ${targetName}`,
        error: result.error,
      };
    }

    case 'advance': {
      const result = controller.execute({
        type: engine.ActionTypes.ADVANCE_PHASE,
        payload: {},
      });

      // Process end phase effects if we're in End phase
      while (state.phase === 'End' && !state.endOfTurnFinalized) {
        if (state.endOfTurnQueue.length > 0 || state.endOfTurnProcessing) {
          controller.execute({
            type: engine.ActionTypes.PROCESS_END_PHASE,
            payload: {},
          });

          while (_pendingSelection) {
            const sel = _pendingSelection;
            _pendingSelection = null;
            await resolveSelection(sel, state, playerIndex, '', model);
          }
        } else {
          break;
        }
      }

      return { success: true, description: `Advanced phase → ${state.phase}` };
    }

    case 'endTurn': {
      // Advance through remaining phases to end turn
      const startTurn = state.turn;
      let safety = 0;

      while (state.turn === startTurn && safety < 20) {
        safety++;

        // Process any pending end-of-turn effects
        if (state.phase === 'End' && !state.endOfTurnFinalized) {
          if (state.endOfTurnQueue.length > 0 || state.endOfTurnProcessing) {
            controller.execute({
              type: engine.ActionTypes.PROCESS_END_PHASE,
              payload: {},
            });
            while (_pendingSelection) {
              const sel = _pendingSelection;
              _pendingSelection = null;
              await resolveSelection(sel, state, playerIndex, '', model);
            }
            continue;
          }
        }

        controller.execute({
          type: engine.ActionTypes.ADVANCE_PHASE,
          payload: {},
        });

        while (_pendingSelection) {
          const sel = _pendingSelection;
          _pendingSelection = null;
          await resolveSelection(sel, state, playerIndex, '', model);
        }
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

async function runGame(deck1Name, deck2Name, modelName) {
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

  // Set up decks
  const deck1 = engine.getStarterDeck(deck1Name);
  const deck2 = engine.getStarterDeck(deck2Name);

  if (deck1.length === 0 || deck2.length === 0) {
    console.error(`Invalid deck names. Available: ${engine.getDeckCategories().join(', ')}`);
    process.exit(1);
  }

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

  // Draw opening hands (3 cards each per typical TCG rules)
  for (let i = 0; i < 3; i++) {
    engine.drawCard(gameState, 0);
    engine.drawCard(gameState, 1);
  }

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

  while (!checkVictory(gameState) && gameState.turn <= MAX_TURNS) {
    const currentTurn = gameState.turn;
    const activeIdx = gameState.activePlayerIndex;

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

    // Inner loop: keep getting decisions until the turn advances
    while (
      gameState.turn === currentTurn &&
      actionsThisTurn < MAX_ACTIONS_PER_TURN &&
      !checkVictory(gameState)
    ) {
      // Check for pending trap reaction first
      if (gameState.pendingReaction) {
        await handlePendingReaction(controller, gameState, modelName, deckNames);
        if (checkVictory(gameState)) break;
        continue;
      }

      // Handle pending consumption from uiState
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

        const decision = await getDecision(qaState, activeIdx, deckNames[activeIdx], {
          model: modelName,
        });
        console.log(`  [CONSUMPTION] P${activeIdx + 1}: ${JSON.stringify(decision.action)}`);

        if (decision.action.type === 'dryDrop' || decision.action.type === 'pass') {
          controller.execute({
            type: engine.ActionTypes.DRY_DROP,
            payload: { predator: pc.predator, slotIndex: null },
          });
        } else if (decision.action.type === 'eat') {
          const targets = (decision.action.targets || [0])
            .map((i) => pc.availablePrey[i])
            .filter(Boolean);
          controller.execute({
            type: engine.ActionTypes.SELECT_CONSUMPTION_TARGETS,
            payload: { predator: pc.predator, prey: targets, carrion: [] },
          });
        } else {
          // Default: eat first available
          controller.execute({
            type: engine.ActionTypes.SELECT_CONSUMPTION_TARGETS,
            payload: { predator: pc.predator, prey: [pc.availablePrey[0]], carrion: [] },
          });
        }

        // Resolve any pending selections
        while (_pendingSelection) {
          const sel = _pendingSelection;
          _pendingSelection = null;
          await resolveSelection(sel, gameState, activeIdx, '', modelName);
        }

        if (checkVictory(gameState)) break;
        continue;
      }

      // Handle pending placement (additional consumption)
      if (uiState.pendingPlacement) {
        // Just finalize without additional consumption for simplicity
        controller.execute({
          type: engine.ActionTypes.FINALIZE_PLACEMENT,
          payload: { additionalPrey: [] },
        });

        while (_pendingSelection) {
          const sel = _pendingSelection;
          _pendingSelection = null;
          await resolveSelection(sel, gameState, activeIdx, '', modelName);
        }

        if (checkVictory(gameState)) break;
        continue;
      }

      // Auto-advance phases that don't need LLM decisions
      if (gameState.phase === 'Start' || gameState.phase === 'Draw') {
        controller.execute({ type: engine.ActionTypes.ADVANCE_PHASE, payload: {} });
        actionsThisTurn++;
        continue;
      }

      // Auto-process End phase effects
      if (gameState.phase === 'End') {
        if (gameState.endOfTurnQueue.length > 0 || gameState.endOfTurnProcessing) {
          controller.execute({ type: engine.ActionTypes.PROCESS_END_PHASE, payload: {} });
          while (_pendingSelection) {
            const sel = _pendingSelection;
            _pendingSelection = null;
            await resolveSelection(sel, gameState, activeIdx, '', modelName);
          }
        } else {
          controller.execute({ type: engine.ActionTypes.ADVANCE_PHASE, payload: {} });
        }
        actionsThisTurn++;
        continue;
      }

      // Build state and ask LLM for decision
      const stateBefore = snapshotState(gameState);
      const qaState = buildQAState(gameState, activeIdx);
      const decision = await getDecision(qaState, activeIdx, deckNames[activeIdx], {
        model: modelName,
      });

      console.log(
        `  P${activeIdx + 1} [${gameState.phase}]: ${decision.action.type} ${JSON.stringify(decision.action).substring(0, 80)}`
      );

      if (decision.action.type === 'unknown') {
        console.log(`  ⚠️ Unknown action, forcing advance`);
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          console.log(`  ❌ Too many errors, forcing end turn`);
          await executeLLMAction(
            controller,
            gameState,
            uiState,
            { type: 'endTurn' },
            activeIdx,
            modelName
          );
          consecutiveErrors = 0;
        } else {
          await executeLLMAction(
            controller,
            gameState,
            uiState,
            { type: 'advance' },
            activeIdx,
            modelName
          );
        }
        actionsThisTurn++;
        continue;
      }

      consecutiveErrors = 0;

      // Execute the action
      const execResult = await executeLLMAction(
        controller,
        gameState,
        uiState,
        decision.action,
        activeIdx,
        modelName
      );

      // Handle any trap reactions that emerged
      while (gameState.pendingReaction) {
        await handlePendingReaction(controller, gameState, modelName, deckNames);
        if (checkVictory(gameState)) break;
      }

      // Resolve any pending selections
      while (_pendingSelection) {
        const sel = _pendingSelection;
        _pendingSelection = null;
        await resolveSelection(sel, gameState, activeIdx, '', modelName);
      }

      const stateAfter = snapshotState(gameState);
      const diff = diffState(stateBefore, stateAfter);

      turnLog.actions.push({
        action: decision.action,
        reasoning: decision.reasoning?.substring(0, 200),
        result: {
          success: execResult.success,
          description: execResult.description,
          error: execResult.error,
        },
        diff,
        timeMs: decision.timeMs,
      });

      actionsThisTurn++;
      totalActions++;

      if (checkVictory(gameState)) break;

      // If action failed or didn't change state, force advance to avoid infinite loops
      if (
        !execResult.success ||
        (!diff && decision.action.type !== 'advance' && decision.action.type !== 'endTurn')
      ) {
        if (!execResult.success) {
          console.log(`  ⚠️ Action failed (${execResult.error}), forcing advance`);
        } else {
          console.log(`  ⚠️ No state change, forcing advance`);
        }
        await executeLLMAction(
          controller,
          gameState,
          uiState,
          { type: 'advance' },
          activeIdx,
          modelName
        );
        actionsThisTurn++;
      }
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
const deck1 = args[0] || 'fish';
const deck2 = args[1] || 'bird';
const model = args[2] || 'qwen3.5:9b';

runGame(deck1, deck2, model).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
