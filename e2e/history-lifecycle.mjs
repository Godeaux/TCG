import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname,
  OUT = ROOT + 'docs/ui-overhaul/evidence/acceptance/lifecycle';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8143', '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
process.on('exit', () => srv.kill());
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const errors = [],
  results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8143');
  await page.waitForFunction(() => !!window.__qa);
  await page.evaluate(async () => {
    const { getLatestState } = await import('/js/ui/input/dragAndDrop.js');
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { renderGame } = await import('/js/ui.js');
    const s = getLatestState();
    s.setup.stage = 'complete';
    s.deckSelection.stage = 'complete';
    s.menu.stage = 'ready';
    s.menu.mode = 'local';
    s.turn = 3;
    s.phase = 'Main 1';
    s.players[0].field = ['fish-prey-cannibal-fish', 'fish-prey-electric-eel'].map((id) =>
      createCardInstance(getCardDefinitionById(id), 1)
    );
    s.players[0].field.push(null);
    s.players[0].hand = [];
    s.players[1].field = [null, null, null];
    window.probe = s;
    renderGame(s);
    const { resolveEffectResult } = await import('/js/game/effects.js');
    resolveEffectResult(
      s,
      { teamBuff: { player: s.players[0], atk: 20, hp: 20 } },
      { playerIndex: 0 }
    );
    (await import('/js/ui/components/HistoryPanel.js')).renderHistoryPanel(s);
  });
  await page.waitForTimeout(700);
  await page.locator('#field-history-btn').click();
  await page.locator('.history-event').first().click();
  const stats = await page
    .locator('.history-stats')
    .evaluateAll((rows) => rows.map((r) => ({ scroll: r.scrollWidth, width: r.clientWidth })));
  assert(
    stats.every((r) => r.scroll <= r.width),
    JSON.stringify(stats)
  );
  await page.screenshot({ path: OUT + '/two-digit-deltas.png' });
  results.push({ twoDigitStats: stats });
  // Event-time hostile text stays literal; no HTML nodes or event handlers appear.
  await page.evaluate(async () => {
    const { resolveEffectResult } = await import('/js/game/effects.js');
    window.probe.players[1].name = '<img src=x onerror="window.historyXss=true">';
    resolveEffectResult(
      window.probe,
      { damagePlayer: { player: window.probe.players[1], amount: 1 } },
      { playerIndex: 0 }
    );
    (await import('/js/ui/components/HistoryPanel.js')).renderHistoryPanel(window.probe);
  });
  await page.locator('.history-event').first().click();
  assert.equal(await page.locator('#history-panel img[onerror]').count(), 0);
  assert.equal(await page.evaluate(() => window.historyXss), undefined);
  assert((await page.locator('.history-detail').innerText()).includes('<img src=x'));
  // Pin first event, then evict it with 2000 actual effect mutations.
  const oldest = await page.locator('.history-event').last().getAttribute('data-event-id');
  await page.locator('.history-event').last().click();
  await page.evaluate(async () => {
    const { resolveEffectResult } = await import('/js/game/effects.js');
    for (let i = 0; i < 2000; i++)
      resolveEffectResult(
        window.probe,
        { buffCreature: { creature: window.probe.players[0].field[0], atk: 1, hp: 1 } },
        { playerIndex: 0 }
      );
    (await import('/js/ui/components/HistoryPanel.js')).renderHistoryPanel(window.probe);
  });
  assert.equal(await page.locator(`[data-event-id="${oldest}"]`).count(), 0);
  assert.equal(await page.locator('.history-event').count(), 2000);
  assert((await page.locator('.history-detail').innerText()).includes('no longer retained'));
  const newest = await page.evaluate(() => window.probe.historyEvents.events.at(-1).id);
  assert.equal(
    await page.locator('.history-event[aria-pressed="true"]').getAttribute('data-event-id'),
    newest
  );
  // Native play opens the production target picker; History cannot steal it.
  await page.locator('#close-history').click();
  await page.evaluate(async () => {
    const s = window.probe;
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    s.players[0].field = [null, null, null];
    s.players[0].hand = [
      createCardInstance(getCardDefinitionById('mammal-prey-japanese-weasel'), 1),
    ];
    s.players[1].field = [
      createCardInstance(getCardDefinitionById('fish-prey-cannibal-fish'), 1),
      null,
      null,
    ];
    s.players[1].name = 'Rival';
    s.cardPlayedThisTurn = false;
    (await import('/js/ui.js')).renderGame(s);
  });
  const cdp = await page.context().newCDPSession(page);
  const a = await page.locator('#active-hand .card').boundingBox(),
    b = await page.locator('.player-field .field-slot').first().boundingBox();
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }],
    });
  await touch('touchStart', a.x + 40, a.y + 45);
  for (let i = 1; i <= 10; i++) {
    await touch(
      'touchMove',
      a.x + 40 + ((b.x + b.width / 2 - a.x - 40) * i) / 10,
      a.y + 45 + ((b.y + b.height / 2 - a.y - 45) * i) / 10
    );
    await page.waitForTimeout(30);
  }
  await touch('touchEnd');
  await page.locator('#targeting-banner').waitFor({ state: 'visible' });
  await page.locator('#field-history-btn').click();
  assert.equal(await page.locator('#history-panel').getAttribute('aria-modal'), null);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[inert]').length), 0);
  await page.locator('.opponent-field .field-slot .card').first().click();
  await page.locator('#targeting-banner').waitFor({ state: 'detached' });
  results.push({
    targeting: 'native play, History refused without stealing choice, target resolved',
  });
  // Short viewports around both responsive cutovers: controls remain reachable.
  for (const [width, height] of [
    [375, 812],
    [393, 852],
    [600, 600],
    [767, 600],
    [768, 600],
    [900, 600],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      const { createCardInstance } = await import('/js/cardTypes.js');
      const { getCardDefinitionById } = await import('/js/cards/index.js');
      window.probe.players[0].hand = Array.from({ length: 5 }, () =>
        createCardInstance(getCardDefinitionById('fish-prey-cannibal-fish'), 1)
      );
      (await import('/js/ui.js')).renderGame(window.probe);
    });
    await page.waitForTimeout(350);
    if (width >= 768) {
      assert.equal(await page.locator('#field-history-btn').isVisible(), false);
      assert.equal(await page.locator('#close-history').isVisible(), false);
      assert.equal(await page.locator('#history-panel').isVisible(), true);
      await page.locator('.history-detail').press('Escape');
      assert.equal(await page.locator('#history-panel').isVisible(), true);
    }
    if (width < 768) {
      assert.equal(await page.locator('#carrion-pile-container').isVisible(), false);
      for (const [id, title] of [
        ['carrion', 'Carrion Piles'],
        ['exile', 'Exile Piles'],
      ]) {
        await page.locator('.board-diagnostics summary').click();
        await page.locator(`#${id}-pile-container`).click();
        assert.equal(await page.locator('.board-diagnostics').getAttribute('open'), null);
        assert((await page.locator('#selection-panel').innerText()).includes(title));
        await page.getByRole('button', { name: 'OK', exact: true }).click();
      }
      await page.locator('.board-diagnostics summary').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#carrion-pile-container').isVisible(), false);
      await page.locator('.board-diagnostics summary').click();
    }
    const geometry = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      controls: [
        ...(innerWidth < 768 ? ['field-history-btn'] : []),
        'field-turn-btn',
        'carrion-pile-container',
        'exile-pile-container',
      ].map((id) => {
        const el = document.getElementById(id),
          r = el.getBoundingClientRect();
        return {
          id,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          visible: getComputedStyle(el).display !== 'none',
        };
      }),
    }));
    assert(geometry.scroll <= width, JSON.stringify(geometry));
    assert(
      geometry.controls.every(
        (r) => r.visible && r.w > 0 && r.h > 0 && r.x >= 0 && r.x + r.w <= width + 1
      ),
      JSON.stringify(geometry)
    );
    for (const id of [...(width < 768 ? ['field-history-btn'] : []), 'carrion-pile-container'])
      await page.locator('#' + id).scrollIntoViewIfNeeded();
    await page.screenshot({ path: OUT + `/board-${width}x${height}.png` });
    if (width < 768) await page.keyboard.press('Escape');
    await page.locator('#active-hand .card').first().scrollIntoViewIfNeeded();
    const hand = await page.locator('#active-hand .card').first().boundingBox();
    assert(
      hand && hand.y + hand.height / 2 >= 0 && hand.y + hand.height / 2 < height,
      JSON.stringify({ width, height, hand })
    );
    await page.screenshot({ path: OUT + `/hand-${width}x${height}.png` });
    results.push({ viewport: [width, height], geometry, hand });
  }
  // Fresh game drops selection, scroll position and all old details.
  await page.evaluate(async () => {
    const { createGameState } = await import('/js/state/gameState.js');
    (await import('/js/ui/components/HistoryPanel.js')).renderHistoryPanel(createGameState());
  });
  assert.equal(await page.locator('.history-event').count(), 0);
  assert(!(await page.locator('.history-detail').innerText()).includes('Cannibal Fish'));
  assert.equal(await page.locator('.history-events').evaluate((el) => el.scrollTop), 0);
  assert.deepEqual(errors, []);
  results.push({
    escaping: 'literal text',
    retention: 2000,
    eviction: 'explicit notice and valid selection',
    freshMatch: 'cleared',
  });
  fs.writeFileSync(OUT + '/results.json', JSON.stringify({ results, errors }, null, 2));
  console.log('PASS history lifecycle', JSON.stringify(results));
} finally {
  await browser.close();
  srv.kill();
}
