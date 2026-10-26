/** Board-local spell choreography. No game-state writes, layout animation,
 * per-frame JS, full-screen flash, or dependencies. Every scene has a hard
 * particle/lifetime budget, and can be cancelled on navigation or resize. */
import { getFieldSlotElement, getPlayerBadgeByIndex } from '../dom/helpers.js';
import { getCardImagePath, hasCardImage } from '../../cardImages.js';

export const SPELL_FX_LIMITS = Object.freeze({ scenes: 2, nodes: 48, lifetimeMs: 1800 });
const activeScenes = new Set();
const cardImpacts = new WeakMap();
export const reducedSpellMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rectOf = (el, origin) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return {
    x: r.left - origin.left,
    y: r.top - origin.top,
    w: r.width,
    h: r.height,
    cx: r.left - origin.left + r.width / 2,
    cy: r.top - origin.top + r.height / 2,
  };
};

/** Snapshot visible geometry before render removes lethal/bounced targets. */
export const captureSpellScene = (state, effect, layer, localPlayer) => {
  const origin = layer.getBoundingClientRect();
  const slots = [];
  for (let owner = 0; owner < 2; owner++)
    for (let slot = 0; slot < 3; slot++) {
      const el = getFieldSlotElement(state, owner, slot, localPlayer);
      const card = el?.querySelector('.card');
      const rect = rectOf(card || el, origin);
      if (!rect) continue;
      const prior = effect.fieldTargets?.find(
        (c) => c.ownerIndex === owner && c.slotIndex === slot
      );
      const id = prior?.instanceId || card?.dataset.instanceId;
      const instance = state.players[owner].field.find((c) => c?.instanceId === id);
      const historical =
        !instance &&
        id &&
        state.historyEvents?.events
          ?.findLast((e) => e.before.some((c) => c.identity === id))
          ?.before.find((c) => c.identity === id);
      slots.push({
        ...rect,
        owner,
        slot,
        occupied: !!card || !!prior,
        id,
        token: !!(prior?.isToken || instance?.isToken || historical?.isToken),
        name:
          instance?.name ||
          historical?.name ||
          card?.querySelector('.card-name-text')?.textContent ||
          '',
        art:
          card?.querySelector('.card-image')?.src ||
          ((instance?.id || historical?.cardId) && hasCardImage(instance?.id || historical?.cardId)
            ? getCardImagePath(instance?.id || historical?.cardId)
            : null),
      });
    }
  const badges = [0, 1].map((i) => rectOf(getPlayerBadgeByIndex(i), origin));
  const target =
    slots.find((r) => r.owner === effect.targetOwnerIndex && r.slot === effect.targetSlotIndex) ||
    slots.find((r) => effect.targetCardId && r.id === effect.targetCardId) ||
    badges[effect.targetPlayerIndex] ||
    null;
  return {
    slots,
    badges,
    target,
    width: origin.width,
    height: origin.height,
    turn: state.turn,
    generation: state.historyEvents?.matchGeneration,
  };
};

const ALL = new Set(['flood', 'meteor', 'maelstrom']);
const ENEMY = new Set([
  'wave',
  'blizzard',
  'arrows',
  'monsoon',
  'double-strike',
  'bounce-all',
  'quake',
  'freeze-trap',
]);
const MATERIAL = {
  flood: 'water',
  wave: 'water',
  maelstrom: 'water',
  'water-bolt': 'water',
  leap: 'water',
  bubbles: 'water',
  rain: 'water',
  monsoon: 'water',
  blizzard: 'ice',
  dart: 'ice',
  'frost-summon': 'ice',
  'freeze-trap': 'ice',
  meteor: 'ember',
  arrows: 'metal',
  rifle: 'metal',
  harpoon: 'metal',
  shotgun: 'metal',
  net: 'rope',
  quill: 'feather',
  feathers: 'feather',
  'feathers-heal': 'feather',
  'feathers-small': 'feather',
  paralyze: 'venom',
  poison: 'venom',
  'snake-strike': 'venom',
  'venom-heal': 'venom',
  strip: 'water',
  ecdysis: 'pearl',
  nurture: 'pearl',
  thaw: 'gold',
  sunshine: 'gold',
  quake: 'earth',
  'double-strike': 'earth',
  'bounce-all': 'water',
};
const PALETTES = {
  water: ['#73d5dc', '#2c7f98', '#d7f7ef'],
  ice: ['#b2d8ee', '#5788aa', '#edfaff'],
  ember: ['#e69c60', '#9c4733', '#ffe2a5'],
  metal: ['#d9c6a1', '#8a8172', '#fff1cc'],
  rope: ['#c4b78d', '#776744', '#e7ddbd'],
  feather: ['#e3dac2', '#a6ad9f', '#fff6dc'],
  venom: ['#b6c976', '#60754b', '#e4ecc2'],
  pearl: ['#ecdfc7', '#b89f80', '#fff6e5'],
  gold: ['#ddbd7d', '#a0793e', '#f9e7b4'],
  earth: ['#b6a782', '#736650', '#dbd0aa'],
};
export const spellPresentationProfile = (config = {}) => {
  const motif = config.projectile || config.effect || 'draw';
  return {
    motif,
    type: config.type || 'utility',
    material: MATERIAL[motif] || 'gold',
    scope: ALL.has(motif)
      ? 'all'
      : ENEMY.has(motif)
        ? 'enemy'
        : config.type === 'buff' || config.type === 'summon'
          ? 'friendly'
          : 'target',
  };
};
const union = (rects) => {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  const w = Math.max(...rects.map((r) => r.x + r.w)) - x,
    h = Math.max(...rects.map((r) => r.y + r.h)) - y;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
};

export const cancelSpellScenes = () => [...activeScenes].forEach((scene) => scene.cancel());

export const playSpellPresentation = (effect, state, config, geometry, layer) => {
  if (
    !layer?.isConnected ||
    !geometry ||
    document.hidden ||
    state.winner ||
    geometry.generation !== state.historyEvents?.matchGeneration
  )
    return Promise.resolve();
  while (activeScenes.size >= SPELL_FX_LIMITS.scenes) activeScenes.values().next().value.cancel();
  const profile = spellPresentationProfile(config);
  const { motif, material, type, scope } = profile;
  const reduced = reducedSpellMotion();
  const root = document.createElement('div');
  root.className = `spell-scene spell-scene--${material}`;
  root.dataset.spell = effect.spellId || effect.trapId;
  root.dataset.motif = motif;
  root.setAttribute('aria-hidden', 'true');
  const palette = PALETTES[material];
  ['--fx-ink', '--fx-deep', '--fx-light'].forEach((key, i) =>
    root.style.setProperty(key, palette[i])
  );
  layer.append(root);
  const animations = [];
  let count = 0,
    end = 0,
    resolve;
  const finished = new Promise((r) => {
    resolve = r;
  });
  const scene = {
    cancel: () => {
      clearTimeout(timer);
      animations.forEach((a) => a.cancel());
      root.remove();
      activeScenes.delete(scene);
      window.removeEventListener('resize', scene.cancel);
      document.removeEventListener('visibilitychange', scene.cancel);
      resolve();
    },
  };
  activeScenes.add(scene);
  window.addEventListener('resize', scene.cancel, { once: true });
  document.addEventListener('visibilitychange', scene.cancel, { once: true });
  const node = (kind, x, y, w, h, frames, duration = 650, delay = 0) => {
    if (count >= SPELL_FX_LIMITS.nodes) return null;
    count++;
    const el = document.createElement('i');
    el.className = `spell-fx spell-fx--${kind}`;
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    root.append(el);
    const anim = el.animate(frames, {
      duration,
      delay,
      fill: 'both',
      easing: kind === 'remnant' ? 'linear' : 'cubic-bezier(.22,.65,.28,1)',
    });
    animations.push(anim);
    end = Math.max(end, duration + delay);
    return el;
  };
  const fade = (from = 'scale(.85)', to = 'scale(1.12)') => [
    { opacity: 0, transform: from },
    { opacity: 0.82, offset: 0.22 },
    { opacity: 0.65, offset: 0.55 },
    { opacity: 0, transform: to },
  ];
  const ring = (r, delay = 0, size = 1) =>
    node(
      'ring',
      r.cx - (r.w * size) / 2,
      r.cy - (r.w * size) / 4,
      r.w * size,
      (r.w * size) / 2,
      fade('scale(.45)', 'scale(1.18)'),
      720,
      delay
    );
  const frame = (r, delay = 0, kind = material === 'ice' ? 'frost' : 'edge') =>
    node(kind, r.x + 3, r.y + 3, r.w - 6, r.h - 6, fade('scale(.96)', 'scale(1.035)'), 820, delay);
  const motes = (r, kind = 'mote', n = 5, delay = 0, rise = true) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n,
        size = kind === 'feather' ? 15 : kind === 'shard' ? 8 : 3 + (i % 3) * 2;
      node(
        kind,
        r.x + r.w * t,
        r.y + r.h * (rise ? 0.8 : 0.18),
        size,
        kind === 'feather' ? 32 : size * 1.5,
        [
          { opacity: 0, transform: `translate(0,0) rotate(${i * 37}deg)` },
          { opacity: 0.85, offset: 0.25 },
          {
            opacity: 0,
            transform: `translate(${(i % 2 ? 1 : -1) * (8 + i * 3)}px,${rise ? -45 : 55}px) rotate(${i * 37 + 48}deg)`,
          },
        ],
        670 + i * 35,
        delay + i * 35
      );
    }
  };
  const owner = effect.casterIndex ?? state.activePlayerIndex;
  const rows = [0, 1].map((i) => union(geometry.slots.filter((r) => r.owner === i)));
  const origin = geometry.badges[owner] || rows[owner];
  const target = geometry.target;
  const fields = geometry.slots.filter(
    (r) => scope === 'all' || (scope === 'enemy' ? r.owner !== owner : r.owner === owner)
  );
  // Empty slots receive environmental motion, never a fabricated hit marker.
  const affected = fields.filter((r) => r.occupied && (motif !== 'quake' || r.token));
  const areas = scope === 'all' ? rows : [rows[scope === 'enemy' ? 1 - owner : owner]];
  const targets = target
    ? [target]
    : ['aoe', 'buff', 'bounce', 'summon'].includes(type)
      ? affected
      : [];
  // A resolved lethal effect may already have removed the live card. Preserve
  // its public image through the impact beat, then dissolve it; never clone
  // interactive card DOM, resurrect game state, or imply an unrecorded kill.
  const lethal = new Set(
    (state.historyEvents?.events || [])
      .filter((e) => effect.sourceInstanceId && e.sourceIds.includes(effect.sourceInstanceId))
      .flatMap((e) => e.facts.filter((f) => f.terminal).map((f) => f.entity))
  );
  const remnants = new Map();
  const washesAway = ['flood', 'wave', 'maelstrom'].includes(motif);
  if (!reduced)
    for (const r of geometry.slots.filter(
      (r) =>
        lethal.has(r.id) && !state.players.some((p) => p.field.some((c) => c?.instanceId === r.id))
    )) {
      const remnant = node(
        'remnant',
        r.x,
        r.y,
        r.w,
        r.h,
        washesAway
          ? [
              { opacity: 0.85, transform: 'translate(0,0) rotate(0deg)' },
              { opacity: 0.85, offset: 0.24, transform: 'translate(0,-5px) rotate(-3deg)' },
              {
                opacity: 0.65,
                offset: 0.56,
                transform: `translate(${r.w * 0.65}px,-30px) rotate(9deg)`,
              },
              {
                opacity: 0,
                transform: `translate(${geometry.width - r.x + r.w}px,-90px) rotate(22deg) scale(.8)`,
              },
            ]
          : [
              { opacity: 0.8, transform: 'scale(1)' },
              { opacity: 0.8, offset: 0.65, transform: 'scale(1)' },
              { opacity: 0, transform: 'translateY(9px) scale(.96)' },
            ],
        1400
      );
      if (remnant) {
        remnants.set(r.id, remnant);
        remnant.dataset.departure = washesAway ? 'wash-away' : 'dissolve';
        if (r.art)
          remnant.style.backgroundImage = `linear-gradient(0deg,#10272d 4%,transparent 55%),url("${r.art}")`;
        remnant.textContent = r.name;
      }
    }
  // Additive transforms preserve exhaustion tilt and never write card styles.
  // A short airborne hold, sharp landing, then diminishing rebounds give weight
  // without shaking the board or blocking input. Each new hit replaces its own
  // previous recoil rather than stacking transforms on the same card.
  const impact = (r, delay = 0, weight = 1) => {
    const card =
      remnants.get(r.id) ||
      [...document.querySelectorAll('.card')].find((el) => el.dataset.instanceId === r.id);
    if (!card) return;
    const lift = Math.min(19, r.h * 0.085) * weight;
    const lean = (r.slot % 2 ? -1 : 1) * 2.2 * weight;
    cardImpacts.get(card)?.cancel();
    const anim = card.animate(
      [
        { offset: 0, transform: 'translateY(0) rotate(0deg) scale(1)' },
        { offset: 0.18, transform: `translateY(${-lift}px) rotate(${lean}deg) scale(1.045)` },
        { offset: 0.3, transform: `translateY(${-lift}px) rotate(${lean}deg) scale(1.045)` },
        {
          offset: 0.43,
          transform: `translateY(${3 * weight}px) rotate(${-lean * 0.25}deg) scale(1.025,.965)`,
        },
        {
          offset: 0.61,
          transform: `translateY(${-lift * 0.25}px) rotate(${lean * 0.3}deg) scale(1.012)`,
        },
        { offset: 0.76, transform: 'translateY(1px) rotate(-.3deg) scale(1,.99)' },
        { offset: 0.89, transform: 'translateY(-1px) rotate(.15deg) scale(1)' },
        { offset: 1, transform: 'translateY(0) rotate(0deg) scale(1)' },
      ],
      { duration: 640, delay, easing: 'linear', composite: 'add', fill: 'none' }
    );
    anim.id = 'spell-card-impact';
    cardImpacts.set(card, anim);
    animations.push(anim);
    end = Math.max(end, delay + 640);
    node(
      'contact',
      r.x + 6,
      r.y + r.h - 12,
      r.w - 12,
      24,
      [
        { opacity: 0, transform: 'scale(.65)' },
        { opacity: 0.32, offset: 0.3, transform: 'scale(.75)' },
        { opacity: 0.65, offset: 0.43, transform: 'scale(1.08)' },
        { opacity: 0, transform: 'scale(1.25)' },
      ],
      640,
      delay
    );
    ring({ ...r, cy: r.y + r.h - 4 }, delay + 275, 1.06);
  };
  const liveCard = (r) =>
    [...document.querySelectorAll('.field-slot .card')].find(
      (el) => el.dataset.instanceId === r.id
    );
  const cardMotion = (card, frames, duration, delay, id, fill = 'none') => {
    if (!card) return;
    cardImpacts.get(card)?.cancel();
    const a = card.animate(frames, {
      duration,
      delay,
      easing: 'cubic-bezier(.2,.7,.25,1)',
      composite: 'add',
      fill,
    });
    a.id = id;
    cardImpacts.set(card, a);
    animations.push(a);
    end = Math.max(end, duration + delay);
  };
  const cold = (r, delay = 0) => {
    frame(r, delay, 'frost');
    node(
      'rime',
      r.x + 2,
      r.y + 2,
      r.w - 4,
      r.h - 4,
      [
        { opacity: 0, transform: 'scaleY(.05)' },
        { opacity: 0.85, offset: 0.48, transform: 'scaleY(1)' },
        { opacity: 0.7, offset: 0.8, transform: 'scaleY(1)' },
        { opacity: 0, transform: 'scaleY(1)' },
      ],
      1100,
      delay
    );
    for (let i = 0; i < 2; i++)
      node(
        'cold-wisp',
        r.x - 6,
        r.y + r.h * (0.55 + i * 0.2),
        r.w + 12,
        24,
        [
          { opacity: 0, transform: 'translateX(8px) scale(.8)' },
          { opacity: 0.65, offset: 0.35 },
          { opacity: 0, transform: `translate(${-15 - i * 9}px,-35px) scale(1.2)` },
        ],
        1000,
        delay + i * 90
      );
  };
  const pull = (r, delay) => {
    // Animate a transfer only when the resolved board really contains the same
    // creature on the caster's side. A lethal or blocked steal never crosses sides.
    const transferred =
      r.owner !== owner && state.players[owner].field.some((c) => c?.instanceId === r.id);
    const card = liveCard(r);
    if (!transferred || !card) return false;
    const dest = rectOf(card, layer.getBoundingClientRect());
    const dx = r.cx - dest.cx,
      dy = r.cy - dest.cy;
    cardMotion(
      card,
      [
        { offset: 0, transform: `translate(${dx}px,${dy}px) rotate(-3deg)` },
        { offset: 0.2, transform: `translate(${dx * 1.03}px,${dy * 1.03}px) rotate(-5deg)` },
        { offset: 0.72, transform: 'translate(0,8px) rotate(3deg)' },
        { offset: 1, transform: 'translate(0,0) rotate(0deg)' },
      ],
      680,
      delay,
      'spell-card-pull',
      'backwards'
    );
    const angle = (Math.atan2(r.cy - dest.cy, r.cx - dest.cx) * 180) / Math.PI;
    node(
      'filament',
      dest.cx,
      dest.cy,
      Math.hypot(dx, dy),
      2,
      [
        { opacity: 0.8, transform: `rotate(${angle}deg) scaleX(1)` },
        { opacity: 1, offset: 0.2, transform: `rotate(${angle}deg) scaleX(1.03)` },
        { opacity: 0, transform: `rotate(${angle}deg) scaleX(0)` },
      ],
      680,
      delay
    );
    ring({ ...dest, cy: dest.y + dest.h }, delay + 490, 0.9);
    return true;
  };
  if (reduced) {
    for (const r of (targets.length ? targets : [origin]).filter(Boolean))
      node('edge', r.x + 3, r.y + 3, r.w - 6, r.h - 6, [{ opacity: 0.45 }, { opacity: 0 }], 180);
  } else if (type === 'projectile') {
    // No target metadata means no guessed victim. An option-only cast gets a
    // restrained cast cue; Shotgun's untargeted option explicitly covers enemies.
    const destinations = target
      ? [target]
      : motif === 'shotgun'
        ? geometry.slots.filter((r) => r.owner !== owner && r.occupied)
        : [];
    for (const [i, r] of destinations.entries()) {
      const start = origin || rows[owner];
      if (!start) continue;
      const dx = r.cx - start.cx,
        dy = r.cy - start.cy,
        angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const delay = i * 65;
      if (['harpoon', 'rifle', 'quill'].includes(motif))
        node(
          'filament',
          start.cx,
          start.cy,
          Math.hypot(dx, dy),
          1,
          [
            { opacity: 0, transform: `rotate(${angle}deg) scaleX(0)` },
            { opacity: 0.55, offset: 0.5, transform: `rotate(${angle}deg) scaleX(1)` },
            { opacity: 0, transform: `rotate(${angle}deg) scaleX(1)` },
          ],
          500,
          delay + 190
        );

      node(
        motif === 'rifle' ? 'reticle' : 'focus',
        r.cx - 23,
        r.cy - 23,
        46,
        46,
        fade('scale(1.25) rotate(-20deg)', 'scale(.8) rotate(0deg)'),
        420,
        delay
      );
      const kind =
        motif === 'net'
          ? 'net'
          : motif === 'quill'
            ? 'feather'
            : ['water-bolt', 'leap'].includes(motif)
              ? 'droplet'
              : 'lance';
      node(
        kind,
        start.cx - 24,
        start.cy - 4,
        motif === 'net' ? 45 : 48,
        motif === 'net' ? 45 : 8,
        [
          { opacity: 0, transform: `translate(0,0) rotate(${angle}deg) scale(.6)` },
          { opacity: 0.95, offset: 0.2 },
          {
            opacity: 1,
            offset: 0.8,
            transform: `translate(${dx * 0.8}px,${dy * 0.8 - (motif === 'leap' ? 36 : 0)}px) rotate(${angle}deg)`,
          },
          { opacity: 0, transform: `translate(${dx}px,${dy}px) rotate(${angle}deg)` },
        ],
        390,
        delay + 190
      );
      if (motif === 'harpoon') {
        if (!pull(r, delay + 470)) impact(r, delay + 470, 0.85);
      } else if (motif !== 'dart') impact(r, delay + 470, motif === 'rifle' ? 1 : 0.6);
      ring(r, delay + 490, 0.75);
      if (motif === 'net')
        node('net', r.x, r.y, r.w, r.h, fade('scale(1.18)', 'scale(.8)'), 560, delay + 470);
      else if (motif === 'dart') {
        cold(r, delay + 470);
        motes(r, 'shard', 4, delay + 470);
      } else motes(r, material === 'metal' ? 'shard' : 'mote', 4, delay + 490);
    }
    if (!destinations.length && origin) ring(origin, 0, 0.5);
  } else if (type === 'aoe' || (type === 'trap' && motif === 'maelstrom')) {
    if (['flood', 'wave', 'maelstrom'].includes(motif)) {
      areas.filter(Boolean).forEach((r, i) => {
        for (let j = 0; j < 3; j++)
          node(
            'current',
            r.x - 12,
            r.cy - 45,
            r.w + 24,
            90,
            [
              { opacity: 0, transform: 'translateY(50px) scaleY(.6)' },
              { opacity: 0.8 - j * 0.12, offset: 0.3 },
              { opacity: 0.6 - j * 0.1, offset: 0.65 },
              { opacity: 0, transform: 'translateY(-55px) scaleY(1.2)' },
            ],
            900,
            i * 160 + j * 85
          );
        motes(r, 'droplet', 5, i * 160 + 270);
      });
      affected.forEach((r, i) => {
        if (!remnants.has(r.id))
          cardMotion(
            liveCard(r),
            [
              { transform: 'translate(0,0) rotate(0deg)' },
              { offset: 0.3, transform: 'translate(8px,-5px) rotate(3deg)' },
              { offset: 0.65, transform: 'translate(-3px,0) rotate(-1deg)' },
              { transform: 'translate(0,0) rotate(0deg)' },
            ],
            700,
            260 + i * 45,
            'spell-card-current'
          );
        ring(r, 330 + i * 45, 0.9);
      });
    } else if (['blizzard', 'monsoon', 'arrows'].includes(motif)) {
      areas.filter(Boolean).forEach((r) => {
        for (let i = 0; i < 9; i++) {
          const x = r.x + r.w * ((i + 0.5) / 9),
            y = r.y + ((i % 3) * r.h) / 5;
          node(
            motif === 'blizzard' ? 'shard' : 'rain',
            x,
            y,
            motif === 'blizzard' ? 9 : 2,
            motif === 'arrows' ? 65 : 24,
            [
              { opacity: 0, transform: 'translate(12px,-25px) rotate(18deg)' },
              { opacity: 0.7, offset: 0.3 },
              { opacity: 0, transform: 'translate(-18px,65px) rotate(18deg)' },
            ],
            620,
            i * 48
          );
        }
      });
      affected.forEach((r, i) => {
        if (motif === 'blizzard') cold(r, 200 + i * 50);
        else {
          impact(r, 300 + i * 50, 0.35);
          ring(r, 300 + i * 50, 0.75);
        }
      });
    } else {
      // Meteor and earth effects carry weight through staggered pressure rings,
      // not screen displacement. Two beats for Pounce Plummet, one for Meteor.
      if (motif === 'meteor') {
        const r = union(geometry.slots);
        if (r)
          node(
            'meteor',
            r.cx - 20,
            r.cy - 20,
            40,
            40,
            [
              { opacity: 0, transform: 'translate(90px,-160px) scale(.45)' },
              { opacity: 0.95, offset: 0.4 },
              { opacity: 0, transform: 'translate(0,0) scale(1)' },
            ],
            550
          );
      }
      affected.forEach((r, i) => {
        impact(r, 410 + i * 35, motif === 'meteor' ? 1.25 : 1);
        if (motif === 'meteor')
          node(
            'fracture',
            r.cx - r.w * 0.4,
            r.cy - r.w * 0.4,
            r.w * 0.8,
            r.w * 0.8,
            fade('scale(.65)', 'scale(1.08)'),
            720,
            430 + i * 35
          );
        ring(r, 420 + i * 35);
        if (motif === 'double-strike') ring(r, 730 + i * 35, 1.12);
        motes(r, 'shard', 3, 460 + i * 35);
      });
    }
  } else if (type === 'buff' || type === 'heal' || type === 'summon') {
    const receivers =
      type === 'heal'
        ? [origin, ...(motif === 'feathers-heal' ? affected : [])].filter(Boolean)
        : target
          ? [target]
          : affected;
    receivers.forEach((r, i) => {
      frame(r, i * 60, type === 'summon' ? 'frost' : 'edge');
      ring({ ...r, cy: r.y + r.h * 0.82 }, i * 60);
      motes(
        r,
        material === 'feather'
          ? 'feather'
          : material === 'water'
            ? 'bubble'
            : material === 'ice'
              ? 'shard'
              : 'mote',
        4,
        i * 60 + 100
      );
      if (motif === 'sunshine')
        node('sunray', r.cx - 16, r.y, 32, r.h, fade('scaleY(.4)', 'scaleY(1)'), 850, i * 60);
    });
    if (!receivers.length && origin) ring(origin, 0, 0.5);
  } else if (type === 'bounce') {
    affected.forEach((r, i) => {
      ring(r, i * 70);
      node(
        'echo',
        r.x + 10,
        r.y + 10,
        r.w - 20,
        r.h - 20,
        [
          { opacity: 0, transform: 'translateY(10px) scaleY(.85)' },
          { opacity: 0.55, offset: 0.2 },
          { opacity: 0, transform: `translateY(${r.owner === owner ? 65 : -65}px) scale(.6)` },
        ],
        650,
        i * 70
      );
    });
  } else if (motif === 'freeze-trap') {
    const frozen = affected.filter((r) =>
      state.players[r.owner].field.some((c) => c?.instanceId === r.id && c.frozen)
    );
    (target ? [target] : frozen).forEach((r, i) => cold(r, i * 60));
  } else if (type === 'status' || (type === 'utility' && target)) {
    if (target) {
      frame(target);
      if (['paralyze', 'poison', 'strip'].includes(motif))
        for (let i = 0; i < 3; i++)
          node(
            'coil',
            target.x + 8,
            target.cy - 30 + i * 12,
            target.w - 16,
            42,
            fade(`scale(.75) rotate(${i * 18 - 20}deg)`, `scale(1.05) rotate(${i * 18 + 25}deg)`),
            850,
            i * 85
          );
      else if (motif === 'ecdysis')
        node(
          'echo',
          target.x,
          target.y,
          target.w,
          target.h,
          fade('translateY(0) scale(1)', 'translateY(-25px) scale(1.12)'),
          900
        );
      motes(target, material === 'venom' ? 'droplet' : 'mote', 5, 180);
    } else if (origin) ring(origin, 0, 0.5);
  } else if (origin) {
    // Utility effects live beside the caster, not over unrelated creatures.
    const r = { ...origin, w: Math.min(origin.w, 120) };
    for (let i = 0; i < 3; i++)
      node(
        motif === 'treasure' ? 'gem' : 'folio',
        r.cx - 14,
        r.cy - 20,
        28,
        40,
        [
          { opacity: 0, transform: 'translateY(8px) rotate(0deg) scale(.8)' },
          {
            opacity: 0.8,
            offset: 0.35,
            transform: `translate(${(i - 1) * 23}px,-12px) rotate(${(i - 1) * 13}deg)`,
          },
          { opacity: 0, transform: `translate(${(i - 1) * 10}px,-28px) rotate(0deg) scale(.7)` },
        ],
        820,
        i * 60
      );
    motes(r, 'mote', 4, 150);
  }
  // WAAPI completion and a bounded timeout both converge on idempotent cleanup.
  const timer = setTimeout(scene.cancel, Math.min(end + 50, SPELL_FX_LIMITS.lifetimeMs));
  return finished;
};
