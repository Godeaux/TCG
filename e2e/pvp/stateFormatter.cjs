/**
 * State Formatter — Converts game state into an LLM-readable prompt
 * 
 * Takes __qa.getState() output and produces a compact, strategic prompt
 * that gives the LLM player everything they need to make a decision.
 * 
 * Key principles:
 * - Show YOUR hand (full detail), opponent hand count only
 * - Show both fields with stats, keywords, attack eligibility
 * - Include relevant rules reminders based on what's on the board
 * - Include game phase and what actions are available
 */

/**
 * Format a single card for display
 */
function formatCard(card, showDetails = true) {
  if (!card) return null;
  const stats = card.atk || card.currentAtk ? `${card.currentAtk ?? card.atk}/${card.currentHp ?? card.hp}` : '';
  const nut = card.nutrition ? ` (nut:${card.nutrition})` : '';
  const kw = card.keywords?.length ? ` [${card.keywords.join(', ')}]` : '';
  const atk = card.canAttack ? ' ⚔️' : '';
  const atkPlayer = card.canAttackPlayer ? '👤' : '';
  const barrier = card.hasBarrier ? ' 🛡️' : '';
  const frozen = card.isFrozen ? ' ❄️' : '';
  const paralyzed = card.isParalyzed ? ' ⚡' : '';
  const dryDrop = card.isDryDropped ? ' 🍂' : '';
  
  let line = `${card.name} (${card.type})`;
  if (stats) line += ` ${stats}`;
  if (nut) line += nut;
  if (kw) line += kw;
  if (barrier) line += barrier;
  if (frozen) line += frozen;
  if (paralyzed) line += paralyzed;
  if (dryDrop) line += dryDrop;
  if (atk) line += atk;
  if (atkPlayer) line += atkPlayer;
  
  if (showDetails && card.effectText) {
    line += `\n      Effect: ${typeof card.effectText === 'string' ? card.effectText.substring(0, 80) : ''}`;
  }
  
  return line;
}

/**
 * Build rules reminders based on current board state
 */
function buildRulesContext(state, playerIndex) {
  const rules = [];
  const myField = state.players?.[playerIndex]?.field?.filter(c => c) || [];
  const oppField = state.players?.[1 - playerIndex]?.field?.filter(c => c) || [];
  const hand = state.players?.[playerIndex]?.hand || [];
  
  // Always include phase rules
  if (state.phase === 'Main 1' || state.phase === 'Main 2') {
    rules.push('• 1 card per turn (Free Spells don\'t consume limit but need it available)');
    rules.push('• Predators eat 0-3 friendly prey when played for +ATK/+HP per nutrition');
    rules.push('• Dry drop (0 eaten) = base stats, no ability, loses all keywords');
  }
  
  if (state.phase === 'Combat') {
    rules.push('• Summoning sickness: new creatures can attack enemies but not rival directly');
    rules.push('• Ambush: no counter-damage. Blocks Poisonous.');
    rules.push('• Lure: MUST target this creature (attacks AND abilities)');
  }
  
  // Contextual rules based on what's on board
  const allCreatures = [...myField, ...oppField];
  const keywords = new Set();
  allCreatures.forEach(c => c.keywords?.forEach(k => keywords.add(k)));
  
  if (keywords.has('Barrier')) rules.push('• Barrier: blocks first damage instance, then removed. Blocks Toxic/Neurotoxic.');
  if (keywords.has('Poisonous')) rules.push('• Poisonous: kills attacker when defending. Blocked by Ambush.');
  if (keywords.has('Toxic')) rules.push('• Toxic: kills any creature it damages (regardless of HP). Blocked by Barrier.');
  if (keywords.has('Neurotoxic')) rules.push('• Neurotoxic: paralyzes enemy after combat (dies end of turn). Blocked by Barrier.');
  if (keywords.has('Hidden')) rules.push('• Hidden: can\'t be attacked but CAN be targeted by spells/abilities.');
  if (keywords.has('Invisible')) rules.push('• Invisible: can\'t be targeted by attacks OR abilities. Mass effects still hit.');
  if (keywords.has('Immune')) rules.push('• Immune: only takes damage from direct creature attacks.');
  if (keywords.has('Lure')) rules.push('• Lure: MUST target this creature for attacks AND abilities. Overrides Hidden/Invisible.');
  if (keywords.has('Haste')) rules.push('• Haste: can attack rival directly on the turn played.');
  
  return rules;
}

/**
 * Format the full game state as an LLM prompt
 * 
 * @param {Object} qaState - Output from window.__qa.getState()
 * @param {number} playerIndex - Which player this prompt is for (0 or 1)
 * @param {string} deckName - Name of this player's deck (for flavor)
 * @returns {string} Formatted prompt for the LLM
 */
function formatStatePrompt(qaState, playerIndex, deckName = 'Unknown') {
  const opponentIndex = 1 - playerIndex;
  const me = qaState.players?.[0]; // qaState always shows local player as [0]
  const opp = qaState.players?.[1];
  
  const myField = me?.field || [];
  const oppField = opp?.field || [];
  const myCreatures = myField.filter(c => c);
  const oppCreatures = oppField.filter(c => c);
  
  const lines = [];
  
  // Header
  lines.push(`GAME STATE — Turn ${qaState.turn} | Phase: ${qaState.phase}`);
  lines.push(`You are Player ${playerIndex + 1} (${deckName} deck)`);
  lines.push(`HP: You ${me?.hp ?? '?'} | Rival ${opp?.hp ?? '?'}`);
  lines.push('');
  
  // Your field
  lines.push('YOUR FIELD:');
  if (myCreatures.length === 0) {
    lines.push('  (empty)');
  } else {
    myField.forEach((c, i) => {
      if (c) lines.push(`  [slot ${i}] ${formatCard(c)}`);
    });
  }
  const emptySlots = myField.filter(c => !c).length;
  lines.push(`  (${emptySlots} empty slot${emptySlots !== 1 ? 's' : ''})`);
  lines.push('');
  
  // Rival field
  lines.push('RIVAL FIELD:');
  if (oppCreatures.length === 0) {
    lines.push('  (empty)');
  } else {
    oppField.forEach((c, i) => {
      if (c) lines.push(`  [slot ${i}] ${formatCard(c, false)}`);
    });
  }
  lines.push('');
  
  // Your hand
  if (me?.hand) {
    lines.push(`YOUR HAND (${me.hand.length} cards):`);
    me.hand.forEach((c, i) => {
      lines.push(`  [${i}] ${formatCard(c)}`);
    });
  }
  lines.push('');
  
  // Zones
  lines.push(`Deck: ${me?.deckSize ?? '?'} cards | Carrion: ${me?.carrion?.length ?? 0} | Exile: ${me?.exile?.length ?? 0}`);
  lines.push(`Rival: hand ${opp?.handSize ?? '?'} | deck ${opp?.deckSize ?? '?'} | carrion ${opp?.carrion?.length ?? 0}`);
  lines.push('');
  
  // Rules context
  const rules = buildRulesContext(qaState, playerIndex);
  if (rules.length > 0) {
    lines.push('RELEVANT RULES:');
    rules.forEach(r => lines.push(r));
    lines.push('');
  }
  
  // Pending context
  if (qaState.pendingContext) {
    lines.push('PENDING ACTION:');
    const ctx = qaState.pendingContext;
    if (ctx.type === 'pending_consumption') {
      lines.push(`  You played ${ctx.predator}. Choose prey to consume (0-3):`);
      ctx.options?.forEach((o, i) => {
        lines.push(`  [${i}] ${o.name} (${o.source}, nutrition ${o.nutrition})`);
      });
      if (ctx.canDryDrop) lines.push('  Or: DRY_DROP (base stats, no ability, lose keywords)');
    } else if (ctx.type === 'pending_reaction') {
      lines.push('  Opponent played a card/attacked. You may activate a trap:');
      ctx.reactions?.forEach((r, i) => {
        lines.push(`  [${i}] ${r.name} (${r.triggerType})`);
      });
      lines.push('  Or: PASS (do not activate)');
    }
    lines.push('');
  }
  
  // Available actions
  lines.push('AVAILABLE ACTIONS:');
  if (qaState.phase === 'Main 1' || qaState.phase === 'Main 2') {
    lines.push('  PLAY [hand_index]           — Play a card from hand');
    lines.push('  PLAY [hand_index] EAT [prey_indices]  — Play predator and eat prey');
    lines.push('  PLAY [hand_index] DRY_DROP  — Play predator without eating');
    lines.push('  ADVANCE                     — Move to next phase');
    lines.push('  END_TURN                    — Skip remaining phases, end turn');
  } else if (qaState.phase === 'Combat') {
    lines.push('  ATTACK [my_slot] [target_slot]  — Attack enemy creature');
    lines.push('  ATTACK [my_slot] PLAYER         — Attack rival directly');
    lines.push('  ADVANCE                         — End combat, move to next phase');
    lines.push('  END_TURN                        — End turn');
  } else {
    lines.push('  ADVANCE — Move to next phase');
  }
  if (qaState.pendingContext?.type === 'pending_consumption') {
    lines.push('  EAT [indices]  — Select prey to consume (comma-separated)');
    lines.push('  DRY_DROP       — Place without eating');
  }
  if (qaState.pendingContext?.type === 'pending_reaction') {
    lines.push('  ACTIVATE [index]  — Activate a trap');
    lines.push('  PASS              — Do not activate');
  }
  
  lines.push('');
  lines.push('Think briefly (2-3 sentences max), then output ONLY your action on the last line.');
  lines.push('Keep reasoning SHORT. The action line must be parseable.');
  lines.push('Format: ACTION [args]');
  
  return lines.join('\n');
}

/**
 * Parse an LLM response into a structured action
 * 
 * @param {string} response - Raw LLM output
 * @returns {Object} Parsed action: { type, args }
 */
function parseAction(response) {
  // Find the last line that looks like an action
  const lines = response.trim().split('\n').reverse();
  
  for (const line of lines) {
    const clean = line.trim().toUpperCase();
    
    // PLAY [index]
    const playMatch = clean.match(/^PLAY\s+\[?(\d+)\]?/);
    if (playMatch) {
      const idx = parseInt(playMatch[1]);
      
      // Check for EAT targets
      const eatMatch = clean.match(/EAT\s+\[?([\d,\s]+)\]?/);
      if (eatMatch) {
        const targets = eatMatch[1].split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        return { type: 'play', handIndex: idx, eat: targets };
      }
      
      // Check for DRY_DROP
      if (clean.includes('DRY_DROP') || clean.includes('DRY DROP')) {
        return { type: 'play', handIndex: idx, dryDrop: true };
      }
      
      return { type: 'play', handIndex: idx };
    }
    
    // ATTACK [my_slot] [target_slot/PLAYER]
    const attackMatch = clean.match(/^ATTACK\s+\[?(\d+)\]?\s+\[?(PLAYER|\d+)\]?/);
    if (attackMatch) {
      const mySlot = parseInt(attackMatch[1]);
      const target = attackMatch[2] === 'PLAYER' ? 'player' : parseInt(attackMatch[2]);
      return { type: 'attack', attackerSlot: mySlot, target };
    }
    
    // EAT [indices]
    const eatOnly = clean.match(/^EAT\s+\[?([\d,\s]+)\]?/);
    if (eatOnly) {
      const targets = eatOnly[1].split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      return { type: 'eat', targets };
    }
    
    // DRY_DROP
    if (clean.match(/^DRY[_\s]?DROP/)) {
      return { type: 'dryDrop' };
    }
    
    // ACTIVATE [index]
    const activateMatch = clean.match(/^ACTIVATE\s+(\d+)/);
    if (activateMatch) {
      return { type: 'activate', index: parseInt(activateMatch[1]) };
    }
    
    // PASS
    if (clean.match(/^PASS$/)) {
      return { type: 'pass' };
    }
    
    // ADVANCE
    if (clean.match(/^ADVANCE$/)) {
      return { type: 'advance' };
    }
    
    // END_TURN
    if (clean.match(/^END[_\s]?TURN$/)) {
      return { type: 'endTurn' };
    }
  }
  
  // Fallback: couldn't parse
  return { type: 'unknown', raw: response.substring(response.length - 100) };
}

module.exports = { formatStatePrompt, parseAction, formatCard };
