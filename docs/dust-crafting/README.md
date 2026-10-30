# Dust crafting — pre-release implementation

Status: local implementation, not deployed. No player reset performed.

## Product contract

- Mobile: three rows by default/minimum, up to five. Desktop: two through six.
- Controls: minus (smaller cards), plus (larger), previous, next. Horizontal scroll.
- Remember separate mobile/desktop density preferences and preserve the visible card.
- Gallery shows the highest owned finish and its count. Details use the existing
  card inspector; Craft uses a contained native modal with the actual card renderer.
- Only missing finishes can be crafted. No extra rules explanation in crafting.
- Common/Uncommon/Rare/Legendary/Pristine cost 4/16/64/256/1024 dust.
- Copies recycle for 1/4/16/64/256 dust. One action recycles all extras, keeping one
  of every finish. No bulk selection or confirmation/success dialog.

## Implementation and recovery

`009-dust-crafting.sql` extends the existing private economy. Pack receipts seed
per-finish quantities; best-rarity ownership supplies a minimum of one, without
counting the same recorded draw twice. Future pack receipts atomically count all
five draws. The existing highest-rarity inventory remains compatible.

Craft/recycle derives the owner from authenticated identity, serializes on the
same account lock as packs, validates catalog/ownership/funds and commits an
immutable receipt with the balance and inventory changes. Client-supplied prices,
quantity/grant amounts and target-profile authority are not accepted.

The browser stores an intent before sending and retains it through uncertain
responses/reloads. Retry recovers that exact operation. A definitive refusal
clears the intent. No optimistic debit or client-side fallback grants.

## Verification

- `npm run check`: unit, lint, formatting, asset and all SQL contracts.
- `node e2e/dust-crafting.mjs`: production UI + real migration on local PGlite;
  only Supabase transport/identity are fixtures. Included in normal UI CI.
- `validate-dust-contention.mjs`: opt-in fresh local PostgreSQL on port 55440,
  `tcg_qa`, database `postgres`, `TCG_PG_MODULE` pointing to installed pg module.
  Three independent connections demonstrate lock waits for competing crafts,
  duplicate intents and pack-versus-recycle; fresh-connection receipt recovery.
- Screenshots generated here are local QA accounts, not live player balances.

## Remaining release gates

Live read-only inspection on October 30 found zero verified owners, zero economy
accounts and zero pack receipts. The new migration is not installed live.
Ordinary players still use the legacy account/economy path. A UI deployment alone
would NOT make crafting available to them.

1. Complete verified account enrollment and the approved legacy-account cutover.
   Never infer ownership from mutable `current_auth_id` or plaintext PIN claims.
   Verified-email delivery requires configured/tested SMTP or an Auth send hook;
   public delivery is not yet verified. Do not wipe or fabricate trusted balances.
2. Complete the trusted progression/reward integration tracked in
   `../release-1.0-staging/HARDENING-TRACKER.md`; do not import browser-minted packs
   or inventory into the trusted economy as an expedient substitute.
3. Apply/rehearse migration 009 on the verified release schema, then exercise
   authenticated APIs and two real accounts, cross-account refusal, reload and
   concurrent pack/craft/recycle against the deployed service.
4. Run the full frozen-candidate CI/browser contract and device acceptance;
   add v0.20 release notes only when that release scope is genuinely ready.

Deploy backend first, verify the extended economy response, then publish the
matching frontend/assets. Older clients remain compatible with highest-rarity
inventory. If frontend rollout fails, keep committed receipts/counts/dust intact;
roll forward. Never undo real purchases by deleting this populated ledger.
