# Pre-1.0 gameplay campaign — planned, not certification

Owner request, 2026-10-28: sustained in-game testing over multiple days across
PvP, PvAI and AI-vs-AI, including dry-drop/consumption bypasses. A green unit
suite or a large number of AI games is not a substitute for this campaign.
No campaign pass is claimed by this document.

## First bounded audit, dispatched October 28

Local Qwen 3.8, one-hour timeout, isolated branch
`qa/pre-1-drydrop-2026-10-28`, base `458589d` (0.18 candidate).
Deliverable: `docs/qa/pre-1-drydrop-audit-2026-10-28.md` in its audit checkout.
Scope: ability suppression without consuming prey, legal consumption controls,
invalid/insufficient prey, cancellation, pending choices, JSON recovery, and AI
routes. Real production operations and valid catalog cards only. Add failing
regressions for confirmed defects; no runtime changes, deployment, production
backend writes or additional paid inference. Parent reviews all findings.
This is one audit, not the multi-day campaign itself.

## Execution matrix

Keep a ledger per build, seed, scenario and mode. Separate automated matches,
scripted adversarial cases, and manual real-device matches in reporting.

- **PvP:** two independent clients/identities and both seats. Include concurrent
  inputs, cancel/back/retry, reload at pending choices, disconnect/reconnect,
  duplicate delivery, rematch and seat-private payload inspection. A local
  transport harness is useful but is not live PvP certification.
- **PvAI:** human in each supported seat, Quick play and Deep thinking, random,
  domain and saved decks. Exercise the same legality gates through human and
  AI actions; inspect actual state, not just the AI's stated intent.
- **AI-vs-AI:** seeded batches across every supported domain pairing and both
  starting seats, random and curated adversarial decks. Record actual outcomes,
  incomplete games, repeated states, crashes and rule invariant violations.
  Never count timeouts or skipped games as passes.

## Focus areas, each with legal and refusal controls

1. Dry-drop suppression; keywords, triggered/activated/slain effects; valid
   consumption, insufficient/invalid prey, cancellation, Free Play restrictions.
2. Turn/phase legality, play limits, attack readiness, target legality, traps,
   response windows and effects that create additional choices.
3. Damage prevention, barriers, poison/freeze, death ordering, simultaneous
   effects, token creation/transformation, discard/exile and win/draw resolution.
4. Serialization/reload at each pending choice; stale action rejection and
   same-build replay consistency. Preserve private information throughout.
5. Input variants: tap, hold/drag, keyboard, rapid repeated input, portrait
   scrolling, and native iPhone background/resume. Emulation is not a native pass.

Use CORE-RULES.md plus printed card text to decide expected behavior. Track
ambiguous rules for owner resolution rather than inventing an expectation.
Every confirmed bug needs a minimal reproducible seed/action trace and a failing
production-path regression before a fix. Audit-only red tests stay isolated.

## Multi-day release gate

Plan multiple daily sessions and overnight automated batches, recording actual
elapsed run time and completed matches. Begin broader batches only after the
focused invariants and test harness are trustworthy. Fixes invalidate affected
coverage; rerun the relevant matrix on the final candidate. Do not promise
"all possibilities": document tested combinations and explicit gaps.

Before calling 1.0 ready:

- No unresolved reproduced rule-breaking, privacy or state-divergence defects.
- Every known gameplay fix has a regression; contract and browser checks green.
- Required PvP recovery/privacy and native-phone acceptance evidence exists.
- Multi-day ledger names tested build(s), modes, seeds, games completed/failed,
  manual sessions, limitations and remaining owner decisions.

No production soak, account migration or recurring automation is enabled by
this planning document. Use isolated staging for adversarial multiplayer work.
