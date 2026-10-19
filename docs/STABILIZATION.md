# Multiplayer stabilization record

Updated: 2026-10-18

## Mission and scope

Owner direction: reliable online multiplayer whenever the game is opened, smooth
play, and progressive defect elimination. Single-player is not the objective.
No new card expansion, domain purchase, or backend replacement is part of this
initial cleanup. Zero known release-blocking bugs is a gate; no finite test suite
proves that all bugs are absent.

## Source baseline and preservation

- Latest published source inspected: `22d732f` (2026-04-03 UTC).
- Former local HEAD: `da4e11d`, 36 commits behind.
- Active work: `stabilize/multiplayer-foundation` in the normal project checkout.
- Unfinished expansion preserved in `archive/card-expansion-2026-10-18`, commit
  `a5a8035`: 44 files, including all untracked tools and card archives.
- A separate local file backup, SHA-256 manifest, and tracked binary diff are in
  workspace `backups/food-chain-tcg/2026-10-18-pre-stabilization/`.
- Archive commit deliberately bypassed formatting hooks to preserve exact bytes;
  it is not a release candidate. Neither copy is an off-machine backup.
- The original `main` branch remains unchanged. Do not release it without first
  checking its relationship to current `origin/main`.

## Initial gates and remediation

Before cleanup, latest source: 4,951/4,954 tests passed (three failures in two
files), formatting passed, lint had 0 errors and 246 warnings. These failures
predate this branch.

The consumption tests passed `{ state, creature }` helper wrappers where real
cards were required. One test could succeed without placing any creature.
Replaced these with production-controller assertions, including refusal outside
a main phase and preservation of hand/field while consumption is pending.

The old Regen fixtures invented boosted stats without running the operations
that track gains. Replacement tests use actual consumption/buff resolution.
They reproduced a real missing targeted-buff gain update. Network regressions
also reproduced loss of consumption/buff gains during snapshot hydration.
Both paths now preserve the Regen ceiling. Coverage includes JSON transport,
full lobby sync, forced reconnect restoration, legacy snapshots, and object
isolation. Existing historical failures were not simply suppressed or skipped.

Verified after a fresh `npm ci`: **4,962/4,962 tests across 51 files passed**;
formatting passed; lint had 0 errors and 246 pre-existing warnings. Node 24.21.0,
Vitest 4.1.12. `npm audit` initially reported 19 development-dependency advisories
(2 critical, 13 high, 4 moderate). Compatible lockfile updates without `--force`
reduced the report to zero; package version ranges were unchanged.

Run `npm run check` for the current baseline. Tests do not require live Supabase.
CI now uses Node 24 and the same command, including stabilization-branch pushes.
The pre-push hook runs the same checks locally. GitHub execution and production
rollout remain unverified until this branch is published and checked there.

## Verified service state and unknowns

- Public static site and published sample assets were reachable on October 18.
- Supabase project hostname returns NXDOMAIN. This does NOT prove deletion.
- Supabase account project status, database contents, backups, billing, RLS,
  anonymous-auth settings, and Realtime publication settings remain unverified.
- No SQL migrations/schema backup were found in the inspected source.
- Client login currently reads a stored PIN and compares it in browser code.
  Authentication and row-level access must be reviewed before public restoration.
- GitHub Pages API reports legacy deployment from `main`, root path. A failed
  Test & Lint workflow did not prevent the latest deployment. CI is not a gate yet.
- Browser startup imports Supabase JS from esm.sh at major version `@2`; pinning
  or bundling runtime dependencies is pending. Google Fonts is another dependency.
- This cleanup does not restore service or publish a new build.

## Ordered next work

1. Keep the baseline green; review fixes and preserve a rollback reference.
2. Inspect the existing Supabase account/project before choosing restore versus
   recreate. Export schema, data, RLS, grants, functions/triggers and configuration
   if available. Never overwrite a surviving database to match guessed client calls.
3. Establish a disposable backend/staging environment with versioned migrations
   and repeatable initialization; verify authentication and authorization first.
4. Audit action authority, hidden-information exposure, snapshot completeness,
   reconnect/idempotency, PRNG state, stale/out-of-order traffic, and host loss.
   Existing host-authoritative architecture is not itself proof of cheat resistance.
5. Build browser-driven two-client acceptance tests against staging.
6. Switch Pages to an explicitly check-dependent deployment workflow and verify
   that failing checks cannot publish. Keep production unchanged until verified.
7. Choose an availability plan that does not depend on incidental player traffic;
   any recurring paid service commitment needs the owner's budget decision.
8. Add outside-in monitoring and a tested restore/rollback runbook.

## Backend inventory (from client calls, NOT an authoritative schema)

`profiles`, `decks`, `lobbies`, `game_sessions`, `player_cards`, `friendships`,
`duel_invites`, `bug_reports`, `bug_report_votes`; Supabase Auth and Realtime
channels are additional dependencies. Table names alone cannot recover policies,
constraints, indexes, functions, existing users, or stored decks.

## Multiplayer relaunch acceptance criteria

- Two fresh browser profiles can authenticate, create/join a lobby, choose decks,
  finish setup, and complete real matches through normal UI interactions.
- Core faction matchups, consumption, target selection, traps, simultaneous death,
  and end-of-turn effects behave according to CORE-RULES.md on both clients.
- Refresh/reconnect during setup, targeting, combat and end-of-turn recovers the
  correct turn, HP ceiling, keywords, card identities, and pending decisions.
- Retries/duplicate/out-of-order messages cannot duplicate plays, consume a card
  twice, grant extra actions, or silently corrupt state.
- Unauthorized users cannot read private decks/hands or write another player's
  profile, saved deck, lobby, or match. PIN verification must not rely on the client.
- Desktop and mobile browsers have usable touch/targeting, readable cards, and no
  blocking rendering bugs; full matches, rematches, and leaving/rejoining work.
- Backend unavailability produces a clear recoverable state, not an endless spinner.
- Staging runs pass; production smoke check, rollback, backup restore, monitoring,
  and idle-period availability are verified before calling the service reliable.

## Known remaining quality debt

246 pre-existing lint warnings; historical tests include weak or self-implemented
assertions outside the repaired files. Full coverage and all mechanics have not
been audited. Additional healing, stat-copying, and runtime snapshot fields need
review; the scoped HP-gain fix is not a complete engine/network certification.
