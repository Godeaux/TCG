# Deep AI Simulation System

## Objective

Build a "book-perfect" AI that makes decisions through **actual game simulation**, not heuristics. The AI should feel truly dynamic, making informed decisions based on the complete board state and all possible consequences of every action.

---

## Core Principles

1. **Simulation over heuristics** - Use real GameController to simulate moves, capturing ALL effects
2. **Complete move enumeration** - A "move" includes all nested selections (modal choices, targets)
3. **Context-aware evaluation** - Keyword values depend on board state, not static bonuses
4. **Reuse existing code** - Follow CLAUDE.md, no parallel game logic
5. **Pruning for depth** - Alpha-beta pruning allows deeper search within time limits

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GameTreeSearch                          │
│  - Alpha-beta with iterative deepening                      │
│  - Transposition table (cache evaluated positions)          │
│  - Time-limited search with "best so far" guarantee         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      MoveGenerator                           │
│  - Enumerate ALL legal moves for current state              │
│  - Order moves by heuristic (best-first for pruning)        │
│  - Types: card plays, attacks, pass, end turn               │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────────┐
│  SelectionEnumerator    │   │  AttackEnumerator           │
│  - Modal choices        │   │  - Valid targets per Lure   │
│  - Target selections    │   │  - Attack ordering          │
│  - Recursive branching  │   │  - Face vs creature         │
│  - Dry drop option      │   │                             │
└─────────────────────────┘   └─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   MoveSimulator                              │
│  - Execute fully-specified moves on cloned state            │
│  - Uses real GameController (silent callbacks)              │
│  - Pre-feeds selections to avoid blocking                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              PositionEvaluator (ENHANCED)                    │
│  - Static evaluation at leaf nodes                          │
│  - Context-aware getKeywordValue(creature, state, player)   │
│  - Existing: material, threats, position quality            │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Context-Aware Keyword Evaluation
**File:** `js/ai/PositionEvaluator.js` (modify existing)

Update `getKeywordValue()` to accept state context:

```javascript
getKeywordValue(creature, state, playerIndex) {
  const opponent = state.players[1 - playerIndex];
  let bonus = 0;

  // TOXIC: Worth more when opponent has high-HP creatures
  if (hasKeyword(creature, KEYWORDS.TOXIC)) {
    const highHpTargets = opponent.field.filter(c => c && (c.currentHp ?? c.hp) >= 4).length;
    bonus += 4 + (highHpTargets * 3);
  }

  // HASTE: Worth more if can attack THIS turn
  if (hasKeyword(creature, KEYWORDS.HASTE)) {
    if (creature.summonedTurn === state.turn && !creature.hasAttacked) {
      bonus += 8;  // Immediate threat
    } else {
      bonus += 2;  // Already used
    }
  }

  // BARRIER: Worth more when facing high incoming damage
  if (hasKeyword(creature, KEYWORDS.BARRIER) || creature.hasBarrier) {
    const incomingDamage = opponent.field.reduce((sum, c) =>
      c ? sum + (c.currentAtk ?? c.atk ?? 0) : sum, 0);
    bonus += Math.min(incomingDamage, 10);
  }

  // AMBUSH: Worth more when clean kills available
  if (hasKeyword(creature, KEYWORDS.AMBUSH)) {
    const atkPower = creature.currentAtk ?? creature.atk ?? 0;
    const killableTargets = opponent.field.filter(c =>
      c && (c.currentHp ?? c.hp) <= atkPower).length;
    bonus += 2 + (killableTargets * 2);
  }

  // LURE: Worth more when protecting valuable creatures
  if (hasKeyword(creature, KEYWORDS.LURE)) {
    const player = state.players[playerIndex];
    const valuableCreatures = player.field.filter(c =>
      c && c !== creature &&
      ((c.currentAtk ?? c.atk ?? 0) >= 3 || hasKeyword(c, KEYWORDS.TOXIC))
    ).length;
    bonus += 2 + (valuableCreatures * 3);
  }

  // REGENERATION: Worth more when damaged
  if (hasKeyword(creature, KEYWORDS.REGENERATION)) {
    const missingHp = (creature.hp) - (creature.currentHp ?? creature.hp);
    bonus += 2 + missingHp;
  }

  // Negative keywords
  if (hasKeyword(creature, KEYWORDS.HARMLESS)) bonus -= 5;
  if (isPassive(creature)) bonus -= 3;

  return bonus;
}
```

Also update `evaluateCreature()` call site to pass state context.

---

### Phase 2: SelectionEnumerator
**File:** `js/ai/SelectionEnumerator.js` (new)

Handle cards with modal choices and target selections:

```javascript
/**
 * Enumerates all possible selection paths for cards that require choices.
 * A card like "Draw 3 OR +3/+3 to a creature" generates multiple moves:
 * - {card, selections: [{type:'modal', choice:'draw'}]}
 * - {card, selections: [{type:'modal', choice:'buff'}, {type:'target', choice:'inst_1'}]}
 * - {card, selections: [{type:'modal', choice:'buff'}, {type:'target', choice:'inst_2'}]}
 */
export class SelectionEnumerator {
  constructor() {
    this.evaluator = null; // Set by MoveGenerator
  }

  /**
   * Get all complete selection paths for a card
   */
  enumerateSelections(state, card, playerIndex) {
    // Cards without effects needing selection
    if (!this.cardNeedsSelection(card)) {
      return [{ selections: [] }];
    }

    // Use intercepting controller to discover selection requirements
    return this.exploreSelectionTree(state, card, playerIndex, []);
  }

  /**
   * Recursively explore selection branches
   */
  exploreSelectionTree(state, card, playerIndex, previousSelections) {
    const paths = [];
    const simResult = this.simulateWithSelections(state, card, playerIndex, previousSelections);

    if (simResult.pendingSelection) {
      // Card needs another choice - branch on all options
      const request = simResult.pendingSelection;

      for (const option of request.options) {
        const newSelections = [...previousSelections, {
          type: request.type,
          choice: option.id ?? option.instanceId ?? option
        }];

        const subPaths = this.exploreSelectionTree(state, card, playerIndex, newSelections);
        paths.push(...subPaths);
      }
    } else if (simResult.success) {
      // Complete path found
      paths.push({
        selections: previousSelections,
        resultingState: simResult.state
      });
    }

    return paths;
  }

  /**
   * Simulate card play with pre-determined selections
   */
  simulateWithSelections(state, card, playerIndex, selections) {
    // Implementation uses intercepting controller pattern
    // See Phase 2 implementation details
  }

  /**
   * Check if card has effects that need player choices
   */
  cardNeedsSelection(card) {
    // Check for modal effects, targeted effects, etc.
    const effects = card.effects || {};
    // ... detection logic
  }
}
```

---

### Phase 3: MoveGenerator
**File:** `js/ai/MoveGenerator.js` (new)

Enumerate all legal moves with full selection paths:

```javascript
export class MoveGenerator {
  constructor() {
    this.selectionEnumerator = new SelectionEnumerator();
  }

  /**
   * Generate all legal moves for current state
   * Each move is FULLY SPECIFIED (no ambiguity)
   */
  generateMoves(state, playerIndex) {
    const moves = [];

    // Card plays (with all selection variations)
    moves.push(...this.generateCardPlays(state, playerIndex));

    // Attacks
    moves.push(...this.generateAttacks(state, playerIndex));

    // Pass/End turn
    moves.push({ type: 'END_TURN' });

    // Order for alpha-beta efficiency (best moves first)
    return this.orderMoves(moves, state, playerIndex);
  }

  generateCardPlays(state, playerIndex) {
    const moves = [];
    const player = state.players[playerIndex];

    for (const card of player.hand) {
      if (!this.canPlayCard(state, card, playerIndex)) continue;

      // Get all selection paths for this card
      const selectionPaths = this.selectionEnumerator.enumerateSelections(
        state, card, playerIndex
      );

      if (card.type === 'Creature') {
        // Each valid slot × each selection path × dry drop option
        for (let slot = 0; slot < 5; slot++) {
          if (player.field[slot] !== null) continue;

          for (const path of selectionPaths) {
            // Normal play
            moves.push({
              type: 'PLAY_CARD',
              card,
              slot,
              dryDrop: false,
              selections: path.selections
            });

            // Dry drop option
            moves.push({
              type: 'PLAY_CARD',
              card,
              slot,
              dryDrop: true,
              selections: path.selections
            });
          }
        }
      } else {
        // Spells/Traps
        for (const path of selectionPaths) {
          moves.push({
            type: 'PLAY_CARD',
            card,
            slot: null,
            selections: path.selections
          });
        }
      }
    }

    return moves;
  }

  generateAttacks(state, playerIndex) {
    const moves = [];
    const player = state.players[playerIndex];
    const opponent = state.players[1 - playerIndex];

    // Find Lure creatures (must be attacked first)
    const lureCreatures = opponent.field.filter(c =>
      c && hasKeyword(c, KEYWORDS.LURE) && !c.hidden
    );

    for (const attacker of player.field) {
      if (!this.canAttack(attacker, state)) continue;

      // If opponent has Lure, can only attack Lure creatures
      const validTargets = lureCreatures.length > 0
        ? lureCreatures
        : opponent.field.filter(c => c && !c.hidden);

      // Attack each valid creature
      for (const defender of validTargets) {
        moves.push({
          type: 'ATTACK',
          attackerInstanceId: attacker.instanceId,
          target: { type: 'creature', instanceId: defender.instanceId, card: defender }
        });
      }

      // Attack face (only if no Lure)
      if (lureCreatures.length === 0) {
        moves.push({
          type: 'ATTACK',
          attackerInstanceId: attacker.instanceId,
          target: { type: 'player' }
        });
      }
    }

    return moves;
  }

  /**
   * Order moves for alpha-beta pruning efficiency
   * Best moves first = more pruning = faster search
   */
  orderMoves(moves, state, playerIndex) {
    return moves.sort((a, b) =>
      this.getHeuristic(b, state, playerIndex) - this.getHeuristic(a, state, playerIndex)
    );
  }

  getHeuristic(move, state, playerIndex) {
    // Quick scoring for move ordering (not full evaluation)
    if (move.type === 'ATTACK') {
      if (move.target.type === 'player') {
        const attacker = state.players[playerIndex].field.find(
          c => c?.instanceId === move.attackerInstanceId
        );
        const atk = attacker?.currentAtk ?? attacker?.atk ?? 0;
        const oppHp = state.players[1 - playerIndex].hp;
        if (atk >= oppHp) return 10000; // Lethal
        return atk * 10;
      }
      // Creature attack - prioritize killing threats
      return 50;
    }

    if (move.type === 'PLAY_CARD') {
      if (hasKeyword(move.card, KEYWORDS.HASTE)) return 80;
      if (move.card.type === 'Creature') return 60;
      return 40;
    }

    return 0; // END_TURN
  }

  canPlayCard(state, card, playerIndex) {
    // Check nutrition cost, field space, etc.
    // Reuse existing validation logic
  }

  canAttack(creature, state) {
    if (!creature) return false;
    if (creature.hasAttacked) return false;
    if (creature.frozen || creature.paralyzed) return false;
    if (isPassive(creature)) return false;
    if (hasKeyword(creature, KEYWORDS.HARMLESS)) return false;
    // Summoning sickness
    if (creature.summonedTurn === state.turn && !hasKeyword(creature, KEYWORDS.HASTE)) {
      return false;
    }
    return true;
  }
}
```

---

### Phase 4: MoveSimulator
**File:** `js/ai/MoveSimulator.js` (new)

Execute fully-specified moves using real game logic:

```javascript
export class MoveSimulator {
  /**
   * Execute a move on cloned state, return resulting state
   */
  simulate(state, move, playerIndex) {
    const clonedState = createSnapshot(state);
    const controller = this.createSimulationController(clonedState, playerIndex, move.selections);

    let success = false;

    if (move.type === 'PLAY_CARD') {
      const result = controller.execute({
        type: ActionTypes.PLAY_CARD,
        payload: {
          card: move.card,
          slotIndex: move.slot,
          dryDrop: move.dryDrop
        }
      });
      success = result.success;
    } else if (move.type === 'ATTACK') {
      const result = controller.execute({
        type: ActionTypes.DECLARE_ATTACK,
        payload: {
          attackerInstanceId: move.attackerInstanceId,
          target: move.target
        }
      });
      success = result.success;
    } else if (move.type === 'END_TURN') {
      const result = controller.execute({ type: ActionTypes.END_TURN });
      success = result.success;
    }

    return {
      success,
      state: controller.state
    };
  }

  /**
   * Create controller that auto-answers selection requests
   */
  createSimulationController(state, playerIndex, preSelectedChoices = []) {
    const selectionQueue = [...preSelectedChoices];

    return new GameController(state, { localPlayerIndex: playerIndex }, {
      onStateChange: () => {},
      onBroadcast: () => {},
      onSelectionNeeded: (request) => {
        // Auto-answer from pre-selected choices
        if (selectionQueue.length > 0) {
          const selection = selectionQueue.shift();
          return selection.choice;
        }
        // No answer - shouldn't happen if SelectionEnumerator worked correctly
        console.warn('[MoveSimulator] Unexpected selection request:', request);
        return request.options[0]; // Fallback to first option
      },
      onSelectionComplete: () => {}
    });
  }
}
```

---

### Phase 5: GameTreeSearch
**File:** `js/ai/GameTreeSearch.js` (new)

Alpha-beta search with iterative deepening:

```javascript
export class GameTreeSearch {
  constructor() {
    this.moveGenerator = new MoveGenerator();
    this.moveSimulator = new MoveSimulator();
    this.evaluator = new PositionEvaluator();
    this.transpositionTable = new Map();
    this.stats = { nodes: 0, pruned: 0 };
  }

  /**
   * Find best move with time limit
   */
  findBestMove(state, playerIndex, maxTimeMs = 2000) {
    const startTime = Date.now();
    let bestMove = null;
    let bestScore = -Infinity;

    // Iterative deepening
    for (let depth = 1; depth <= 20; depth++) {
      this.stats = { nodes: 0, pruned: 0 };

      const result = this.alphaBeta(
        state, depth, -Infinity, Infinity, playerIndex, true
      );

      // Time check
      if (Date.now() - startTime > maxTimeMs * 0.8) {
        console.log(`[Search] Time limit at depth ${depth}`);
        break;
      }

      bestMove = result.move;
      bestScore = result.score;

      console.log(`[Search] Depth ${depth}: score=${bestScore} nodes=${this.stats.nodes} pruned=${this.stats.pruned}`);

      // Early exit on winning line
      if (bestScore > 9000) break;
    }

    return { move: bestMove, score: bestScore };
  }

  alphaBeta(state, depth, alpha, beta, playerIndex, maximizing) {
    this.stats.nodes++;

    // Terminal conditions
    if (depth === 0 || this.isGameOver(state)) {
      return {
        score: this.evaluator.evaluatePosition(state, playerIndex),
        move: null
      };
    }

    // Transposition table lookup
    const stateKey = this.hashState(state);
    const cached = this.transpositionTable.get(stateKey);
    if (cached && cached.depth >= depth) {
      return cached;
    }

    const currentPlayer = maximizing ? playerIndex : (1 - playerIndex);
    const moves = this.moveGenerator.generateMoves(state, currentPlayer);

    if (moves.length === 0) {
      return {
        score: this.evaluator.evaluatePosition(state, playerIndex),
        move: { type: 'END_TURN' }
      };
    }

    let bestMove = moves[0];

    if (maximizing) {
      let maxScore = -Infinity;

      for (const move of moves) {
        const simResult = this.moveSimulator.simulate(state, move, currentPlayer);
        if (!simResult.success) continue;

        const result = this.alphaBeta(
          simResult.state, depth - 1, alpha, beta, playerIndex, false
        );

        if (result.score > maxScore) {
          maxScore = result.score;
          bestMove = move;
        }

        alpha = Math.max(alpha, result.score);
        if (beta <= alpha) {
          this.stats.pruned++;
          break;
        }
      }

      const entry = { score: maxScore, move: bestMove, depth };
      this.transpositionTable.set(stateKey, entry);
      return entry;

    } else {
      let minScore = Infinity;

      for (const move of moves) {
        const simResult = this.moveSimulator.simulate(state, move, currentPlayer);
        if (!simResult.success) continue;

        const result = this.alphaBeta(
          simResult.state, depth - 1, alpha, beta, playerIndex, true
        );

        if (result.score < minScore) {
          minScore = result.score;
          bestMove = move;
        }

        beta = Math.min(beta, result.score);
        if (beta <= alpha) {
          this.stats.pruned++;
          break;
        }
      }

      const entry = { score: minScore, move: bestMove, depth };
      this.transpositionTable.set(stateKey, entry);
      return entry;
    }
  }

  hashState(state) {
    // Efficient state hashing for transposition table
    return JSON.stringify({
      turn: state.turn,
      phase: state.phase,
      active: state.activePlayerIndex,
      p0hp: state.players[0].hp,
      p1hp: state.players[1].hp,
      p0field: state.players[0].field.map(c => c?.instanceId),
      p1field: state.players[1].field.map(c => c?.instanceId)
    });
  }

  isGameOver(state) {
    return state.players[0].hp <= 0 || state.players[1].hp <= 0;
  }
}
```

---

### Phase 6: Integration
**File:** `js/ai/ai.js` (modify existing)

Wire the search into actual AI decision making:

```javascript
import { GameTreeSearch } from './GameTreeSearch.js';

const search = new GameTreeSearch();

export function makeAIMove(state, aiPlayerIndex, difficulty = 'hard') {
  const timeLimits = {
    easy: 500,
    medium: 1000,
    hard: 2000,
    expert: 5000
  };

  const maxTime = timeLimits[difficulty] ?? 2000;
  const { move, score } = search.findBestMove(state, aiPlayerIndex, maxTime);

  console.log(`[AI] Selected: ${move.type} score=${score}`);

  return move;
}
```

---

## File Summary

| Phase | File | Type | Description |
|-------|------|------|-------------|
| 1 | `js/ai/PositionEvaluator.js` | Modify | Context-aware `getKeywordValue()` |
| 2 | `js/ai/SelectionEnumerator.js` | New | Enumerate modal/target choices |
| 3 | `js/ai/MoveGenerator.js` | New | Generate all legal moves |
| 4 | `js/ai/MoveSimulator.js` | New | Execute moves via real controller |
| 5 | `js/ai/GameTreeSearch.js` | New | Alpha-beta with pruning |
| 6 | `js/ai/ai.js` | Modify | Wire search into AI |

---

## Verification Checkpoints

### Phase 1 Complete When:
- [ ] `getKeywordValue()` takes `(creature, state, playerIndex)`
- [ ] Toxic value scales with opponent's high-HP creatures
- [ ] Haste value differs based on whether attack was used
- [ ] Tests pass

### Phase 2 Complete When:
- [ ] Modal choice cards generate multiple moves
- [ ] Targeted effects enumerate all valid targets
- [ ] Nested selections (modal → target) work correctly

### Phase 3 Complete When:
- [ ] All creature plays enumerated (slot × dry drop)
- [ ] All attacks enumerated (respecting Lure)
- [ ] Moves ordered by heuristic quality

### Phase 4 Complete When:
- [ ] Moves with pre-selected choices execute correctly
- [ ] State cloning preserves all game data
- [ ] Effects trigger properly in simulation

### Phase 5 Complete When:
- [ ] Search finds lethal when available
- [ ] Deeper search finds better moves
- [ ] Pruning reduces nodes significantly
- [ ] Time limit respected

### Phase 6 Complete When:
- [ ] AI uses search for all decisions
- [ ] Difficulty affects search depth
- [ ] Game plays correctly end-to-end

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Depth 3 search | < 500ms |
| Depth 5 search | < 2000ms |
| Nodes per second | > 1000 |
| Pruning efficiency | > 50% |

---

## Future Enhancements (Post-MVP)

1. **Opening book** - Pre-computed first few turns
2. **Endgame tablebase** - Perfect play in simple endgames
3. **Neural network evaluation** - Learn evaluation from games
4. **Parallel search** - Web workers for multi-core
