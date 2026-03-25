/**
 * LLM Brain — Sends game state to a local model and gets a strategic decision
 * 
 * Calls Ollama API directly for fast local inference.
 * Each call = one game decision with full reasoning.
 */

const { formatStatePrompt, parseAction } = require('./stateFormatter.cjs');

const OLLAMA_URL = 'http://localhost:11434/api/generate';

/**
 * System prompt that teaches the LLM how to play Food Chain TCG
 */
const SYSTEM_PROMPT = `You are an expert Food Chain TCG player. You make strategic decisions based on board state.

KEY RULES:
- Each player has 10 HP. First to 0 loses. Both at 0 = draw.
- 20-card singleton deck. 3 field slots. No hand limit.
- 1 card per turn. Free Spells don't consume the limit.
- Predators eat 0-3 friendly prey when played. Gain +1/+1 per nutrition consumed.
- Dry drop (0 eaten) = base stats, no ability, loses keywords.
- Creatures have summoning sickness (can't attack rival directly until next turn, but CAN attack enemy creatures).
- Haste bypasses summoning sickness.

CARD TYPES:
- Prey: creatures with nutrition value. Good for early board + feeding predators.
- Predator: big creatures that eat prey for stats + abilities.
- Spell: one-use effect, exiled after. Costs card limit.
- Free Spell: one-use effect, doesn't cost limit but needs limit available.
- Trap: stays in hand, activates on opponent's turn when triggered.

STRATEGY TIPS:
- Board presence wins games. Play creatures early.
- Predators are strongest when you have prey to eat.
- Don't dry-drop a predator unless desperate — they lose all keywords.
- Trade favorably: attack enemies you can kill without losing your creature.
- Save removal spells for big threats.
- Go face (attack rival) when you have lethal or clear board advantage.

RESPONSE FORMAT:
1. Think about your play in 4-5 sentences. Consider threats, trades, board state, and lethal potential.
2. Your FINAL LINE must be ONLY the action command — nothing else on that line.

EXAMPLES:
---
My hand has a 3/3 Prey with Ambush and my opponent has a 2/2 creature. Playing the Prey gives me board presence and Ambush means I won't take counter-damage when I attack next turn. The opponent's creature is a threat if left unchecked but I can handle it in combat. I'll play the Prey now and attack with it next turn since summoning sickness only blocks direct player attacks.
PLAY 2
---
I have a Haste predator and a Prey on my field. If I eat the Prey, my predator becomes 5/5 and can attack the rival directly for 5 damage this turn thanks to Haste. The rival is at 7 HP so this puts them in lethal range. The Prey's nutrition of 2 boosts my predator from 3/3 to 5/5 which is worth sacrificing the board slot.
PLAY 0 EAT 0
---
My Gyrfalcon has Haste and the rival has no creatures. I can attack directly for 4 damage. The rival is at 6 HP so two more direct attacks wins the game. No reason to hold back.
ATTACK 0 PLAYER
---

Action commands: PLAY n, PLAY n EAT n,n,n, PLAY n DRY_DROP, ATTACK slot target/PLAYER, ADVANCE, END_TURN, EAT n, DRY_DROP, ACTIVATE n, PASS`;

/**
 * Call the LLM for a game decision
 * 
 * @param {Object} qaState - Game state from __qa.getState()
 * @param {number} playerIndex - Which player (0 or 1)
 * @param {string} deckName - Deck name for context
 * @param {Object} options - { model, temperature }
 * @returns {Object} { reasoning, action, rawResponse, tokensUsed, timeMs }
 */
async function getDecision(qaState, playerIndex, deckName, options = {}) {
  const model = options.model || 'qwen3-coder-next:latest';
  const temperature = options.temperature ?? 0.3;
  
  const statePrompt = formatStatePrompt(qaState, playerIndex, deckName);
  const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${statePrompt}`;
  
  const start = Date.now();
  
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature,
          num_predict: 500, // 4-5 sentences reasoning + action (rarely exceeds 350)
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const timeMs = Date.now() - start;
    const rawResponse = data.response || '';
    const thinking = data.thinking || '';
    const action = parseAction(rawResponse);
    
    // Combine thinking + response for full reasoning log
    const fullReasoning = thinking 
      ? `[Thinking] ${thinking.trim()}\n[Response] ${rawResponse.trim()}`
      : rawResponse.trim();
    
    return {
      reasoning: fullReasoning,
      action,
      rawResponse,
      thinking,
      tokensUsed: data.eval_count || 0,
      promptTokens: data.prompt_eval_count || 0,
      timeMs,
      model,
    };
  } catch (error) {
    return {
      reasoning: `Error: ${error.message}`,
      action: { type: 'endTurn' }, // Safe fallback
      rawResponse: '',
      tokensUsed: 0,
      promptTokens: 0,
      timeMs: Date.now() - start,
      model,
      error: error.message,
    };
  }
}

/**
 * Quick test — verify the brain can make a decision
 */
async function testBrain() {
  const mockState = {
    phase: 'Main 1',
    turn: 3,
    activePlayer: 0,
    localPlayer: 0,
    players: [
      {
        hp: 8,
        deckSize: 14,
        hand: [
          { name: 'Mockingbird', type: 'Prey', atk: 1, hp: 1, currentAtk: 1, currentHp: 1, keywords: [], effectText: 'Copy abilities of target animal' },
          { name: 'Harpy Eagle', type: 'Predator', atk: 5, hp: 5, currentAtk: 5, currentHp: 5, keywords: [], effectText: 'Add target enemy to hand' },
          { name: 'Swan Song', type: 'Spell', effectText: 'Heal 9' },
        ],
        field: [
          { name: 'Doctor Bird', type: 'Prey', currentAtk: 1, currentHp: 1, keywords: ['Free Play', 'Immune'], slot: 0, canAttack: false, canAttackPlayer: false },
          null,
          null,
        ],
        carrion: ['Carrier Pigeon'],
        exile: [],
      },
      {
        hp: 10,
        deckSize: 13,
        handSize: 5,
        field: [
          null,
          { name: 'Cane Toad', type: 'Predator', currentAtk: 4, currentHp: 3, keywords: ['Poisonous'], slot: 1, canAttack: true, canAttackPlayer: true },
          null,
        ],
        carrion: [],
        exile: [],
      },
    ],
    pendingContext: null,
    ui: { isMyTurn: true },
  };
  
  console.log('Testing LLM brain...');
  const decision = await getDecision(mockState, 0, 'Bird');
  console.log(`\nModel: ${decision.model}`);
  console.log(`Time: ${decision.timeMs}ms (${decision.promptTokens} prompt + ${decision.tokensUsed} gen tokens)`);
  console.log(`\nReasoning:\n${decision.reasoning}`);
  console.log(`\nParsed action: ${JSON.stringify(decision.action)}`);
  
  return decision;
}

module.exports = { getDecision, testBrain, SYSTEM_PROMPT };
