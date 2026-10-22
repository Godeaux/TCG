# Review of c2e385e / 7d1bdc5 — 2026-10-20

Verdict: happy-path improvement, NOT crash-safe reconnect certification.
Existing contract rerun: 4982 tests / 56 files pass. Existing host/guest E2E logs
end successfully. I did not rerun the live browsers in this review.
Two additional production-controller regressions FAILED (log /tmp/tcg-review-sequencing.log).

## Confirmed findings

1. **Stale intent executes after restore.** restoreSequencing prepopulates synthetic
   `intent-N-restored` strings, but actual messages are `intent-N-TIMESTAMP`.
   _handleGuestIntent does not refuse counters BELOW _nextExpectedIntent.
   Restore seq14/next9/last8, send intent-5-111 ADVANCE_PHASE as valid guest:
   phase changes Main 1 -> Combat, seq increases to 15. It should do neither.
   The existing duplicate test lacks lobby/player identity, so validateAction
   rejects Unknown sender before executeAction. It is a false-positive guard test.
2. **Received is not processed.** _intentCounter advances before out-of-order buffering.
   Receive intent2 while expecting1; checkpoint still has seq0, but lastIntentCounter2.
   Restore uses max(nextExpectedIntent,last+1) and expects3, skipping unexecuted1/2.
   Persistence inside _processGuestIntent also precedes incrementing nextExpectedIntent;
   checkpoint semantics must be consistent, not patched with a maximum of unlike counters.
3. **Host-refresh E2E can skip its critical check.** It logs public mismatch without
   failing, only asserts private hand when !mismatch, logs rather than asserts the
   >=2 guest actions precondition, and conditionally probes a guest action. Both clients
   converging to the same old board would not establish continuity.

## Separate persistence blocker (source review, no induced DB race this pass)

saveGameState uses unconditional upsert; both clients can write; fire-and-forget saves
can arrive out of order. DB row can regress. broadcastSyncState passes the separate
broadcast payload._seq, whereas ActionBus saves pass its action seq: not one revision
namespace. In-memory max counters do not make the board+RNG+revision atomic or fresh.
A fresh host has no previous high-water mark to compare against. Rejecting older state
only on load is insufficient. Need an authoritative, monotonic database checkpoint
contract (server-side conditional write/CAS, coherent revision namespace and ownership).
Do not call the current row 'our own trusted record': either peer can write it.

Answers to the local model: no broad epoch rewrite yet; first fix the two demonstrated
intent bugs and false-positive tests. Monotonic checkpoint persistence is the next
prerequisite, before simultaneous reload or pending-decision scenarios. Durable snapshots
can be sufficient for a scoped design, but the current implementation is not proof.

## Reproduction

Copy the code below into tests/network/reviewSequencing.test.js and run
`npx vitest run tests/network/reviewSequencing.test.js`. Both tests currently fail.
Use finally/reset cleanup when incorporating them permanently. They are documented
here rather than silently adding known-red tests to the normal green contract.

```js
import { describe, it, expect, vi } from 'vitest';
import { createTestState, addCardToHand } from '../setup/testHelpers.js';
import { GameController } from '../../js/game/controller.js';
const send = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
vi.mock('../../js/network/sync.js', () => ({
  sendLobbyBroadcast: send,
  saveGameStateToDatabase: save,
  setSequencingSnapshotProvider: () => {},
}));
import { ActionBus } from '../../js/network/actionBus.js';


function fixture() {
  const state = createTestState({phase: 'Main 1', activePlayerIndex: 1});
  state.menu.mode = 'online';
  state.menu.lobby = {id: 1, host_id: 'host', guest_id: 'guest'};
  state.menu.profile = {id: 'host'};
  const controller = new GameController(state, {pendingConsumption: null},
    {onStateChange: () => {}, onBroadcast: () => {}, onSelectionNeeded: () => {}});
  const bus = new ActionBus({getState: () => state, getProfileId: () => 'host',
    getHostId: () => 'host', executeAction: a => controller.execute(a)});
  return {state, bus};
}
describe('Review: durable intent safety', () => {
  it('refuses a real stale action after restoration', () => {
    const {state,bus} = fixture();
    bus.restoreSequencing({actionSequence:14,nextExpectedIntent:9,lastIntentCounter:8});
    bus._handleGuestIntent({intentId:'intent-5-111', senderId:'guest',
      action:{type:'ADVANCE_PHASE',payload:{}}});
    expect(state.phase).toBe('Main 1');
    expect(bus.getSequence()).toBe(14);
    bus.reset();
  });
  it('does not restore past a buffered but unprocessed intent', () => {
    const {bus} = fixture();
    bus._handleGuestIntent({intentId:'intent-2-222',senderId:'guest',
      action:{type:'ADVANCE_PHASE',payload:{}}});
    const checkpoint = bus.getSequencingState();
    const fresh = fixture().bus;
    fresh.restoreSequencing(checkpoint);
    expect(fresh._nextExpectedIntent).toBe(1);
    bus.reset(); fresh.reset();
  });
});

```
