# Hardening and game cutover tracker

Updated 2026-10-29. Owner authorized broad DB hardening and real-game integration,
with preservation of working gameplay. No wipe now; consider one final reset only
when the complete hardening/cutover is ready. Migration of existing PIN accounts
is acceptable, but existing mutable profile claims are not independent ownership
proof. Do not silently preserve unverified balances as trusted progression.

## Shipped to real Supabase

- Private immutable ownership, match checkpoint/action tables and reward ledger.
- Exactly-once settlement and atomic pack debit/inventory/receipt operations.
- 241 reviewed non-token card IDs; no browser writes to private economy.
- Authenticated ownership-derived pack RPC, server randomness, current-balance
  reads and retry recovery at zero balance. No browser-supplied draws.
- Browser EXECUTE removed from internal RLS event hook; automatic RLS retested.
- Owner bindings and accepted-action identities are now append-only even for the
  gameplay service; service UPDATE/DELETE/TRUNCATE are denied, INSERT retained.
  Six new service refusal checks are included in the normal foundation contract.
- Stats/favorite-card views changed to security-invoker. Before-change test
  reproduced unrelated-identity access to synthetic rows; after-change tests
  retain owner access and refuse the unrelated identity. Synthetic rows rolled
  back inside migration. Current game code does not query either view.

## Published in main — PR #128, 80e463d

- Real collection/open/reveal/Done UI consumes server-committed pack contents for
  enrolled profiles. Pending intent survives reload and lost responses.
- Private inventory/balance refresh for enrolled profiles.
- Failed legacy debit no longer opens a pack in the local candidate.
- 7 unit tests, 43 authenticated SQL checks, production browser refusal/recovery
  regression. Full check passes with documented isolated PGlite dependency.
- Active combined worktree: food-chain-server-integration on
  harden/server-economy-2026-10-29. It merges foundation 513efd8 with the latest
  overnight frontend 825252c (including no-X/half-blur). Combined contract:
  5,272 tests / 78 files plus all SQL checks; all 27 browser scripts passed across
  the initial run and a resumed tail. Initial script 22 stopped on a preexisting
  .inspection-close selector after the owner-requested X removal. Corrected three
  affected tests to click the actual card preview and assert dismissal, then
  reran scripts 22–27. No earlier browser checks weakened or skipped. The opt-in
  live-profile script was syntax-checked, not run (no real-player login).
  Logs: /tmp/tcg-integration-ui.log and /tmp/tcg-integration-ui-tail.log.
  These changes shipped through PR #128. Both PR CI and post-merge main CI passed.
  Pages deployed; live files matched the release and desktop/mobile smoke checks passed.

## Additional authority regression — October 29

- Parent reproduced five failures before the fix in the actual ActionBus,
  controller and JSON snapshot restore (not a replacement game implementation).
- RESOLVE_DISCARD now requires the sender's own outstanding discard choice and
  an actual card in that seat's hand. Controller independently validates the
  choice and consumes the canonical hand object, refusing replay/foreign cards.
- Pending discard choices survive full JSON snapshot restoration and completion
  clears the choice on the receiving state. Legitimate out-of-turn discard passes.
- All five regression tests pass; full contract passes 5,277 tests / 79 files plus
  all SQL suites using the documented isolated PGlite dependency. Relevant browser
  match/reconnect and selection lifecycle checks rerun after the change: both pass.
- These changes shipped in PR #128. Host validation is defense in depth,
  not a substitute for authenticated server authority or private seat projections.
- The separate five-minute local review timed out without a report or executed
  tests. It is not counted as independent certification; no local tester is active.

## Atomic match persistence — October 29 follow-up

- Migration `20261029164157` / `008-atomic-match-commit.sql` is installed in real
  Supabase. The private service-only function locks the checkpoint, checks the
  permanently mapped participant, binds the action ID to actor/revision/request,
  compares the expected revision, and commits checkpoint + both projections +
  receipt together. Finished matches refuse new actions; old retries still work.
- Service direct checkpoint UPDATE/DELETE/TRUNCATE and accepted-action INSERT
  are revoked; existing service bootstrap INSERT remains. This is a persistence
  boundary, NOT an authenticated gameplay endpoint or a game-rules validator.
- 40 local SQL checks pass, including forced late receipt failure rolling back
  the checkpoint, stale/foreign/browser refusal, finished retries and ACLs.
- `verify-live-match-commit.sql` passed on real Supabase; fixtures rolled back.
  The separate attempted multi-call SQL-tool test did not demonstrate observable
  connection overlap. Its synthetic fixtures were explicitly removed; private
  checkpoint/action/seat counts and the QA auth-user count returned to zero.
- Independent local PostgreSQL 18.4 connections then demonstrated TWO actual
  lock waits: competing IDs produced one accepted revision and one SQLSTATE40001;
  duplicate requests returned one receipt. Closing the writer and retrying on a
  fresh connection recovered the terminal receipt. Exactly two actions/revision2
  remained after one normal and one terminal action. Temporary server stopped.
- Reproducer: `validate-match-contention.mjs` (opt-in isolated local PostgreSQL).
  Needs a fresh database `tcg_atomic_qa`, superuser `tcg_qa`, loopback port55439;
  `TCG_PG_MODULE` may point to an isolated `pg/lib/index.js`. No repo dependency
  or background service was added. This is not live gameplay certification.

## Still required — do not call the live game hardened

1. **Account ownership:** provider-backed login and verified registration;
   stable owner bindings; signout never relinquishes ownership; expiry/replay/
   resend cases; verify email delivery configuration. Preserve existing profile
   IDs only with independently verified migration. Fresh accounts or a future
   owner-approved reset avoid trusting legacy claims. No ownership backfill yet.
2. **Authoritative gameplay:** run existing GameController on trusted service;
   validate identity, seat, legal action and result; persist revision/action-ID
   atomic transitions. Client snapshots/winner declarations are not evidence.
   Address serializable pending selections, randomness and crash recovery.
3. **Private seat projections:** opponent hand/deck/trap identities excluded from
   all network, reconnect, logs/history/targeting/debug paths. Never expose
   canonical state to participants merely because they are in the match.
4. **Economy cutover:** server-authored terminal results; explicit eligibility
   (concessions/short matches/rematches/abuse limits); remove legacy pack, stats
   and inventory mutation only after replacement works. Audit direct rarity
   purchases and every other currency/card-grant path, not just opening packs.
5. **Remaining tables/policies:** profiles/PIN reads and claims, decks, sessions,
   lobbies, invitations, friendships, bug reports/votes and legacy match logs.
   Inventory all permissive policies: restrictive additions don't replace ORed
   permissive policies. Test owner, opponent, unrelated, expired and guest roles.
6. **Operational quality:** schema/grant/config backup and restore drill;
   service secrets/caller authorization; sensible payload and rate limits;
   indexes/FK/uniqueness validation against actual data and query plans;
   idempotent migrations, rollout version gates, logging without hidden cards or
   credentials, and post-cutover recovery that never restores unsafe writes.
7. **Release gate:** independent concurrent connections, live authenticated
   two-client matches, third-identity refusal, both-client reconnect, stale tabs,
   crash-after-commit, rematches and repeated completed-game restore; all tests
   and exact-release asset checks. Native iPhone acceptance remains separate.

## Known boundaries

- Empty verified owner/economy ledgers after QA; existing users not switched.
- Legacy published reward path remains vulnerable until coordinated cutover.
- Real JWT API test now passed on Supabase: unenrolled guest gets null economy
  and HTTP 403 pack refusal. A single explicitly synthetic QA owner with one
  pack then received two overlapping HTTP purchase requests: one 200, one 400,
  one receipt/debit, zero remaining packs. Five simultaneous retries returned
  the identical receipt with no extra debit. QA session logged out; exact QA
  ledger/profile/auth rows removed; local bearer-token file cleared.
  Test script: e2e/live-pack-api-check.mjs (explicit opt-in, never normal CI).
  Synthetic owner mapping bypassed real registration for test setup only; this
  does NOT certify verified-email enrollment or two-browser full gameplay.
- Single PGlite connection still is not concurrent database testing; the HTTP
  test above is separate evidence, not proof of every database interleaving.
- Local eight-hour run ended with an error/no delivered final report. Recovered
  its committed report/probes at food-chain-reward-audit f6183ab and independently
  reran both: failed debit grants cards; two stale production clients spend one
  pack twice. IO-only mocks, not live exploit tests. Evidence reruns are in
  /tmp/tcg-reviewed-failed-debit and /tmp/tcg-reviewed-double-spend. The report's
  suggestion of a client-supplied increment RPC is NOT accepted: clients must
  never choose grant amounts. Other source-only findings are not certified.
  The failed supervision observer was removed after review; no worker remains
  running under that old eight-hour task.
- Security advisor warnings for the two authenticated economy RPCs are expected
  definer entrypoints: identity checks + restricted privileges are deliberate.
  Ten private-table no-policy notices are intentional deny-by-default.

## Testing delegation preference

Owner explicitly permits local testing agents for future work. Only ONE local
tester/model workload at a time fits the Mac Studio. Prefer frozen snapshots or
untouched subsystems; avoid auditing moving targets the parent is actively fixing.
Review runnable evidence; source claims alone are not confirmed defects.
