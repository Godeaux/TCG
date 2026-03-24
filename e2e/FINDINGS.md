# E2E Findings

Cron agents append anything unexpected here. Main session (Dev) reviews and investigates.

Format:
```
## [Date] [Run ID or descriptor]
- **What happened:** [description]
- **Expected:** [what should have happened per CORE-RULES-S.md]
- **Actual:** [what actually happened]
- **Game state:** [compact state string if available]
- **Severity:** low / medium / high / critical
```

---

## 2026-03-24 Manual exploration
- **What happened:** White Missile (Free Spell) stayed in hand after being "played" via QA API
- **Expected:** Free Spells go to exile after use (CORE-RULES-S.md §11)
- **Actual:** Card remained in hand. Likely because spell needs target selection (selectFromGroup) and the selection was never completed
- **Severity:** medium — affects QA API path, real player would see the selection modal and complete it
