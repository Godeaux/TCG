# Next local task: repair intent restoration and its acceptance tests

Start at reviewed HEAD 7d1bdc5 plus review-doc commit. Read AGENTS.md,
docs/HOST-REFRESH-REVIEW.md and docs/STABILIZATION.md. This supersedes the
previous host-refresh task; do not repeat its exploratory investigation.

## Evidence already established — reproduce once, then fix

Copy the two exact regressions in HOST-REFRESH-REVIEW.md into the network tests.
They use the real GameController and valid host/guest identities. Both fail now:
- stale intent5 executes after restore expects9;
- buffered but unprocessed intent2 makes restore expect3 rather than1.
The existing duplicate test passes for the wrong reason (Unknown sender).

## Deliverable: one focused commit

1. Define checkpoint fields precisely: last CONFIRMED action revision; contiguous
   consumed/processed guest-intent high-water mark; guest-local sent counter is not
   proof of host execution. Do not derive processed progress from highest received.
   Rejections need a defined terminal response too; never strand their retries.
2. Refuse stale counters before executing game mutations. Remove synthetic restored
   IDs as a dedup guarantee. For already-consumed retries, replay a known outcome or
   trigger explicit authoritative recovery when outcome history is unavailable.
   Do not silently drop a retry and leave the guest pending forever.
3. Capture coherent progress after a terminal intent outcome, with matching board
   and RNG. Test out-of-order2-before1, duplicates before/after reconstructing the bus,
   and retries of rejected actions. Preserve normal ordered progress and unchanged
   state for refused duplicates. Include a valid fresh intent to prove fixture works.
4. Tighten the host-refresh harness: require >=2 CONFIRMED guest intents before reload,
   assert unchanged pre/post checkpoint state (not just agreement between clients),
   exact hand/deck identities, and require a post-rejoin guest action and host action
   to confirm. Do not skip checks when mismatch is true or when it is the wrong turn;
   progress legally until the required turn or fail on a bounded timeout.
5. npm run check (baseline 4982/56, 246 existing warnings), then real isolated-context
   host AND guest reload runs. Report actual exit status, not grep-for-FAIL counts.
   Trap coverage may be explicitly optional for these focused runs. Commit complete
   notes including remaining persistence blocker; capture counters/evidence.

## Bounds

20-minute checkpoint: new regressions reproduced, state the chosen invariant.
If no new evidence for 20 more minutes, crystallize the blocker rather than loop.
No UI overhaul, rematch, simultaneous reloads, pending-trap reload, auth migrations
or broad epoch protocol in this task. Do NOT claim crash-safe persistence afterward:
unconditional multi-writer upserts and mixed revision namespaces remain a separate
high-priority follow-up, detailed in HOST-REFRESH-REVIEW.md. If the minimal intent fix
requires changing that contract, stop with the exact dependency and proposed scope.
