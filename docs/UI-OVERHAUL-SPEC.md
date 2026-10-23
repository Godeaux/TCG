# Food Chain UI overhaul — authoritative implementation spec

Version: 1.0 · 2026-10-22 · Owner: pnut / 0 · Implementer: local Qwen 3.8 Flash Next.
Status: **design approved; production implementation NOT started**.
Entry point / mutable resume record: [UI-OVERHAUL-EXECUTION.md](UI-OVERHAUL-EXECUTION.md).
This spec is deliberately self-contained. Chat summaries and old design studies
are not required to execute it. Read the ledger after every compaction.

## 0. Mission, authority, boundaries

Build the approved desktop + portrait-phone game UI on the existing game, preserving
reliable online multiplayer and the current rules. This is a production integration,
not another standalone mockup, not a new site/framework, and not an engine rewrite.

Owner authorized UI work in Discord message 1563026383200976928; approved the full
face strip in 1563033607352615054; selected before/after option A with full-bleed
history art in 1563041616128643102; approved the merged look except missing prey
nutrition in 1563043497966305395. Nutrition is now fixed in the reference.
These decisions supersede the earlier no-reskin scope guard. No need to re-ask
about them. Ask only on materially new interaction/design ambiguity, with a
concrete screenshot and a recommended choice. Proceed with independent work.

Authorized: local code, tests, screenshots, focused commits. Do not merge/deploy,
change live backend schema/auth/RLS, buy services, install a new framework, rewrite
card mechanics, or import archive/card-expansion-2026-10-18. Do not spawn paid agents.
Owner intends a later review by the stronger model: stop at review-ready, not release.
Use existing assets and card registry; mockup card stats/text are NOT rule authority.
Do not use the Sites plugin: this is an existing repository application.

Repo: `/Users/nut/.openclaw/workspace/food-chain-tcg`.
Branch: `ui/overhaul-2026-10-22`; base `0b84588`.
C/D/E parent branch `fix/rule-gates-CDE-2026-10-21` was pushed, not merged here.
C `dae2ce2`, D `3b8acae`, E `695d00f` are done. Do not redo that backlog.
At handoff: contract 63 files / 5,119 tests; lint 244 warnings / 0 errors.
Warnings are a baseline, not permission to add new ones. Re-measure before edits.
Read AGENTS.md; CORE-RULES.md governs mechanics, docs/STABILIZATION.md release gates.

## 1. Exact visual sources and precedence

All links are repo-local. Keep these reference files unchanged during implementation;
put real-app evidence under `docs/ui-overhaul/evidence/CPxx/`.

1. This specification and explicit later owner corrections.
2. **History**: [history-merged.html](ui-overhaul/history-merged.html), corrected to
   include prey nutrition. Open with `?island&event=attack`, `consume`, or `summon`.
   [Consumption](ui-overhaul/merged-393-consume.png),
   [attack](ui-overhaul/merged-393-attack.png),
   [summon](ui-overhaul/merged-393-summon.png).
   Companion 375px screenshots use `merged-375-…`.
3. **Board**: [board-reference.html](ui-overhaul/board-reference.html), copied from
   latest delivered v7, with relative art paths. Phone `?island`; desktop default.
   [desktop](ui-overhaul/board-desktop-approved.jpg),
   [phone](ui-overhaul/board-phone-approved.jpg).
4. Face hit-region illustration: [phone-face.png](ui-overhaul/phone-face.png).

Older `history-options.html`, A/B/C screenshots, `interaction-review.html`, and
`UI-OVERHAUL-2026-10-22.md` are design history, not competing specifications.
The final history differs intentionally from early option A: no shrunken/letterboxed
art, no Source/Target or Damage resolved labels, nutrition visible on prey.
Do not copy the prototype's repeated fake event rows, timers, hardcoded health,
card text, demo island/status bar/home indicator, or layout-review annotations.
Prototype interaction checks do NOT prove the production app works.

### Layout contract

- Portrait phones primary; desktop separately composed. Landscape phone is not a
  launch requirement. Do not regress existing functioning landscape gratuitously.
- Phone order: safe-area/top utilities → rival identity strip/hidden hand count →
  enemy 3-slot field → compact phase/action control → own 3-slot field → own identity
  and pile control → horizontally scrolling, unfanned hand → bottom safe area.
- Desktop: top utilities; arena plus docked right history; rival strip above enemy
  row, phase control between fields, own identity above the fanned hand. Use the v7
  desktop spacing/sizing, not a stretched phone view. History toggle can hide panel.
- Latest v7 reference has History/Menu at phone top and compact Carrion/Exile control
  by own identity; desktop has Carrion/Exile in top utilities. Preserve that placement,
  not the stale v2 note demanding all pile controls at phone top. No bottom nav bar.
- Keep existing menu/settings, resync, surrender, emotes, piles, setup/deck building,
  reactions, victory/rematch and recovery reachable. Move secondary controls into
  appropriate existing menus; don't silently delete functionality to match a picture.
- Remove redundant Your Hand headings/copyright clutter from the battle center;
  no new decorative dashboard panels. Existing diagnostics can remain accessible
  away from the normal board; not required as a prominent advantage graph.
- Tokens/themes: restrained dark teal/slate board, subdued faction-tinted card/effect
  surfaces, muted borders, readable light text. No stark cream/white effect panels,
  neon glow everywhere, ornamental headings, or replacement stock illustrations.
- Use real `env(safe-area-inset-*)` and dynamic viewport sizing. Fake island mode is
  reference-only. Widths 375/393 portrait must not horizontally scroll the whole page.
  Hand scrolls independently. If short height genuinely cannot fit, permit deliberate
  vertical arena scrolling rather than cutting off cards or shrinking text to nothing.
- Prefer scoped CSS variables and components. Do not paste the prototype's layered
  historical CSS overrides into styles.css; translate final computed layout once.
- Initial sizing guides, not fixed-pixel mandates: phone 393px reference has ~119px
  board/hand cards, ~185px height, 8px field gaps; desktop adapts to available arena
  with three zones visible. Size field and hand coherently; inspect real long text.

### Cards / inspection / statuses

- Normal field and hand follow latest v7 consistent card geometry: name, art, stats,
  centered complete effect text. Do not revert to earlier effectless field cards.
- Full hand descriptions visible without hold/inspect. No ellipsis/line clamp or
  “inspect for full text” workaround. Evaluate the longest real descriptions and
  multiple factions; adapt card/text area and scrolling, not gameplay content.
- Normal board/hand art uses contain (uncropped); **history art uses cover** as an
  explicit approved exception. Never stretch artwork. Names must remain legible;
  support long names without hiding identity. No global rule leaking between contexts.
- Creature stats: ATK, NUT where applicable, HP. Prey NUT includes zero; null means
  not applicable, not falsy zero. In history NUT must appear in BOTH rows, even when
  consumed/dead. Predators do not gain a fake prey stat. Edible-predator consumption
  nutrition follows engine semantics; distinguish it from printed prey NUT.
- Board ATK reflects effective attack (Pack etc.), HP current HP; no invented base
  values. Stat getters and rules stay shared with gameplay. History captures values
  at event time, never re-evaluates old stats against the current board.
- Barrier visually reads as gold protective dome/shield; Frozen, Paralysis, exhaustion,
  Hidden/Invisible, cancelled abilities and dry drops remain distinguishable. Reuse
  current state/keyword checks. Do not remove effects just to simplify card rendering.
- Phone hold enlarges the actual card, not an inspector drawer. Release/cancel clears
  enlargement/focus and never plays/attacks. Horizontal hand scrolling cancels hold;
  drag intent cancels hold; ensure one gesture cannot both inspect and execute.
- Desktop hover/focus can enlarge; fan cards lift without clipping or losing hit targets.
  Keyboard/click alternatives remain available; no functionality becomes drag-only.

## 2. Approved face target and input contract

One explicit rival identity strip, **at least 44 CSS px high**, full arena width,
including avatar/name, HP, deck/count/hidden hand area, and gaps within it. It excludes
utility toolbar, enemy field/cards/empty slots, phase row, own strip, and history.
The dashed mint outline in the reference is an annotation, not a permanent decoration.

Map strip identity from actual local seat using getLocalPlayerIndex; never hardcode
“rival = player 1”. On hover, highlight exactly the accepted region when legal;
show refusal feedback when illegal. Mouse and touch use the same resolver.
Use the release point, not remembered hover target. Leaving the region removes stale
highlight; dropping on gaps/outside/overlays cancels with zero game mutation.

Current desktop has `.scoreboard-row` → opponent coercion; touch often only recognizes
`.player-badge`. Remove broad coercion as the DOM migrates. Make the approved strip
an explicit data-marked target with player index; do not make an ancestor of both
players the target. Own-player spell targeting can still work under its own rules.
Interactive child buttons (emotes etc.) must not fire on drag release. Overlays always
win hit testing; dragging onto history never attacks behind it. Verify enlarged drag
preview is pointer-events:none or otherwise not mistaken for the underlying target.

Retain existing controller/action-bus legality for phase/turn/owner, Lure, summoning
exhaustion/Haste, Passive/Harmless, missing cards, attack counters and valid spells.
The UI cannot authorize moves. Targeted spells use their own targeting legality,
not creature-attack tests. Board/card consumption, empty-slot play, and click/tap
attack flows must survive the new resolver.

## 3. Approved history UI

### Upper list / interaction

- Mobile: slide from right as overlay; board geometry unchanged. Width
  `min(324px, 100vw - 32px)` (69px of board remains at 393px). Below top safe area
  and toolbar, above bottom safe area. Approximately 49% list / 51% details.
- Compact full-bleed source-art slice → action symbol → target-art slice; turn marker,
  restrained separators, selected-row highlight. Match reference density (~62px
  row, ~105×43px art at 393px). No blank tutorial prose or mockup headings in app.
- Upper list scrolls independently. Lower details scroll only when legitimately long.
  Selecting updates details without jumping the upper list. Events have stable IDs;
  never key selection by array index or a card's name.
- Follow newest only while already following. Arrival of events must preserve a
  reader's selected event and anchored scroll position. Retention eviction must
  degrade gracefully (clear message/nearest available selection, never wrong detail).
- X, History toggle, Escape, backdrop close. Backdrop close doesn't click board.
  Preserve selection/position on reopen in the same match; reset on new match.
- Phone background board inert to pointer AND keyboard while open; contain focus,
  return focus to opener; preserve previous inert state for nested overlays.
  Mandatory decision/Trap/End prompt takes priority and closes history, without
  answering/cancelling/advancing gameplay. Incoming sync continues normally.
- Desktop history is docked, not a modal preventing play. Hover/focus previews an
  event; click pins selection. Pointer leaving restores pinned selection. No hover
  assumptions on touch hardware. Reduced-motion disables sliding transitions.

### Lower detail (the owner-approved A merge)

Turn/event label, BEFORE row, AFTER row, computed plain description. Two aligned
columns for source and target. Same-size before/after cards. Rounded card silhouettes,
full-width cover artwork, translucent name pill over the art, stats underneath.
No Source • Target / Damage resolved / Nutrition gained / Ally created labels.
No option A/B/C labels. Nutrition is required for prey in both rows.

- Gain: green AFTER stat with +delta; loss: red AFTER stat with -delta; unchanged neutral.
  Compare with event's before snapshot, NOT printed base. Color never sole signal.
- Death: retain the after visual with HP 0 red and skull/crossbones on art, name/stats
  still readable. Do not run a death animation on the real board by viewing history.
- Consumed: explicit CONSUMED banner + actual destination; not a death skull and not
  forced to 0 HP. Summoned: empty slot before, card + SUMMONED banner after.
- Return/exile/destroy/sacrifice: explicit cause and destination; not generic death.
  Tokens must not falsely show Carrion when engine removes them. Snapshot the last
  known card state before destruction/reset; public history keeps identity correctly.
- Barrier: show shield before, no shield after, HP unchanged if absorbed. Healing,
  buffs/debuffs, statuses, transformations, player damage and multiple affected entities
  must communicate actual changes, not force every event into a combat template.
- Multi-target/consume: horizontally scrollable aligned groups, same order in both
  rows and source retained; indicate target count and that more targets are available.
  Do not shrink 3 targets into unreadable miniatures or omit affected creatures.
- Player target: player portrait/name + HP tile, no fabricated card/NUT. Unknown/private
  target: count/back/neutral tile; no hidden art or tooltip/DOM leak. Missing art uses
  a designed placeholder while preserving name/stats. Long names wrap within pill
  if needed; do not obscure stats. Check at least 2-digit stats and ±2-digit deltas.

### Computed wording, not bespoke prose / LLM generation

A pure deterministic formatter consumes event kind + explicitly recorded facts:
1. actor + action verb + object(s), e.g. “Tiger Shark consumed Cannibal Fish.”
2. per-entity measured stat gains/losses, status transitions, and removal/arrival cause.
Consistent vocabulary/templates and deterministic ordering, using names stored at
that moment. Suppress unchanged fields and duplicate sentences. Never parse old
English log strings to infer snapshots. Use textContent/escaped attributes, not
unsafe innerHTML of player/card names. Fixtures' hardcoded prose is not production.

“Lost 3 HP” may be derived from HP change; “dealt 4 damage” requires recorded damage
facts (overkill, prevention, Barrier, Immune and healing differ). Preserve raw facts
and display HP floored to zero for slain creatures. Explicit cause, not 0 HP or absence
alone, distinguishes slay/destroy/consume. Prevented attacks may record “negated”;
invalid/rejected intents are not successful history interactions.

## 4. Production integration map (verified names; line numbers will drift)

- `index.html`: `.game-container`, `.top-bar`, `.battlefield-layout-two-column`,
  `.battlefield-center-column`, `#scoreboard-row` currently contains BOTH badges,
  `.opponent-field`, `.player-field` each three `.field-slot[data-slot]`, phase
  `#field-turn-btn`, `#active-hand`, `#selection-panel`, `#action-panel`,
  `.game-log-panel`, `#game-history-log`, `#field-history-btn`, `#close-history`.
  Move nodes deliberately; preserve IDs until every consumer migrated. No duplicate IDs.
- `styles.css`: existing large cascade. Inventory relevant selectors before editing;
  scope new styles and remove superseded rules only after checking callers/screens.
- `js/ui.js`: render orchestration, appendLog, setupLogCardLinks, setupMobileNavigation,
  badge click/target listeners, pile selection, pending choice/turn drain callbacks.
  Extract new History component rather than expanding the monolith unnecessarily.
- `js/ui/components/{Card,Hand,Field,OpponentHandStrip,CardTooltip,SelectionPanel}.js`:
  production rendering/inspection. Card exports renderCardStats, hasNutrition,
  renderCardInnerHtml, renderCard. Hand updateHandOverlap controls fan. Field is
  seat-relative. Don't build a parallel fake board disconnected from these paths.
- `js/ui/input/{dragAndDrop,touchHandlers,inputRouter}.js`: shared handlers, drag
  feedback, release actions, hold/cancel state. Touch init/reattach must not multiply
  listeners. `js/ui/dom/helpers.js`: getPlayerBadgeByIndex/getFieldSlotElement.
- `js/ui/overlays/SettingsOverlay.js`, `js/ui/components/SettingsButton.js`: menu/focus.
  Do not steal focus from active decision overlays or trap dialogs.
- `js/game/historyLog.js`: logGameAction/logPlainMessage currently prepend TEXT to
  state.log (limit 2000); formatCardForLog encodes name/id/rarity, NOT prior stats.
- `js/state/gameState.js`: createGameState, logMessage, RNG/cursor/instance-ID tracking.
  `js/keywords.js`: getEffectiveAttack; Card.hasNutrition currently only Prey.
- `js/game/controller.js`: GameController.execute returns from many handler branches;
  PLAY_CARD, attack, pending trap and End decisions can span multiple actions.
- `js/game/{combat,consumption,effects,turnManager}.js`: actual mutation boundaries.
  resolveCreatureCombat/resolveDirectAttack/cleanupDestroyed; consumePrey;
  resolveEffectResult; startTurn/finalizeEndPhase. Source of semantic facts.
- `js/network/{actionBus,actionSerializer,actionValidator,actionLog,actionSync,sync}.js`:
  online dispatch, optimistic guest/host confirm/recovery, replay/checksums.
  `js/network/serialization.js`: buildLobbySyncPayload/applyLobbySyncPayload currently
  transport game.log plus zones and pending decisions. No `stateSync.js` here.
- `tests/integration/`, `tests/network/`, `tests/effects/`: use real registry instances
  and actual controller/effect execution; helpers may mock transport/storage only.
- `e2e/interface-regression.mjs`: useful starting point, not full coverage or native iOS.
  `.github/workflows/test.yml` currently runs npm run check, not browser regressions.

## 5. History data contract and capture design

This is the main engineering risk. Strings/live card refs cannot support truthful
before/after or refresh. Build a separate versioned public event stream; keep state.log
compatible for existing diagnostics/legacy records. Do not replace the action log:
network action replay and user-visible history are different things.

Suggested new modules (names may change once, recorded in ledger):
`js/game/historyEvents.js` (schema/projection/recording),
`js/ui/components/HistoryPanel.js` (render/lifecycle),
`js/ui/history/describeEvent.js` (pure formatter),
`js/ui/input/targetResolver.js` (shared hit resolution).

Minimum conceptual schema (implement/test real types, don't just copy placeholder):

```js
{
  version: 1,
  id: 'stable match-scoped event ID',
  turn: 3, phase: '…', actorIndex: 0,
  kind: 'attack', cause: 'combat',
  actionRef: 'stable action/group identity', ordinal: 0,
  sourceIds: ['instance-A'], targetIds: ['instance-B'],
  before: [/* explicit PUBLIC entity snapshots */],
  after: [/* same identities/order incl terminal removed snapshots */],
  outcomes: [/* stat deltas, damage facts, status changes, zone/cause */]
}
```

Each entity snapshot: kind card/player/empty/unknown; stable identity; ownerIndex;
printed card ID + event-time display name/art reference; type; zone/slot; current HP,
max HP where useful, effective displayed ATK, prey nutrition or null; relevant public
keywords/status flags and token marker. Explicitly project fields. No functions,
DOM, registry references, nested live objects, decks/hands, private choices or callbacks.
Copy at capture time; later damage/bounce/copy must not mutate past events. No hydrate
through createCardInstance just to display history (could allocate IDs/reinterpret data).

Design rules:
- Capture before the first relevant mutation and after resolution; explicit terminal
  snapshots before cleanup removes entities. Do NOT take before after execution.
- Net whole-action board diffs alone cannot describe cause, damage prevention, transient
  tokens, spawn-then-death, or multiple sequential effects. Record semantic facts at
  mutation sites and group by resolution. Avoid double-recording the same effect at
  both controller and effect layer. Compound action may yield ordered child events.
- Record at resolved interaction boundaries, not every render/animation. A prompt is
  not resolution. Missing/invalid choices refuse before mutation and before events.
  Partial effects resolved before a later prompt need durable progress and correlation;
  don't replay or re-describe them twice. Preserve existing C/D/E cancellation policy.
- Choose a deterministic match-scoped event counter/correlation mechanism that survives
  authoritative snapshots. Never consume gameplay RNG/seededInstanceId for event IDs,
  use Date.now for identity/order, or serialize absolute local seat labels “You/Rival”.
- Guest optimistic actions already run locally before host confirmation. Establish an
  explicit reconciliation policy: no second event on confirmation; rollback/rejected
  intent restores history along with board; replay/snapshot replaces authoritative
  timeline, not append blindly. Local event counters must roll back too.
- Prefer deterministic event generation on both clients under existing replay, with
  authoritative snapshot replacement and tests proving equality. If that is not viable,
  stage a documented host-confirmed event transport alternative; never ship half of
  both strategies. Freeze the chosen contract at CP03 before broad instrumentation.
- Serialize version/counter/events in lobby state, validate shape on apply, deep-copy,
  and default safely on legacy payloads. An old text-only log renders as legacy text,
  with “Detail unavailable” if opened; no fabricated before/after.
- Bound retention (default 2000 events, matching existing log order of magnitude),
  snapshot only involved public entities, no image blobs or full game snapshots/event.
  Measure serialized bytes at normal and maximum history. Report payload-size risk
  if backend transport budgets are unknown; don't claim capacity without measurement.
- History is presentation metadata, never a gameplay authority. Review gameplay checksum
  inputs before adding fields. Preserve the board/RNG checksum contract and separately
  assert history consistency; don't hide a gameplay mismatch by excluding more state.
- Match reset clears stream/counter/selection; recovery preserves same-match IDs.
  Legacy payload without history must not retain unrelated prior-match events.
- Removal destinations come from engine behavior: slay vs destroy vs consume, token
  removal, scavenge, return to hand. Publicly seen cards can remain visible as historical
  facts, but do not expose subsequently drawn/hidden cards or deck order through history.

## 6. Required event coverage and meaningful tests

Maintain a coverage checklist in ledger; “other event” text fallback cannot substitute
for structured details on shipped public interactions below. Legacy logs are separate.
Use real card definitions + controller/effect paths, not fixture-defined mechanics.

- Creature-v-creature attack: both HP changes, retaliation, lethal (0), simultaneous
  death, multi-strike, before-combat source/target death. Barrier loss (no HP loss),
  negated attack/trap, Toxic/Poisonous/Neurotoxic statuses and cause.
- Direct attack/player-target damage/heal; player tiles and correct perspective.
- Play/summon (one and multiple tokens), empty → creature; no private hand leak.
- Consume 0 (dry drop), 1 and multiple prey; prey NUT including 0; edible predator;
  scavenge from carrion; token consumed (not false Carrion). Gains tracked correctly.
- Spells/abilities: damage/heal, ATK/HP buffs/debuffs, status gain/removal, destroy/exile,
  return-to-hand reset, sacrifice, theft/control change, transform and copied abilities.
- Start/End effects, Regen, paralysis death, thaw, onSlain and nested summon/damage.
- Trap activation that becomes public vs offered/private/declined trap. A prompt open
  or closed is not a completed attack. Turn/setup/victory can be plain typed rows.
- Draw/discard/show effects honor visibility: unknown card/count for private draw;
  public discards only reveal what rules reveal. No AI-thinking leaks to opponent.
- Snapshot JSON round trip with pending End/reaction + subsequent real action; both
  seats; duplicate confirmations, rejected optimistic intent, out-of-order replay;
  event ordering, identity/counter, before/after immutability and PRNG unchanged.
- Formatter: zero vs null nutrition, overkill distinct from HP loss, multiple changes,
  prevention, token destination, unknown card/art, malicious name string escaped.

A PASS requires a nonempty exercised path and observable assertions. Don't conditionally
skip core cases on missing UI/card. Refusal tests assert board/RNG/history unchanged.
For runtime fixes add a failing reproduction first. No tests that merely mirror the
implementation or assert a helper's invented output without exercising production.

## 7. Ordered checkpoints (do one bounded slice at a time)

Detailed status and receipts live ONLY in the ledger. Each checkpoint requires evidence,
focused tests, npm run check, git diff --check and a focused commit. Docs can describe
pending browser/live gates without claiming them passed. Do not re-audit completed CDE.

**CP00 — baseline and reference freeze.** Read spec/ledger/AGENTS. Inspect git status;
record base and ownership of uncommitted files. Run contract before edits. Open approved
phone/desktop/history refs. Record existing browser issues separately. No redesign.

**CP01 — production layout shell and styling tokens.** Map existing IDs/event consumers,
implement top/rival/field/phase/own/hand/sidebar composition, responsive safe areas and
new History shell (can retain legacy content until CP06). Preserve all controls;
no hidden hardcoded board. Screenshot real app at 393×852 and 1440×900. Verify both
seat mappings and resize; show own and rival HP at correct positions.

**CP02 — real cards, hand, inspection and status visuals.** Coherent geometry, full text,
art policy, ATK/NUT/HP including zero, long names/descriptions, Barrier and statuses.
Check hand 0/1/5/many, max 3-slot field, representative five factions, tokens, field
spells. Test hold/release/cancel/scroll, desktop fan/hover, no accidental actions.

**CP03 — freeze history schema and reconciliation contract.** Build projection/formatter
primitives and small production vertical slice (e.g. one attack). Record exact schema,
ID allocation/rollback/persistence policy, event boundary and checksum decision in
`docs/ui-overhaul/HISTORY-CONTRACT.md`. Prove immutability, no PRNG use, both-seat
snapshot round trip, duplicate confirmation and rejected optimistic rollback BEFORE
adding dozens of emitters. No restyling detour; new history can be temporarily hidden.

**CP04a — combat and player history capture.** Exercise all combat coverage above,
source and target before/after, explicit removal reasons, trap/negation boundary.
**CP04b — play/consume/summon and zone moves.** Nutrition and multi-target correctly
captured, tokens/scavenge/bounce/transform handled; production-operation tests.
**CP04c — effects/turn/reaction coverage.** Complete coverage list; chronological nested
outcomes and pending choices survive refresh, no blanket action-replay duplication.
Sub-checkpoints may use separate commits. Always persist exact next uncovered case.

**CP05 — shared face targeting/input.** Introduce resolver, migrate desktop hover/drop
and touch release/feedback/click without broad row coercion. Exercise strip edges,
internal gaps, outside gaps, cards/empty slots/toolbars/overlays, both seats and legal/
illegal actions. Assert action count exactly one or zero; no UI-only validation.

**CP06 — production HistoryPanel.** Render real events (not fake refs), upper list +
lower before/after exactly approved, NUT both rows, banners, skull, full art, computed
copy. Keep legacy text fallback. Click/focus/hover/scroll selection stable during new
sync events; multi-target, missing art and player target paths. Screenshot attack,
consume and summon from actual game operations at both phone sizes and desktop.

**CP07 — overlays/accessibility/control integration.** Mobile history backdrop + inert/
focus lifecycle and mandatory prompt priority; menu/settings/piles/inspection/input
interoperate. Remove conflicting old mobile inspector/history navigation. Preserve
normal Tab/Shift-Tab/Escape behavior and restore focus after repeated open/close.
Confirm History doesn't pause network or cause turn progress. No new backdrop leaks.

**CP08 — bounded acceptance and automation gate.** Implement a deterministic local
browser regression entry (`e2e/ui-overhaul.mjs`, `npm run test:ui` proposed) and wire
into .github/workflows/test.yml with managed Chromium installation/static server.
Run old interface regression too; replace synthetic keydown-only checks with real
Playwright keyboard/mouse/touch events. Require no unexpected page errors.
Cover full game setup/play/consume/attack/turn/victory/rematch/piles and both seats;
real production operations, local transport fixture only where needed. Both clients
must agree after snapshot refresh and next action. Test live matches only with
explicit permitted test accounts/backend; otherwise mark live gate BLOCKED, not PASS.

**CP09 — reviewer handoff and stop.** Full contract + browser gate; acceptance matrix,
actual screenshot paths, commit list, files changed, warnings/baseline comparison,
payload-size results, known limits, and reproduction commands in
`docs/UI-OVERHAUL-REVIEW.md`. No unchecked core checkpoint may be called complete.
If externally blocked, report partial review-ready with exact blockers. Do not push/
merge/deploy without further instruction. Do not keep polishing/hunting indefinitely.

## 8. Verification commands and environments

```sh
cd /Users/nut/.openclaw/workspace/food-chain-tcg
npm run check
# New focused Vitest examples once files exist:
npx vitest run tests/integration/historyEvents.test.js tests/network/historyRecovery.test.js
git diff --check
# Static server in a separate process (inspect existing listener before starting):
python3 -m http.server 8123 --bind 127.0.0.1
# Existing browser check; use this installed Chrome if managed Chromium is absent:
TCG_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node e2e/interface-regression.mjs
# Proposed new gate, after CP08 adds it:
npm run test:ui
```

Local managed Playwright Chromium was absent during design; installed Chrome worked.
Don't run npx playwright install repeatedly on failure or claim Chrome emulation is
native iOS. CI should install its pinned Playwright Chromium and run offline fixtures.
Existing e2e/multiplayer-two-browser.mjs creates live accounts and rows: NOT a harmless
read-only test; don't run blindly. Inspect scripts before executing them.

Minimum real-app screenshot matrix: 375×812, 393×852, 1280×800, 1440×900, 1920×1080;
short viewport and widths around responsive breakpoint (600/900 if retained) should
not lose controls. On each: board, full hand, History open, hold/selection. Additional
History attack/consume/summon and legal face-drag screenshot. Inspect images yourself;
geometry-only assertions miss bad crops, unreadable names and missing nutrition.
Verify all images loaded; preview screenshots cannot substitute for actual app captures.

Browser interactions: native keyboard presses for Tab/focus progression; mouse drag
for desktop; Chromium touch lifecycle for phone, including touchcancel and hold→release.
Use page.evaluate to arrange valid fixtures/import real modules, not to fake success
instead of invoking actual handlers. Record native iOS/Safari as UNVERIFIED unless
actually tested on-device. Automated unit green is not multiplayer certification.

## 9. Compaction and communication protocol (mandatory)

- First after compaction: read ledger's Resume block, git status/log, then ONLY the
  relevant spec section and checkpoint files. Do not reload every transcript/image.
- Write the ledger before a long command, before compaction, at each green checkpoint,
  and before ending a turn. Evidence survives in files, not chat narration.
- Use fixed checkpoint IDs; one IN_PROGRESS. A checkmark means committed implementation
  plus recorded tests, never “planned”, “read”, or “looks okay”. Keep BLOCKED separate.
- Within 15 minutes of no measurable progress, write exact blocker/failing assertion,
  hypothesis and next bounded step. Avoid loops of reading the same code or telling
  the owner the same task is almost done. Test fixture bugs are not engine fixes.
- If editing tools report success, verify file content and diff; earlier work created
  a mangled filename. Use exact paths, no ellipsis in file names. Never trust a tool
  acknowledgement without filesystem evidence.
- Send concise Discord progress every 2–3 meaningful steps and at least once per minute
  while actively working. Questions/status from owner get a timely visible response.
- At end report completed checkpoint IDs, test counts/status, commit, and next action.
  When instructed to proceed straight through, do not stop between green checkpoints
  asking permission to continue. Stop only for a real blocker/owner decision or CP09.
- If another process changed files, preserve its work; inspect diff before changing.
  Never reset/clean/delete untracked files to manufacture a clean tree. Trash unwanted
  artifacts only after ownership is known. No broad lint/format sweep outside scope.
