# Next local task — section B (paralysis timing)

Section A is complete: see `docs/OWNERSHIP-FIX-2026-10-21.md`. Full contract
passes 5,074 tests / 59 files. The section-A assignment below is retained as
history; do not redo it. Continue with section B only when resuming the backlog.

Reviewed baseline: `5e9795d`. Read `AGENTS.md` and
`docs/RESKIN-READINESS-REVIEW-2026-10-21.md` first. That review supersedes the morning
ordering, preserving the earlier review as evidence. Production baseline is green:
4,996 tests / 58 files, 246 existing warnings; interface-regression.mjs passes.

## Completed assignment: section A (historical acceptance criteria)

Fix the reproduced card-ownership bypass in js/network/actionValidator.js.
Normal cards have no uid, so `c.uid === card.uid` erroneously matches unrelated
cards. The diagnostic serialized/deserialized a guest attack using the host's
Hoatzin; validation accepted it and host HP fell 10→8.

1. Read the exact section-A reproduction and acceptance list. Add failing
   production-path refusal tests with real cards, lobby identities and controller;
   mock transport/storage only. Do not just test a copied identity helper.
2. Make all four affected ownership checks fail closed. Test missing/empty IDs,
   conflicting modern/legacy identity, wrong owner/zone, removed refs, and legitimate
   own-card actions. Preserve defined legacy support rather than silently guessing.
3. Run targeted tests and npm run check. Commit only this implementation + its tests
   and a short status note with exact results. Do not sweep untracked review artifacts
   into the implementation commit. No push, merge, live backend changes or reskin.
4. Report what changed, tests/exit status, commit SHA, and next backlog item.
   At 15 minutes, checkpoint actual evidence/blocker; do not loop reading/planning.

## Remaining ordered queue (do not attempt all in one run)

B. Paralysis timing when active attacker is paralyzed by defender.
C. Return-to-hand reset and copying already-copied abilities across snapshots.
D. Start-of-turn deaths suppressing onSlain.
E. Atomic/durable mandatory End decisions (announced fix not present at baseline).
F. Authoritative monotonic checkpoints; stage backend work if required, no live deploy.
G. Field release cleanup; robust Settings focus and genuine native-input regressions.
H. Bounded desktop/portrait and two-client acceptance matrix; report remaining gates.

The linked review has exact evidence, file locations and acceptance criteria for
all tasks, plus the separate auth/RLS production-release blockers. Finish one
bounded task at a time, keep tests meaningful, and do not call the game crash-safe
or fully ready merely because the existing suite is green.
