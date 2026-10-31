# Username account cutover — October 30

Status: implemented and tested, **not enabled for players**. Main/Pages are
unchanged. No legacy accounts have been deleted.

## Owner direction

No player email address is required. Signup and login use username/password.
All legacy profiles (including Pnut) may be reset after replacement readiness.
The old browser-checked plaintext PIN flow must not return.

## Implementation

- `js/network/usernameAccount.js`: password gateway, provider session installation,
  current-profile RPC and local provider signout. No ownership release on logout.
- `supabase/functions/tcg-accounts`: provider-managed password hashing/sessions,
  random internal non-contact aliases, private username lookup, request validation,
  rate limiting and generic login errors. Service credentials stay in Edge env.
- Internal aliases are infrastructure identifiers, not collected player emails.
  Authentication does not depend on email delivery or email ownership assertions.
- Passwords: 8–128 characters. Usernames: 3–24 ASCII letters/digits/underscores,
  case-insensitive uniqueness. No email recovery is implemented.
- Migration 010 (deployed): private username directory, service-only enrollment
  and rate-limit APIs, authenticated current-profile RPC. Registration requires
  trusted provider app metadata, not browser user metadata or old profile claims.
- Migration 011 (not deployed): replace mutable profile ownership checks,
  forbid credential reads/profile claims and browser economy writes, private decks.
- Migration 012 (not executed): refuse reset until legacy claims are disabled;
  retire unmapped legacy profiles/data while preserving mapped owners and reports.
  Refresh the private backup during a write freeze immediately before execution.

## Observed checks

- Full `npm run check`: 5,295 unit tests / 81 files, all SQL contracts passed.
- Username SQL contract now has 44 checks including a reset rehearsal preserving
  registered owners/decks and nulling report attribution without deleting reports.
- Restored all 11 real public application tables and constraints to local PGlite,
  applied original policies, migrations 010/011, and reset 012. No mutable ownership
  joins remain. All legacy rows targeted by reset were retired, all 30 reports kept.
- Two isolated real provider accounts signed up without player emails, logged in
  case-insensitively, rejected wrong passwords and received distinct permanent
  profiles with empty server economies. No fake email-code verification was used.
- Actual mobile frontend + real provider: login, refresh persistence, enabled
  Craft menus, zero dust and provider logout passed; no JS errors.
- Live QA endpoint was temporarily restricted to one authenticated operator ID.
  After testing, exact QA profiles and four QA Auth identities were removed.
  Their local credential files were trashed. No real player account was removed.
- Public endpoint version 3 now matches checked-in disabled entrypoint (`ready:false`),
  returns HTTP 503, and performs no signup. `verify_jwt:false` is intentional for
  eventual password login before a session exists; the handler verifies passwords
  with the provider. Never enable before the corresponding policy/frontend cutover.
- Live final inventory: 2,066 legacy profiles; zero permanent owners, username
  accounts and dust receipts. Dust migration 009 remains installed.
- Horizontal gallery regression passed after login changes. Earlier combined
  density/dust UI also passed Chromium and WebKit across five viewports.

## Remaining release scope

The owner explicitly approved retaining host/browser-run multiplayer at 18:20 PDT,
October 30 (Discord 1565898118829178905), deferring anti-cheat. No engine rewrite.
Migration 013 accepts existing match outcomes into a separate, retry-deduplicated
accounting ledger. It is NOT server verification of gameplay. Online participants
receive one pack, AI wins one, AI losses none, matching existing reward rules.
Pending writes persist locally and recover on collection load. Match IDs survive
JSON reconnect snapshots and reset on a new game/rematch.

Still needed: progression tests, final CI/two-client acceptance,
freeze/refreshed backup, 011+012 cutover, enable account entrypoint, main publication,
and exact-version live verification. The registration endpoint being deployed is
not the same as this rollout being complete.
