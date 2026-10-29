# Reward Integrity Audit — local, 2026-10-29

Branch `audit/reward-integrity-local-2026-10-29` @ baseline `36b1db1`. Start 06:53 PDT. Final checkpoint 07:4x PDT.
Scope: pack-opening grant/concurrency, debit/credit retries, profile balance writes,
alternate grant routes. Completed-match rejoin/settlement replay owned by parent
(their repro: TOTAL 4 packs / 4 gamesPlayed after initial + 3 restores — not
duplicated here; parent correction applied 07:1x).
No production network writes, no credentials, no fixes applied.
Status vocabulary: **SOURCE-CONFIRMED** = read from production code, no test yet;
**REPRODUCED** = failing behavior shown by runnable probe with ONLY DB IO stubbed
(real Chrome, real `renderGame`, actual button/keyboard events); **POLICY-CONFIRMED**
= parent's production policy-metadata read.

## Checkpoints

- CP-1 (≈07:04): source traces via `read`/`grep -n` on js/ui.js,
  js/network/lobbyManager.js, js/network/supabaseApi.js,
  js/ui/overlays/PackOpeningOverlay.js, js/ui/overlays/VictoryOverlay.js. No tests run yet.
- CP-2 (≈07:25): probe plan corrected per parent — obsolete Vitest/jsdom plan
  WITHDRAWN (jsdom is not a dependency here; no re-implemented `onOpenPack`
  helpers — that would test a copy). Replaced with real-UI probes below.
- CP-3 (this write, ≈07:4x): both UI probes written, run, green-as-bug-repro.
  R-03 and R-01 promoted to REPRODUCED.

## Findings table

| ID | Path | Cause | Evidence | Run command | Observed | Expected | Confidence | Remediation | Status |
|----|------|-------|----------|-------------|----------|----------|-----------|-------------|--------|
| R-03 | `js/ui.js:4997-5005` (`onOpenPack`) + `js/network/lobbyManager.js:436-448` | **Debit-failure free grant.** `updatePackCount` catches API errors, reverts local count, RETURNS the reverted count (>0); `onOpenPack` awaits it with NO success check and opens anyway. Grant path `savePlayerCardsToDatabase` is independent and still succeeds. | ui.js:4999-5005; lobbyManager.js:444-447; **probe:** `e2e/reward-failed-debit-probe.mjs`, `docs/qa/evidence/reward-failed-debit/evidence.json` | `node e2e/reward-failed-debit-probe.mjs` | **REPRODUCED (UI tier, actual clicks).** Fixture A (debit rejected before commit): 2/2 failed debits → pack still opened, 5 cards granted each round; server pack row pinned at 1 while `savePlayerCards` fired 2×. Fixture B (debit committed, ack lost): server row 1→0 but client reverted to 1 → round-3 healthy open spent a phantom pack, 10 total cards granted from a 1-pack account; unbounded per-failure loop. | Grant only after server-confirmed spend; atomic open RPC | High (probe) | Fail-closed debit; server-owned open+grant | **REPRODUCED (UI)** — live tier UNTESTED (no live writes) |
| R-01 | `js/network/lobbyManager.js:424-449` → `js/network/supabaseApi.js:272-290` | `updatePackCount` computes `newPacks = max(0, profile.packs + delta)` from client-local snapshot, writes ABSOLUTE value `update({ packs }).eq('id', profileId)`. No server increment, no compare-and-set. POLICY-CONFIRMED: authenticated may UPDATE profiles. | lobbyManager.js:431-441; supabaseApi.js:278-284; **probe:** `e2e/reward-two-client-double-spend.mjs`, `docs/qa/evidence/reward-two-client/evidence.json` | `node e2e/reward-two-client-double-spend.mjs` | **REPRODUCED (two-client UI tier).** Two independent browser clients both loaded packs=1, both ran the production `[data-pe="packs"]` → `onOpenPack` → `updatePackCount`/save path against ONE shared ledger: both opened, 2 grant calls, 10 cards, both wrote absolute `packs=0` (packWrites `[0,0]` — second write is a pure lost update). Also swallows `+1` win grant at VictoryOverlay.js:405 (same write path; win side not separately probed). | Atomic server-side delta RPC; reject absolute balance writes | High (probe) | Server-owned atomic increment RPC | **REPRODUCED (UI, 2 clients)** |
| R-02 | `js/ui.js:4997-5005` + `js/ui/overlays/PackOpeningOverlay.js:683-697` | Pack decremented+persisted BEFORE opening; grant only fires at reveal-completion (`updateButtonStates`→`onSaveCards`). No opened-pack record ties spend→grant. | ui.js:5000; overlay save trigger; **corroborated by probe fixture B:** ack-lost debit leaves spend durable while client believes the spend failed — no recovery record exists either way | indirect via `node e2e/reward-failed-debit-probe.mjs` (fixture B); mid-open reload NOT separately probed | REPRODUCED (indirect: spend/grant divergence with no reconciliation record). Exact mid-open-reload loss UNTESTED. | Atomic open RPC or durable pending-grant + idempotent retry | High | Server roll+grant; persist roll pre-reveal | REPRODUCED (indirect) / reload path SOURCE-CONFIRMED |
| R-04 | `js/network/supabaseApi.js:959-982` + `PackOpeningOverlay.js:63-93` | Pack rolled client-side (`Math.random()`); grant payload `{card_id, rarity}` client-controlled; blind `upsert(onConflict:'profile_id,card_id')`; no catalog/rarity-monotonicity check. POLICY-CONFIRMED: authenticated ALL on own player_cards, no award provenance constraints. | supabaseApi.js:969-976; lobbyManager.js:379-388 (client-map-only filter) | n/a (devtools/REST path; NOT exercised — no live writes) | UNTESTED — expected: any catalog card at any rarity grantable; last-write-wins can downgrade owned cards. Probe grants used production rolls only (cards verified genuine). | Server rolls & grants; max-rarity on conflict | High | Server-owned grant RPC | POLICY+SOURCE-CONFIRMED / UNTESTED |
| R-05 | `js/network/lobbyManager.js:324-329` (`ensurePlayerCardsLoaded`) | `if (cardsLoading \|\| cardsLoaded) return;` — concurrent callers return before fetch resolves; a save then diffs against empty `ownedCards`. | trace; no shared promise | not probed (probe stubs `fetchPlayerCards`, which bypasses the race by design — honest gap) | UNTESTED — expected: stale/empty-map diff → blind upsert → R-04 downgrade window | Await shared promise; server max(rarity) | Medium-High | Share in-flight promise | SOURCE-CONFIRMED / UNTESTED |
| R-06 | `js/ui/overlays/PackOpeningOverlay.js:683-690` (`saveTriggered`) | In-tab double-save of one pack's cards impossible: guard `if (allRevealed && !saveTriggered) { saveTriggered = true; await onSaveCards(...) }` is synchronous, per-`startPackOpening`. | trace + probes: every probe grant call carried exactly 5 cards; no duplicate grant for a single open | — | No in-tab double-save observed in 6 total opens across both probes. NEGATIVE CONTROL kept. | — | High (negative) | none | CLOSED — NEGATIVE CONTROL |
| R-07 | `js/ui.js:4997-5005` same-tab double-click | Guarded ONLY at packs=1: `updatePackCount` mutates `profile.packs` synchronously before its first await (lobbyManager.js:431-433), so click #2 sees decremented count. With packs>1 a second click passes the guard and can overlap pack-opening animations/state. Ordering luck, not a lock. | trace | — | No double-open at packs=1; packs>1 double-open NOT excluded. NEGATIVE CONTROL narrowed per parent correction. | — | High (negative, packs=1 only) | explicit in-flight flag | OPEN (packs>1 untested) |

## Probe design (tier labels honest)

Both probes: existing `@playwright/test` + real Chrome; local static server;
**actual** `[data-pe="packs"]` click → production `onOpenPack` closure created by
production `renderGame` callbacks → real keyboard hold-to-shake → real
`#pack-reveal-all` click → production `updateButtonStates`/`onSaveCards` →
production `savePlayerCardsToDatabase` diff. ONLY `getSupabaseApi` from
`/js/network/index.js` is replaced by request routing (same pattern as parent
`e2e/reward-rejoin-audit.mjs`); every `*.supabase.co` request is aborted, so
live writes are structurally impossible. `pageerror` captured: zero on all pages.
NOT tested: live Supabase tier (no credentials used), mid-open reload, R-05 race,
packs>1 double-click, win-side credit.

- `e2e/reward-failed-debit-probe.mjs` — shared mock ledger fixtures:
  `preCommitReject` (rejected before commit) and `committedAckLost` (durable
  commit + lost ack) per parent's both-fixtures directive. Exit asserts PASS
  when the bug reproduces (documented; no invented pass — evidence.json is the
  artifact).
- `e2e/reward-two-client-double-spend.mjs` — two real browser pages,
  independent UI state, ONE shared Node-side ledger via `context.exposeBinding`,
  one pack, two openings.

## Alternate grant-route sweep (grep -rn over js/)

Only four reward sinks exist: `updatePackCount` (all callers), `savePlayerCardsToDatabase`,
`savePlayerCards`, `grantRandomCard` (dead — zero callers). DeckBuilder `acquire`
routes through the same `updatePackCount`/`savePlayerCardsToDatabase`. No third
grant route; R-03's debit-failure path is the only way to grant without a
successful spend in the current client.

## Recommended fix (client-side, testable)

`updatePackCount` → return boolean/throw on failure; `onOpenPack` opens only on
truthy result; same for deck `acquire`. Replace absolute `packs` UPDATE with a
security-definer RPC doing `packs = GREATEST(0, packs + delta) WHERE packs + delta >= 0`
(parent is implementing DB hardening in staging; client fail-closed pairs with it).
Re-run both probes after fix: fixture A must produce 0 opens/0 grants; two-client
probe must produce 1 open, 1 grant, ledger packs=0, second client refused.
