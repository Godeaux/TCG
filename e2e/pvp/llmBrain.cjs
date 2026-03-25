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

STRATEGY:
Your goal is to reduce the rival's HP to 0. Every decision you make — what to play, when to attack, what to save — should work toward that goal based on what's in your hand and what's on the board. Think about tempo, board control, and damage. Consider what the opponent might do next turn. Factor in keywords like Lure, Barrier, Poisonous, and Ambush when deciding whether to attack. Predators are strongest when you have prey on the field to consume — plan your turns around setting that up. Don't be passive — if you have the advantage, press it. If you're behind, find the play that gives you the best chance to come back.

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
I have two creatures that can attack the rival directly: a 4/2 at slot 0 and a 4/4 at slot 1. The combat math says 8 total damage and the rival is at 4 HP — that's lethal. I should attack directly with both creatures to win the game this turn. Starting with slot 0.
ATTACK 0 PLAYER
---
My field is full with three 1/1 creatures and I can't play any more cards. I should attack with what I have, trade into enemy threats, or advance if no good attacks exist. Trying to play a card when the field is full will fail.
ATTACK 0 0
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
        keep_alive: '30m',
        options: {
          temperature,
          num_predict: 300,
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
    
    // If parse failed, retry with a short action-only prompt
    if (action.type === 'unknown') {
      const retryPrompt = `You are playing Food Chain TCG. Your previous response didn't include a valid action command.\n\nGiven this board state:\n${statePrompt}\n\nOutput ONLY one action command. Nothing else. No explanation.\nExample: PLAY 0\nExample: ATTACK 0 PLAYER\nExample: END_TURN`;
      
      try {
        const retryResp = await fetch(OLLAMA_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model, prompt: retryPrompt, stream: false, keep_alive: '30m',
            options: { temperature: 0.1, num_predict: 30 },
          }),
        });
        const retryData = await retryResp.json();
        const retryAction = parseAction(retryData.response || '');
        
        if (retryAction.type !== 'unknown') {
          return {
            reasoning: fullReasoning + '\n[RETRY] ' + (retryData.response || '').trim(),
            action: retryAction,
            rawResponse: retryData.response || '',
            thinking,
            tokensUsed: (data.eval_count || 0) + (retryData.eval_count || 0),
            promptTokens: (data.prompt_eval_count || 0) + (retryData.prompt_eval_count || 0),
            timeMs: Date.now() - start,
            model,
            retried: true,
          };
        }
      } catch (e) { /* retry failed, return original */ }
    }
    
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
