# Plan: Resolution-Independent Card Scaling

## Problem Statement

Cards and their text (title, stats, effects) appear too small in hand, and previous fixes have been inconsistent across different PC resolutions and browser zoom levels. We need a "once and for all" solution that provides a uniform experience regardless of resolution.

## Root Cause

Current card styling mixes incompatible units:
- Card height: `22vh` (viewport-relative)
- Card name font: `1.4vh` (viewport-relative)
- Stats min-height: `20px` (fixed pixels)
- SVG viewBox: `260×60` (fixed pixels)
- Content area: `42%` (parent-relative)

These units don't scale together, causing proportions to break at different resolutions/zoom levels.

## Solution: Container Query-Based Scaling

Make the **card itself** the single source of truth. Every element inside sizes relative to the card's dimensions using CSS Container Query units (`cqi`, `cqb`).

### Key Principle

```
1cqi = 1% of container's width
1cqb = 1% of container's height
```

If card name is `font-size: 5cqi`, it will always be 5% of the card's width - whether the card is 100px or 500px wide.

## Implementation Steps

### Phase 1: Remove SVG Text Rendering

The SVG approach adds complexity without solving the core problem. CSS container queries are simpler and more maintainable.

**Files to modify:**
- `js/ui/components/Card.js` - Remove SVG rendering functions, return to plain text

**Changes:**
1. Remove `SVG_CONFIGS` object
2. Remove `renderEffectSvg()`, `renderNameSvg()`, `renderStatsSvg()`, `renderKeywordsSvg()`
3. Remove canvas measurement code (`getMeasureContext`, `wrapTextByWidth`)
4. Keep `wrapTextToLinesByChars()` for effect text wrapping (still useful)
5. Update `renderCard()` to output plain text/HTML instead of SVGs
6. Remove `context` parameter from render functions

### Phase 2: Make Cards Container Query Containers

**File: `styles.css`**

Add container query support to all card contexts:

```css
/* Make ALL cards container query containers */
.card {
  container-type: size;
  container-name: card;
}
```

### Phase 3: Define Card Internal Layout with Container Units

**File: `styles.css`**

Replace current card internal sizing with container-relative units:

```css
/* Card maintains 5:7 aspect ratio */
.card {
  aspect-ratio: 5 / 7;
  container-type: size;
  container-name: card;
}

/* Card inner layout - all heights relative to card */
.card-inner {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* Name area: 8% of card height */
.card-name {
  height: 8cqb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 5cqi;  /* 5% of card width */
  font-weight: 600;
}

/* Image area: 50% of card height */
.card-image-container {
  height: 50cqb;
}

/* Content area: 42% of card height */
.card-content-area {
  height: 42cqb;
  display: flex;
  flex-direction: column;
}

/* Stats row */
.card-stats-row {
  height: 7cqb;
  font-size: 4.5cqi;
}

/* Keywords */
.card-keywords {
  height: 5cqb;
  font-size: 3.5cqi;
}

/* Effect text - takes remaining space */
.card-effect {
  flex: 1;
  font-size: 3.8cqi;
  line-height: 1.3;
  overflow: hidden;
}
```

### Phase 4: Hand-Specific Sizing for Legibility

**File: `styles.css`**

Ensure hand cards are large and legible:

```css
/* Hand cards - generous sizing for readability */
.hand-grid .card {
  /* Base height responsive to viewport, with good minimums */
  height: clamp(180px, 25vh, 320px);
  width: auto;
  aspect-ratio: 5 / 7;
}

/* Hand card text overrides - prioritize legibility */
@container card (min-height: 150px) {
  .card-name {
    font-size: 5.5cqi;
  }
  .card-effect {
    font-size: 4cqi;
  }
}

@container card (min-height: 200px) {
  .card-name {
    font-size: 6cqi;
  }
  .card-effect {
    font-size: 4.2cqi;
  }
}
```

### Phase 5: Field Card Sizing

**File: `styles.css`**

Field cards can be smaller since tooltip provides detail:

```css
.field-slot .card {
  height: 100%;
  width: auto;
  aspect-ratio: 5 / 7;
}

/* Field cards - smaller text is acceptable */
@container card (max-height: 120px) {
  .card-name {
    font-size: 4cqi;
  }
  .card-effect {
    font-size: 3cqi;
  }
  .card-stats-row {
    font-size: 4cqi;
  }
}
```

### Phase 6: Tooltip/Inspector Sizing

**File: `styles.css`**

Tooltips should have the most readable text:

```css
.tooltip-card-preview .card {
  width: 100%;
  aspect-ratio: 5 / 7;
}

/* Tooltip gets largest, most readable text */
@container card (min-width: 200px) {
  .card-name {
    font-size: 6cqi;
  }
  .card-effect {
    font-size: 4.5cqi;
  }
}
```

### Phase 7: Cleanup

**Files to modify:**
- `js/ui/components/Hand.js` - Remove `context: 'hand'` parameter
- `js/ui/components/Field.js` - Remove `context: 'field'` parameter
- `js/ui/components/CardTooltip.js` - Remove context-related changes

## Testing Checklist

After implementation, test at these resolutions/zoom levels:

- [ ] 1920×1080 at 100% zoom
- [ ] 1920×1080 at 125% zoom
- [ ] 1920×1080 at 150% zoom
- [ ] 2560×1440 at 100% zoom
- [ ] 3840×2160 (4K) at 100% zoom
- [ ] 1366×768 (laptop) at 100% zoom
- [ ] Browser zoom: 50%, 75%, 100%, 125%, 150%, 200%

**Verify:**
1. Hand cards are always legible without squinting
2. Card proportions stay consistent across all resolutions
3. Text never overflows or gets clipped
4. Field cards are readable but can be smaller
5. Tooltip/inspector shows full detail clearly

## Browser Support

CSS Container Queries are supported in:
- Chrome 105+ (Sept 2022)
- Firefox 110+ (Feb 2023)
- Safari 16+ (Sept 2022)
- Edge 105+ (Sept 2022)

~95% of users have support. For the ~5% without, add fallback:

```css
@supports not (container-type: size) {
  .card-name { font-size: 14px; }
  .card-effect { font-size: 12px; }
  /* etc. */
}
```

## File Summary

| File | Changes |
|------|---------|
| `js/ui/components/Card.js` | Remove SVG rendering, simplify to plain text |
| `js/ui/components/Hand.js` | Remove `context` parameter |
| `js/ui/components/Field.js` | Remove `context` parameter |
| `js/ui/components/CardTooltip.js` | Remove context-related code |
| `styles.css` | Add container queries, replace px/vh with cqi/cqb |

## Success Criteria

1. Cards in hand are **large and legible** at all resolutions
2. Text scales **proportionally** with card size
3. **No more resolution-specific fixes** needed
4. Consistent appearance whether on 1080p laptop or 4K monitor
5. Browser zoom works correctly from 50% to 200%
