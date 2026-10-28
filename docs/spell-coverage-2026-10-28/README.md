# Spell/history pass — 2026-10-28

Based on v0.17 main 42eb3d2. Not deployed.

## Completed
- Opening five-card deals for both players produce no semantic history entries or sequence increments. Ordinary turn/effect draws still record. JSON recovery preserves hands and history.
- Audited the full registry: 45 deck spells + 16 generated spell cards. All 61 now have explicit presentation configurations. Generated spells no longer fall through to the generic draw fan.
- Distinct silhouettes/choreography for generated and previously generic utility spells, using local SVG/CSS assets. Existing reduced-motion, 48-node, two-scene and 1.8-second cleanup budgets retained.
- Washout: dedicated enemy-row foam front, stripping sigils and impact. Owner approved preview in Discord. Local production play-handler and serialized-event cases verified at 393 and 1440 widths, both player perspectives.
- Reproduced and fixed a wrong-row geometry defect: local hot-seat layouts rotate while network-local seat remains 0. Field rows now declare their rendered owner; visual helpers use that actual ownership.
- Reproduced an empty Terrain Shift scene when no enemy tokens existed. Ground still shifts; no false card-hit animation is shown.
- Registry-wide real casts exposed Whitewater's invalid legacy target schema (cast refused). Uses the established all-entities damage selection, with explicit 3 damage + 3 healing and snapshot tests.
- Summon effects anchor to newly arrived cards rather than unrelated existing creatures.

## Evidence
- Baseline: 5,169 tests / 69 files passed.
- Final: npm run check — 5,232 tests / 71 files passed, lint/format passed (existing lint warnings).
- Full npm run test:ui passed, including 69 production cast/snapshot presentations and 61 presentation configurations at phone/desktop sizes; no page errors.
- Additional focused Washout row-mapping red/green reproduction; actual opening setup function tested in browser.
- cast-results.json, screenshots and washout-demo.mp4 are local evidence; bulk/generated images are not staged.

## Limits / next work
The exact zero-animation event reported by the owner was not reproduced on the current branch; an ordinary Washout cast did produce the old delayed wave. The missing generated-spell configs, empty Terrain Shift scene and wrong-row mapping were independently reproduced. Do not claim that config presence alone proved the report false.
No deployed-site change, native-phone certification or backend/security change is claimed. Profile and pack-opening visual unification is next; initial read-only real QA profile captures are in docs/profile-pack-polish/.
