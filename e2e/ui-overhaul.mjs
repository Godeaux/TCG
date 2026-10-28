// CP02 evidence: real cards, hand states, geometry/full-text audit, statuses, exhaustion.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = ROOT + '/docs/ui-overhaul/evidence/acceptance';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8141', '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 700));
const { chromium } = await import(ROOT + '/node_modules/@playwright/test/index.mjs');
process.on('exit', () => srv.kill());
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
  await page.goto('http://127.0.0.1:8141');
  await page.waitForFunction(() => !!window.__qa);
  await page.locator('#menu-other').click();
  await page.waitForTimeout(300);
  await page.locator('#other-ai').click();
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
  // This geometry/history fixture must not inherit random reaction cards from AI setup.
  state.players[1].hand = [];
  state.players[1].traps = [];
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

const results = [];
try {
  const page = await toBoard(
    { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true },
    'phone'
  );
  await page.evaluate(referenceFixture);
  await page.evaluate(async () => {
    const { GameController } = await import('/js/game/controller.js');
    const { renderGame } = await import('/js/ui.js');
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { consumePrey } = await import('/js/game/consumption.js');
    const { resolveEffectResult } = await import('/js/game/effects.js');
    const s = window.reviewState;
    s.historyEvents = { version: 1, matchGeneration: 1, sequence: 0, events: [] };
    const c = new GameController(
      s,
      {},
      { onStateChange: () => {}, onBroadcast: () => {}, onSelectionNeeded: () => {} }
    );
    const card = (id) => createCardInstance(getCardDefinitionById(id), 1);
    s.players[0].field = [card('fish-predator-tiger-shark'), card('fish-prey-cannibal-fish'), null];
    consumePrey({
      state: s,
      predator: s.players[0].field[0],
      preyList: [s.players[0].field[1]],
      playerIndex: 0,
    });
    const legion = card('fish-prey-portuguese-man-o-war-legion');
    s.players[0].hand.push(legion);
    c.execute({ type: 'PLAY_CARD', payload: { card: legion, slotIndex: 1 } });
    s.phase = 'Combat';
    c.execute({
      type: 'RESOLVE_ATTACK',
      payload: {
        attacker: s.players[0].field[0],
        target: { type: 'creature', card: s.players[1].field[0] },
      },
    });
    window.reviewController = c;
    renderGame(s);
  });
  await page.locator('#field-history-btn').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#history-panel').getAttribute('aria-modal'), 'true');
  for (const width of [393, 375]) {
    await page.setViewportSize({ width, height: width === 393 ? 852 : 812 });
    for (const kind of ['attack', 'consume', 'summon']) {
      const id = await page.evaluate(
        (kind) => window.reviewState.historyEvents.events.find((e) => e.kind === kind).id,
        kind
      );
      await page.locator(`[data-event-id="${id}"]`).click();
      await page.screenshot({ path: `${OUT}/phone-${width}-${kind}.png` });
    }
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('#history-panel'),
        detail = document.querySelector('.history-detail');
      return {
        width: innerWidth,
        panel: panel.getBoundingClientRect().toJSON(),
        detail: detail.getBoundingClientRect().toJSON(),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(geometry.overflow, false);
    assert(geometry.panel.x >= 0);
    results.push(geometry);
  }
  // A real multi-consume must retain readable, aligned before/after tiles.
  await page.evaluate(async () => {
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { consumePrey } = await import('/js/game/consumption.js');
    const { renderGame } = await import('/js/ui.js');
    const card = (id) => createCardInstance(getCardDefinitionById(id), 1),
      s = window.reviewState;
    const pred = card('fish-predator-tiger-shark'),
      a = card('fish-prey-cannibal-fish'),
      b = card('fish-prey-electric-eel');
    s.players[0].field = [pred, a, b];
    consumePrey({ state: s, predator: pred, preyList: [a, b], playerIndex: 0 });
    renderGame(s);
  });
  const multiId = await page.evaluate(() => window.reviewState.historyEvents.events.at(-1).id);
  await page.locator(`[data-event-id="${multiId}"]`).click();
  const multi = await page.locator('.history-duel').evaluateAll((rows) =>
    rows.map((r) => ({
      width: r.clientWidth,
      scroll: r.scrollWidth,
      tiles: [...r.children].map((c) => c.getBoundingClientRect().width),
    }))
  );
  assert(
    multi.every(
      (r) => r.tiles.length === 3 && r.tiles.every((w) => w >= 125) && r.scroll > r.width
    ),
    JSON.stringify(multi)
  );
  await page
    .locator('.history-duel')
    .first()
    .evaluate((r) => (r.scrollLeft = 130));
  await page.waitForTimeout(100);
  assert.equal(
    await page
      .locator('.history-duel')
      .first()
      .evaluate((r) => r.scrollLeft),
    await page
      .locator('.history-duel')
      .last()
      .evaluate((r) => r.scrollLeft)
  );
  await page.screenshot({ path: `${OUT}/phone-375-multi-consume.png` });
  results.push({ multi });
  // Native focus cycle: backwards from Close must wrap to detail, never the board.
  await page.locator('#close-history').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.className),
    'history-duel history-multi'
  );
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'close-history');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.querySelectorAll('[inert]').length), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'field-history-btn');
  await page.screenshot({ path: `OUT/unused.png`.replace('OUT', OUT) });
  // Incoming mandatory selection closes History without answering it.
  await page.locator('#field-history-btn').click();
  await page.evaluate(async () => {
    window.historyPromptAnswered = false;
    (await import('/js/ui/components/SelectionPanel.js')).renderSelectionPanel({
      title: 'Choose a target',
      items: [],
      confirmLabel: 'Confirm',
      onConfirm: () => (window.historyPromptAnswered = true),
    });
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#history-panel').getAttribute('aria-modal'), null);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[inert]').length), 0);
  assert.equal(await page.evaluate(() => window.historyPromptAnswered), false);
  await page.evaluate(async () =>
    (await import('/js/ui/components/SelectionPanel.js')).clearSelectionPanel()
  );
  // Resolver uses live hit-tested elements, including exact strip/control boundaries.
  const hits = await page.evaluate(async () => {
    const { resolveDropTarget } = await import('/js/ui/input/targetResolver.js');
    const strip = document.getElementById('rival-strip'),
      r = strip.getBoundingClientRect();
    const point = (x, y) => resolveDropTarget(document.elementFromPoint(x, y))?.id || null;
    return {
      inside: point(r.x + 2, r.y + r.height / 2),
      outside: point(r.x - 2, r.y + r.height / 2),
      control: resolveDropTarget(document.querySelector('#rival-strip button'))?.id || null,
    };
  });
  assert.equal(hits.inside, 'rival-strip');
  assert.equal(hits.outside, null);
  assert.equal(hits.control, null);
  results.push(hits);
  // Existing complete mobile fan/hold/drag acceptance is executed separately too.
  const desktop = await toBoard({ viewport: { width: 1440, height: 900 } }, 'desktop');
  await desktop.evaluate(referenceFixture);
  const payload = await page.evaluate(async () =>
    JSON.parse(
      JSON.stringify(
        (await import('/js/network/serialization.js')).buildLobbySyncPayload(window.reviewState)
      )
    )
  );
  await desktop.evaluate(async (payload) => {
    (await import('/js/network/serialization.js')).applyLobbySyncPayload(
      window.reviewState,
      payload,
      { forceApply: true }
    );
    (await import('/js/ui.js')).renderGame(window.reviewState);
  }, payload);
  for (const width of [1280, 1440, 1920]) {
    await desktop.setViewportSize({
      width,
      height: width === 1280 ? 800 : width === 1920 ? 1080 : 900,
    });
    const consumeId = await desktop.evaluate(
      () => window.reviewState.historyEvents.events.find((e) => e.kind === 'consume').id
    );
    await desktop.locator(`[data-event-id="${consumeId}"]`).click();
    await desktop.waitForTimeout(1200);
    await desktop.screenshot({ path: `${OUT}/desktop-${width}-consume.png` });
  }
  assert.deepEqual(
    await desktop.evaluate(() => window.reviewState.historyEvents),
    await page.evaluate(() => window.reviewState.historyEvents)
  );
  // Pin survives real incoming effect events. Desktop hover is only a preview.
  const pinned = await desktop
    .locator('.history-event[aria-pressed="true"]')
    .getAttribute('data-event-id');
  await desktop.locator('.history-event').first().hover();
  await desktop.locator('#own-strip .player-name').hover();
  assert.equal(
    await desktop.locator('.history-event[aria-pressed="true"]').getAttribute('data-event-id'),
    pinned
  );
  const nextOperation = async () => {
    const { resolveEffectResult } = await import('/js/game/effects.js');
    const { renderGame } = await import('/js/ui.js');
    const s = window.reviewState;
    resolveEffectResult(
      s,
      { damagePlayer: { player: s.players[1], amount: 1 } },
      { playerIndex: 0, opponentIndex: 1 }
    );
    renderGame(s);
  };
  await desktop.evaluate(nextOperation);
  await page.evaluate(nextOperation);
  assert.equal(
    await desktop.locator('.history-event[aria-pressed="true"]').getAttribute('data-event-id'),
    pinned
  );
  assert.deepEqual(
    await desktop.evaluate(() => window.reviewState.historyEvents),
    await page.evaluate(() => window.reviewState.historyEvents)
  );
  const playerId = await desktop.evaluate(() => window.reviewState.historyEvents.events.at(-1).id);
  await desktop.locator(`[data-event-id="${playerId}"]`).click();
  assert.equal(await desktop.locator('.history-detail [aria-label^="NUT"]').count(), 0);
  assert.equal(await desktop.locator('.history-detail [aria-label^="HP"]').count(), 2);
  await desktop.screenshot({ path: `${OUT}/desktop-player-damage.png` });
  results.push({
    snapshotAndNextOperation: 'identical',
    pinnedSelection: 'preserved',
    playerTiles: 'HP only',
  });
  // Actual tab reload, authoritative JSON restore, then another production effect.
  const recoveredPayload = await page.evaluate(async () =>
    JSON.parse(
      JSON.stringify(
        (await import('/js/network/serialization.js')).buildLobbySyncPayload(window.reviewState)
      )
    )
  );
  await desktop.reload();
  await desktop.waitForFunction(() => !!window.__qa);
  await desktop.evaluate(async (payload) => {
    const { getLatestState } = await import('/js/ui/input/dragAndDrop.js');
    const { applyLobbySyncPayload } = await import('/js/network/serialization.js');
    const { renderGame } = await import('/js/ui.js');
    const s = getLatestState();
    applyLobbySyncPayload(s, payload, { forceApply: true });
    s.menu.mode = 'local';
    s.menu.stage = 'ready';
    window.reviewState = s;
    renderGame(s);
  }, recoveredPayload);
  await desktop.evaluate(nextOperation);
  await page.evaluate(nextOperation);
  assert.deepEqual(
    await desktop.evaluate(() => window.reviewState.historyEvents),
    await page.evaluate(() => window.reviewState.historyEvents)
  );
  results.push({ actualReloadAndSubsequentEffect: 'identical history' });
  // Seat mapping is exercised without connecting to a live backend.
  for (const seat of [0, 1]) {
    const mapping = await desktop.evaluate(async (seat) => {
      const s = window.reviewState;
      s.menu.mode = 'online';
      s.menu.profile = { id: seat ? 'guest-fixture' : 'host-fixture' };
      s.menu.lobby = { host_id: 'host-fixture', guest_id: 'guest-fixture' };
      (await import('/js/ui.js')).renderGame(s);
      const { resolveDropTarget } = await import('/js/ui/input/targetResolver.js');
      return {
        own: Number(
          resolveDropTarget(document.querySelector('#own-strip .player-name')).dataset.playerIndex
        ),
        rival: Number(
          resolveDropTarget(document.querySelector('#rival-strip .player-name')).dataset.playerIndex
        ),
      };
    }, seat);
    assert.deepEqual(mapping, { own: seat, rival: 1 - seat });
    results.push({ seat, mapping });
  }
  const pageErrors = errs.filter((e) => e.includes('PAGEERROR'));
  assert.deepEqual(pageErrors, []);
  execFileSync(process.execPath, ['e2e/interface-regression.mjs'], {
    cwd: ROOT,
    env: { ...process.env, TCG_BASE: 'http://127.0.0.1:8141' },
    stdio: 'inherit',
  });
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors: errs }, null, 2));
  console.log(JSON.stringify({ result: 'PASS', assertions: results, errors: errs }, null, 2));
} catch (error) {
  for (const [i, p] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries()) {
    await p.screenshot({ path: `${OUT}/failure-${i}.png` });
    console.log(await p.locator('.overlay.active').allTextContents());
  }
  throw error;
} finally {
  await browser.close();
  srv.kill();
}
