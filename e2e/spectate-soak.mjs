// UI-started AI-vs-AI soak. AI decisions are NOT evidence of human drag/tap paths.
// This script only clicks shipped controls and reads snapshots; no state injection,
// controller execution, or QA action APIs. Failures retain a trace and screenshot.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out = process.env.TCG_SOAK_OUT || '/tmp/tcg-spectate-soak';
const count = Number(process.env.TCG_SOAK_MATCHES || 10);
const maxHours = Number(process.env.TCG_SOAK_HOURS || 6);
const port = Number(process.env.TCG_SOAK_PORT || 8201);
mkdirSync(out, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const domains = ['fish', 'bird', 'mammal', 'reptile', 'amphibian'];
const results = [];
const started = Date.now();
let consecutiveFailures = 0;
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const save = (status, extra = {}) =>
  writeFileSync(
    `${out}/summary.json`,
    JSON.stringify(
      {
        status,
        pid: process.pid,
        sourceCommit,
        started: new Date(started).toISOString(),
        requested: count,
        budgetHours: maxHours,
        results,
        ...extra,
      },
      null,
      2
    )
  );
save('running');
try {
  for (let match = 0; match < count && Date.now() - started < maxHours * 3600000; match++) {
    const width = match % 2 ? 393 : 1440,
      height = match % 2 ? 852 : 900;
    const left = domains[match % 5],
      right = domains[Math.floor(match / 5) % 5];
    const difficulty = match % 2 ? 'trueSim' : 'easy';
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.tracing.start({ screenshots: true, snapshots: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const row = {
      match,
      left,
      right,
      difficulty,
      width,
      started: new Date().toISOString(),
      tier: 'UI-started AIvAI; read-only observation',
    };
    const eventFile = `${out}/match-${match}.jsonl`;
    let lastState;
    try {
      await page.goto(`http://127.0.0.1:${port}`);
      await page.locator('#menu-other').click();
      await page.locator(`[data-difficulty="${difficulty}"]`).click();
      await page.locator('.practice-advanced summary').click();
      await page.locator('#ai-vs-ai').click();
      await page.locator('#spectate-left-deck').selectOption(`domain:${left}`);
      await page.locator('#spectate-right-deck').selectOption(`domain:${right}`);
      await page.locator('#ai-vs-ai-start').click();
      const initial = await page.evaluate(async () => {
        const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
        return {
          decks: s.deckBuilder.selections.map((d) => d.map((c) => c.id)),
          difficulty: s.menu.aiDifficulty,
        };
      });
      assert.equal(initial.difficulty, difficulty);
      assert.deepEqual(
        initial.decks.map((d) => d.length),
        [20, 20]
      );
      appendFileSync(eventFile, JSON.stringify({ initial }) + '\n');
      await page.screenshot({ path: `${out}/match-${match}-start.png` });
      let fingerprint = '',
        changed = Date.now();
      const matchStarted = Date.now();
      for (;;) {
        lastState = await page.evaluate(() => ({
          state: window.__qa.getState(),
          result: window.__qa.isGameOver(),
        }));
        const s = lastState.state;
        // Only stable, externally observable invariants; no invented rule interpreter.
        assert(
          s.players.every((p) => p.hp <= 10),
          'HP above rules cap'
        );
        assert(
          s.players.every((p) => p.field.filter(Boolean).length <= 3),
          'field above three creatures'
        );
        assert.deepEqual(errors, [], 'uncaught browser error');
        const now = JSON.stringify(lastState);
        if (now !== fingerprint) {
          fingerprint = now;
          changed = Date.now();
          appendFileSync(
            eventFile,
            JSON.stringify({ at: new Date().toISOString(), ...lastState }) + '\n'
          );
        }
        if (lastState.result.over) {
          row.result = lastState.result;
          row.turn = s.turn;
          row.status = 'completed';
          const countdown = page.locator('#victory-countdown');
          if (await countdown.isVisible()) await countdown.click();
          await page.screenshot({ path: `${out}/match-${match}-end.png` });
          break;
        }
        assert(
          Date.now() - changed < 90000,
          `No state progress for 90s at ${s.phase}, turn ${s.turn}`
        );
        assert(
          Date.now() - matchStarted < 12 * 60000,
          'Match exceeded 12-minute observation budget'
        );
        await page.waitForTimeout(500);
      }
      consecutiveFailures = 0;
      await ctx.tracing.stop();
    } catch (error) {
      row.status = 'failed';
      row.error = error.message;
      row.lastState = lastState;
      row.browserErrors = errors;
      consecutiveFailures++;
      await page.screenshot({ path: `${out}/match-${match}-failure.png` }).catch(() => {});
      await ctx.tracing.stop({ path: `${out}/match-${match}-trace.zip` });
    } finally {
      await ctx.close();
    }
    row.finished = new Date().toISOString();
    results.push(row);
    save('running');
    console.log(JSON.stringify(row));
    if (consecutiveFailures >= 3)
      throw new Error('Three consecutive failures: stopped to avoid repeating a blocked path');
  }
  save(results.every((r) => r.status === 'completed') ? 'completed' : 'completed-with-failures', {
    finished: new Date().toISOString(),
  });
} catch (error) {
  save('failed', { error: error.message, finished: new Date().toISOString() });
  throw error;
} finally {
  await browser.close();
  server.kill();
}
assert(results.length > 0, 'no matches observed');
assert(
  results.every((r) => r.status === 'completed'),
  'campaign contains failures; inspect summary and traces'
);
