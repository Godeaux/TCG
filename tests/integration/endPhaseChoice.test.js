/**
 * E — an End-phase choice survives a refresh (docs/CDE-E-DESIGN-2026-10-22.md,
 * spec docs/RESKIN-READINESS-REVIEW-2026-10-21.md §E).
 *
 * The defect being closed: PROCESS_END_PHASE used to shift the head creature off
 * `endOfTurnQueue` and *then* discover it needed a target. If the seat had no
 * answer (a refresh, a dropped connection, a cancelled prompt), the creature was
 * already gone from the queue, so the next tick saw an empty queue and finalized
 * — the mandatory effect was silently skipped.
 *
 * The fix moves the boundary: the entry goes to `state.endOfTurnPending` before
 * the effect resolves, so every decision is observable and serializable, and a
 * missing/invalid answer refuses **before** mutation.
 *
 * Every test below drives production operations only: GameController.execute()
 * with the same actions the UI drain loop dispatches, plus the network snapshot
 * round trip. No test implements game logic.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestState,
  createTestCreature,
  ensureRegistryInitialized,
} from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
import { ActionTypes } from '../../js/state/actions.js';
import { buildLobbySyncPayload, applyLobbySyncPayload } from '../../js/network/serialization.js';

ensureRegistryInitialized();

const BELL_BIRD = 'bird-prey-white-bellbird'; // onEnd: selectFromGroup all-entities → damage 3
const ROBIN = 'bird-prey-robin'; // onEnd: summonTokens ×2 (non-interactive)
const AXOLOTL = 'amphibian-prey-axolotl'; // 2/2, no onEnd

/**
 * The UI passes `effectTargets` descriptors of exactly this shape (see
 * `toEffectTarget` in js/ui.js) — creature by instanceId, player by index.
 */
const creatureTarget = (creature) => ({ instanceId: creature.instanceId, type: 'creature' });
const playerTarget = (playerIndex) => ({ type: 'player', playerIndex });

const makeController = (state, handlers = {}) =>
  new GameController(
    state,
    { pendingConsumption: null },
    {
      onStateChange: () => {},
      onBroadcast: () => {},
      onSelectionNeeded: () => {},
      ...handlers,
    }
  );

/**
 * Build a turn-4 End phase for player 0 holding a Bell Bird (owes a mandatory
 * target) and, optionally, a Robin behind it (auto-resolving, proves ordering).
 */
const setupEndPhase = ({ withRobin = true, bellBird: withBellBird = true } = {}) => {
  const state = createTestState();
  state.turn = 4;
  state.activePlayerIndex = 0;
  // Enter End from Main 2 the way a real turn does — queueEndOfTurnEffects only
  // runs on the transition into End, never from a state already sitting in it.
  state.phase = 'Main 2';
  state.log = [];

  let bellBird = null;
  if (withBellBird) {
    bellBird = createTestCreature(BELL_BIRD, 0, 0, state).creature;
    bellBird.summonedTurn = 1;
  }

  let robin = null;
  if (withRobin) {
    robin = createTestCreature(ROBIN, 0, withBellBird ? 1 : 0, state).creature;
    robin.summonedTurn = 1;
  }

  const { creature: victim } = createTestCreature(AXOLOTL, 1, 0, state);
  victim.summonedTurn = 1;

  const ctrl = makeController(state);
  // Enter End the way the UI does, so the queue is engine-derived.
  ctrl.execute({ type: ActionTypes.ADVANCE_PHASE, payload: {} });
  if (state.phase !== 'End') {
    throw new Error(`fixture failed to reach End phase (phase=${state.phase})`);
  }
  return { state, ctrl, bellBird, robin, victim };
};

const processEnd = (ctrl, effectTargets = [], extra = {}) =>
  ctrl.execute({
    type: ActionTypes.PROCESS_END_PHASE,
    payload: { effectTargets, ...extra },
  });

const resolveChoice = (ctrl, effectTargets = [], extra = {}) =>
  ctrl.execute({
    type: ActionTypes.RESOLVE_END_PHASE_CHOICE,
    payload: { effectTargets, ...extra },
  });

const eggCount = (state, playerIndex) =>
  state.players[playerIndex].field.filter((c) => c?.id === 'token-blue-egg').length;

// ---------------------------------------------------------------------------
// 1. Refusal before mutation
// ---------------------------------------------------------------------------
describe('§E: a mandatory End-phase target missing from the action refuses before mutation', () => {
  it('refuses the creature instead of draining it, with zero state mutation', () => {
    const { state, ctrl, bellBird, robin, victim } = setupEndPhase();
    expect(state.endOfTurnQueue.map((c) => c.instanceId)).toEqual([
      bellBird.instanceId,
      robin.instanceId,
    ]);

    const oppHpBefore = state.players[1].hp;
    const myHpBefore = state.players[0].hp;
    const myDeck = state.players[0].deck.length;
    const oppDeck = state.players[1].deck.length;

    const result = processEnd(ctrl);

    expect(result.success).toBe(true);
    expect(result.needsChoice).toBe(true);
    expect(result.pendingChoice.instanceId).toBe(bellBird.instanceId);
    expect(result.pendingChoice.cardName).toBe('White Bellbird');
    expect(result.pendingChoice.type).toBe('selectTarget');
    // The caller needs a renderable prompt, not just a flag.
    expect(result.pendingChoice.candidates.length).toBeGreaterThan(0);

    // Nothing happened. That is the whole point of the refusal.
    expect(state.players[1].hp).toBe(oppHpBefore);
    expect(state.players[0].hp).toBe(myHpBefore);
    expect(state.players[0].deck.length).toBe(myDeck);
    expect(state.players[1].deck.length).toBe(oppDeck);
    expect(victim.currentHp).toBe(2);
    expect(eggCount(state, 0)).toBe(0);

    // The owed choice is recorded instead: moved, never dropped.
    expect(state.endOfTurnPending?.instanceId).toBe(bellBird.instanceId);
    expect(state.endOfTurnQueue.map((c) => c.instanceId)).toEqual([robin.instanceId]);
    expect(state.endOfTurnProcessing).toBe(false);
    expect(state.endOfTurnFinalized).toBe(false);
  });

  it('an invalid target answer refuses again and keeps the entry pending', () => {
    const { state, ctrl, bellBird, victim } = setupEndPhase({ withRobin: false });

    expect(processEnd(ctrl).needsChoice).toBe(true);

    // A target that is not one of the candidates (e.g. a stale id from before a
    // refresh) must not be able to consume the pending entry.
    const bogus = processEnd(ctrl, [{ instanceId: 'card-does-not-exist', type: 'creature' }]);
    expect(bogus.needsChoice).toBe(true);
    expect(state.endOfTurnPending?.instanceId).toBe(bellBird.instanceId);
    expect(victim.currentHp).toBe(2);

    const bogusResolve = resolveChoice(ctrl, [
      { instanceId: 'card-does-not-exist', type: 'creature' },
    ]);
    expect(bogusResolve.needsChoice).toBe(true);
    expect(victim.currentHp).toBe(2);

    // …and a valid answer afterwards still works, exactly once.
    const answered = resolveChoice(ctrl, [creatureTarget(victim)]);
    expect(answered.success).toBe(true);
    expect(victim.currentHp).toBeLessThan(0); // 2 HP into 3 sonic damage
    expect(state.endOfTurnPending).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Re-entrancy while the prompt is open
// ---------------------------------------------------------------------------
describe('§E: re-entrancy while a prompt is open is a no-op', () => {
  it('a second PROCESS_END_PHASE re-offers the same choice without advancing', () => {
    const { state, ctrl, bellBird, robin, victim } = setupEndPhase();

    const first = processEnd(ctrl);
    const second = processEnd(ctrl);
    const third = processEnd(ctrl);

    for (const result of [second, third]) {
      expect(result.needsChoice).toBe(true);
      expect(result.pendingChoice.instanceId).toBe(bellBird.instanceId);
    }
    expect(second.pendingChoice.type).toBe(first.pendingChoice.type);

    expect(state.endOfTurnPending?.instanceId).toBe(bellBird.instanceId);
    expect(state.endOfTurnQueue.map((c) => c.instanceId)).toEqual([robin.instanceId]);
    expect(victim.currentHp).toBe(2);
    expect(eggCount(state, 0)).toBe(0); // the queue never marched past the refusal
  });
});

// ---------------------------------------------------------------------------
// 3. No early finalization
// ---------------------------------------------------------------------------
describe('§E: nothing finalizes or passes the turn while a choice is owed', () => {
  it('END_TURN is refused while a creature is pending', () => {
    const { state, ctrl } = setupEndPhase();
    processEnd(ctrl);

    const turn = state.turn;
    const active = state.activePlayerIndex;
    ctrl.execute({ type: ActionTypes.END_TURN, payload: {} });

    expect(state.turn).toBe(turn);
    expect(state.activePlayerIndex).toBe(active);
    expect(state.endOfTurnFinalized).toBe(false);
    expect(state.endOfTurnPending).not.toBeNull();
  });

  it('an empty queue does not finalize while a choice is owed', () => {
    // The dangerous shape a refresh used to produce: nothing left in the queue,
    // a mandatory effect still owed.
    const { state, ctrl } = setupEndPhase({ withRobin: false });
    processEnd(ctrl);
    expect(state.endOfTurnQueue).toHaveLength(0);
    expect(state.endOfTurnPending).not.toBeNull();

    const result = processEnd(ctrl);
    expect(result.finalized).toBeUndefined();
    expect(result.needsChoice).toBe(true);
    expect(state.endOfTurnFinalized).toBe(false);

    // Once answered, the very next tick finalizes normally.
    resolveChoice(ctrl, [playerTarget(1)]);
    expect(state.players[1].hp).toBeLessThan(30);
    const done = processEnd(ctrl);
    expect(done.finalized).toBe(true);
    expect(state.endOfTurnFinalized).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Answering runs the effect exactly once and the queue resumes
// ---------------------------------------------------------------------------
describe('§E: answering the owed choice runs the effect exactly once', () => {
  it('sequential effects stay ordered behind the refusal', () => {
    const { state, ctrl, victim } = setupEndPhase();

    processEnd(ctrl);
    expect(eggCount(state, 0)).toBe(0); // Robin waits behind Bell Bird

    const answered = resolveChoice(ctrl, [creatureTarget(victim)]);
    expect(answered.success).toBe(true);
    expect(answered.moreInQueue).toBe(true);
    expect(state.endOfTurnPending).toBeNull();
    expect(state.endOfTurnProcessing).toBe(false);

    // Answering twice cannot double-damage or double-run.
    const again = resolveChoice(ctrl, [creatureTarget(victim)]);
    expect(again.success).toBe(false);
    expect(again.error).toMatch(/pending/i);

    // Bell Bird resolved once (3 damage on a 2 HP creature), Robin still owed.
    expect(state.players[1].field[0]).toBeNull();
    expect(eggCount(state, 0)).toBe(0);

    // Next tick: Robin auto-resolves, no prompt, no choice needed. The field has
    // three slots and two are occupied, so only one of the two eggs fits.
    const robinResult = processEnd(ctrl);
    expect(robinResult.needsChoice).toBeUndefined();
    expect(eggCount(state, 0)).toBe(1);
    expect(robinResult.moreInQueue).toBe(false);

    // Final tick finalizes.
    const done = processEnd(ctrl);
    expect(done.finalized).toBe(true);
  });

  it('a non-interactive End effect never reports needsChoice (no regression)', () => {
    const { state, ctrl, robin, victim } = setupEndPhase({ bellBird: false });

    const result = processEnd(ctrl);
    expect(result.needsChoice).toBeUndefined();
    expect(state.endOfTurnPending).toBeNull();
    expect(eggCount(state, 0)).toBe(2);
    expect(victim.currentHp).toBe(2);
    expect(robin).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. Cancellation policy — mandatory, reopen-on-cancel, never skipped
// ---------------------------------------------------------------------------
describe('§E: cancellation policy — End-phase effects are mandatory', () => {
  it('a cancelled prompt (no targets) re-offers the choice instead of skipping it', () => {
    const { state, ctrl, bellBird, victim } = setupEndPhase({ withRobin: false });

    processEnd(ctrl); // prompt opens
    // ESC / "No Target" ⇒ the UI dispatches with an empty effectTargets array.
    const cancelled = resolveChoice(ctrl, []);

    expect(cancelled.needsChoice).toBe(true);
    expect(state.endOfTurnPending?.instanceId).toBe(bellBird.instanceId);
    expect(state.endOfTurnFinalized).toBe(false);
    expect(victim.currentHp).toBe(2);
    // The creature is still on the board and still owes its effect, so the next
    // drain tick re-prompts rather than dropping it.
    expect(state.players[0].field.some((c) => c?.instanceId === bellBird.instanceId)).toBe(true);
  });

  it('force resolves the owed creature through the interactive fallback rather than skipping it', () => {
    const { state, ctrl, victim } = setupEndPhase({ withRobin: false });
    let prompted = null;
    ctrl.onSelectionNeeded = (selection) => {
      prompted = selection;
    };

    processEnd(ctrl);
    // force = "the seat declines to choose"; the effect still runs and falls back
    // to the interactive prompt (the legacy single-player path), never to silence.
    const forced = resolveChoice(ctrl, [], { force: true });
    expect(forced.success).toBe(true);
    expect(prompted).not.toBeNull();
    expect(prompted.selectTarget).toBeTruthy();

    prompted.onSelect({ type: 'creature', creature: victim });
    expect(victim.currentHp).toBeLessThan(0);
    expect(state.endOfTurnPending).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Durability — the owed choice crosses a refresh
// ---------------------------------------------------------------------------
describe('§E: the owed choice survives a snapshot restore', () => {
  const roundTrip = (host) => {
    const guest = createTestState();
    guest.menu.profile = { id: 'guest', username: 'Guest' };
    applyLobbySyncPayload(guest, JSON.parse(JSON.stringify(buildLobbySyncPayload(host))), {
      forceApply: true,
    });
    return guest;
  };

  it('rehydrates the pending creature against the live field, not a clone', () => {
    const { state: host, bellBird, robin } = setupEndPhase();
    processEnd(makeController(host), []);

    const payload = buildLobbySyncPayload(host);
    expect(payload.game.endOfTurnPending).toBe(bellBird.instanceId);
    expect(payload.game.endOfTurnQueue).toEqual([robin.instanceId]);

    const guest = roundTrip(host);
    expect(guest.endOfTurnPending?.instanceId).toBe(bellBird.instanceId);
    // Identity matters: the resolver mutates the creature it runs, so a rehydrated
    // clone would resolve to nothing and the effect would vanish silently.
    expect(guest.endOfTurnPending).toBe(guest.players[0].field[0]);
    expect(guest.endOfTurnQueue[0]).toBe(guest.players[0].field[1]);
    expect(guest.endOfTurnFinalized).toBe(false);
  });

  it('the restored seat can answer the choice exactly once and finish the End phase', () => {
    const { state: host } = setupEndPhase();
    processEnd(makeController(host), []);
    const hostVictimHp = host.players[1].field[0].currentHp;

    const guest = roundTrip(host);
    const guestVictim = guest.players[1].field[0];
    const guestCtrl = makeController(guest);

    // A refresh restores the prompt rather than finalizing past it.
    expect(processEnd(guestCtrl).needsChoice).toBe(true);

    const answered = resolveChoice(guestCtrl, [creatureTarget(guestVictim)]);
    expect(answered.success).toBe(true);
    expect(guestVictim.currentHp).toBeLessThan(0);
    expect(guest.endOfTurnPending).toBeNull();

    // Exactly once: a second answer has nothing to consume.
    expect(resolveChoice(guestCtrl, [creatureTarget(guestVictim)]).success).toBe(false);

    processEnd(guestCtrl); // Robin
    const done = processEnd(guestCtrl);
    expect(done.finalized).toBe(true);
    // The host never mutated while its choice sat unanswered.
    expect(host.players[1].field[0].currentHp).toBe(hostVictimHp);
  });

  it('a pending creature that died during the same End phase drops out cleanly', () => {
    const { state: host, bellBird } = setupEndPhase({ withRobin: false });
    processEnd(makeController(host), []);
    expect(host.endOfTurnPending?.instanceId).toBe(bellBird.instanceId);

    // Board change (e.g. a trap/refresh combination) removed it from the field.
    host.players[0].field[0] = null;
    const guest = roundTrip(host);
    expect(guest.endOfTurnPending).toBeNull();
    expect(guest.endOfTurnQueue).toEqual([]);
    expect(guest.endOfTurnFinalized).toBe(false);
    // …so the End phase can finalize instead of waiting on a ghost.
    expect(processEnd(makeController(guest)).finalized).toBe(true);
  });
});
