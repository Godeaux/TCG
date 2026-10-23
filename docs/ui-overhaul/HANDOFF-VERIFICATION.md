# Design/spec handoff verification — 2026-10-22

This verifies the handoff, NOT the future production UI overhaul.

- `npm run check`: exit 0, 63 files / 5,119 tests, formatting clean,
  244 existing lint warnings and 0 errors.
- All Markdown links in UI-OVERHAUL-SPEC.md, UI-OVERHAUL-EXECUTION.md,
  UI-OVERHAUL-START.md resolved to existing repo-local files.
- Installed Google Chrome through Playwright rendered history-merged.html at
  393×852 and 375×812 for attack/consume/summon; 6 images. No missing art or detail
  overflow. Geometry/text output: merged-check.json. Screenshots visually inspected
  for corrected prey nutrition and the merged art/name-pill treatment.
- Cannibal Fish's nutrition 2 appears twice (before and after); a temporary browser-only
  fixture mutation to nutrition 0 also rendered twice. Predator has no nutrition tile.
- board-reference.html uses repo-relative art; image loading checked locally.
- No production JS/CSS/HTML application files changed. Reference HTML uses illustrative
  state, not real game execution. No native-iOS, production input or multiplayer UI
  acceptance was performed. Those gates are explicitly pending in the ledger.

Approved references: board-reference.html + board-*-approved.jpg for board;
history-merged.html + merged-{375,393}-{attack,consume,summon}.png for History;
phone-face.png for approved face hit-region illustration. Earlier studies may
remain locally but are superseded; they are not required to execute the task.
