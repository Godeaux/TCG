// UI-PLAYED audit: dry drop / consume through production handlers only.
// Real app startup, visible Practice controls, real mouse drags/clicks.
// Read-only __qa.getState() inspection only — no dispatch, no injection.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.env.TCG_DRYDROP_OUT || '/tmp/tcg-drydrop-repaired';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8199;
const requested = new Set(
  (process.env.TCG_DRYDROP_SCENARIOS || 'autoDry,consume,dryButton').split(',')
);

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
process.on('exit', () => server.kill());
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);

const consoleLog = [];
const evidence = [];
const shots = [];

function record(step, detail) {
  evidence.push({ step, detail });
  console.log(`STEP ${step}: ${JSON.stringify(detail)}`);
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('console', (m) => consoleLog.push(m.text()));
  page.on('pageerror', (e) => consoleLog.push(`PAGEERROR ${e.message}`));

  // --- Real startup ---
  await page.goto(`http://127.0.0.1:${PORT}`);
  await page.waitForFunction(() => !document.body.hasAttribute('data-loading'));
  await page.waitForFunction(() => !!window.__qa);
  await page.screenshot({ path: `${OUT}/00-home.png` });
  shots.push('00-home.png');
  record('startup', 'app loaded, __qa present');

  await page.evaluate(() => {
    window.__auditInputEvents = [];
    for (const type of ['dragstart', 'dragend', 'drop'])
      document.addEventListener(
        type,
        (event) =>
          window.__auditInputEvents.push({
            type,
            target: event.target.closest('.card')?.dataset.instanceId,
            tag: event.target.tagName,
          }),
        true
      );
  });
  const readState = () => page.evaluate(() => window.__qa.getState());
  const logTail = () => page.evaluate(() => window.__qa.getState().recentLog.slice(0, 6));

  // --- Visible-control Practice setup (same flow practice-decks.mjs clicks) ---
  await page.locator('#menu-other').click();
  await page.locator('[data-difficulty="easy"]').click();
  await page.locator('#practice-player-deck').selectOption('domain:fish');
  await page.locator('#practice-ai-deck').selectOption('domain:mammal');
  await page.screenshot({ path: `${OUT}/01-practice-setup.png` });
  shots.push('01-practice-setup.png');
  await page.locator('#ai-start-game').click();
  await page.waitForFunction(() => window.__qa?.getState()?.players?.[0]?.hand?.length > 0);
  await completeOpeningRoll();
  record(
    'practice-setup',
    'fish deck vs mammal AI via visible controls; opening roll passed via UI'
  );
  await page.screenshot({ path: `${OUT}/02-game-start.png` });
  shots.push('02-game-start.png');

  const myTurnMain = (s) =>
    s.activePlayer === s.localPlayer && (s.phase === 'Main 1' || s.phase === 'Main 2');

  // The opening roll overlay is part of the real match flow: click the visible
  // "Roll for <you>", then the "goes first" choice if we won the roll.
  async function completeOpeningRoll() {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const s = await readState();
      if (s.phase !== 'Setup') return;
      const overlay = page.locator('#setup-overlay');
      if (await overlay.isVisible().catch(() => false)) {
        const btns = overlay.locator('button');
        const n = await btns.count();
        let clicked = false;
        for (let i = 0; i < n; i++) {
          const b = btns.nth(i);
          const text = ((await b.textContent().catch(() => '')) || '').trim();
          if (!text) continue;
          const enabled = await b.isEnabled().catch(() => false);
          if ((/Roll for/.test(text) && enabled) || /goes first/.test(text)) {
            await page
              .screenshot({ path: `${OUT}/05-opening-roll-${text.replace(/\W+/g, '_')}.png` })
              .catch(() => {});
            await b.click({ timeout: 2000 }).catch(() => {});
            clicked = true;
            break;
          }
        }
        if (clicked) await page.waitForTimeout(450);
        else await page.waitForTimeout(500);
      } else {
        await page.waitForTimeout(500);
      }
    }
    const s = await readState();
    if (s.phase === 'Setup') throw new Error('opening roll did not complete in 30s');
  }

  // Clear any UI selection that blocks phase advancement (isSelectionActive()
  // returns true while #selection-panel has children; targeting banner blocks too).
  async function clearStuckSelection() {
    let cleared = false;
    for (const sel of [
      '#targeting-banner .skip-targeting',
      '#targeting-banner .cancel-targeting',
    ]) {
      const l = page.locator(sel);
      if (
        (await l.count()) &&
        (await l
          .first()
          .isVisible()
          .catch(() => false))
      ) {
        await l
          .first()
          .click({ timeout: 1000 })
          .catch(() => {});
        await page.waitForTimeout(250);
        cleared = true;
        break;
      }
    }
    const panel = page.locator('#selection-panel');
    if (await panel.count()) {
      const btns = panel.locator('button');
      const n = await btns.count();
      for (let i = 0; i < n; i++) {
        const b = btns.nth(i);
        const t = ((await b.textContent().catch(() => '')) || '').trim();
        if (/Skip|Confirm|Done|No prey|None/i.test(t) && (await b.isVisible().catch(() => false))) {
          await b.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(250);
          cleared = true;
          break;
        }
      }
    }
    return cleared;
  }

  async function passReaction() {
    const button = page.getByRole('button', { name: 'Do not activate', exact: true });
    if (await button.isVisible()) {
      await button.click();
      await page.waitForTimeout(400);
      record('reaction', 'declined through visible control');
    }
  }

  async function endTurn() {
    const initial = await readState();
    const minimumTurn =
      initial.activePlayer === initial.localPlayer ? initial.turn + 1 : initial.turn;
    const deadline = Date.now() + 90000;
    let stallLog = null;
    while (Date.now() < deadline) {
      await passReaction();
      const s = await readState();
      if (myTurnMain(s) && s.turn >= minimumTurn && !s.pendingContext) return;
      if (s.activePlayer === s.localPlayer) {
        await page.keyboard.press('Escape');
        await page.mouse.move(10, 10);
        await clearStuckSelection();
        const btn = page.locator('#field-turn-btn');
        const wasSkipConfirm = /Skip combat\?/.test(
          (await btn.textContent().catch(() => '')) || ''
        );
        await btn.click({ timeout: 3000 });
        await page.waitForTimeout(wasSkipConfirm ? 700 : 500);
        // Combat with ready attackers asks "Skip combat?"; confirm within its window.
        const t2 = ((await btn.textContent().catch(() => '')) || '').trim();
        if (/Skip combat\?/.test(t2)) {
          await btn.click({ timeout: 2000 });
          await page.waitForTimeout(600);
        }
        const s2 = await readState();
        if (myTurnMain(s2) && s2.turn >= minimumTurn) return;
        if (s2.phase === s.phase && s2.activePlayer === s.activePlayer)
          await page.waitForTimeout(800);
      } else {
        await page.waitForTimeout(700); // AI thinking
      }
      const s3 = await readState();
      if (s3.activePlayer === s3.localPlayer && s3.phase === stallLog?.phase) {
        await page.screenshot({ path: `${OUT}/91-stall-${s3.phase}.png` }).catch(() => {});
      }
      stallLog = { phase: s3.phase, active: s3.activePlayer };
    }
    const s = await readState();
    const log = await logTail().catch(() => []);
    throw new Error(
      `stuck after 90s: active=${s.activePlayer} phase=${s.phase} log=${JSON.stringify(log)}`
    );
  }

  async function dragToField(instanceId) {
    const card = page.locator(`#active-hand .card[data-instance-id="${instanceId}"]`);
    await card.waitFor({ state: 'visible', timeout: 5000 });
    const hitPoint = () =>
      card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const points = [];
        for (let y = Math.max(1, r.top + 15); y < Math.min(innerHeight, r.bottom) - 15; y += 10)
          for (let x = Math.max(1, r.left + 15); x < Math.min(innerWidth, r.right) - 15; x += 10)
            if (document.elementFromPoint(x, y)?.closest('.card') === el) points.push({ x, y });
        points.sort(
          (a, b) =>
            Math.hypot(a.x - r.x - r.width / 2, a.y - r.y - r.height / 2) -
            Math.hypot(b.x - r.x - r.width / 2, b.y - r.y - r.height / 2)
        );
        return points[0] || null;
      });
    let point = await hitPoint();
    expect(point, 'hand card must have a genuinely hittable point').not.toBeNull();
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(250);
    point = await hitPoint();
    expect(point, 'lifted hand card must remain hittable').not.toBeNull();
    const s = await readState();
    const slot = Math.max(
      0,
      s.players[0].field.findIndex((c) => !c)
    );
    const target = await page.locator('.player-field .field-slot').nth(slot).boundingBox();
    expect(target).not.toBeNull();
    record('drag-before', {
      instanceId,
      phase: s.phase,
      turn: s.turn,
      active: s.activePlayer,
      local: s.localPlayer,
      ui: s.ui,
      slot,
      point,
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 15, point.y - 15, { steps: 5 });
    await page.waitForTimeout(100);
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
    await page.mouse.move(target.x + target.width / 2 + 1, target.y + target.height / 2 + 1);
    await page.mouse.up();
    record('drag-events', await page.evaluate(() => window.__auditInputEvents));
    await page.waitForTimeout(700);
  }

  let done = { autoDry: false, dryButton: false, consume: false };
  let playedThisTurn = false;

  const complete = () => [...requested].every((name) => done[name]);
  for (let turn = 0; turn < 28 && !complete(); turn++) {
    await passReaction();
    let s = await readState();
    if (s.pendingContext && s.pendingContext.type && s.pendingContext.type !== 'none') {
      // a modal wants attention; screenshot and abort honestly
      await page.screenshot({ path: `${OUT}/90-blocked-${turn}.png` });
      shots.push(`90-blocked-${turn}.png`);
      record('blocked', `pendingContext=${JSON.stringify(s.pendingContext)} at turn ${turn}`);
      break;
    }
    if (!myTurnMain(s)) {
      if (s.activePlayer === s.localPlayer) {
        await page
          .locator('#field-turn-btn')
          .click({ timeout: 3000 })
          .catch(() => {});
        await page.waitForTimeout(400);
      }
      await endTurn();
      playedThisTurn = false;
      s = await readState();
    }
    if (!myTurnMain(s)) continue;

    const me = s.players[s.localPlayer];
    const myPrey = me.field.filter(
      (c) => c && c.type === 'Prey' && !c.isFrozen && !c.keywords.includes('Inedible')
    );
    const predators = me.hand.filter(
      (c) => c.type === 'Predator' && !c.keywords.includes('Scavenge')
    );
    const preys = me.hand
      .filter((c) => c.type === 'Prey' && !c.isFrozen && !c.keywords.includes('Inedible'))
      .sort((a, b) => (a.effectText?.length || 0) - (b.effectText?.length || 0));

    // Scenario 1: dry drop with NO prey on field (auto, no panel)
    if (
      requested.has('autoDry') &&
      !done.autoDry &&
      !playedThisTurn &&
      myPrey.length === 0 &&
      predators.length
    ) {
      const p = predators[0];
      await dragToField(p.instanceId);
      const after = await readState();
      const placed = after.players[after.localPlayer].field.find(
        (c) => c && c.id === p.id && c.summonedTurn === after.turn
      );
      const ok = placed && placed.isDryDropped === true;
      await page.screenshot({ path: `${OUT}/10-autodry-${p.name.replace(/\W+/g, '')}.png` });
      shots.push(`10-autodry-${p.name.replace(/\W+/g, '')}.png`);
      record('auto-dry-drop', {
        card: p.name,
        placed: placed
          ? { name: placed.name, isDryDropped: placed.isDryDropped, keywords: placed.keywords }
          : null,
        passed: ok,
        log: await logTail(),
      });
      expect(
        ok,
        'auto dry drop must place a fresh field instance with suppressed abilities'
      ).toBeTruthy();
      expect(
        after.players[0].hand.some((c) => c.instanceId === p.instanceId),
        'played hand instance must leave hand'
      ).toBeFalsy();
      done.autoDry = true;
      playedThisTurn = true;
      continue;
    }

    // Setup for B/C: put a prey on my field (normal play)
    if (
      !playedThisTurn &&
      myPrey.length === 0 &&
      preys.length &&
      (!requested.has('autoDry') || done.autoDry || predators.length === 0)
    ) {
      await dragToField(preys[0].instanceId);
      const seeded = await readState();
      record('seed-prey', {
        card: preys[0].name,
        field: seeded.players[0].field.map((c) => c && c.name),
        pending: seeded.pendingContext,
        log: seeded.recentLog.slice(0, 6),
      });
      expect(
        seeded.players[0].field.some((c) => c && c.id === preys[0].id),
        'prey must actually be placed'
      ).toBeTruthy();
      playedThisTurn = seeded.ui.cardPlayedThisTurn;
      continue;
    }

    // Scenario 2: consume path (panel -> Consume -> checkbox -> Confirm)
    if (
      requested.has('consume') &&
      !done.consume &&
      !playedThisTurn &&
      myPrey.length > 0 &&
      predators.length
    ) {
      const p = predators[0];
      const before = p.currentAtk ?? p.atk;
      await dragToField(p.instanceId);
      const consumeBtn = page.getByRole('button', { name: 'Consume', exact: true });
      if (!(await consumeBtn.count())) {
        record('consume-missing-panel', {
          card: p.name,
          pending: (await readState()).pendingContext,
        });
        break;
      }
      await consumeBtn.click();
      await page.waitForTimeout(300);
      await page.locator('#selection-panel input[type=checkbox]').first().check();
      const nutrition = (await readState()).recentLog; // keep ordering
      void nutrition;
      await page.screenshot({ path: `${OUT}/20-consume-checkboxes.png` });
      shots.push('20-consume-checkboxes.png');
      await page
        .locator('#selection-panel button')
        .filter({ hasText: /Confirm/ })
        .click();
      await page.waitForTimeout(300);
      // Consumption can legally owe a card choice before the predator arrives
      // (e.g. Orca's tutor). Resolve it through the real displayed candidate.
      for (let choice = 0; choice < 5; choice++) {
        const candidate = page.locator('.card-selection-overlay .card').first();
        if (!(await candidate.isVisible())) break;
        record('consumption-choice', await candidate.innerText());
        await candidate.click();
        await page.waitForTimeout(300);
      }
      await passReaction();
      await page.waitForTimeout(500);
      const after = await readState();
      const placed = after.players[after.localPlayer].field.find(
        (c) => c && c.id === p.id && c.summonedTurn === after.turn
      );
      const preyGone = !after.players[after.localPlayer].field.some(
        (c) => c && c.type === 'Prey' && c.instanceId === myPrey[0].instanceId
      );
      const grew = placed && (placed.currentAtk ?? 0) > (before ?? 0);
      await page.screenshot({ path: `${OUT}/21-after-consume.png` });
      shots.push('21-after-consume.png');
      record('consume', {
        predator: p.name,
        atkBefore: before,
        atkAfter: placed ? placed.currentAtk : null,
        preyConsumed: myPrey[0].name,
        preyGone,
        grew,
        isDryDropped: placed ? placed.isDryDropped : null,
        passed: !!(placed && grew && preyGone && placed.isDryDropped !== true),
        log: await logTail(),
      });
      expect(
        !!(placed && grew && preyGone && placed.isDryDropped !== true),
        'consumption must complete, gain stats, and remove selected prey'
      ).toBeTruthy();
      done.consume = true;
      playedThisTurn = true;
      continue;
    }

    // Scenario 3: dry-drop BUTTON while prey present (panel -> Dry drop)
    if (
      requested.has('dryButton') &&
      !done.dryButton &&
      !playedThisTurn &&
      myPrey.length > 0 &&
      predators.length
    ) {
      const p = predators[0];
      await dragToField(p.instanceId);
      const dryBtn = page.getByRole('button', { name: 'Dry drop', exact: true });
      if (!(await dryBtn.count())) {
        record('drybutton-missing-panel', {
          card: p.name,
          pending: (await readState()).pendingContext,
        });
        break;
      }
      await dryBtn.click();
      await page.waitForTimeout(700);
      const after = await readState();
      const placed = after.players[after.localPlayer].field.find(
        (c) => c && c.id === p.id && c.summonedTurn === after.turn
      );
      const preyStill = after.players[after.localPlayer].field.some(
        (c) => c && c.instanceId === myPrey[0].instanceId
      );
      await page.screenshot({ path: `${OUT}/30-drydrop-button.png` });
      shots.push(`30-drydrop-button.png`);
      record('dry-drop-button', {
        predator: p.name,
        isDryDropped: placed ? placed.isDryDropped : null,
        keywords: placed ? placed.keywords : null,
        preySurvived: preyStill,
        passed: !!(placed && placed.isDryDropped === true),
        log: await logTail(),
      });
      expect(
        !!(placed && placed.isDryDropped === true && preyStill),
        'explicit dry drop must preserve prey'
      ).toBeTruthy();
      done.dryButton = true;
      playedThisTurn = true;
      continue;
    }

    await endTurn();
    playedThisTurn = false;
  }

  // Keyword suppression evidence for UI dry-dropped creature
  const finalState = await readState();
  const dryCards = finalState.players[finalState.localPlayer].field.filter(
    (c) => c && c.isDryDropped
  );
  record('final', {
    done,
    dryDroppedOnField: dryCards.map((c) => ({
      name: c.name,
      keywords: c.keywords,
      currentAtk: c.currentAtk,
    })),
  });
  await page.screenshot({ path: `${OUT}/99-final.png` });
  shots.push('99-final.png');

  fs.writeFileSync(
    `${OUT}/evidence.json`,
    JSON.stringify(
      { requested: [...requested], evidence, shots, consoleTail: consoleLog.slice(-40) },
      null,
      2
    )
  );
  for (const name of requested)
    expect(done[name], `required real-input path must complete: ${name}`).toBe(true);
  console.log('RESULT ' + JSON.stringify(done));
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: `${OUT}/failure.png` });
    record('failure-state', await page.evaluate(() => window.__qa.getState()));
  }
  fs.writeFileSync(
    `${OUT}/failure.json`,
    JSON.stringify(
      { error: error.message, evidence, shots, consoleTail: consoleLog.slice(-40) },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  server.kill();
}
