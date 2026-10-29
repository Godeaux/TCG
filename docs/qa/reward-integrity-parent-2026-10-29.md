# Reward integrity investigation — parent evidence

Status: active; local Qwen investigation continues separately. Baseline36b1db1.
No production balances/inventory changed, no account rows read. Live metadata queries
were read-only policies, grants, constraints and defaults. No release fix claimed.

## Reproduced first

**RWD-01 — completed-game recovery repeats pack and stats awards (release blocker).**
`checkForVictory` uses only `state.victoryProcessed`. It suppresses repeated renders
of the same object, but `buildLobbySyncPayload` does not persist it and fresh state
starts false. After a real JSON serialize/apply recovery of a completed match,
the production victory path awards again. Probe starts with one credited pack,
re-renders safely at1, then restores the same completed snapshot three times:
server-IO stand-in receives absolute writes1,2,3,4; gamesPlayed/gamesWon also rise.
This is real production component/serialization evidence with database IO mocked,
not a full UI-played match or live-account exploit. UI rejoin source also treats
setup-complete/turn>1 as in-progress and accepts existing seats before closed-state
checks. No durable settlement receipt protects reward eligibility.

- Script: `e2e/reward-rejoin-audit.mjs` (opt-in failing invariant probe, NOT a green CI test).
- Evidence root: `/Users/nut/.openclaw/workspace/qa-evidence/reward-integrity-2026-10-29/`
- `rejoin/evidence.json`: invariant one credit fails4!=1.
- Repeat: `TCG_REWARD_OUT=/tmp/reward-rejoin node e2e/reward-rejoin-audit.mjs`.
- Counterexample: rendering same already-processed state does NOT award twice.

**RWD-02 — committed credit with lost response leaves UI and server disagreeing.**
Same probe with `TCG_REWARD_FAIL_RESPONSE=1`: mocked durable IO applies balance1,
then throws. `updatePackCount` rolls local balance back to0; victory remains
processed. Recovery later awards again rather than returning original receipt.
Evidence `lost-ack/evidence.json`. This demonstrates ambiguous-response handling,
not an actual production network outage. Failure-before-commit and concurrent
operation interleavings are additional required cases.

## Source and fresh metadata findings (not live exploitation)

- **Authority:** browser `updateProfilePacks` accepts an absolute balance;
  `savePlayerCard(s)` accepts card IDs/rarities. Live UPDATEprofiles and ALLown
  player_cards policies/grants permit owner mutation, not proof of earned value.
  Existing profile-claim policies also weaken who counts as owner. No relevant
  economy trigger appeared in queried metadata. Row ownership alone is not
  authorization to mint rewards.
- **Identity:** no server-issued match-completion receipt/unique account+match
  reward record in these paths. A lobby can be reused for rematches: lobby ID or
  the presentation-history generation alone is not a secure match authority.
- **Split persistence:** victory stats and pack writes are independent fire-and-
  forget operations. Failure can partially settle a result; reward UI is shown
  before confirmation. No safe retry/receipt state in the UI.
- **Policy loophole to decide:** current online code rewards both winner and loser
  with no minimum duration/turn/contribution test. Surrender directly sets HP0.
  Repeated newly created short/conceded matches differ from replaying one match;
  exactly-once settlement alone will not prevent coordinated farming. Do not
  silently invent a minimum duration or remove legitimate losing-player rewards.
- **Client-generated loot:** pack content/rarity is rolled in the browser, while
  inventory writes accept the payload. A unique opening ID alone is insufficient
  if the browser still chooses its contents.
- **Pack integrity under child review:** stale-tab absolute balance writes;
  opening despite debit failure; debit-before-delivery loss; failed-save retries;
  stale rarity overwrite. Do not promote these to reproduced until actual tests.
- **Negative finding:** profiles.packs default is0 in live metadata. No evidence
  of a default starter-pack signup farm from that default alone.
- **Constraints:** player_cards has unique(profile_id,card_id) and rarity enum
  check; these prevent duplicate rows/invalid rarity names, NOT unauthorized
  grants or rarity upgrades. profiles.packs is nullable integer with default0;
  queried constraints do not enforce earned provenance.

## Required protection design / acceptance contract

1. Server-validated immutable match result with fresh server-issued match ID for
   every rematch; bind eligible participants to verified identity. Browser cannot
   assert its own outcome, modify economy columns or grant inventory.
2. Unique(match_id, account_id, reward_kind) receipt. In one DB transaction lock
   result/account as appropriate, validate eligibility, insert settlement receipt,
   increment balance and record stats. Concurrent/late duplicates return the SAME
   receipt, with no extra effect. Retain dedupe protection beyond snapshot/lobby GC.
3. Pack open accepts a bounded request identity, not client cards/balance. Server
   atomically checks positive balance, debits, rolls contents once, saves contents
   and inventory upgrades, and commits receipt. Retry after disconnect returns
   the original cards without charging again. A new request with zero balance
   fails. Concurrent openings may spend only available packs.
4. Inventory upgrades are monotone and validated; failed transactions change
   neither currency nor inventory. Render/animation/back navigation never grants
   value. UI reports pending/confirmed/failed from receipts, not optimistic claims.
5. Replace broad table writes with narrowly scoped operations and verified owner
   binding. A SECURITY DEFINER RPC accepting arbitrary winners/card payloads is
   NOT a solution. Explicitly test anonymous, other-account and own-account raw
   table/API writes. Privileged service is a trust boundary requiring validated
   operations, not merely a hidden service key.
6. Decide eligibility for early surrender, disconnect, draw, AI difficulty,
   repeated opponent/account pairs and retries. Throttles supplement—not replace—
   accounting invariants; avoid punishing genuine connection loss.

Acceptance matrix: both seats; winner/loser/draw/local/AI/spectate; same-render,
refresh/rejoin, old snapshots, two tabs/devices, concurrent settlements, same/new
rematch ID, lost response before/after commit, failed debit, failed inventory
save, zero/negative/stale balance, simultaneous spend+earn, rarity downgrade,
repeated request with changed payload, tampered actor/outcome/amount/cards,
account switch, legacy-client direct writes, deleted/expired lobby receipt replay.
Require true server transaction/RLS tests and separate real-transport/UI tests;
client unit success is not economy-security certification.

## Local investigation and supervision

Qwen3.8 local run6bfe0c26-39b6-4075-b754-16e439cefc83, timeout28800seconds.
Checkout `food-chain-reward-audit`; requested report
`docs/qa/reward-integrity-local-2026-10-29.md` and checkpoints every15minutes.
Parent inspected actual tool history at~07:00: rejected a false one-pack same-tab
race, steered toward failed debit plus stale-tab tests; no source claim counted
as a reproduced test. Parent observer joba5493e4e-3657-4555-844f-d28c1a934632
checks evidence every20minutes, steers stalls, ends by14:53PDT. Report completion
and independent parent evidence review still pending.
