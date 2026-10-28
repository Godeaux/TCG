/** Small, asset-independent silhouettes for spells that previously shared a
 * generic card fan. All animation stays in the scene's existing node budget. */
export const SPELL_SIGNATURES = {
  poison: ['M32 4Q5 35 12 47Q32 68 52 47Q59 35 32 4z M22 40l20 12 M42 40L22 52', 'fall'],
  paralyze: [
    'M12 15Q32-5 52 15Q62 30 32 31Q2 32 12 49Q32 67 52 49 M28 10l10 17-12 10 10 17',
    'pulse',
  ],
  rain: ['M8 20Q4 5 20 8Q32-6 44 9Q63 5 58 23H8 M16 30l-6 18 M32 30l-6 18 M48 30l-6 18', 'fall'],
  treasure: ['M8 28h48v26H8z M8 28a24 20 0 0 1 48 0 M8 35h48 M28 30h8v12h-8z', 'open'],
  search: ['M32 4v28c0 20-24 18-24 4 M8 36l8 6 M25 18l7-6 7 6-7 6z', 'swing'],
  reveal: ['M4 32Q32 4 60 32Q32 60 4 32z M42 32a10 10 0 1 1-20 0a10 10 0 1 1 20 0', 'open'],
  neocortex: [
    'M12 16L32 8 52 20 44 48 20 54 12 16 44 48 32 8 20 54 52 20 12 16 M25 29h14v10H25z',
    'pulse',
  ],
  copy: ['M8 8h28v38H8z M28 18h28v38H28z M12 26h40 M44 20l8 6-8 6', 'split'],
  'sacrifice-draw': ['M8 8h20v30H8z M36 26h20v30H36z M10 54L54 10 M42 10h12v12', 'split'],
  choose: ['M4 20h16v32H4z M24 8h16v44H24z M44 20h16v32H44z', 'fan'],
  'choose-small': [
    'M6 43Q2 22 20 25Q24 5 40 17Q62 18 57 43Q32 61 6 43z M23 36h2 M39 36h2',
    'pulse',
  ],
  transmogrify: [
    'M8 44Q48 52 48 24Q42 8 28 19Q12 30 30 35 M26 28L14 18 M35 39l8 14 M42 23l12-6',
    'swing',
  ],
  draw: ['M10 17h25v35H10z M22 11h25v35H22z M34 5h25v35H34z', 'fan'],
  glow: ['M8 34Q30 8 48 34Q30 60 8 34z M48 34l12-14v28z M18 25v18', 'pulse'],
  nurture: ['M24 6h16v12l10 14v24H14V32l10-14z M14 36h36 M28 43h8', 'rise'],
  thaw: [
    'M32 3v12 M32 49v12 M3 32h12 M49 32h12 M11 11l9 9 M44 44l9 9 M11 53l9-9 M44 20l9-9 M42 32a10 10 0 1 1-20 0a10 10 0 1 1 20 0',
    'open',
  ],
  'small-buff': ['M32 6l25 14-9 30-16 9-16-9-9-30z M32 18v28 M18 32h28', 'rise'],
  metamorphosis: ['M32 9v46 M32 28Q4-2 7 29Q7 54 32 38Q57 54 57 29Q60-2 32 28', 'open'],
  hatch: ['M32 5C8 5 2 57 32 57S56 5 32 5z M12 32l12-6 8 12 8-15 12 8', 'open'],
  'scale-shield': [
    'M32 4L57 15 52 40 32 59 12 40 7 15z M15 22q8 12 17 0q9 12 17 0 M19 34q6 10 13 0q7 10 13 0',
    'open',
  ],
  'scale-volley': [
    'M10 7l42 45 M52 7L10 49 M32 4v54 M44 52h8V44 M10 41v8h8 M25 51l7 7 7-7',
    'fall',
  ],
  'golden-dart': ['M9 55L52 12 M42 7l15 15 M45 19l-4-14 18 0-2 18-12-4 M10 42l12 12', 'fall'],
  'spectral-darts': ['M4 15l23 17L4 49 M23 8l27 24-27 24 M40 20l19 12-19 12', 'split'],
  'tomato-freeze': [
    'M32 17C6 7 1 52 24 56C55 68 67 19 43 17z M32 17L19 9l13 3 8-9-2 13 13-5 M16 39h30 M31 25v28',
    'pulse',
  ],
  'lake-deluge': [
    'M3 25Q18 8 32 25T61 25 M3 38Q18 21 32 38T61 38 M3 51Q18 34 32 51T61 51 M26 5h12',
    'fall',
  ],
  'rainbow-regen': [
    'M5 53a27 39 0 0 1 54 0 M13 53a19 29 0 0 1 38 0 M21 53a11 19 0 0 1 22 0',
    'open',
  ],
  'feather-veil': ['M10 56L48 9Q66 6 55 31L10 56 M22 41l-5-15 M32 29l-4-13 M31 33h15', 'swing'],
  'prismatic-feather': [
    'M10 56L48 9Q66 6 55 31L10 56 M22 41l-5-15 M32 29l-4-13 M31 33h15 M6 9l4-6 4 6-4 6z',
    'fan',
  ],
  'seed-feed': [
    'M9 40Q4 17 27 17Q32 40 9 40z M38 54Q23 35 44 26Q63 42 38 54z M13 35l10-13 M39 46l5-12',
    'fall',
  ],
  'scarlet-plume': [
    'M12 57Q0 18 35 5Q60 12 49 38L12 57 M12 57L35 5 M19 40l20-5 M24 26l18-5',
    'rise',
  ],
  'milk-pour': ['M11 6h22v10l6 12v27H5V28l6-12z M5 34h34 M47 25q-12 20 0 20q12 0 0-20', 'fall'],
  gift: [
    'M6 27h52v29H6z M3 19h58v12H3z M28 19v37h8V19 M32 19C6 17 14-7 32 19C50-7 58 17 32 19',
    'open',
  ],
  'wool-guard': [
    'M12 17Q8 4 23 12Q32-2 42 12Q59 5 52 21Q66 31 54 41Q58 58 42 53Q32 68 22 53Q4 58 11 41Q-2 28 12 17z M20 28l10 12 16-19',
    'open',
  ],
  'fur-mantle': [
    'M19 5L5 23 11 56 32 47 53 56 59 23 45 5 32 17z M19 5l2 27 11 15 11-15 2-27 M12 28l9 4 M43 32l9-4',
    'rise',
  ],
};

export function paintSpellSignature(motif, rect, node, delay = 0) {
  const signature = SPELL_SIGNATURES[motif];
  if (!signature || !rect) return;
  const [path, motion] = signature;
  const size = Math.max(30, Math.min(80, rect.w * 0.6, rect.h * 0.65));
  const variants = {
    open: ['scale(.25) rotate(-12deg)', 'scale(1.1)', 'scale(1.3) translateY(-12px)'],
    swing: ['translateY(-35px) rotate(-25deg)', 'rotate(12deg)', 'translateY(-20px) rotate(25deg)'],
    pulse: ['scale(.5)', 'scale(1.15)', 'scale(.85) translateY(-14px)'],
    split: ['translateX(-24px) scale(.7)', 'translateX(0) scale(1)', 'translateX(25px) scale(.9)'],
    fan: ['rotate(-25deg) scale(.4)', 'rotate(10deg) scale(1)', 'rotate(25deg) translateY(-20px)'],
    rise: ['translateY(30px) scale(.6)', 'translateY(0) scale(1)', 'translateY(-35px) scale(.8)'],
    fall: ['translateY(-40px) scale(.6)', 'translateY(0) scale(1)', 'translateY(25px) scale(.85)'],
  };
  const frames = variants[motion];
  const crest = node(
    'signature',
    rect.cx - size / 2,
    rect.cy - size / 2,
    size,
    size,
    [
      { opacity: 0, transform: frames[0] },
      { opacity: 0.95, offset: 0.35, transform: frames[1] },
      { opacity: 0.85, offset: 0.65, transform: frames[1] },
      { opacity: 0, transform: frames[2] },
    ],
    1050,
    delay
  );
  if (crest) {
    crest.dataset.signature = motif;
    crest.innerHTML = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  }
}
