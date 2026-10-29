import { mkdirSync } from 'node:fs';
mkdirSync(new URL('../docs/ui-phase2/', import.meta.url), { recursive: true });
// Real history capture operations, checked through the production panel.
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', '8161', '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 500));
const browser =
  process.env.TCG_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({
        ...(process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}),
      });
const failures = [];
try {
  const p = await browser.newPage({ hasTouch: true });
  await p.goto('http://127.0.0.1:8161');
  await p.waitForFunction(() => window.__qa);
  const ids = await p.evaluate(async () => {
    const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { resolveEffectResult } = await import('/js/game/effects.js');
    const { consumePrey } = await import('/js/game/consumption.js');
    const { drawCard } = await import('/js/state/gameState.js');
    const card = (id) => createCardInstance(getCardDefinitionById(id), 1);
    s.menu.stage = 'ready';
    s.menu.mode = 'local';
    s.setup.stage = 'complete';
    s.deckSelection.stage = 'complete';
    s.deckBuilder.stage = 'complete';
    s.turn = 3;
    s.phase = 'Main 1';
    s.activePlayerIndex = 0;
    const ids = {};
    const remember = (k) => (ids[k] = s.historyEvents.events.at(-1).id);
    const leopard = card('mammal-predator-black-leopards');
    s.players[0].field = [leopard, null, null];
    resolveEffectResult(s, { buffCreature: { creature: leopard, atk: 1, hp: 1 } }, { playerIndex: 0 });
    remember('ambush');
    const pred = card('fish-predator-tiger-shark'),
      a = card('fish-prey-cannibal-fish'),
      b = card('fish-prey-electric-eel');
    s.players[0].field = [pred, a, b];
    s.players[1].field = [null, null, null];
    resolveEffectResult(s, { buffCreature: { creature: a, atk: 20, hp: 20 } }, { playerIndex: 0 });
    remember('single');
    consumePrey({ state: s, predator: pred, preyList: [a, b], playerIndex: 0 });
    remember('multi');
    resolveEffectResult(
      s,
      { destroyCreatures: { creatures: [pred], ownerIndex: 0 } },
      { playerIndex: 0 }
    );
    remember('destroy');
    resolveEffectResult(
      s,
      { damagePlayer: { player: s.players[1], amount: 1 } },
      { playerIndex: 0 }
    );
    remember('player');
    s.players[1].deck = [card('fish-predator-great-white-shark')];
    drawCard(s, 1);
    remember('draw');
    window.detailState = s;
    (await import('/js/ui.js')).renderGame(s);
    return ids;
  });
  const check = (name, ok, data) => {
    if (!ok) failures.push({ name, data });
  };
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
    [393, 852],
    [375, 600],
  ]) {
    await p.setViewportSize({ width, height });
    await p.waitForTimeout(100);
    if (width < 768 && !(await p.locator('#history-panel').isVisible()))
      await p.locator('#field-history-btn').click();
    for (const kind of ['ambush', 'single', 'multi', 'destroy', 'player', 'draw']) {
      await p.locator(`[data-event-id="${ids[kind]}"]`).click();
      if (kind === 'ambush') {
        const card = p.locator('.history-detail .history-tile').first();
        if (width < 768) await card.tap(); else await card.click();
        await expect(p.locator('#card-hover-tooltip.visible')).toBeVisible();
        await expect(p.locator('#card-hover-tooltip.visible')).toContainText('Ambush');
        await expect(p.locator('#tooltip-info-boxes')).toContainText('When attacking');
        await expect(p.locator('#card-hover-tooltip')).toHaveClass(/modern-inspector/);
        expect(await p.locator('#card-hover-tooltip').evaluate((el) => el.inert)).toBe(false);
        expect(await p.locator('#history-card-inspection').count()).toBe(0);
        await p.screenshot({ path: `docs/ui-phase2/${width}-history-inspection.png` });
        // The shared inspector keeps its existing card-face tap/click dismissal.
        const preview = p.locator('#tooltip-card-preview .card').first();
        if (width < 768) await preview.tap(); else await preview.click();
        await expect(p.locator('#card-hover-tooltip.visible')).toBeHidden();
        await expect(p.locator('#history-panel')).toBeVisible();
        if (width < 768) await card.tap(); else await card.click();
        await expect(p.locator('#card-hover-tooltip.visible')).toBeVisible();
        await p.keyboard.press('Escape');
        await expect(p.locator('#card-hover-tooltip.visible')).toBeHidden();
        await expect(p.locator('#history-panel')).toBeVisible();
      }
      const report = await p.locator('.history-detail').evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        text: el.innerText,
        cards: [...el.querySelectorAll('.history-card-face')]
          .filter((c) => getComputedStyle(c).display !== 'none')
          .map((c) => {
            const r = c.getBoundingClientRect();
            return {
              ratio: r.width / r.height,
              overflows: [
                ...c.querySelectorAll('.card-name-text,.card-effect-text,.card-keywords-text'),
              ]
                .filter(
                  (t) =>
                    t.scrollWidth > t.clientWidth + 1 ||
                    t.getBoundingClientRect().bottom >
                      t.parentElement.getBoundingClientRect().bottom + 1
                )
                .map((t) => t.className),
            };
          }),
        stats: [...el.querySelectorAll('.history-stats')].map(
          (r) => r.scrollWidth <= r.clientWidth + 1
        ),
      }));
      check(`${width} ${kind} outer overflow`, report.scroll <= report.width + 1, report);
      check(`${width} ${kind} stats fit`, report.stats.every(Boolean), report);
      check(
        `${width} ${kind} canonical face`,
        report.cards.every((c) => Math.abs(c.ratio - 5 / 7) < 0.01 && !c.overflows.length),
        report
      );
      if (kind === 'draw')
        check(
          'private draw',
          !report.text.includes('Great White') && report.cards.length === 0,
          report
        );
      if (kind === 'destroy')
        check(
          'destroy semantics',
          report.text.toLowerCase().includes('destroyed') &&
            !report.text.toLowerCase().includes('slain'),
          report
        );
      if (kind === 'single')
        check(
          'historical stats retained',
          report.text.includes('22') && report.text.includes('21'),
          report
        );
      if (kind === 'multi') {
        await p
          .locator('.history-duel')
          .first()
          .evaluate((el) => (el.scrollLeft = el.scrollWidth));
        await p.waitForTimeout(80);
        const xs = await p
          .locator('.history-duel')
          .evaluateAll((rows) => rows.map((r) => r.scrollLeft));
        check('paired horizontal scroll', xs[0] === xs[1] && xs[0] > 0, xs);
      }
    }
    // Scrolling a long event must not start another event halfway down its details.
    await p.locator(`[data-event-id="${ids.multi}"]`).click();
    await p.locator('.history-detail').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await p.locator(`[data-event-id="${ids.single}"]`).click();
    check(
      `${width} selection starts at heading`,
      await p.locator('.history-detail').evaluate((el) => el.scrollTop === 0)
    );
    if (width === 1440)
      await p.screenshot({ path: root + 'docs/ui-phase2/history-detail-audit.png' });
  }
  await p.evaluate(async () => {
    const { createGameState } = await import('/js/state/gameState.js');
    (await import('/js/ui/components/HistoryPanel.js')).renderHistoryPanel(createGameState());
  });
  check(
    'empty layout reset',
    !(await p.locator('.history-detail').getAttribute('class')).includes('history-single')
  );
  console.log(JSON.stringify({ failures }));
  assert.deepEqual(failures, []);
  console.log(
    'PASS history detail: 30 viewport/event combinations, privacy, snapshots, overflow, scroll/reset'
  );
} finally {
  await browser.close();
  server.kill();
}
