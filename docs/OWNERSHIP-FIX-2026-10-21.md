# Section A completed — card ownership refusal (2026-10-21)

Completed the interrupted task on top of 5e9795d. No push or deployment.

## Changes

- Shared identity matching in `js/network/cardIdentity.js`: a supplied modern
  instanceId is decisive; only an absent modern ID permits a nonempty string
  legacy UID. Missing, empty or malformed identities do not match accidentally.
- All four ownership checks reject wrong-owner/wrong-zone cards and missing
  references before controller execution.
- Wire resolution follows the same policy: a conflicting/stale modern ID cannot
  resolve to another card through UID fallback. Serialization preserves invalid
  falsy supplied IDs (0/false), so they are rejected rather than erased into a
  legacy lookup.
- Reworked the unfinished cardOwnership tests: corrected phase fixtures and
  assertions that previously checked a nonexistent rejection `error` field
  instead of `reason`. Tests use registered cards, JSON transport, real ActionBus
  and GameController; only network/storage are mocked.

## Verification

Ownership regressions reproduced against the old implementation before changes.
The additional 0/false serialization regression was also red before its fix.

`npm run check`: exit 0, **5,074 tests / 59 files**, including **78 ownership tests**.
Formatting passes; ESLint 0 errors / 245 existing warnings (one unused binding
removed from the prior 246). `git diff --check`: exit 0.

Refusals assert unchanged complete player state, HP, zones and RNG; no controller
execution; an explicit action_rejected response; and successful handling of the
next guest intent. Positive cases prove actual own-card attack, play and return.
Legacy-only identity tests establish resolution/authorization, not certification
of every downstream gameplay operation on historical legacy-only saves.

## Scope and next work

Section A is done. Next is section B (paralysis timing) in the reskin-readiness
review. Sections B–H and the broader action-legality/identity/backend audit remain
open. This fix is not comprehensive multiplayer or crash-safety certification.
Earlier review documents and diagnostic scripts remain separate working-tree
artifacts; they are not part of this implementation commit.
