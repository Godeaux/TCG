import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname,
  out = root + 'docs/ui-overhaul/evidence/mobile-feedback';
fs.mkdirSync(out, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '8146', '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const failures = [],
  results = [];
function check(name, ok, data) {
  results.push({ name, ok, data });
  if (!ok) failures.push(name);
}
try {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 660 },
    hasTouch: true,
    isMobile: true,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => failures.push(e.message));
  await p.goto('http://127.0.0.1:8146');
  await p.waitForFunction(() => !!window.__qa);
  async function fixture() {
    await p.evaluate(async () => {
      const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
      const { createCardInstance } = await import('/js/cardTypes.js');
      const { getCardDefinitionById } = await import('/js/cards/index.js');
      const c = (id) => createCardInstance(getCardDefinitionById(id), 3);
      s.menu.stage = 'ready';
      s.menu.mode = 'local';
      s.setup.stage = 'complete';
      s.deckSelection.stage = 'complete';
      s.deckBuilder.stage = 'complete';
      s.turn = 3;
      s.phase = 'Main 1';
      s.activePlayerIndex = 0;
      s.cardPlayedThisTurn = false;
      s.players[0].hand = [
        'fish-prey-silver-king',
        'mammal-predator-dholes',
        'reptile-prey-phantastic-leaf-tailed-gecko',
        'fish-prey-electric-eel',
        'fish-prey-cannibal-fish',
      ].map(c);
      s.players[0].field = [c('mammal-prey-platypus'), null, null];
      s.players[1].field = [c('fish-prey-cannibal-fish'), null, null];
      window.feedbackState = s;
      window.feedbackCards = [...s.players[0].hand];
      const { resolveEffectResult } = await import('/js/game/effects.js');
      for (let i = 0; i < 25; i++)
        resolveEffectResult(
          s,
          { buffCreature: { creature: s.players[0].field[0], atk: 1, hp: 1 } },
          { playerIndex: 0 }
        );
      (await import('/js/ui.js')).renderGame(s);
    });
    await p.waitForTimeout(650);
  }
  await fixture();
  for (const [width, height] of [
    [393, 660],
    [375, 600],
    [393, 740],
    [393, 852],
    [1440, 800],
  ]) {
    await p.setViewportSize({ width, height });
    await p.waitForTimeout(200);
    const bounds = await p.evaluate(() => ({
      height: innerHeight,
      doc: document.documentElement.scrollHeight,
      items: [
        ...document.querySelectorAll(
          '.battlefield-center-column,.battlefield-layout,.hand-panel,#active-hand .card'
        ),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          cls: el.className,
          top: r.top,
          bottom: r.bottom,
          client: el.clientHeight,
          scroll: el.scrollHeight,
          overflow: getComputedStyle(el).overflowY,
        };
      }),
    }));
    check(
      `viewport ${width}x${height}`,
      bounds.items.every(
        (r) =>
          r.top >= -1 &&
          r.bottom <= height + 1 &&
          (r.cls.includes('card') || r.scroll <= r.client + 2)
      ),
      bounds
    );
    await p.screenshot({ path: out + `/board-${width}x${height}.png` });
  }
  await p.setViewportSize({ width: 393, height: 660 });
  await p.waitForTimeout(200);
  check(
    'exhaustion tilt preserved',
    await p
      .locator('.player-field .card.exhausted-state')
      .first()
      .evaluate((el) => getComputedStyle(el).transform !== 'none')
  );
  check(
    'type banners restored',
    await p
      .locator('#active-hand .card')
      .first()
      .evaluate((el) => getComputedStyle(el, '::before').display !== 'none')
  );
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: ['touchEnd', 'touchCancel'].includes(type)
        ? []
        : [{ x, y, radiusX: 14, radiusY: 20, force: 1 }],
    });
  // Native taps use the real touch handler, with the actual browser-content height.
  await p.locator('#active-hand .card').first().scrollIntoViewIfNeeded();
  let boxes = await p.locator('#active-hand .card').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );
  await touch('touchStart', boxes[0].x + 12, boxes[0].y + 35);
  await touch('touchEnd');
  await p.waitForTimeout(150);
  check(
    'single modern inspection with side info',
    await p.evaluate(
      () =>
        document.querySelectorAll('.hand-focus').length === 0 &&
        document.querySelector('#card-hover-tooltip').classList.contains('modern-inspector') &&
        document.querySelector('#tooltip-info-boxes').textContent.includes('Discard')
    )
  );
  await p.screenshot({ path: out + '/tap-silver-king.png' });
  await p.locator('#tooltip-info-boxes').tap();
  check(
    'tapping explanation area keeps inspector open',
    await p.locator('#card-hover-tooltip').evaluate((el) => el.classList.contains('visible'))
  );
  await p.locator('#tooltip-card-preview .card').tap();
  await p.waitForTimeout(250);
  check(
    'tapping expanded card dismisses inspector',
    await p.locator('#card-hover-tooltip').evaluate((el) => !el.classList.contains('visible'))
  );

  await touch('touchStart', 5, 70);
  await touch('touchEnd');
  await fixture();
  await p.locator('#active-hand .card').first().scrollIntoViewIfNeeded();
  boxes = await p.locator('#active-hand .card').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, id: e.dataset.instanceId };
    })
  );
  const before = await p.evaluate(() => JSON.stringify(window.feedbackState.players));
  const ids = [];
  await touch('touchStart', boxes[0].x + 12, boxes[0].y + 35);
  await p.waitForTimeout(400);
  for (let i = 0; i < boxes.length; i++) {
    const x = i === boxes.length - 1 ? boxes[i].x + boxes[i].w / 2 : boxes[i].x + 12;
    await touch('touchMove', x, boxes[0].y + 35);
    await p.waitForTimeout(80);
    ids.push(
      await p.evaluate(
        () => document.querySelector('#active-hand .hand-focus')?.dataset.instanceId ?? null
      )
    );
    await p.screenshot({ path: out + `/browse-${i}.png` });
  }
  // Reverse without lifting the finger, then drift upward: browsing must not play.
  const reverseIds = [];
  for (let i = boxes.length - 1; i >= 0; i--) {
    await touch('touchMove', boxes[i].x + 12, boxes[0].y + 35);
    await p.waitForTimeout(120);
    const focused = await p.locator('#active-hand .hand-focus').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.instanceId, left: r.left, right: r.right };
      })
    );
    reverseIds.push(focused[0]?.id);
    check(
      `reverse browse card ${i} stays on screen`,
      focused.length === 1 && focused[0].left >= -1 && focused[0].right <= 394,
      focused
    );
  }
  // Reverse while transforms are still animating; clamp against resting geometry.
  for (const i of [1, 0, 1, 0, 4, 3, 4]) {
    await touch('touchMove', boxes[i].x + 12, boxes[0].y + 35);
    await p.waitForTimeout(25);
  }
  await p.waitForTimeout(120);
  check(
    'rapid reversal keeps edge card inside viewport',
    await p.locator('#active-hand .hand-focus').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= -1 && r.right <= innerWidth + 1;
    })
  );
  await touch('touchMove', boxes[0].x + 12, boxes[0].y - 80);
  await touch('touchEnd');
  check(
    'reverse thumb selects each card',
    new Set(reverseIds.filter(Boolean)).size === 5,
    reverseIds
  );
  check('continuous thumb selects each card', new Set(ids.filter(Boolean)).size === 5, ids);
  check(
    'browse release never plays',
    before === (await p.evaluate(() => JSON.stringify(window.feedbackState.players)))
  );
  // Each hand card opens the same inspector, including tokens and long effects.
  for (let i = 0; i < boxes.length; i++) {
    await touch('touchStart', boxes[i].x + 12, boxes[i].y + 35);
    await touch('touchEnd');
    await p.waitForTimeout(200);
    check(
      `inspector for hand card ${i}`,
      await p.evaluate(() => {
        const tip = document.querySelector('#card-hover-tooltip');
        const r = tip.getBoundingClientRect();
        return (
          tip.classList.contains('visible') &&
          tip.classList.contains('modern-inspector') &&
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          !document.querySelector('#tooltip-info-boxes .card-box')
        );
      })
    );
    if (i === 1 || i === 2) await p.screenshot({ path: out + `/inspect-card-${i}.png` });
    await touch('touchStart', 5, 70);
    await touch('touchEnd');
    await p.waitForTimeout(200);
  }
  await p.locator('#field-history-btn').click();
  await p.waitForTimeout(150);
  const r = await p.locator('.history-events').boundingBox();
  await touch('touchStart', r.x + r.width / 2, r.y + r.height - 25);
  for (let j = 1; j <= 12; j++) {
    await touch('touchMove', r.x + r.width / 2, r.y + r.height - 25 - ((r.height - 90) * j) / 12);
    await p.waitForTimeout(20);
  }
  await touch('touchEnd');
  await p.waitForTimeout(350);
  const scroll = await p
    .locator('.history-events')
    .evaluate((e) => ({ top: e.scrollTop, height: e.clientHeight, total: e.scrollHeight }));
  check('native history upper list scrolls', scroll.top > 30, scroll);
  await p.screenshot({ path: out + '/history-scrolled.png' });

  await p.locator('#close-history').click();
  await fixture();
  await p.evaluate(async () => {
    const s = window.feedbackState;
    s.activePlayerIndex = 1;
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const spell = createCardInstance(getCardDefinitionById('fish-spell-flood'), s.turn);
    s.players[1].hand = [spell];
    const { AIController } = await import('/js/ai/AIController.js');
    await new AIController({ playerIndex: 1 }).executeCardPlay(s, spell, null, {});
    (await import('/js/ui.js')).renderGame(s);
  });
  await p.locator('.spell-card-reveal .spell-reveal-card-wrapper.flipped').waitFor();
  check(
    'AI Flood visibly flips with readable name and effect',
    await p
      .locator('.spell-card-reveal')
      .evaluate(
        (el) =>
          el.textContent.includes('Flood') &&
          el.querySelector('.spell-reveal-effect').textContent.length > 0
      )
  );
  await p.waitForTimeout(600);
  await p.screenshot({ path: out + '/ai-flood-reveal.png' });
  await p.locator('.spell-card-reveal').waitFor({ state: 'detached' });
  await p.locator('#field-history-btn').click();
  await p.getByRole('button', { name: /Platypus was destroyed by Flood/ }).click();
  check(
    'destruction history visibly names responsible spell',
    await p
      .locator('.history-detail')
      .evaluate((el) => el.textContent.includes('Platypus was destroyed by Flood'))
  );
  await p.screenshot({ path: out + '/ai-flood-history.png' });

  fs.writeFileSync(out + '/results.json', JSON.stringify({ results, failures }, null, 2));
  console.log(JSON.stringify({ results, failures }));
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  server.kill();
}
