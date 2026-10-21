# Next local task: host refresh without losing the match

Starting point: `d5c0c1d` on `stabilize/multiplayer-foundation`.
Read AGENTS.md and docs/STABILIZATION.md. No UI overhaul or broad auth rewrite.

## Why this next

Guest reload now has live evidence. Host reload does not. The host owns action
ordering, so a host refreshing can invalidate the still-connected guest's intent
sequence even if the board looks right. This is a concrete lead, NOT a confirmed bug.

Code evidence to inspect:
- js/network/actionBus.js constructor/reset starts `_seq = 0` and
  `_nextExpectedIntent = 1`. The surviving guest may already have sent many intents.
- js/network/lobbyManager.js only arms `pendingAuthoritativeSync` for guests.
- Database restoration and ordinary sync have different private-zone protection.
Do NOT simply force-apply any guest snapshot to the host or remove sequence guards.

## Bounded reproduction first (20 minutes)

1. Extend e2e/multiplayer-ui.mjs with a reconnect-player option (default guest;
   host for this case), preserving separate contexts and real DOM actions.
2. Ensure the guest has completed at least two confirmed actions BEFORE reloading
   host. Record seq and intent counters read-only. Do not reload guest.
3. Reload host, click Rejoin, then continue through a guest action, host action and
   at least two subsequent draws. Compare exact card IDs/instance IDs in hands/decks,
   field, HP, turn, phase, names, and PRNG cursor after settled actions.
4. Capture first failing action and both logs. If it passes, record that result and
   stop this task; do not invent a fix or expand into every reconnect scenario.

## If reproduced

Add a failing regression for that exact failure, then make the smallest coherent
repair to reconnect/session sequencing and authoritative restoration. Preserve
rejection of duplicate/stale actions; do not blindly reset a counter on each message.
Test a delayed/duplicate pre-rejoin message cannot execute twice. If the design needs
an epoch/checkpoint handshake, explain the evidence and narrow proposal before a
large rewrite. Never accept unverified peer state merely to satisfy a test.

## Completion

- Live host-refresh run: real actions after rejoin, subsequent draws agree, no hidden
  recovery loop or buffered-intent stall; winner/loser agree at match end.
- Existing guest-refresh regression still passes.
- npm run check green (baseline 4979 tests / 56 files; 246 pre-existing lint warnings).
- Commit with exact reproduction, fix, validation and remaining limits in
  docs/STABILIZATION.md. Capture video if practical.
- Random trap coverage is a separate requirement: TCG_REQUIRE_TRAPS=0 is acceptable
  for this focused reconnect run, but explicitly report it as not required.

## Keep it bounded

Send concise updates every few steps. After 20 minutes, report the exact failure or
passing evidence and next concrete action. If no new evidence after another 20
minutes, stop and document the blocker instead of rereading the same files.
No simultaneous reload, pending trap reload, rematch, mobile or backend migrations
in this task. Plaintext PIN/RLS issues remain release blockers, separately tracked.
