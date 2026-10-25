# Public history contract — CP03

Version 1. Implementation: `js/game/historyEvents.js`. Presentation metadata only;
rules never consult the stream. `computeStateChecksum` remains unchanged.

## Transport and identity

`state.historyEvents = {version:1, matchGeneration:1, sequence, events}`.
Events use `m<generation>:e<sequence>`, increasing only when an event is recorded.
No RNG, timestamp or card-ID allocation. Each fresh game starts an empty stream;
identity is scoped to that game, not globally unique. Retain the last 2000 events.
A controller action lazily takes its first recorded event ID as `actionRef`;
subsequent nested events share it with increasing `ordinal`. Independent strikes
remain independent actions. Bound selection callbacks preserve that scope; pending
play-trap snapshots persist `historyActionRef` and public consumed-card context so
refresh resumes the real onPlay on the live field instance, exactly once. A pending
End decision records nothing until resolved. Refusals/prompts allocate no group ID.
Standalone effect captures still default to their own event ID. No correlation uses
local network intent timestamps. All four UI restart paths clear history and advance
matchGeneration; recovery adopts the authoritative generation.
Pending prompts are not events. Resolved partial effects are recorded immediately,
so the existing pending-operation snapshot preserves them without replay.

Event fields: version, id, turn, phase, actorIndex (absolute seat), kind, cause,
actionRef, ordinal, sourceIds, targetIds, aligned before/after arrays, facts.
`facts` is the concrete name of the spec's conceptual `outcomes` array.
Entity projection explicitly lists public card identity/definition ID (art reference),
name/type/faction, owner/zone/slot, current HP (floored at zero), printed HP/ATK,
effective ATK, prey NUT (zero preserved; null for non-prey), keywords/statuses/token.
Players carry absolute seat identity, name and HP. Empty/unknown tiles have no card
identity. History retains a public card's known past, never enumerates private zones.

Before/after are captured at semantic mutation boundaries, not English logs or a
whole-action board diff. Combat captures both participants before damage, explicit
applied damage/Barrier prevention, keyword terminal causes, and snapshots before
cleanup; dead tokens go to void, non-tokens to carrion. Incoming events are validated
against closed field sets and copied/deep-frozen. Recording also copies before freeze:
neither future board mutation nor mutation of transport objects can change the past.
Copying/freezing must never freeze live engine cards. Source/target IDs use instance IDs.

## Reconciliation

Deterministic local emission on both peers. Confirmation does not execute an already
optimistic action. Duplicate confirmations at/below current sequence do nothing;
gaps request full recovery rather than running against an incorrect board.
Existing optimistic created-ID reconciliation additionally rebuilds immutable public
snapshots/ID lists/fact identities. Never mutate frozen events in place.
Rejected optimistic actions trigger the existing full authoritative recovery path;
while recovery is pending dispatch is blocked. Recovery replaces board, RNG cursor,
history, event counter and action sequencing. It does not append events. Ordinary
snapshot application follows the existing force/freshness authority rules.
Missing/invalid legacy history resets to empty; it never retains another match's log.
Authoritative match generation is adopted, not checked against a fresh client's 1.

Malformed/unknown fields, bad versions, misaligned identities, duplicate/out-of-order
IDs or IDs beyond the snapshot counter are dropped. Formatter only reads public
facts/snapshots and returns text. UI must use textContent. Image paths must derive
from validated definition IDs, never accept arbitrary transport URLs.

## Evidence and remaining coverage

`tests/network/historyRecovery.test.js`: actual GameController attacks, both seats,
immutable capture and JSON restore, PRNG neutrality, metadata checksum independence,
legacy reset/private-field rejection, optimistic duplicate-confirmation and rejected
recovery, out-of-order confirmation, created-ID reconciliation. Full CP04 semantic
coverage remains tracked in UI-OVERHAUL-EXECUTION.md; this contract does not assert
all card effects are instrumented. Live backend and native Safari are separate gates.
