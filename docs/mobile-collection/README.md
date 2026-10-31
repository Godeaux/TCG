# Mobile collection polish — 2026-10-30

The owner requested native horizontal collection scrolling (no paging arrows or
vertical overflow), uncut rarity borders/seals, background-tap dismissal, and no
previous/next card-inspection controls. Token Back remains available.

Live reproduction at 390×664 measured a 356px gallery with 392px of vertical
content. WebKit additionally reproduced the card inner face extending below its
border: an aspect-ratio parent did not reliably constrain a percentage-height
child. The shared face now uses definite inset positioning. Rarity SVGs no longer
inherit the collection toolbar's fixed 20px dimensions. Alpha compositing avoids
WebKit's overexposed color-dodge foil. Native selects receive consistent sizing.

Verification: `npm run check`; `npm run test:ui`; and
`TCG_BROWSER=webkit node e2e/mobile-collection.mjs`.
The new regression runs at 390×664, 393×680, 430×746, 320×568, and 1440×900.
It checks full bottom borders, seal/glyph bounds, no vertical overflow, the last
card's reachability, filter reset, modal background dismissal and token Back.
Chromium phones use synthesized native touch swipes. Playwright mobile WebKit
cannot synthesize swipes/wheel: its native scroll container is moved through
scrollBy, with touch taps used for inspection. Actual iPhone hardware remains
unverified. Ownership in screenshots is an in-memory fixture, not live balances.

## Separate account/economy cutover

The owner authorized retiring all legacy accounts, including Pnut, and requiring
new registrations (Discord follow-up, October 30). No deletion is part
of this frontend patch. Live read-only inspection confirmed zero verified owner
mappings, zero economy accounts/pack receipts, and no dust/craft RPCs.
The local dusting implementation is on `polish/predeploy-changelog-2026-10-30`.
Do not expose nonfunctional crafting controls as a completed release. Replacement
provider-email login/delivery, enrollment, trusted rewards and migration 009 must
be tested before a backed-up coordinated reset. No old PIN/current_auth_id claims
are a verified ownership source. Email-provider configuration remains unverified.
