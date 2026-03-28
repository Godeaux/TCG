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
      if (c) lines.push(`  [slot ${i}] ${formatCard(c, true)}`);
    });
  }
  lines.push('');
  
  // SITUATION ASSESSMENT — help the LLM see the math
  if (qaState.phase === 'Combat') {
    const canAttackDirect = myCreatures.filter(c => c.canAttackPlayer);
    const canAttackAny = myCreatures.filter(c => c.canAttack);
    const totalDirectATK = canAttackDirect.reduce((s, c) => s + (c.currentAtk ?? c.atk ?? 0), 0);
    const oppHP = opp?.hp ?? 99;
    
    if (canAttackDirect.length > 0 && totalDirectATK >= oppHP) {
      lines.push(`🔥 LETHAL AVAILABLE: You have ${totalDirectATK} direct damage vs rival's ${oppHP} HP. Attack the rival directly to WIN.`);
    } else if (canAttackDirect.length > 0) {
      const pctDmg = Math.round(totalDirectATK / oppHP * 100);
      lines.push(`COMBAT MATH: ${canAttackDirect.length} creature(s) can attack rival directly for ${totalDirectATK} damage (${pctDmg}% of rival's ${oppHP} HP). Prioritize face damage unless a trade saves you from lethal.`);
    }
    if (canAttackAny.length > 0 && canAttackDirect.length === 0) {
      lines.push(`COMBAT MATH: You have ${canAttackAny.length} creature(s) that can attack enemy creatures (but not the rival directly due to summoning sickness).`);
    }
    if (canAttackAny.length === 0) {
      lines.push('COMBAT MATH: No creatures can attack this turn. Use ADVANCE to end combat.');
    }
    
    // Split eligible attackers into face-attackers vs creature-only
    const faceAttackers = canAttackAny.filter(c => c.canAttackPlayer);
    const creatureOnly = canAttackAny.filter(c => !c.canAttackPlayer);
    
    if (faceAttackers.length > 0) {
      lines.push('CAN ATTACK RIVAL DIRECTLY (ATTACK slot# PLAYER):');
      for (const c of faceAttackers) {
        lines.push(`  slot ${c.slot}: ${c.name} (${c.currentAtk ?? c.atk} ATK)`);
      }
    }
    if (creatureOnly.length > 0) {
      lines.push('CAN ATTACK CREATURES ONLY (summoning sickness — CANNOT hit PLAYER):');
      for (const c of creatureOnly) {
        lines.push(`  slot ${c.slot}: ${c.name} (${c.currentAtk ?? c.atk} ATK) — creatures only`);
      }
    }
    if (faceAttackers.length === 0 && creatureOnly.length === 0) {
      lines.push('No creatures can attack this turn.');
    }
    lines.push('');
  } else if (qaState.phase === 'Main 1' || qaState.phase === 'Main 2') {
    const emptyCount = myField.filter(c => !c).length;
    if (emptyCount === 0) {
      // Check if player has spells in hand
      const spells = me?.hand?.filter(c => c.type === 'Spell' || c.type === 'Free Spell') || [];
      const predators = me?.hand?.filter(c => c.type === 'Predator') || [];
      if (spells.length > 0) {
        lines.push(`⚠️ FIELD FULL — but you have ${spells.length} spell(s) in hand. Play a spell to gain advantage!`);
      } else if (predators.length > 0 && myCreatures.some(c => c.type === 'Prey')) {
        lines.push(`⚠️ FIELD FULL — consider playing a Predator with EAT to consume a weaker Prey and upgrade your board.`);
      } else {
        lines.push(`⚠️ FIELD FULL — no spells available. Trade aggressively in combat to open slots for stronger cards next turn.`);
      }
    } else if (myCreatures.length === 0) {
      lines.push('⚠️ EMPTY FIELD — play a creature first. Buff/heal spells have no effect without creatures on your field.');
    }
    lines.push('');
  }
  
  // Your hand (labeled "hand #" to distinguish from field "slot #")
  if (me?.hand) {
    lines.push(`YOUR HAND (${me.hand.length} cards) — use PLAY hand# to play:`);
    me.hand.forEach((c, i) => {
      lines.push(`  [hand ${i}] ${formatCard(c)}`);
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
    lines.push('  This is the PLAY phase. Play a card OR pass. Combat happens automatically after.');
    lines.push('  PLAY hand#                  — Play a card (e.g. PLAY 0)');
    lines.push('  PLAY hand# EAT slot#,slot#  — Play predator eating field prey for +1/+1 per prey');
    lines.push('  PLAY hand# DRY_DROP         — Play predator without eating (loses keywords!)');
    lines.push('  PASS                        — Skip playing (if field full or no good plays)');
    lines.push('  You CANNOT attack during this phase. Attacks happen next in Combat.');
  } else if (qaState.phase === 'Combat') {
    lines.push('  *** YOU CAN ONLY ATTACK DURING COMBAT — NOT PLAY CARDS ***');
    lines.push('  ATTACK slot# slot#    — Attack enemy creature (YOUR slot → ENEMY slot)');
    lines.push('  ATTACK slot# PLAYER   — Attack rival directly (YOUR slot → rival HP)');
    lines.push('  ADVANCE               — End combat');
    lines.push('  END_TURN              — End turn');
    lines.push('  NOTE: slot numbers are 0-2 (field positions), NOT hand indices!');
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
  lines.push('Think briefly (2-3 sentences max). Then your FINAL LINE must be ONLY the action command.');
  
  return lines.join('\n');
}

/**
 * Parse an LLM response into a structured action
 * 
 * @param {string} response - Raw LLM output
 * @returns {Object} Parsed action: { type, args }
 */
function parseAction(response) {
  // Aggressively find action commands anywhere in the response
  // Scan lines in reverse — last action wins
  const lines = response.trim().split(String.fromCharCode(10)).reverse();

  
  for (const line of lines) {
    const clean = line.trim().toUpperCase();
    
    // PLAY with EAT — match anywhere in line
    const playEatMatch = clean.match(/PLAY\s+\[?(\d+)\]?\s+EAT\s+\[?([\d,\s]+)\]?/);
    if (playEatMatch) {
      const idx = parseInt(playEatMatch[1]);
      const targets = playEatMatch[2].split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      return { type: 'play', handIndex: idx, eat: targets };
    }
    
    // PLAY with DRY_DROP — match anywhere
    const playDryMatch = clean.match(/PLAY\s+\[?(\d+)\]?\s+DRY[_\s]?DROP/);
    if (playDryMatch) {
      return { type: 'play', handIndex: parseInt(playDryMatch[1]), dryDrop: true };
    }
    
    // PLAY [index] — match anywhere in line
    const playMatch = clean.match(/PLAY\s+\[?(\d+)\]?/);
    if (playMatch) {
      return { type: 'play', handIndex: parseInt(playMatch[1]) };
    }
    
    // ATTACK [slot] [target/PLAYER] — match anywhere
    const attackMatch = clean.match(/ATTACK\s+\[?(\d+)\]?\s+\[?(PLAYER|\d+)\]?/);
    if (attackMatch) {
      const target = attackMatch[2] === 'PLAYER' ? 'player' : parseInt(attackMatch[2]);
      return { type: 'attack', attackerSlot: parseInt(attackMatch[1]), target };
    }
    
    // EAT [indices] — match anywhere
    const eatOnly = clean.match(/(?:^|\s)EAT\s+\[?([\d,\s]+)\]?/);
    if (eatOnly) {
      const targets = eatOnly[1].split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      return { type: 'eat', targets };
    }
    
    // DRY_DROP — match anywhere
    if (clean.match(/(?:^|\s)DRY[_\s]?DROP(?:\s|$)/)) {
      return { type: 'dryDrop' };
    }
    
    // ACTIVATE [index] — match anywhere
    const activateMatch = clean.match(/ACTIVATE\s+\[?(\d+)\]?/);
    if (activateMatch) {
      return { type: 'activate', index: parseInt(activateMatch[1]) };
    }
    
    // PASS — exact or at end of line
    if (clean.match(/(?:^|\s)PASS\s*$/)) {
      return { type: 'pass' };
    }
    
    // ADVANCE or PASS — exact or at end of line
    if (clean.match(/(?:^|\s)(?:ADVANCE|PASS)\s*$/)) {
      return { type: 'advance' };
    }
    
    // END_TURN — match anywhere
    if (clean.match(/(?:^|\s)END[_\s]?TURN\s*$/)) {
      return { type: 'endTurn' };
    }
  }
  
  // Fallback: scan the ENTIRE response for any action pattern (not line-by-line)
  const full = response.toUpperCase();
  
  const lastPlay = full.lastIndexOf('PLAY ');
  if (lastPlay >= 0) {
    const sub = full.substring(lastPlay);
    const m = sub.match(/PLAY\s+\[?(\d+)\]?(?:\s+EAT\s+\[?([\d,\s]+)\]?)?(?:\s+DRY[_\s]?DROP)?/);
    if (m) {
      const idx = parseInt(m[1]);
      if (m[2]) {
        const targets = m[2].split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        return { type: 'play', handIndex: idx, eat: targets };
      }
      if (sub.includes('DRY')) return { type: 'play', handIndex: idx, dryDrop: true };
      return { type: 'play', handIndex: idx };
    }
  }
  
  const lastAtk = full.lastIndexOf('ATTACK ');
  if (lastAtk >= 0) {
    const sub = full.substring(lastAtk);
    const m = sub.match(/ATTACK\s+\[?(\d+)\]?\s+\[?(PLAYER|\d+)\]?/);
    if (m) {
      const target = m[2] === 'PLAYER' ? 'player' : parseInt(m[2]);
      return { type: 'attack', attackerSlot: parseInt(m[1]), target };
    }
  }
  
  if (full.includes('END_TURN') || full.includes('END TURN')) return { type: 'endTurn' };
  if (full.match(/ADVANCE/)) return { type: 'advance' };
  
  return { type: 'unknown', raw: response.substring(response.length - 100) };
}

module.exports = { formatStatePrompt, parseAction, formatCard };
