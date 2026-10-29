# 1.0 foundation cutover — staged, NOT deployed

Updated 2026-10-28. Frontend PR #126 is independent of this package.
This is a reviewable implementation boundary, not a claim of backend readiness.
The SQL below is an additive staging candidate, not an executable full cutover.
No production schema, accounts, or gameplay data were changed in this pass.

## Current evidence

Read-only live metadata captured October 28 confirms RLS enabled on all 11 public
tables, but `profiles` has an authenticated SELECT policy with `true` and a
`Users can claim profile` UPDATE policy with `USING true` and only a target-owner
check. More restrictive policies do not cancel these permissive policies.
The client still downloads and compares `pin`, changes `current_auth_id` on login,
and clears ownership on logout. Treat neither a PIN nor that mutable link as
proof of legacy ownership.

`game_sessions` has only lobby_id, game_state, action_sequence, updated_at and id;
participants have ALL access. The client upserts full state unconditionally.
Serialization includes both hands, decks and traps. RLS against outsiders alone
cannot hide the opponent's private state from a legitimate participant.

Metadata-only evidence (no player rows or credentials):
`qa-evidence/food-chain-1-polish-2026-10-28/backend-metadata.json` in the workspace.
This is not a complete schema backup: grants, triggers, constraints, functions,
Realtime authorization and Auth/provider configuration must also be exported.

## Account contract

- Supabase provider-verified emailed code for persistent accounts; anonymous Auth
  for guests. No custom PIN storage or browser credential verification.
- Profile IDs remain stable so decks, friends and cosmetics retain references.
- Permanent account ownership lives separately from session presence. Logout
  signs out; it must never make a profile claimable.
- Do not backfill owner mappings from current_auth_id or PIN. Existing profiles
  remain quarantined until an independently verified owner mapping is approved.
  Fresh verified users may create fresh profiles; no automatic reuse by username.
- Guest matches create no persistent progression. Only verified account owners
  may save decks. Match rewards/stats are written by the authoritative service,
  never by a browser updating its own packs or card inventory.
- Public profile view explicitly includes only approved presentation fields.
  PIN, auth IDs, email, internal account claims and private decks are excluded.

## Concrete implementation sequence

1. Export complete live schema/policies/grants and verify backup restore on an
   isolated target. Confirm email delivery/redirects/limits without purchasing
   a plan. Provision a staging target; no branching that incurs fees implicitly.
2. Apply `001-foundation-candidate.sql` to staging. It creates private owner and
   match-state tables with no browser access; it does not grant migration claims.
   Add provider-backed account UI, OTP expiry/resend errors, and anonymous guest
   entry behind a release flag. Replace all profile-current_auth_id ownership
   joins with immutable mappings; preserve FK profile IDs.
3. Build an authoritative service that executes the existing GameController,
   verifies the caller's seat and legal action, and produces separate seat views.
   Browser requests carry match generation, expected revision and action ID.
   Durable commit uses one transaction for revision check, action deduplication,
   canonical state and both seat projections. Network delivery occurs only after
   commit. Reject stale generations/revisions; repeat action IDs return the
   already-committed result. Do not authorize arbitrary caller-supplied snapshots.
4. Projection inventory must cover hand/deck/traps, pending selections/reactions,
   logs, history, targeting payloads, reconnect state, errors and debug APIs.
   Counts/opaque handles are not card identities. Preserve private choices only
   in the entitled seat projection. Browser QA access is not authorization.
5. Freeze new legacy games and account changes during cutover. Drain active games
   or explicitly end them; do not let old clients continue on the v2 transport.
   Deploy v2 client/service, replace ALL old ownership policies (not just add
   stricter policies), revoke browser canonical-state writes and PIN reads, and
   disable the old PIN and claim endpoints. Expose public profile presentation
   through an explicit allowlist. Delete obsolete credentials only after verified
   backup/retention approval, not as part of this additive staging candidate.
6. Run the refusal/acceptance matrix below against staging, then controlled live
   QA accounts. Enable general traffic only once every required row passes.

## Required tests before cutover

- Fresh verified account, expired/wrong/replayed OTP, resend throttling,
  sign-out/relogin and two devices retaining the same stable owner mapping.
- Anonymous user cannot claim a legacy account, grant inventory/rewards, change
  stats, edit another profile/deck, or promote itself to a persistent owner.
- Different verified user cannot steal ownership by username/PIN/auth-ID update.
- Two valid seats plus unrelated third identity: own hand visible, opponent
  identities absent from wire payload, storage, reconnect, history and errors.
- Simultaneous actions, duplicate retry, stale writer, stale rematch generation,
  out-of-order delivery and service crash between commit and delivery: exactly
  one durable legal transition; no checkpoint regression or duplicate reward.
- JSON snapshot round trip and reload during every pending choice, both-client
  loss/rejoin, portrait background/resume, rematch/change-deck and completed game.
- Native iPhone portrait acceptance remains separate from Chromium emulation.
- Execute `npm run check` plus production browser suite; green unit tests alone
  are not the live security or recovery certificate.

## Rollback

Before v2 accepts real games, disable v2 flag and discard only the empty staging
schema using the provided rollback after checking it contains no data.
After v2 accepts traffic, rollback means maintenance/read-only mode and reverting
the frontend/service to a compatible v2 build. Preserve canonical state and
owner mappings. Do NOT restore plaintext-PIN login, permissive claim policies,
or client-writeable canonical state as a rollback. Recovery from backup requires
an explicit point-in-time data reconciliation, not an automatic DROP command.

## Remaining product work, not prerequisites to this frontend PR

Practice Play again/Change deck needs a single tested reset path (the existing
AI, menu and online resets duplicate state setup). It is deliberately not wired
to online rematch broadcasts. Large-art responsive derivatives and check-dependent
Pages deployment remain follow-ups. Missing artwork/audio are owner-managed and
not release blockers. Pristine animation stays deferred.

## Local SQL validation (October 28)

PGlite 0.5.13 (PostgreSQL WASM) passed: candidate applies, 12 browser-role
read/delete attempts refused, service writes succeed, duplicate action refused,
populated rollback refuses and retains owner/game rows, empty rollback succeeds.
This exercises SQL semantics with minimal FK dependencies, NOT the live policies,
provider email, complete schema, authoritative reducer, or atomic commit service.

Reproduce without adding a game dependency:

```sh
npm install --prefix /tmp/tcg-foundation-qa --no-audit --no-fund @electric-sql/pglite@0.5.13
TCG_PGLITE_MODULE=/tmp/tcg-foundation-qa/node_modules/@electric-sql/pglite/dist/index.js \
  node docs/release-1.0-staging/validate-foundation.mjs
```
