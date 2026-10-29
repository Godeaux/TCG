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
- Stats/favorite-card views changed to security-invoker. Before-change test
  reproduced unrelated-identity access to synthetic rows; after-change tests
  retain owner access and refuse the unrelated identity. Synthetic rows rolled
  back inside migration. Current game code does not query either view.

## Implemented locally, not published

- Real collection/open/reveal/Done UI consumes server-committed pack contents for
  enrolled profiles. Pending intent survives reload and lost responses.
- Private inventory/balance refresh for enrolled profiles.
- Failed legacy debit no longer opens a pack in the local candidate.
- 7 unit tests, 43 authenticated SQL checks, production browser refusal/recovery
  regression. Full check passes with documented isolated PGlite dependency.
- Active worktree: food-chain-foundation-staging. Must integrate onto current
  frontend branch; this older foundation branch is NOT a wholesale deployment.

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
- SQL role tests are not real JWT browser authentication certification.
- Single PGlite connection is not concurrent database testing.
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
