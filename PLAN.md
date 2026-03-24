# Food Chain TCG — Bug-Free Perfection Plan

**Goal:** Make every game rule and effect work exactly as CORE-RULES.md specifies. Zero bugs.

**Approach:** TDD + LLM self-play. Tests are the source of truth. Every rule has a test. Every fix starts with a failing test. Playwright play sessions find NEW bugs, which then get the same treatment.

---

## Phase 1: Clean the Codebase ✅ DONE
- Deleted experimental decks: Arachnid, Feline, Crustacean, Insect
- Removed AI vs AI simulation system (BugDetector, BugRegistry, invariantChecks, etc.)
- Stripped experimental keywords: Web, Webbed, Venom, Stalk, Pride, Shell, Molt, Evasive, Unstoppable
- ~13,400 lines removed across two commits
- **Core 5 decks remain:** Fish, Bird, Mammal, Reptile, Amphibian + Tokens
- **Branch:** `dev/strip-experimental`

## Phase 2: TDD Test Harness
- Set up test runner (vitest or Node test runner) — lightweight, no build step
- Write unit tests for every rule in CORE-RULES.md §1–§15
- Pure JS tests against `GameController` — no browser needed
- Tests organized by rule section in `test/` directory
- Each bug from the audit report gets a **failing test FIRST**, then the fix
- Test categories:
  - Turn phases & flow (§2)
  - Eating/consumption mechanics (§3)
  - Summoning exhaustion (§4)
  - Combat resolution — all keyword interactions (§5-§6)
  - Status effects: Frozen, Paralysis (§7)
  - Trap timing & activation (§8)
  - Death triggers / onSlain exceptions (§9)
  - Tokens (§10)
  - Spell types (§11)
  - Edge cases from §12 checklist (26 items)
  - Victory conditions incl. simultaneous 0 HP draw (§12)

## Phase 3: Fix Audit Bugs (TDD)
For each bug: write failing test → fix code → test passes.

Priority order (from AUDIT-REPORT.md):
1. **Neurotoxic vs Barrier** — Paralysis applies when Barrier blocks (Critical)
2. **Duplicate cleanupDestroyed** — Controller vs combat.js versions diverge (Critical)
3. **Simultaneous 0 HP = draw** — Currently player 1 wins instead (Major)
4. **Lure always overrides Hidden/Invisible** — Uses wrong "last applied" heuristic (Major)
5. **Dry drop clears keywords** — Suppressed via flag but direct checks bypass it (Major)
6. **Predator from carrion eats** — playFromCarrion skips consumption flow (Major)
7. **Neurotoxic at 0 ATK** — Should require damage dealt (Major)
8. **Eating limit validation** — No server-side cap at 3 (Minor)
9. **Log message typo** — "going second" should say "going first" (Minor)
10. **Seeded PRNG for drawCard** — Uses Math.random() (Minor)

## Phase 4: Playwright Self-Play
- Install Playwright with WebKit (Safari engine)
- Local static server for the game
- Two browser contexts — Dev controls both players
- Start headless (no visual), screenshots between every action
- Play full games, verify behavior against CORE-RULES.md
- Use `__dev` API for state inspection when something smells off
- Find long-tail bugs the static audit missed
- Each new bug → back to Phase 3 treatment (failing test → fix → pass)

---

## Key Principles
- **Tests are the source of truth.** Every rule has a test.
- **TDD always.** Failing test first, then fix. No exceptions.
- **TDD for cleanup too.** Before removing dead code, write tests that prove the remaining code works without it. Run tests after every removal to catch cascading breakage immediately.
- **No simulation bloat.** No invariant checkers, no BugDetector.
- **Player's perspective.** Playwright tests play the game like a human would.
- **CORE-RULES.md is authoritative.** If code disagrees with rules, code is wrong.
- **Programmatic error detection.** Tight tests catch bugs before they hit context. Write tests that surface errors affirmatively, don't stumble on them later.

---

*Created 2026-03-22 · Updated as phases complete*
