# Juice System Design Document

**Author:** Systems Architect
**Status:** Planning
**Scope:** Animation timing, screen shake, sound effects, impact weight

---

## Overview

Add "juice" to make every action feel weighty and satisfying. Core principles:
1. **Anticipation** — Brief delay before action creates tension
2. **Impact** — Visual + audio feedback at moment of contact
3. **Follow-through** — Settling animations after impact
4. **Scaling** — Bigger cards = bigger effects

---

## Architecture

### New Module: `js/ui/effects/juiceSystem.js`

Central coordinator for timing, shake, and sound integration.

```
js/ui/effects/
├── battleEffects.js    (existing - visual animations)
├── spellEffects.js     (existing - spell visuals)
└── juiceSystem.js      (NEW - timing, shake, sound coordination)
```

**Why a new module?**
- Keeps timing logic separate from animation rendering
- Single place to tune all "feel" parameters
- Can be disabled for accessibility (motion sensitivity)

### Data Flow

```
GameController.execute(action)
    ↓
State changes (instant, as before)
    ↓
queueVisualEffect(state, effect)
    ↓
JuiceSystem.enhanceEffect(effect)     ← NEW: adds timing, shake, sound metadata
    ↓
processVisualEffects(state)
    ↓
JuiceSystem.orchestrate(effects)      ← NEW: staggers, delays, triggers sounds
    ↓
battleEffects.play*(effect)           (existing animation functions)
```

---

## Timing Constants

All timings in milliseconds. Tunable from one location.

```javascript
// js/ui/effects/juiceSystem.js

export const JUICE_TIMING = {
    // Attack sequence
    ATTACK_WINDUP: 180,           // Pause before attack launches
    ATTACK_TRAVEL: 350,           // Ghost flight time (was 420, tighter)
    ATTACK_IMPACT_DELAY: 40,      // Delay between hit and effects
    ATTACK_STAGGER: 120,          // Between sequential attacks

    // Card play
    PLAY_ANTICIPATION: 80,        // Before card appears
    PLAY_SLAM_SMALL: 150,         // 1-2 cost creatures
    PLAY_SLAM_MEDIUM: 200,        // 3-4 cost creatures
    PLAY_SLAM_BIG: 280,           // 5+ cost creatures
    PLAY_SETTLE: 100,             // Bounce-back after slam

    // Damage
    DAMAGE_POP_STAGGER: 60,       // Between multiple damage numbers
    SHAKE_DURATION: 400,          // Screen shake length

    // Consumption
    CONSUMPTION_ANTICIPATION: 100,
    CONSUMPTION_CRUNCH: 200,

    // Keywords
    KEYWORD_PULSE_COUNT: 2,       // Number of glow pulses
    KEYWORD_PULSE_INTERVAL: 150,
};
```

---

## Screen Shake System

### Implementation

Add shake to the game board container, not individual elements.

```javascript
// js/ui/effects/juiceSystem.js

export function screenShake(intensity = 'medium', duration = JUICE_TIMING.SHAKE_DURATION) {
    const intensities = {
        light:  { x: 2, y: 1 },   // Small hits, keywords
        medium: { x: 4, y: 2 },   // Normal attacks
        heavy:  { x: 8, y: 4 },   // Big creatures, lethal hits
        slam:   { x: 3, y: 6 },   // Card play (more vertical)
    };

    const board = document.getElementById('game-board');
    const { x, y } = intensities[intensity];

    // CSS custom properties for shake animation
    board.style.setProperty('--shake-x', `${x}px`);
    board.style.setProperty('--shake-y', `${y}px`);
    board.classList.add('screen-shake');

    setTimeout(() => board.classList.remove('screen-shake'), duration);
}
```

### CSS Addition

```css
/* styles.css */

@keyframes screen-shake {
    0%, 100% { transform: translate(0, 0); }
    10% { transform: translate(calc(-1 * var(--shake-x)), var(--shake-y)); }
    20% { transform: translate(var(--shake-x), calc(-1 * var(--shake-y))); }
    30% { transform: translate(calc(-0.5 * var(--shake-x)), var(--shake-y)); }
    40% { transform: translate(var(--shake-x), var(--shake-y)); }
    50% { transform: translate(calc(-1 * var(--shake-x)), calc(-0.5 * var(--shake-y))); }
    60% { transform: translate(var(--shake-x), calc(-1 * var(--shake-y))); }
    70% { transform: translate(calc(-0.5 * var(--shake-x)), var(--shake-y)); }
    80% { transform: translate(calc(-1 * var(--shake-x)), calc(-0.5 * var(--shake-y))); }
    90% { transform: translate(var(--shake-x), 0); }
}

.screen-shake {
    animation: screen-shake var(--shake-duration, 400ms) ease-out;
}
```

---

## Sound Effect Integration

### Sound Categories Needed

| Category | Sound | Trigger Point | Priority |
|----------|-------|---------------|----------|
| **Combat** | `attackWhoosh` | Attack ghost launches | P0 |
| **Combat** | `impactHit` | Attack connects | P0 |
| **Combat** | `impactHeavy` | 4+ damage hit | P0 |
| **Combat** | `creatureDeath` | Creature HP → 0 | P0 |
| **Play** | `cardSlam` | Card placed on field | P0 |
| **Play** | `cardSlamHeavy` | 5+ cost card placed | P1 |
| **Consume** | `consumptionCrunch` | Consumption completes | P0 |
| **Keywords** | `barrierBlock` | Barrier absorbs | P1 |
| **Keywords** | `toxicProc` | Poison applied | P1 |
| **UI** | `cardHover` | Card mouseover | P2 |
| **UI** | `buttonClick` | UI button press | P2 |
| **Game** | `victoryFanfare` | Win screen | P1 |
| **Game** | `defeatStinger` | Lose screen | P1 |

### SoundManager Enhancement

```javascript
// js/audio/soundManager.js - additions

const SOUNDS = {
    // Existing
    turnEnd: 'audio/turn-end.wav',
    cardDraw: 'audio/card-draw.wav',

    // Combat (P0)
    attackWhoosh: 'audio/attack-whoosh.wav',
    impactHit: 'audio/impact-hit.wav',
    impactHeavy: 'audio/impact-heavy.wav',
    creatureDeath: 'audio/creature-death.wav',

    // Play (P0)
    cardSlam: 'audio/card-slam.wav',
    cardSlamHeavy: 'audio/card-slam-heavy.wav',

    // Consume (P0)
    consumptionCrunch: 'audio/consumption-crunch.wav',

    // Keywords (P1)
    barrierBlock: 'audio/barrier-block.wav',
    toxicProc: 'audio/toxic-proc.wav',

    // Game (P1)
    victoryFanfare: 'audio/victory-fanfare.wav',
    defeatStinger: 'audio/defeat-stinger.wav',
};
```

---

## Attack Sequence (Revised)

### Current Flow (No Juice)
```
0ms:   State resolves → attack ghost launches immediately
420ms: Ghost arrives → impact ring + damage pop (simultaneous)
```

### New Flow (With Juice)
```
0ms:   State resolves
       ↓
0ms:   Attacker card pulses/glows (anticipation)
       Sound: none (tension through silence)
       ↓
180ms: Attack ghost launches
       Sound: attackWhoosh
       Screen: none yet
       ↓
530ms: Ghost arrives at target
       Sound: impactHit (or impactHeavy if damage >= 4)
       Screen: shake(medium) or shake(heavy)
       ↓
570ms: Impact ring + damage pop
       ↓
670ms: If lethal → death sound + heavy shake
       ↓
790ms: Settle, next attack can begin (if multi-attack)
```

### Implementation Hook

```javascript
// js/ui/effects/battleEffects.js - modify playAttackAnimation()

export async function playAttackAnimation(effect, options = {}) {
    const { attacker, target, damage } = effect;

    // Phase 1: Windup
    await JuiceSystem.pulseElement(attacker.element, JUICE_TIMING.ATTACK_WINDUP);

    // Phase 2: Launch
    SoundManager.play('attackWhoosh');
    await animateGhostFlight(attacker, target, JUICE_TIMING.ATTACK_TRAVEL);

    // Phase 3: Impact
    const isHeavy = damage >= 4;
    SoundManager.play(isHeavy ? 'impactHeavy' : 'impactHit');
    screenShake(isHeavy ? 'heavy' : 'medium');

    await delay(JUICE_TIMING.ATTACK_IMPACT_DELAY);

    // Phase 4: Feedback
    playImpactRing(target);
    playDamagePop(target, damage);

    // Phase 5: Death check (handled by separate effect in queue)
}
```

---

## Card Play Slam

### Slam Intensity by Cost

| Cost | Slam Type | Scale | Shake | Sound |
|------|-----------|-------|-------|-------|
| 1-2 | Light | 1.0 → 1.05 → 1.0 | `light` | `cardSlam` |
| 3-4 | Medium | 1.0 → 1.08 → 1.0 | `medium` | `cardSlam` |
| 5+ | Heavy | 1.0 → 1.12 → 1.0 | `slam` | `cardSlamHeavy` |

### Implementation Hook

```javascript
// js/game/controller.js - modify placeCreatureInSlot()

async placeCreatureInSlot(state, cardUid, slotIndex, player) {
    const card = getCardByUid(state, cardUid);
    const cost = card.cost;

    // Determine slam intensity
    const slamType = cost >= 5 ? 'heavy' : cost >= 3 ? 'medium' : 'light';

    // Queue visual effect with slam metadata
    queueVisualEffect(state, {
        type: 'cardPlay',
        cardUid,
        slotIndex,
        player,
        slam: slamType,  // NEW: juice metadata
    });

    // ... rest of placement logic
}
```

```javascript
// js/ui/effects/battleEffects.js - new function

export async function playCardPlayAnimation(effect) {
    const { cardUid, slam } = effect;
    const element = document.querySelector(`[data-uid="${cardUid}"]`);

    const config = {
        light:  { scale: 1.05, shake: 'light',  sound: 'cardSlam' },
        medium: { scale: 1.08, shake: 'medium', sound: 'cardSlam' },
        heavy:  { scale: 1.12, shake: 'slam',   sound: 'cardSlamHeavy' },
    }[slam];

    // Anticipation pause
    await delay(JUICE_TIMING.PLAY_ANTICIPATION);

    // Slam down
    element.style.transform = `scale(${config.scale})`;
    SoundManager.play(config.sound);
    screenShake(config.shake);

    // Settle
    await delay(JUICE_TIMING[`PLAY_SLAM_${slam.toUpperCase()}`]);
    element.style.transform = 'scale(1)';
}
```

---

## Multi-Attack Stagger

When multiple attacks happen in one combat phase, stagger them.

```javascript
// js/ui.js - modify processVisualEffects()

async function processVisualEffects(state) {
    const effects = state.visualEffects || [];

    // Group attacks for staggering
    const attackEffects = effects.filter(e => e.type === 'attack');
    const otherEffects = effects.filter(e => e.type !== 'attack');

    // Play attacks with stagger
    for (let i = 0; i < attackEffects.length; i++) {
        if (i > 0) {
            await delay(JUICE_TIMING.ATTACK_STAGGER);
        }
        await playAttackAnimation(attackEffects[i]);
    }

    // Play other effects (can be parallel)
    await Promise.all(otherEffects.map(e => playEffect(e)));

    // Clear processed effects
    state.visualEffects = [];
}
```

---

## Accessibility Considerations

### Motion Reduction

```javascript
// js/ui/effects/juiceSystem.js

export function shouldReduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
        || localStorage.getItem('reduceMotion') === 'true';
}

export function getTimingMultiplier() {
    if (shouldReduceMotion()) return 0.3;  // Much faster
    const speed = localStorage.getItem('animationSpeed') || 'normal';
    return { slow: 1.5, normal: 1.0, fast: 0.6 }[speed];
}
```

### Settings Integration

Add to options menu:
- Animation Speed: Slow / Normal / Fast
- Reduce Motion: Toggle (respects OS preference by default)
- Screen Shake: Toggle

---

## Implementation Order

### Phase 1: Foundation (Do First)
1. Create `juiceSystem.js` with timing constants and `screenShake()`
2. Add CSS keyframes for screen shake
3. Add P0 sound files (6 sounds)
4. Integrate sounds into SoundManager

### Phase 2: Combat Juice
1. Add windup delay to attack animation
2. Integrate `attackWhoosh` sound at launch
3. Add impact sounds with damage-based selection
4. Add screen shake on impact
5. Add attack stagger for multi-attacks

### Phase 3: Card Play Juice
1. Add slam metadata to `cardPlay` visual effect
2. Implement `playCardPlayAnimation()` with cost-based intensity
3. Add slam sounds

### Phase 4: Polish
1. Consumption crunch sound + shake
2. Keyword sounds (barrier, toxic)
3. Victory/defeat fanfares
4. Settings UI for animation preferences

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `js/ui/effects/juiceSystem.js` | **NEW** | Timing, shake, coordination |
| `js/ui/effects/battleEffects.js` | Modify | Add async/await, windup delays |
| `js/audio/soundManager.js` | Modify | Add 10+ new sound definitions |
| `js/game/controller.js` | Modify | Add slam metadata to cardPlay effects |
| `js/ui.js` | Modify | Add attack stagger logic |
| `styles.css` | Modify | Add screen-shake keyframes |
| `audio/*.wav` | **NEW** | 10+ sound effect files |

---

## Open Questions

1. **Sound sourcing**: Use free SFX libraries (freesound.org, Kenney.nl) or generate?
2. **Timing tuning**: Values above are estimates. Need playtesting session to dial in.
3. **Mobile performance**: Test shake performance on low-end devices.
4. **Multiplayer sync**: Animations are client-only, but verify no race conditions with state updates.

---

## Approval Checklist

- [ ] Timing constants reviewed
- [ ] Sound list approved
- [ ] Accessibility approach approved
- [ ] Implementation order approved
- [ ] Ready to begin Phase 1
