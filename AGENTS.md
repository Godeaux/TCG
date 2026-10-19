# Food Chain TCG working contract

## Objective

Reliable, smooth **online multiplayer** is the product goal. Stabilize before
adding content. AI and local play are existing features, not revival milestones.

## Sources and boundaries

- Read `CORE-RULES.md` for mechanics and `docs/STABILIZATION.md` for current status.
- All gameplay actions go through `GameController`; network changes must preserve
  host/guest consistency, private information boundaries, and reconnect state.
- Do not merge `archive/card-expansion-2026-10-18` wholesale. It contains preserved,
  unreviewed work based on an older source version.
- Historical bug labels and memory are leads, not proof of current defects.

## Verification

- Reproduce gameplay/network defects with a failing test before fixing them.
- Use real production operations and valid card instances; no conditional passes,
  placeholder assertions, or tests that implement their own game logic.
- For runtime state changes, test the JSON snapshot round trip and recovery path.
- `npm run check` is the local/CI contract (lint, formatting, full Vitest suite).
- A green suite is necessary, not a multiplayer certification. Before relaunch,
  complete the two-client acceptance checklist in `docs/STABILIZATION.md`.
- Do not publish secrets or interpret DNS failure as proof of deleted backend data.
