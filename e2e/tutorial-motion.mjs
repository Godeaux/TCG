import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { TUTORIAL_SCENES } from '../js/ui/overlays/tutorialScenes.js';
const out = 'docs/tutorial-polish';
mkdirSync(out, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '8184', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
const browser =
  process.env.TCG_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({ executablePath: process.env.TCG_CHROME });
const errors = [],
  failures = [],
  reviewed = [];
try {
  await new Promise((r) => setTimeout(r, 400));
  await Promise.all(
    Array.from({ length: 5 }, async (_, worker) => {
      for (const [width, height] of [
        [320, 568],
        [393, 852],
        [1440, 900],
      ]) {
        const page = await browser.newPage({ viewport: { width, height } });
        page.on('pageerror', (e) => errors.push(e.message));
        for (let index = worker; index < TUTORIAL_SCENES.length; index += 5) {
          const scene = TUTORIAL_SCENES[index];
          await page.goto('http://127.0.0.1:8184');
          await page.locator('#other-tutorial').click();
          for (let n = 0; n < index; n++) await page.locator('.tutorial-nav-btn').last().click();
          await page.waitForTimeout(400);
          const cycle = await page.locator('.tutorial-stage').getAttribute('data-cycle');
          let completed = false;
          const screenshots = new Set();
          for (let sample = 0; sample < 100; sample++) {
            const state = await page.evaluate(() => {
              const stage = document.querySelector('.tutorial-stage'),
                bounds = stage.getBoundingClientRect();
              const problems = [];
              for (const el of stage.querySelectorAll(
                '.tutorial-slot-role,.tutorial-slot-note,.tutorial-entity,.tutorial-diagram,.tutorial-phase-name,.tutorial-phase-track'
              )) {
                if (
                  !el.textContent ||
                  !el.getClientRects().length ||
                  Number(getComputedStyle(el.parentElement).opacity) === 0
                )
                  continue;
                const r = el.getBoundingClientRect();
                if (
                  r.x < bounds.x - 1 ||
                  r.right > bounds.right + 1 ||
                  r.y < bounds.y - 1 ||
                  r.bottom > bounds.bottom + 1 ||
                  el.scrollWidth > el.clientWidth + 1 ||
                  el.scrollHeight > el.clientHeight + 1
                )
                  problems.push(el.className + ': ' + el.textContent);
              }
              const caption = document.querySelector('.tutorial-stage-label');
              if (caption.scrollHeight > caption.clientHeight + 1)
                problems.push('caption overflow: ' + caption.textContent);
              return { cycle: stage.dataset.cycle, step: Number(stage.dataset.step), problems };
            });
            if (state.problems.length)
              failures.push({ width, scene: scene.id, step: state.step, problems: state.problems });
            const milestone =
              state.step === scene.demo.steps.length - 1
                ? 'result'
                : state.step >= Math.floor(scene.demo.steps.length / 2)
                  ? 'middle'
                  : 'start';
            if (!screenshots.has(milestone)) {
              await page.screenshot({
                path: `${out}/${width}-${String(index + 1).padStart(2, '0')}-${milestone}.png`,
              });
              screenshots.add(milestone);
            }
            if (state.cycle !== cycle) {
              completed = true;
              break;
            }
            await page.waitForTimeout(180);
          }
          assert.ok(completed, `${scene.id} never completed a loop`);
          const images = await page
            .locator('.tutorial-stage-slot > .card .card-image')
            .evaluateAll((imgs) =>
              imgs.map((i) => ({
                src: i.getAttribute('src'),
                ok: i.complete && i.naturalWidth > 0,
              }))
            );
          assert.ok(
            images.every((i) => i.ok),
            `${scene.id}: missing artwork ${JSON.stringify(images)}`
          );
          await page.locator('.tutorial-replay').click();
          if (scene.id !== 'card-anatomy')
            assert.equal(await page.locator('[data-focus-stat]').count(), 0);
          for (const item of scene.demo.setup.filter((i) => i.card?.hp !== undefined))
            await expect(page.locator(`.tutorial-slot-${item.slot}`)).toHaveAttribute(
              'data-hp',
              String(item.card.hp)
            );
          const tap = await page.locator('.tutorial-replay').boundingBox();
          assert.ok(tap.height >= 43.9, 'Replay needs a 44px tap target');
          await page.locator('#tutorial-close').click();
          assert.equal(await page.locator('.tutorial-attack-ghost,.tutorial-arrow').count(), 0);
          reviewed.push({ width, height, scene: scene.id });
          console.log(`REVIEWED ${width} ${scene.id}`);
        }
        await page.close();
      }
    })
  );
  writeFileSync(
    `${out}/motion-results-${process.env.TCG_BROWSER || 'chromium'}.json`,
    JSON.stringify({ reviewed, failures, errors }, null, 2)
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    `PASS ${reviewed.length} complete animation loops, live layout, artwork, replay and cleanup`
  );
} finally {
  await browser.close();
  server.kill();
}
