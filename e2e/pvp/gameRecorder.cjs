/**
 * Game Recorder — Captures state diffs at every action for post-game review
 * 
 * Wraps the PvP game loop and produces a JSON log file that Opus can review
 * to identify rule violations, unexpected behavior, and bugs.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

/**
 * Compact state snapshot — just the fields needed for diff comparison
 */
function snapshotState(qaState, actingPlayerIndex) {
  if (!qaState) return null;
  
  const formatField = (field) => (field || []).map(c => {
    if (!c) return null;
    return {
      name: c.name,
      type: c.type,
      atk: c.currentAtk ?? c.atk,
      hp: c.currentHp ?? c.hp,
      keywords: c.keywords ? [...c.keywords] : [],
      slot: c.slot,
      hasBarrier: c.hasBarrier || false,
      isFrozen: c.isFrozen || false,
      isParalyzed: c.isParalyzed || false,
      isDryDropped: c.isDryDropped || false,
    };
  });
  
  // Map from local perspective (players[0]=local, [1]=opponent) 
  // to absolute game perspective (p1=game player 1, p2=game player 2)
  const localIdx = qaState.localPlayer ?? 0;
  const local = qaState.players?.[0];  // Always the acting player's view
  const opponent = qaState.players?.[1];
  
  // If actingPlayerIndex is 0 (P1), local=P1, opponent=P2
  // If actingPlayerIndex is 1 (P2), local=P2, opponent=P1
  const gameP1 = actingPlayerIndex === 0 ? local : opponent;
  const gameP2 = actingPlayerIndex === 0 ? opponent : local;
  
  return {
    phase: qaState.phase,
    turn: qaState.turn,
    activePlayer: qaState.activePlayer,
    p1: {
      hp: gameP1?.hp,
      handSize: gameP1?.hand?.length ?? gameP1?.handSize ?? 0,
      deckSize: gameP1?.deckSize ?? 0,
      field: formatField(gameP1?.field),
      carrionSize: gameP1?.carrion?.length ?? 0,
      exileSize: gameP1?.exile?.length ?? 0,
    },
    p2: {
      hp: gameP2?.hp,
      handSize: gameP2?.hand?.length ?? gameP2?.handSize ?? 0,
      deckSize: gameP2?.deckSize ?? 0,
      field: formatField(gameP2?.field),
      carrionSize: gameP2?.carrion?.length ?? 0,
      exileSize: gameP2?.exile?.length ?? 0,
    },
  };
}

/**
 * Compute diff between two state snapshots
 */
function computeDiff(before, after) {
  if (!before || !after) return { error: 'missing state' };
  
  const changes = [];
  
  // HP changes
  for (const p of ['p1', 'p2']) {
    if (before[p].hp !== after[p].hp) {
      changes.push({ type: 'hp', player: p, from: before[p].hp, to: after[p].hp, delta: after[p].hp - before[p].hp });
    }
    if (before[p].handSize !== after[p].handSize) {
      changes.push({ type: 'hand', player: p, from: before[p].handSize, to: after[p].handSize });
    }
    if (before[p].deckSize !== after[p].deckSize) {
      changes.push({ type: 'deck', player: p, from: before[p].deckSize, to: after[p].deckSize });
    }
    if (before[p].carrionSize !== after[p].carrionSize) {
      changes.push({ type: 'carrion', player: p, from: before[p].carrionSize, to: after[p].carrionSize });
    }
    
    // Field creature changes
    for (let i = 0; i < 3; i++) {
      const bCreature = before[p].field?.[i];
      const aCreature = after[p].field?.[i];
      
      if (!bCreature && aCreature) {
        changes.push({ type: 'creature_entered', player: p, slot: i, creature: aCreature.name, stats: `${aCreature.atk}/${aCreature.hp}` });
      } else if (bCreature && !aCreature) {
        changes.push({ type: 'creature_died', player: p, slot: i, creature: bCreature.name });
      } else if (bCreature && aCreature && bCreature.name === aCreature.name) {
        // Same creature, check stat changes
        if (bCreature.hp !== aCreature.hp) {
          changes.push({ type: 'creature_hp', player: p, slot: i, creature: aCreature.name, from: bCreature.hp, to: aCreature.hp });
        }
        if (bCreature.atk !== aCreature.atk) {
          changes.push({ type: 'creature_atk', player: p, slot: i, creature: aCreature.name, from: bCreature.atk, to: aCreature.atk });
        }
        // Keyword changes
        const addedKw = (aCreature.keywords || []).filter(k => !(bCreature.keywords || []).includes(k));
        const removedKw = (bCreature.keywords || []).filter(k => !(aCreature.keywords || []).includes(k));
        if (addedKw.length) changes.push({ type: 'keyword_added', player: p, slot: i, creature: aCreature.name, keywords: addedKw });
        if (removedKw.length) changes.push({ type: 'keyword_removed', player: p, slot: i, creature: aCreature.name, keywords: removedKw });
      }
    }
  }
  
  return changes;
}

/**
 * Check for suspicious diffs — auto-flag potential rule violations
 */
function checkSuspicious(action, diff, before, after) {
  const flags = [];
  
  // HP above 10
  if (after.p1.hp > 10) flags.push('P1 HP above 10: ' + after.p1.hp);
  if (after.p2.hp > 10) flags.push('P2 HP above 10: ' + after.p2.hp);
  
  // Dead creature still on field
  for (const p of ['p1', 'p2']) {
    for (const c of (after[p].field || [])) {
      if (c && c.hp <= 0) flags.push(`Dead creature on ${p} field: ${c.name} (${c.hp}hp)`);
    }
  }
  
  // Combat damage math check
  if (action?.type === 'attack' && action?.target !== 'player') {
    // Find the attacker and defender
    const attackerPlayer = action.attackerSlot !== undefined ? 'p1' : 'p2'; // simplified
    const hpChanges = diff.filter(d => d.type === 'creature_hp');
    // If attacker has ATK X, defender should lose X HP (unless Barrier/Immune)
  }
  
  // Card played but still in hand (hand size didn't decrease)
  if (action?.type === 'play') {
    const activeP = before.activePlayer === 0 ? 'p1' : 'p2';
    const handChange = diff.find(d => d.type === 'hand' && d.player === activeP);
    if (!handChange || handChange.to >= handChange.from) {
      flags.push(`Card played but hand didn't shrink (${activeP})`);
    }
  }
  
  return flags;
}

/**
 * Create a new game recording
 */
function createRecording(deck1, deck2, model) {
  const gameId = `game-${Date.now()}`;
  const recording = {
    id: gameId,
    timestamp: new Date().toISOString(),
    decks: { p1: deck1, p2: deck2 },
    model,
    actions: [],
    result: null,
    suspiciousCount: 0,
  };
  
  return {
    /**
     * Record an action with before/after state diffs
     */
    recordAction(turn, player, phase, actionType, reasoning, stateBefore, stateAfter) {
      const before = snapshotState(stateBefore, player);
      const after = snapshotState(stateAfter, player);
      const diff = computeDiff(before, after);
      const suspicious = checkSuspicious({ type: actionType }, diff, before, after);
      
      const entry = {
        turn,
        player,
        phase,
        action: actionType,
        reasoning: reasoning?.substring(0, 200),
        diff: diff.length > 0 ? diff : undefined,
        suspicious: suspicious.length > 0 ? suspicious : undefined,
      };
      
      recording.actions.push(entry);
      if (suspicious.length > 0) recording.suspiciousCount += suspicious.length;
      
      // Auto-save after every action (crash-safe)
      this.save();
      
      return { entry, suspicious };
    },
    
    /**
     * Record game result
     */
    setResult(winner, reason, finalState, viewingPlayerIndex = 0) {
      // Map from local perspective to absolute game perspective
      let p1hp, p2hp;
      if (finalState?.players) {
        if (viewingPlayerIndex === 0) {
          p1hp = finalState.players[0]?.hp;
          p2hp = finalState.players[1]?.hp;
        } else {
          p1hp = finalState.players[1]?.hp;
          p2hp = finalState.players[0]?.hp;
        }
      }
      recording.result = {
        winner,
        reason,
        turns: finalState?.turn || recording.actions.length,
        finalHP: { p1: p1hp, p2: p2hp },
      };
    },
    
    /**
     * Save recording to disk
     */
    save() {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      const filePath = path.join(LOG_DIR, `${gameId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(recording, null, 2));
      return filePath;
    },
    
    /**
     * Get summary for console output
     */
    getSummary() {
      const actionCount = recording.actions.length;
      const suspiciousActions = recording.actions.filter(a => a.suspicious);
      return {
        id: gameId,
        decks: `${deck1} vs ${deck2}`,
        actions: actionCount,
        suspicious: suspiciousActions.length,
        suspiciousDetails: suspiciousActions.map(a => ({
          turn: a.turn,
          action: a.action,
          flags: a.suspicious,
        })),
        result: recording.result,
      };
    },
    
    recording,
  };
}

module.exports = { createRecording, snapshotState, computeDiff, checkSuspicious };
