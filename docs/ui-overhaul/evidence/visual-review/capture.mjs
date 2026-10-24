// CP02 evidence: real cards, hand states, geometry/full-text audit, statuses, exhaustion.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const ROOT = '/Users/nut/.openclaw/workspace/food-chain-tcg';
const OUT = ROOT + '/docs/ui-overhaul/evidence/visual-review';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8137', '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 700));
const { chromium } = await import(ROOT + '/node_modules/@playwright/test/index.mjs');
const browser = await chromium.launch({
  executablePath:
    '/Users/nut/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
process.on('exit', () => srv.kill());
const errs = [];

async function toBoard(ctxOpts, tag) {
  const page = await browser.newPage(ctxOpts);
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
  await page.goto('http://127.0.0.1:8137');
  await page.waitForFunction(() => !!window.__qa);
  await page.evaluate(() => document.getElementById('menu-other')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('other-ai')?.click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('ai-deck-random')?.click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#deck-select-grid > *')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('deck-random')?.click());
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const { getLatestState } = await import('/js/ui/input/dragAndDrop.js');
    getLatestState().menu.aiSpeed = 'paused';
    document.getElementById('deck-confirm')?.click();
  });
  await page.waitForTimeout(400);
  for (let i = 0; i < 8; i++) {
    const active = await page.evaluate(() =>
      [...document.querySelectorAll('.overlay.active')].map((o) => o.id)
    );
    if (!active.length) break;
    const clicked = await page.evaluate(() => {
      const ov = [...document.querySelectorAll('.overlay.active')].pop();
      const b = ov.querySelector(
        '#setup-actions button, .setup-button-row button, .coin-flip-actions button, button:not([disabled])'
      );
      if (b) {
        b.click();
        return b.textContent.trim().slice(0, 30);
      }
      return null;
    });
    if (!clicked) break;
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
let page = await toBoard(
  { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true },
  'review'
);
await page.evaluate(referenceFixture);
await page.waitForTimeout(500);
for (const [tag, width, height] of [
  ['phone-393', 393, 852],
  ['phone-375', 375, 812],
  ['desktop-1440', 1440, 900],
]) {
  if (tag === 'desktop-1440') {
    await page.close();
    page = await toBoard({ viewport: { width, height } }, 'desktop');
    await page.evaluate(referenceFixture);
  }
  await page.setViewportSize({ width, height });
  await page.evaluate(async () => {
    const { updateHandOverlap } = await import('/js/ui/components/Hand.js');
    updateHandOverlap(document.getElementById('active-hand'));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/' + tag + '-board.png' });
  console.log(
    tag,
    await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      zones: [
        ...document.querySelectorAll(
          '.top-utilities,#rival-strip,.opponent-field,.field-divider,.player-field,.own-control-row,.hand-panel'
        ),
      ].map((el) => ({ name: el.className, rect: el.getBoundingClientRect().toJSON() })),
      cards: [...document.querySelectorAll('#active-hand .card,.field-slot .card')].map((el) => ({
        name: el.querySelector('.card-name').textContent.trim(),
        width: el.offsetWidth,
        height: el.offsetHeight,
        text: el.querySelector('.card-effect-text')?.textContent,
        size:
          el.querySelector('.card-effect-text') &&
          getComputedStyle(el.querySelector('.card-effect-text')).fontSize,
        clipped:
          el.querySelector('.card-effect-text')?.scrollHeight -
          el.querySelector('.card-effect-text')?.clientHeight,
      })),
      hand: {
        scroll: document.getElementById('active-hand').scrollWidth,
        width: document.getElementById('active-hand').clientWidth,
      },
    }))
  );
}

// Native desktop interactions and no clipping at the delivered viewport.
let geometry = await page.evaluate(() => ({
  bottom: Math.max(
    ...[...document.querySelectorAll('#active-hand .card')].map(
      (c) => c.getBoundingClientRect().bottom
    )
  ),
  height: innerHeight,
}));
assert.ok(geometry.bottom <= geometry.height, JSON.stringify(geometry));
await page.click('#field-history-btn');
assert.equal(await page.locator('.battlefield-right-column').isVisible(), false);
await page.click('#field-history-btn');
assert.equal(await page.locator('.battlefield-right-column').isVisible(), true);
await page.locator('#active-hand .card').first().hover();
await page.waitForTimeout(300);
assert.ok(await page.locator('#active-hand .hand-focus').count());
await page.mouse.move(5, 5);
await page.close();

page = await toBoard(
  { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true },
  'gestures'
);
await page.evaluate(referenceFixture);
await page.waitForTimeout(300);
const cdp = await page.context().newCDPSession(page);
const touch = async (type, x, y) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }],
  });
const gameSnapshot = () =>
  page.evaluate(() =>
    JSON.stringify({
      players: window.reviewState.players,
      phase: window.reviewState.phase,
      turn: window.reviewState.turn,
    })
  );
const baseline = await gameSnapshot();
let rect = await page.locator('#active-hand .card').nth(1).boundingBox();
await touch('touchStart', rect.x + 50, rect.y + 50);
for (let step = 1; step <= 8; step++) {
  await touch('touchMove', rect.x + 50 - step * 12, rect.y + 50);
  await page.waitForTimeout(20);
}
await touch('touchEnd');
const scrolled = await page.locator('#active-hand').evaluate((el) => el.scrollLeft);
assert.ok(scrolled === 0, 'Owner correction: complete phone fan fits without horizontal scrolling');
assert.equal(await gameSnapshot(), baseline, 'Horizontal browsing must not play a card');
await page.locator('#active-hand').evaluate((el) => (el.scrollLeft = 0));
rect = await page.locator('#active-hand .card').nth(1).boundingBox();
await touch('touchStart', rect.x + 50, rect.y + 50);
await page.waitForTimeout(500);
const enlarged = await page.locator('#active-hand .hand-focus').boundingBox();
assert.ok(enlarged.width > 200, 'Hold must visibly enlarge the actual card');
assert.ok(
  await page.evaluate(() => document.elementFromPoint(100, 260)?.closest('.hand-focus')),
  'Held card must paint/hit-test above field statuses'
);
await page.screenshot({ path: OUT + '/phone-393-hold.png' });
await touch('touchEnd');
await page.waitForTimeout(250);
assert.equal(await page.locator('#active-hand .hand-focus').count(), 0);
assert.equal(await gameSnapshot(), baseline, 'Hold/release must not change gameplay');
rect = await page.locator('#active-hand .card').nth(1).boundingBox();
await touch('touchStart', rect.x + 50, rect.y + 50);
await page.waitForTimeout(450);
await touch('touchCancel');
assert.equal(await page.locator('#active-hand .hand-focus').count(), 0);
assert.equal(await gameSnapshot(), baseline, 'Cancellation must not change gameplay');
const boardBefore = await page.locator('.player-field').boundingBox();
await page.click('#field-history-btn');
assert.equal(await page.locator('.battlefield-right-column').isVisible(), true);
assert.deepEqual(
  await page.locator('.player-field').boundingBox(),
  boardBefore,
  'History must overlay, not squeeze board'
);
assert.ok((await page.locator('.battlefield-right-column').boundingBox()).width <= 324);
await page.click('#close-history');
await page.click('#settings-fab');
assert.equal(
  await page.locator('#settings-menu').evaluate((el) => el.classList.contains('active')),
  true
);
await page.click('#settings-fab');

// Positive control: upward drag still plays through the real controller.
await page.evaluate(async () => {
  const { getCardDefinitionById } = await import('/js/cards/index.js');
  const { createCardInstance } = await import('/js/cardTypes.js');
  const { renderGame } = await import('/js/ui.js');
  const state = window.reviewState;
  state.players[0].hand = [createCardInstance(getCardDefinitionById('fish-prey-electric-eel'), 1)];
  state.players[0].field = [null, null, null];
  state.cardPlayedThisTurn = false;
  renderGame(state);
});
await page.waitForTimeout(300);
rect = await page.locator('#active-hand .card').boundingBox();
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

// Audit actual registry cards (not short synthetic descriptions).
const longText = await page.evaluate(async () => {
  const { getAllCards } = await import('/js/cards/index.js');
  const { createCardInstance } = await import('/js/cardTypes.js');
  const { renderHand } = await import('/js/ui/components/Hand.js');
  const state = window.reviewState;
  const definitions = getAllCards()
    .sort((a, b) => (b.effectText?.length ?? 0) - (a.effectText?.length ?? 0))
    .slice(0, 12);
  state.players[0].hand = definitions.map((c) => createCardInstance(c, 1));
  renderHand(state);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return [...document.querySelectorAll('#active-hand .card')].map((el) => {
    const effect = el.querySelector('.card-effect-text');
    const name = el.querySelector('.card-name');
    const stats = el.querySelector('.card-stats-row');
    const r = el.getBoundingClientRect();
    return {
      name: name.textContent.trim(),
      font: effect ? parseFloat(getComputedStyle(effect).fontSize) : null,
      height: effect?.clientHeight,
      scrollHeight: effect?.scrollHeight,
      overflow: effect && getComputedStyle(effect).overflowY,
      statsBottom: stats.getBoundingClientRect().bottom,
      cardBottom: r.bottom,
      nameHeight: name.clientHeight,
    };
  });
});
assert.equal(longText.length, 12);
for (const card of longText) {
  assert.ok(card.font >= 10.5);
  assert.ok(card.height >= 24, JSON.stringify(card));
  assert.equal(card.overflow, 'auto');
  assert.ok(card.statsBottom < card.cardBottom);
}
await page.screenshot({ path: OUT + '/phone-393-long-text.png' });
await page.setViewportSize({ width: 375, height: 667 });
await page.waitForTimeout(200);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
assert.ok(
  await page.locator('.battlefield-center-column').evaluate((e) => e.scrollHeight > e.clientHeight),
  'Short screens scroll the arena instead of clipping it'
);
const results = {
  gestures: {
    scrollPixels: scrolled,
    holdWidth: enlarged.width,
    upwardDragPlayed: true,
    stateUnchanged: true,
  },
  desktop: geometry,
  longText,
  errors: errs,
};
fs.writeFileSync(OUT + '/browser-results.json', JSON.stringify(results, null, 2));
assert.equal(errs.filter((e) => e.includes('PAGEERROR')).length, 0);
console.log(
  'PASS: desktop hover/history; phone scroll, hold, cancellation, menu, history; 12 longest descriptions; short viewport.',
  JSON.stringify(results)
);
await browser.close();
srv.kill();
