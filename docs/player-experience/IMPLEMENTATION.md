# Player experience — approved concept 2 implementation

Date: 2026-10-28. Local branch: `ui/player-experience-2026-10-28`.
Not deployed by this task.

## Delivered

- My Cards connects the existing deck library to a paginated collection with search,
  ownership/animal/rarity filters, rarity sorting, canonical gameplay card faces,
  desktop inspection and mobile detail navigation. Short phones show six cards
  per page; taller phones nine; desktop twelve. Packs return to Collection.
- Friends has username search, public profiles, requests, online/offline presence,
  one invite action, and overflow profile/removal controls. Room codes remain a
  secondary entry. No invented “in a match” status.
- Own/public profiles show real career totals, collection previews and chosen art.
  Favorite art, banner and avatar save independently in existing
  `name_style.appearance` JSON, preserving name styling and old-profile defaults.
  Choosing art is cosmetic and does not grant card ownership. No schema migration.
- Missed friend realtime changes reconcile every ten seconds while player screens
  are visible. Unchanged responses do not repaint the screen. Requests share the
  in-flight load and do not reopen after dismissal.
- Cancel now marks the outgoing duel invite cancelled as well as closing its room.
  Failed cancellation remains actionable rather than silently hiding the popup.
  Incoming invitations dismiss player-screen dialogs so they remain actionable.

## Verification

- Baseline contract: 5,241 tests / 72 files passed before changes.
- Final `npm run check`: 5,247 tests / 73 files, lint and formatting pass.
- `e2e/player-experience.mjs`: guest collection, canonical 5:7 card ratio and 10%
  title proportions, search, inspection, navigation at 1440x900, 393x852, 320x568.
- `e2e/home-navigation.mjs`: four viewports, all homepage destinations.
- `e2e/pack-viewport.mjs`: eight viewports, five cards/status/Done fit.
- Explicit live QA: appearance save, reload and public read verify all three
  independent choices; original dedicated QA appearance restored afterward.
- Two existing dedicated QA accounts: search/add/request/accept, public profile,
  presence, invite/cancel, new invite/accept and identical shared room code.
  Friendship created by the test and QA rooms/invites cleaned up afterward.
- Screenshots here use those real empty QA accounts and real catalog data, not
  fabricated ownership or stats. This is UI/lobby acceptance, not a full match or
  reconnect certification.

## Art findings and deferred work

103 of 241 non-token catalog entries lack their expected card JPG. Existing card
renderer placeholders remain visible in the all-cards browser; playable cards are
not hidden to disguise this. The appearance picker offers only existing catalog
artwork. `scripts/build-card-art-index.mjs` generates that manifest, and
`npm run check:art` detects stale manifests after asset changes.

Rarity distribution and existing colors are unchanged. Distinct rarity emblems,
foil/holographic treatments and motion are a separate design pass after this
layout is accepted. No additional social feed, chat, or upload UI was introduced.
