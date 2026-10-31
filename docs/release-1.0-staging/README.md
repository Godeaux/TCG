# 1.0 foundation cutover — private DB installed, client cutover pending

Updated 2026-10-29. Frontend PR #126 is independent of this package.
This is a reviewable implementation boundary, not a claim of backend readiness.
The SQL below is additive infrastructure, not a completed game cutover.
On October 29 the owner authorized applying it in the real Supabase project.
Migrations 20261029142531 (foundation), 20261029142536 (reward settlement) and
20261029142542 (pack opening) are now applied. The reviewed 241-card non-token
catalog is seeded. Existing player balances, policies and client paths are unchanged.

`verify-live-reward-smoke.sql` passed on real Supabase: service settlement retries,
pack retries at zero balance, single debit, maximum rarity, insufficient funds,
and anonymous/authenticated invocation refusal. Synthetic account/game fixtures
were rolled back; post-check owners/reward receipts/opening receipts were all zero.
This is real-database transaction evidence, not real-input gameplay or concurrency
certification. Function ACLs separately confirm service-only EXECUTE. All ten new
tables have RLS and no browser DML grants. The advisor reports ten expected
RLS-with-no-policy notices: deny-by-default private tables, not missing browser access.
Existing public-schema security findings remain open; do not call the project hardened.

## Authenticated pack integration — October 29 follow-up

Migration `20261029144019` (`004-authenticated-packs.sql`) is installed in real
Supabase. Authenticated `tcg_economy()` and `tcg_open_pack(opening_id)` derive the
owner from `auth.uid()` plus the private permanent mapping. The caller cannot
supply a profile, cards, rarity or balance. Server RNG uses random UUID v4 bits
with rejection sampling; rarity weights match `packConfig.js`, including the
last-card uncommon guarantee. The account lock covers lookup, draw and commit.
An existing receipt is returned before checking funds/catalog availability;
responses include the CURRENT balance as well as the historical receipt.

The frontend published in PR #128 routes independently enrolled profiles through this
API and reveals the committed cards without another inventory write. A durable
opening ID survives failed responses/reload until Done. Storage failure refuses
before debit; unknown card definitions retain the receipt for a refreshed client.
Collection refresh uses private inventory for enrolled accounts. API errors never
silently fall back to a legacy debit. Unenrolled accounts remain on the old path;
the local candidate additionally refuses animation after a failed legacy debit.

**Not a full security cutover:** the frontend was published in PR #128 (`80e463d`);
owner mappings remain empty; no existing PIN accounts were migrated. Reward
validation still requires the authoritative gameplay service. The combined release
passed 5,277 unit tests, SQL checks and all 27 browser scripts on GitHub; post-merge
main CI and Pages deployment also succeeded.

## Atomic service match commit

Migration `20261029164157` (`008-atomic-match-commit.sql`) is installed. It provides
compare-and-swap checkpoint revision updates, request-bound idempotency and atomic
checkpoint/projection/receipt persistence. Only the trusted service can execute
it; browser access remains denied. The service must still authenticate the caller,
run GameController, validate legal actions and redact private seat projections.
The function does not certify those responsibilities or issue rewards itself.

`npm run check:db-staging` includes 40 refusal/retry/rollback checks.
`verify-live-match-commit.sql` passed with rolled-back fixtures. Independent local
PostgreSQL connections observed actual lock waits and proved stale contender
refusal, identical retry receipts and recovery on a fresh connection. See
`HARDENING-TRACKER.md` for exact scope and opt-in reproduction setup.
No accounts have been wiped. The owner prefers considering ONE reset only after
hardening is complete, and accepts verified migration as an alternative.

Evidence: 43 authenticated SQL checks in the normal contract; 7 client unit tests;
`e2e/server-pack-opening.mjs` drives the production collection/open/reveal/Done UI
with ONLY Supabase IO mocked (refusal, lost response, same intent at zero balance,
server cards, acknowledgment and failed legacy debit). Real Supabase transactional
smoke `verify-live-authenticated-packs.sql` passed with all synthetic rows rolled
back. Both public RPCs reject unauthenticated REST calls with HTTP 401 / 42501.
A subsequent opt-in authenticated live API test sent two overlapping HTTP pack
purchases against one synthetic pack: one success, one refusal, one receipt.
Five overlapping retries returned that receipt unchanged at zero balance. The
QA session was logged out and its exact ledger/profile/auth rows removed.
This does not certify verified-email registration or full two-client gameplay.

Migration `20261029144227` (`005-internal-trigger-acl.sql`) also removes browser
EXECUTE from the internal `rls_auto_enable` event hook. It verifies the existing
DDL trigger still enables RLS on a transactional QA table before removing that
table. This is least-privilege cleanup, not a claim that an event-trigger function
was previously a callable reward exploit. Existing public-schema findings remain.

`006-stat-view-permissions.sql` also makes the two legacy aggregate views respect
base-table RLS. A live synthetic before/after test reproduced cross-user reads
and then verified owner access with unrelated-user refusal; fixtures rolled back.
The current game does not query these views. Migration `20261029144749` records
this change. Migration `20261029145812` makes private owner bindings and accepted
actions append-only for the gameplay service (INSERT retained; UPDATE/DELETE/
TRUNCATE denied); six service-refusal checks run in the foundation suite. See `HARDENING-TRACKER.md` for the
remaining work and the explicit no-wipe-until-final-cutover direction.

The shared local node_modules lacked PGlite before this change (5,247 unit tests
passed but the default full contract stopped at the missing dependency). Using
the documented isolated PGlite path makes the full contract pass without changing
shared dependencies. Fresh `npm ci` installs the already-pinned dependency.

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

- **October 30, 18:01 owner change:** no email address required for signup.
  Username + password with provider/server-side credential verification.
  Anonymous Auth remains for guests. No plaintext PIN storage or browser
  credential verification. This supersedes the prior emailed-code requirement.
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

## Reward settlement candidate (October 29)

`002-reward-settlement-candidate.sql` adds private match seats, immutable validated
results, economy accounts and reward receipts. `settle_reward` locks the account
and credits balance, game stats and the receipt in one transaction. Replaying a
completed match returns the same receipt; a rematch requires a fresh match ID.
Browser roles cannot call it or access its tables. The service can insert results,
but cannot rewrite results, balances or receipts directly.

This is **not a live exploit fix yet**. The trusted service must independently
validate terminal gameplay and eligibility before recording results. The accepted
revision FK proves an action exists, not that a supplied winner is correct.
Private functions must not be wrapped in a permissive public RPC. Legacy public
profile/inventory writes remain unchanged until the coordinated cutover.

New accounts start at zero. Do not backfill unverified legacy owners or balances.
Receipt balances are historical, not the current account balance. The pack-opening candidate below adds the corresponding debit/delivery transaction;
server RNG and authenticated integration remain outstanding. Real multi-connection contention, authenticated REST refusal,
validated service integration and replacement of legacy write grants/policies
remain release gates. Reward eligibility (including concession farming) must be
an explicit server policy, not inferred from exactly-once settlement.

## Pack-opening candidate (October 29)

`003-pack-opening-candidate.sql` adds a deployment-owned non-token card catalog,
private best-rarity inventory and immutable opening receipts. `open_pack` uses the
same account lock as reward settlement. One transaction debits one pack, grants
five server-selected cards, preserves the better owned rarity and saves the
receipt. A retry returns the original contents even at zero balance. An opening
ID is scoped to its owner; another account cannot reuse its receipt.

The server, not the browser, must generate draws using the approved distribution
and authenticate profile ownership. The function only accepts service calls;
**do not forward browser-supplied cards to it**. Catalog/shape/rank/guaranteed-rarity
validation is not proof of fair randomness. Seed the catalog from reviewed
production non-token IDs before use; SQL tests intentionally use fixture IDs.
An empty catalog fails closed. Same opening ID means same user intent across
retries; new IDs are distinct purchases, not free rerolls. Deliver cards durably
before animation, and recover the receipt on reload rather than rolling again.

Pack tests cover rejected/malformed draws, unknown cards, negative balance
prevention, repeated receipts, stale lower-rarity updates, browser and service
write refusal, and an injected failure that rolls back debit AND new inventory.
This candidate does not yet change the live pack animation or grant endpoints.

## Local SQL validation (October 29)

PGlite 0.5.13 is pinned as a development-only dependency. The normal check contract
now runs foundation, settlement and pack-opening SQL checks:

```sh
npm ci
npm run check:db-staging
npm run check
```

Foundation checks cover candidate application, 12 browser-role read/delete
refusals, service writes, duplicate actions and safe empty-only rollback.
Settlement adds 65 checks for immutable results/receipts, retries, distinct seats
and rematches, no-result refusal, injected receipt failure rolling back balance
and stats, browser-role refusal and rollback preservation. Twenty queued requests
use a single embedded connection; they are **not** a parallel contention test.
The pack candidate adds 62 SQL checks. The staging-branch unit baseline is 5,247 tests.
Minimal FK fixtures do not certify live Supabase policy, email or service behavior.

For an existing shared node_modules checkout, an alternate installed PGlite can
be selected without mutating that shared dependency directory:

```sh
TCG_PGLITE_MODULE=/tmp/tcg-foundation-qa/node_modules/@electric-sql/pglite/dist/index.js npm run check:db-staging
```

Empty-only teardown runs `003-rollback-empty-packs.sql`, then
`002-rollback-empty-rewards.sql` before the foundation
rollback. The reward rollback locks all reward tables before checking emptiness;
it refuses to remove any populated ledger. Never use test fixture DELETEs as
production cleanup or roll back to client-writable rewards.

## Superseded email delivery prerequisite

Email signup was explicitly rejected by the owner on October 30 at 18:01.
The following is historical, not a release gate for username signup.

Supabase's current [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)
was checked October 28: the default sender only delivers to organization team
addresses and is not a production sender. Public email-code login therefore
requires configured custom SMTP (or an appropriate Auth send hook). Whether this
project already has custom delivery configured is unverified. Do not promise
public signup on the default sender, purchase a service, or weaken verification
to get around delivery limits. Configure and test delivery before account cutover.
