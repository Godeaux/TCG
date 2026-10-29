# Tutorial presentation and mechanics review — 2026-10-28

Status: local review; not deployed.

## Review method

Reviewed all 25 original panes using three time-separated frames on both 393×852
and 1440×900, then reviewed the revised sequences. Checked rules against
`CORE-RULES.md`, `js/game/turnManager.js`, `js/game/controller.js`,
`js/game/combat.js`, `js/game/consumption.js`, and shipped card definitions.
This is an assistant review, not a claim that an external review team signed off.

The demonstration is an isolated teaching vignette, not a live match. Named cards
come from shipped JSON and generated effect text. Supporting illustrations (rival
HP, generic damage, Scavenge predator) are explicitly labelled and do not pretend
to be collectible cards. Consumption scenes focus on nutrition and explicitly
mention the additional consume trigger rather than simulating its target choice.

## Presentation standard

- One lesson and one coherent worked example per viewport.
- Real card art and card renderer; no missing-art token stand-ins or invented stats.
- Roles above the cards, persistent results below; captions have their own area.
- HP/ATK values visibly change with the demonstration and reset on Replay/loop.
- Invalid actions do not look like successful attacks or creature deaths.
- Gentle directional motion, restrained highlighting, readable held outcomes.
- Real destinations distinguish Carrion, Exile, staying in hand, and staying alive.
- Replay has a 44px tap target. Page navigation remains visible.

## Pane-by-pane review

| Pane | Finding and revision |
| --- | --- |
| Goal | Attack previously aimed at empty space. Added a visible rival HP target, 10→7. |
| Card Anatomy | Whole-card glow did not identify stats. Focus each actual ATK/HP/NUT value in sequence. |
| Board Zones | Three arbitrary cards did not teach zones; token death incorrectly implied Carrion. Replaced with a labelled field/hand/piles schematic and token exception. |
| Turn Flow | Retained approved connected track. Corrected seven phases to the six in `PHASE_ORDER`; per-attack before-combat effects are not a separate phase. |
| Combat | Copy implied all creatures attack simultaneously; displayed HP never changed. Explain individual attacks, show both combat damage amounts and Mako surviving at 1 HP. |
| Consumption | +2/+2 did not change the card. Live 3/3→5/5, labelled source/destination; dry drops explicitly lose keywords. |
| Spells | Invented Harpoon damage (3) disagreed with the shipped card (4 plus steal). Use real definition, show lethal target and separate spell Exile destination. |
| Free Spells | Missing art and missing allowance restriction. Use the real Edible spell, visibly grant keyword, explain free cards must precede regular play. |
| Traps | Incorrect face-down-field/automatic-trigger model and nonexistent Fish Net trap. Replace with hand→trigger→player choice→Exile response timeline. |
| Summoning Exhaustion | Glow alone did not explain restriction. Contrast blocked direct attack now with a visible direct attack next turn. |
| Card Limit | A second card vanished using death animation. Keep unavailable card visibly in hand; correct trap/free-card rules. |
| Haste | Missing art and invisible rival. Use real Kingfish and immediate 10→7 rival HP result. |
| Free Play | Invented token example and missing ordering rule. Use Black Mullet followed by King Salmon, with allowance labels. |
| Hidden | Missing art and incorrect claim that attacking/Acuity removes Hidden. Use Ghost Eel, blocked target, correct spell and override rules. |
| Invisible | Creature attack reused as a spell demo. Explicit generic targeting source; distinguish untargetability from immunity and list exceptions. |
| Lure | Unexplained three-card lineup and incomplete combat outcome. Label attacker/protected/required target; demonstrate target selection without pretending to resolve a full fight. |
| Immune | Claimed all spell effects fail and only combat can remove it. Use explicit indirect damage illustration; legal targeting and non-damage effects remain possible. |
| Barrier | Same attacker attacked twice without explaining eligibility; no counter-damage. Isolate incoming damage instances; first absorbed, second lowers 3→2 HP. |
| Passive | Generic glowing card. Use Blobfish, explicit cannot-attack result, visible rival, and retained ability explanation. |
| Edible | Incorrect +3/+2 and stale stats. Use current ATK as nutrition, grant +3/+3, show Mako 6/6. |
| Scavenge | Two disconnected tiles and no real action. Use an actual Carrion prey and explicitly generic Scavenge predator, with consumption motion and 3/3→5/5. |
| Acuity | Invented Chameleon keyword/stats and missing art. Use real Great White Shark, valid Hidden target, normal damage/counter-damage. |
| Neurotoxic | Lethal hit was presented as delayed paralysis; wrong turn boundary. Octopus deals 1 to surviving Mako, dies to counter-damage, still applies Paralysis; Mako dies at end of its controller’s turn. Strip displayed abilities and show Harmless/0 attack. |
| Ambush | Incorrect first-strike rule and Toxic claim. Black Mullet attacks a surviving Mako and takes no counter-damage. Clarify attack-only protection and Poisonous. |
| Frozen | Incorrectly killed the frozen creature. Ice clears at controller’s end step; creature remains alive at 2 HP. |

## Regression coverage

- `tests/structural/tutorialExamples.test.js`: phase order against production,
  named cards against registry/art, combat examples against real combat resolver,
  consumption buffs against real consumption, Frozen survival at actual turn boundary.
- `e2e/tutorial-layout.mjs`: all panes across six viewport sizes; longest real
  captions, readable bounds, no routine scrolling, page navigation and ghost cleanup.
- `e2e/tutorial-motion.mjs`: every complete animation loop at short phone, regular
  phone, and desktop sizes; in-flight label geometry, image load, loop completion,
  Replay state restoration, tap targets and close cleanup. Evidence saved under
  `docs/tutorial-polish/` (generated screenshots/results are not source files).

Verification results are recorded after the final runs. No gameplay/network rules
were changed, and this review is not a multiplayer-release certification.

## Verified results

- `npm run check`: **5,241 tests / 72 files passed**, asset versions, lint and formatting passed.
- Chromium + WebKit layout suites: **300 pane/viewport checks passed**.
- Chromium + WebKit motion suites: **150 complete animation loops passed**
  (25 panes × 3 viewports × 2 engines), with no runtime errors or geometry failures.
- Final sequential-navigation preview caught a stat-focus attribute leaking from
  Anatomy. Reset now removes it and the layout suite asserts no cross-pane leak.
- Actual local desktop/mobile screenshots and a recorded walkthrough were generated;
  no production inventory, matches, or account data were used.
