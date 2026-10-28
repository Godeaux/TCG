// CP02 evidence: real cards, hand states, geometry/full-text audit, statuses, exhaustion.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = ROOT + '/docs/ui-overhaul/evidence/acceptance/mobile-hand';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8139', '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 700));
const { chromium } = await import(ROOT + '/node_modules/@playwright/test/index.mjs');
const browser = await chromium.launch({
  ...(process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}),
});
process.on('exit', () => srv.kill());
const errs = [];

async function toBoard(ctxOpts, tag) {
  const page = await browser.newPage(ctxOpts);
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => errs.push(tag + ' PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(tag + ' CONSOLE ' + m.text().slice(0, 160));
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errs.push(tag + ' HTTP ' + r.status() + ' ' + r.url());
  });
  page.on('requestfailed', (r) => {
    if (!r.url().includes('favicon')) errs.push(tag + ' REQFAIL ' + r.url());
  });
  await page.goto('http://127.0.0.1:8139');
  await page.waitForFunction(() => !!window.__qa);
  await page.locator('#menu-other').click();
  await page.waitForTimeout(300);
  await page.waitForTimeout(200);
  await page.locator('#ai-deck-random').click();
  await page.waitForTimeout(1200);
  await page.locator('.deck-select-panel--fish .deck-name').click();
  await page.waitForTimeout(800);
  await page.locator('#deck-random').click();
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const { getLatestState } = await import('/js/ui/input/dragAndDrop.js');
    getLatestState().menu.aiSpeed = 'paused';
  });
  await page.locator('#deck-confirm').click();
  await page.waitForTimeout(400);
  for (let i = 0; i < 8; i++) {
    const active = await page.evaluate(() =>
      [...document.querySelectorAll('.overlay.active')].map((o) => o.id)
    );
    if (!active.length) break;
    const buttons = page.locator('.overlay.active button:visible:not([disabled])');
    if (await buttons.count()) await buttons.first().click();
    else {
      console.log(tag, 'waiting setup', active);
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(900);
  }
  await page
    .waitForFunction(() => !document.querySelector('.overlay.active'), { timeout: 20000 })
    .catch(() => errs.push(tag + ' TIMEOUT overlay'));
  await page.waitForTimeout(600);
  return page;
}

const referenceFixture = async () => {
  const { getLatestState } = await import('/js/ui/input/dragAndDrop.js');
  const { getCardDefinitionById } = await import('/js/cards/index.js');
  const { createCardInstance } = await import('/js/cardTypes.js');
  const { renderGame } = await import('/js/ui.js');
  const state = getLatestState();
  state.menu.aiSpeed = 'paused';
  (await import('/js/ai/AIGameManager.js')).cleanupAI();
  state.menu.mode = 'local';
  state.activePlayerIndex = 0;
  state.phase = 'Main 1';
  state.turn = 3;
  const card = (id) => createCardInstance(getCardDefinitionById(id), 1);
  state.players[0].name = 'You';
  state.players[1].name = 'Rival';
  state.players[0].field = [card('fish-prey-electric-eel'), card('fish-prey-cannibal-fish'), null];
  state.players[1].field = [card('mammal-prey-alaskan-moose'), null, null];
  state.players[0].hand = [
    'fish-predator-tiger-shark',
    'fish-prey-cannibal-fish',
    'fish-predator-shortfin-mako',
    'fish-prey-electric-eel',
    'fish-predator-tiger-shark',
  ].map(card);
  renderGame(state);
  window.reviewState = state;
};

try {
  const page = await toBoard(
    { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true },
    'phone'
  );
  await page.evaluate(referenceFixture);
  const results = [];
  for (const width of [393, 375]) {
    await page.setViewportSize({ width, height: width === 393 ? 852 : 812 });
    for (const n of [0, 1, 3, 5, 9, 12]) {
      await page.evaluate(async (n) => {
        const { createCardInstance } = await import('/js/cardTypes.js');
        const { getCardDefinitionById } = await import('/js/cards/index.js');
        const { renderHand } = await import('/js/ui/components/Hand.js');
        const ids = [
          'fish-predator-tiger-shark',
          'fish-prey-cannibal-fish',
          'fish-predator-shortfin-mako',
          'fish-prey-electric-eel',
        ];
        window.reviewState.players[0].hand = Array.from({ length: n }, (_, i) =>
          createCardInstance(getCardDefinitionById(ids[i % 4]), 1)
        );
        renderHand(window.reviewState);
      }, n);
      await page.waitForTimeout(300);
      const fit = await page.evaluate(() => {
        const hand = document.getElementById('active-hand');
        const cards = [...hand.children].map((el) => el.getBoundingClientRect().toJSON());
        return {
          width: innerWidth,
          count: cards.length,
          scrollWidth: hand.scrollWidth,
          clientWidth: hand.clientWidth,
          cards,
        };
      });
      results.push(fit);
      assert.ok(
        fit.cards.every((c) => c.left >= 0 && c.right <= width),
        JSON.stringify(fit)
      );
      assert.ok(fit.scrollWidth <= fit.clientWidth + 1, 'No hidden horizontal hand overflow');
      if (n === 5) await page.screenshot({ path: OUT + '/phone-' + width + '-hand.png' });
    }
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(referenceFixture);
  await page.waitForTimeout(300);
  const baseline = await page.evaluate(() => JSON.stringify(window.reviewState.players));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: ['touchEnd', 'touchCancel'].includes(type)
        ? []
        : [{ x, y, radiusX: 20, radiusY: 28, force: 0.7 }],
    });
  const r = await page.locator('#active-hand .card').nth(1).boundingBox();
  const x = r.x + 20,
    y = r.y + 45;
  await touch('touchStart', x, y);
  await page.waitForTimeout(550);
  assert.equal(await page.locator('#active-hand .hand-focus').count(), 1);
  assert.ok((await page.locator('#active-hand .hand-focus').boundingBox()).width > 200);
  const heldBounds = await page.locator('#active-hand .hand-focus').boundingBox();
  assert.ok(
    heldBounds.x >= 0 && heldBounds.x + heldBounds.width <= 393,
    'Held card also stays fully on screen'
  );
  // Presentation-only contact marker; this does not trigger the interaction.
  await page.evaluate(
    ({ x, y }) => {
      const marker = document.createElement('div');
      marker.id = 'touch-evidence-marker';
      marker.style.cssText = `position:fixed;left:${x - 20}px;top:${y - 28}px;width:40px;height:56px;border:2px solid #fff9;border-radius:50%;background:#ffffff22;pointer-events:none;z-index:999999`;
      document.body.append(marker);
    },
    { x, y }
  );
  await page.screenshot({ path: OUT + '/phone-393-thumb-held.png' });
  await page.evaluate(() => document.getElementById('touch-evidence-marker').remove());
  await touch('touchEnd');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#active-hand .hand-focus').count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(window.reviewState.players)), baseline);
  // Native cancellation during inspection and drag must leave gameplay untouched.
  for (const mode of ['hold', 'drag', 'hold']) {
    const box = await page.locator('#active-hand .card').nth(1).boundingBox();
    const tx = box.x + 20,
      ty = box.y + 45;
    await touch('touchStart', tx, ty);
    if (mode === 'hold') {
      await page.waitForTimeout(550);
      assert.equal(await page.locator('#active-hand .hand-focus').count(), 1);
    } else {
      await touch('touchMove', tx, ty - 80);
      assert.equal(await page.locator('.mobile-drag-preview').count(), 1);
    }
    await touch('touchCancel');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.hand-focus,.mobile-drag-preview,.card.dragging').count(), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(window.reviewState.players)), baseline);
  }
  // Positive control: upward drag still plays through the real controller.
  await page.evaluate(async () => {
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { renderGame } = await import('/js/ui.js');
    const state = window.reviewState;
    state.players[0].hand = [
      createCardInstance(getCardDefinitionById('fish-prey-electric-eel'), 1),
    ];
    state.players[0].field = [null, null, null];
    state.cardPlayedThisTurn = false;
    renderGame(state);
  });
  await page.waitForTimeout(300);
  let rect = await page.locator('#active-hand .card').boundingBox();
  const target = await page.locator('.player-field .field-slot').first().boundingBox();
  await touch('touchStart', rect.x + 40, rect.y + 50);
  for (let step = 1; step <= 10; step++) {
    await touch(
      'touchMove',
      rect.x + 40 + ((target.x + target.width / 2 - rect.x - 40) * step) / 10,
      rect.y + 50 + ((target.y + target.height / 2 - rect.y - 50) * step) / 10
    );
    await page.waitForTimeout(30);
  }
  await touch('touchEnd');
  await page.waitForTimeout(400);
  assert.equal(
    await page.evaluate(() => window.reviewState.players[0].field[0]?.id),
    'fish-prey-electric-eel',
    'Upward drag must actually play the selected card'
  );
  assert.equal(await page.evaluate(() => window.reviewState.players[0].hand.length), 0);

  fs.writeFileSync(
    OUT + '/results.json',
    JSON.stringify({ results, holdReleaseUnchanged: true, errors: errs }, null, 2)
  );
  assert.equal(errs.filter((e) => e.includes('PAGEERROR')).length, 0);
  console.log(
    'PASS: all cards fit for 0/1/3/5/9/12 cards at 375 and 393; native hold/release unchanged'
  );
} finally {
  await browser.close();
  srv.kill();
}
