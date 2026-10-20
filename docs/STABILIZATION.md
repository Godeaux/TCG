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

A second healing defect cluster was found and fixed the same day. Healing,
`Regenerate`/`Regenerate all`, `RestoreCreature` and regeneration at turn start
capped HP at the printed `hp` stat, so prey consumption and +1/+1 buffs were
erased the first time a creature was patched up. `getMaxHp()` (base +
consumption + buff gains) now backs every restore path; buff bookkeeping moved
into one `recordBuffGains()` helper because four call sites tracked gains four
different ways and `buffCreature` tracked none. Returning a creature to hand
clears earned gains and reverts copied base stats, and serialised card snapshots
now carry base-stat overrides so `copyStats` survives a sync round trip.
Negative heal amounts are clamped instead of being applied as damage.

Verified after a fresh `npm ci`: **4,969/4,969 tests across 52 files passed**;
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
- **Supabase project `cjjkzcvfphagkwsejsoe` is alive.** The earlier NXDOMAIN
  reading was a paused project, not a deleted one; the owner un-paused it and the
  REST endpoint now answers. An initial read-only probe of all nine tables the
  client references returned HTTP 200 for every one: `profiles`, `decks`,
  `lobbies`, `game_sessions`, `player_cards`, `friendships`, `duel_invites`,
  `bug_reports`, `bug_report_votes`. `lobbies`, `player_cards`, `duel_invites`,
  `bug_reports` and `bug_report_votes` still hold rows; `profiles`, `decks` and
  `game_sessions` came back empty. The schema therefore was never lost, and
  recreating it from guessed client calls would have destroyed real data.
  No writes were performed; the probe used the publishable key already in the
  repo, which is itself the finding recorded in the next bullet.
- Supabase backups, billing, RLS policies, grants, functions/triggers,
  anonymous-auth settings and Realtime publications remain unverified; REST reads
  through a publishable key cannot see policies, and no service key exists in the
  repository to check them with.
- Read-only MCP access to the live project is now authorized (2026-10-19), which
  removes the last excuse for guessing at schema. The connector is
  `https://mcp.supabase.com/mcp?project_ref=cjjkzcvfphagkwsejsoe&read_only=true&features=database,docs`,
  OAuth, and exposes five tools: `supabase__execute_sql`, `supabase__list_tables`,
  `supabase__list_migrations`, `supabase__list_extensions`,
  `supabase__search_docs`. `openclaw mcp doctor supabase --probe` reports
  `supabase: ok`. No secret key was ever pasted into chat or committed.
  Operational note that cost several attempts: the OAuth callback binds
  `127.0.0.1:8989` on this Mac and the login command has a fixed five-minute
  timeout. Every earlier failure came from restarting the listener, which orphans
  the page already clicked. One uninterrupted listener plus
  `open -a Safari <url>` completed it immediately.
- A read-only REST audit with the publishable key already in the repo enumerates
  ten public tables by exploiting PostgREST `PGRST205` "perhaps you meant"
  hints: `profiles`, `decks`, `lobbies`, `game_sessions`, `player_cards`,
  `friendships`, `duel_invites`, `match_history`, `player_stats`, `bug_reports`
  (plus `bug_report_votes`, seen via Realtime subscription code).
  Rows visible to the `anon` role: `lobbies` 1836, `player_cards` 659,
  `duel_invites` 49, `bug_reports` 30. Confirmed live columns:
  `lobbies(id, created_at, code, status, host_id, guest_id)`,
  `duel_invites(id, sender_id, receiver_id, lobby_code, status, created_at, expires_at)`,
  `player_cards(id, profile_id, card_id, rarity, obtained_at)`,
  `bug_reports(id, profile_id, title, description, category, status, created_at, updated_at)`.
- `profiles`, `decks`, `game_sessions`, `friendships`, `match_history` and
  `player_stats` return HTTP 200 with zero visible rows. PostgREST cannot
  distinguish "empty" from "hidden by RLS" through this path, so the earlier
  note that those tables "came back empty" is **not established**; the doc line
  claiming nine clean 200s overstated what the probe could prove. Settle it with
  `supabase__execute_sql` against `information_schema` and
  `pg_policies`, then export real DDL and commit it.
  Likewise, a brute-force prefix sweep that finds only one table is a false
  negative, not evidence of an empty database.
- No SQL migrations/schema backup are tracked in source. Schema can now be
  exported from the live project and committed instead of reconstructed.
- Client login currently reads a stored PIN and compares it in browser code.
  Authentication and row-level access must be reviewed before public restoration.
- GitHub Pages API reports legacy deployment from `main`, root path. A failed
  Test & Lint workflow did not prevent the latest deployment. CI is not a gate yet.
- Browser startup imports Supabase JS from esm.sh at major version `@2`; pinning
  or bundling runtime dependencies is pending. Google Fonts is another dependency.
- This cleanup does not restore service or publish a new build.

## Ordered next work

1. Keep the baseline green; review fixes and preserve a rollback reference.
   Done for the current fixes; `3649e16` is the healing/ceiling fix on top of the
   green baseline, branch still unpublished.
2. ~~Inspect the existing Supabase account/project before choosing restore versus
   recreate.~~ The project survived. Export schema, RLS, grants, functions and
   triggers from it and commit them as versioned migrations. Never overwrite a
   surviving database to match guessed client calls.
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

## Backend inventory (live project, audited read-only via `mcp.supabase.com`)

Project `cjjkzcvfphagkwsejsoe`, Postgres 17, queried through the authorized
read-only connector. Everything below is observed state, not inferred from code.

**Objects.** 11 tables, 2 views, 24 indexes, 1 function in `public`, no triggers,
no partitions, no materialized views. Extensions installed: `plpgsql`,
`pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault`. **`pg_cron` is
not installed**, so nothing in this database can clean itself up.

| table                | live rows | note                                                 |
| -------------------- | --------: | ---------------------------------------------------- |
| `profiles`           |      1938 | plaintext `pin text`, `stats`/`matches` jsonb        |
| `lobbies`            |      1836 | no FK on `host_id`/`guest_id`                        |
| `game_sessions`      |      1170 | whole match in one `game_state jsonb`                |
| `player_cards`       |       659 |                                                      |
| `duel_invites`       |        49 | `expires_at` defaults to now + **60 s**              |
| `bug_reports`        |        30 |                                                      |
| `friendships`        |         9 |                                                      |
| `decks`              |         2 | `id bigint PRIMARY KEY` with **no default/identity** |
| `bug_report_votes`   |         1 |                                                      |
| `match_history`      |         0 | never written by this client                         |
| `match_cards_played` |         0 | never written by this client                         |

Views `player_stats` and `player_favorite_card` aggregate `match_history` /
`match_cards_played`. Both base tables are empty and unreferenced in `js/`
(grep confirms zero hits), so those two features can only ever return nothing;
the app keeps the same numbers in `profiles.stats` / `profiles.matches` jsonb.

**Row counts vs. page estimates disagree** (`n_live_tup` is stale — never
vacuumed), which is why the table above is a real `count(*)`.

### RLS exposure

RLS is `enabled` and `forced` on all 11 tables, but permissive policies OR
together, and three of them are `USING (true)`, which silently disables the
table's protection:

- `duel_invites` — a policy literally named **`asd`**, `FOR ALL TO public USING
(true) WITH CHECK (true)`. Every other `duel_invites` policy is decoration:
  any holder of the publishable key can read, insert, update and delete all 49
  invites, including `lobby_code`.
- `profiles` — `Allow select for authenticated users` is `USING (true)` over a
  table whose `pin` column is plaintext, and `Users can claim profile` is
  `UPDATE USING (true) WITH CHECK (current_auth_id = auth.uid())`. Combined:
  an anonymous session can `select pin from profiles where username = ...`
  and then take over any of the 1938 profiles without knowing anything. PIN
  checking lives only in `js/network/supabaseApi.js`, and there are no database
  functions or triggers to enforce it. The acceptance criterion "PIN
  verification must not rely on the client" is currently false.
- `lobbies` — `Policy with table joins` allows `UPDATE` when
  `guest_id IS NULL`, so any authenticated user can rewrite a waiting lobby,
  and `SELECT` is `USING (true)` (all 1836 lobby rows and both player uuids are
  public).
- `bug_reports` — `Users can update any bug status` is `UPDATE USING (true)`.

Table-level grants are the Supabase default `ALL` to `anon` and `authenticated`,
which includes `TRUNCATE`, `TRIGGER`, `REFERENCES` and (PG17) `MAINTAIN`. RLS
does not gate `TRUNCATE`. PostgREST exposes no verb for it, so this is latent
rather than live, but any SQL-capable path (a future `SECURITY DEFINER`
function, a direct pooler connection) would be able to wipe the schema.

### Identity and integrity gaps behind the multiplayer bugs

- Two id spaces, no constraint keeping them apart: policies for `lobbies`,
  `decks` and `game_sessions` exist in both a `host_id = auth.uid()` form and a
  newer `profiles.current_auth_id = auth.uid()` join form, while `lobbies`
  carries **no foreign key** on `host_id`/`guest_id`. Rows written by the older
  client and rows written by the newer one are not comparable, which is the
  shape of the reconnect/lobby-membership failures.
- `decks.id` has no default and no identity, so the client must invent primary
  keys; with 2 rows today this has not collided yet.
- Cleanup is absent by construction: 1836 lobbies and 1170 game sessions have
  accumulated, `duel_invites` expire in 60 s and are never deleted, and there is
  no index on `lobbies(status, created_at)` or `game_sessions(updated_at)` that a
  sweeper could use without a sequential scan.

## Reconnect recovery pass (2026-10-20)

Reconnection was verified with a real two-browser harness (`e2e/multiplayer-ui.mjs`:
two Chromium contexts, real DOM clicks/drags, a real guest tab reload and Rejoin,
then assertions that both boards still agree). The harness, not a unit test, found
every defect below; state assertions alone passed while the guest was still unable
to click anything.

Fixed:

- **Private zones were never repaired after a rejoin.** Normal sync deliberately
  refuses to overwrite the local player's own deck/hand/traps, which is correct
  mid-match and wrong on rejoin: a refreshed client kept its pre-refresh deck and
  played on it indefinitely. Replaced the initial attempt (poll for the ActionBus,
  then call its recovery API — a timing dependency on an object built elsewhere,
  and the rabbit hole this pass abandoned) with a one-shot latch:
  `pendingAuthoritativeSync` arms when a guest resubscribes, the first snapshot
  whose `senderId` is the host applies with `forceApply`, then disarms. A guest
  that reloads now comes back at the host's deck count (observed 14/13 divergence
  before, 14/14 after).
- **`summonedTurn` did not round-trip.** The serializer always writes the key with
  an explicit `null` for cards outside play; hydration tested `!== null` and treated
  that as absent, falling back to the constructor's current turn. Every restored
  creature silently gained a false summon turn, which feeds summoning sickness.
  Hydration now honours an explicit `null` (`'summonedTurn' in snapshot`).
  Independent of reconnects.
- **A reconnecting guest was stranded behind its own overlay.** State converged but
  `menu.stage` stayed on `lobby`, leaving a full-screen overlay that swallowed every
  card drag. The stage now advances only after the authoritative snapshot is applied,
  and only for a completed setup.
- **Guest identity after reload.** `handleMenuRejoin` reloads into local mode, so the
  guest was resolved as player zero. `menu.mode` is restored to `online` before the
  saved snapshot is applied.
- **Intent counters were burned by locally rejected actions.** `_guestDispatch`
  incremented before optimistic execution, so a card played in the wrong phase
  consumed a sequence number that never reached the host, stalling the host's
  strictly-incrementing `_nextExpectedIntent` buffer forever. The counter now
  advances only when the intent is actually sent.
- **Duplicate player names.** Profile identity is applied after gameplay state
  rather than before, and the local player's signed-in name is never overwritten
  by a remote snapshot carrying an index collision.
- **Rejoin information was never persisted for guests**, so the Rejoin path could
  not be reached after a hard reload. The known lobby is now saved on subscribe
  instead of waiting for a join event the guest cannot receive.

VictoryOverlay gained local-perspective VICTORY/DEFEAT/DRAW titles and styles,
verified in a real browser over all five host-win/guest-win/draw combinations by
`e2e/victory-perspective.mjs`. The both-sides-see-VICTORY report is addressed.

Still open, reported by the owner from live play and not yet addressed: traps that
should have fired on one side never prompted, and the health-bar header bobbing up
and down on the left UI. Duplicate names received a fix here but still wants a
second live confirmation.

`npm run check` green: 0 lint errors (246 pre-existing warnings), formatting clean,
4976 tests across 55 files. Harness run: 27/27 assertions including real card plays,
combat, and a concession agreeing on the winner on both clients. A green suite remains
not a multiplayer certification.

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
