import { mkdirSync } from 'node:fs';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { TUTORIAL_SCENES } from '../js/ui/overlays/tutorialScenes.js';
mkdirSync('docs/tutorial-refresh', { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '8163', '--bind', '127.0.0.1'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
});
process.on('exit', () => server.kill());
await new Promise((r) => setTimeout(r, 400));
const browser =
  process.env.TCG_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch(
        process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
      );
const failures = [];
const errors = [];
const sizes = [
  [393, 852],
  [430, 745],
  [375, 600],
  [320, 568],
  [852, 393],
  [1440, 900],
];
try {
  const p = await browser.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  for (const [width, height] of sizes) {
    await p.setViewportSize({ width, height });
    await p.goto(process.env.TCG_BASE || 'http://127.0.0.1:8163');
    await p.locator('#other-tutorial').click();
    await p.waitForTimeout(350);
    await expect(p.locator('.tutorial-nav-btn').first()).toBeDisabled();
    for (const [i, scene] of TUTORIAL_SCENES.entries()) {
      // Use the scene's longest real caption, including when animations haven't reached it yet.
      const caption =
        scene.demo.steps
          .filter((s) => s.type === 'label')
          .map((s) => s.text)
          .sort((a, b) => b.length - a.length)[0] || '';
      const metrics = await p.evaluate(
        ({ caption }) => {
          const label = document.querySelector('.tutorial-stage-label');
          const previousCaption = label.textContent;
          label.textContent = caption;
          const nodes = [
            ...document.querySelectorAll(
              '#tutorial-overlay .tutorial-card, #tutorial-overlay .tutorial-header, .tutorial-demo, .tutorial-stage, .tutorial-text-content, .tutorial-nav, .tutorial-nav-btn, .tutorial-scene-title, .tutorial-scene-text p, .tutorial-flow-step, .tutorial-stage-label'
            ),
          ];
          const result = nodes.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              name: el.className,
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              h: r.height,
              scroll: el.scrollHeight,
              client: el.clientHeight,
              w: el.clientWidth,
              sw: el.scrollWidth,
            };
          });
          label.textContent = previousCaption;
          return result;
        },
        { caption }
      );
      for (const m of metrics)
        if (
          m.x < -1 ||
          m.y < -1 ||
          m.right > width + 1 ||
          m.bottom > height + 1 ||
          m.scroll > m.client + 1 ||
          m.sw > m.w + 1
        )
          failures.push({ width, height, scene: scene.title, ...m });
      const cardCount = await p.locator('.tutorial-stage-slot .card').count();
      assert.equal(cardCount, scene.demo.setup.length, `Missing card in ${scene.title}`);
      for (const b of await p.locator('.tutorial-nav-btn').all())
        assert.ok(
          (await b.boundingBox()).height >= 43.9,
          `${width}x${height}: navigation tap target`
        );
      if ([0, 3, 5, 20].includes(i) && [393, 320, 1440].includes(width)) {
        await p.waitForTimeout(550);
        await p.screenshot({ path: `docs/tutorial-refresh/${width}-${scene.id}.png` });
      }
      if (i < TUTORIAL_SCENES.length - 1) await p.locator('.tutorial-nav-btn').last().click();
    }
    await expect(p.locator('.tutorial-nav-btn').last()).toHaveText('Done');
    await p.locator('.tutorial-nav-btn').last().click();
    await expect(p.locator('#menu-overlay')).toHaveClass(/active/);
    console.log(`CHECKED ${TUTORIAL_SCENES.length} panes at ${width}x${height}`);
  }
  // Observe the real phase sequence at the smallest supported phone size.
  await p.setViewportSize({ width: 320, height: 568 });
  await p.locator('#other-tutorial').click();
  for (let i = 0; i < 3; i++) await p.locator('.tutorial-nav-btn').last().click();
  for (const phase of TUTORIAL_SCENES[3].demo.flow) {
    await expect(p.locator('.tutorial-phase-name')).toHaveText(phase);
    const stage = await p.locator('.tutorial-stage').boundingBox();
    const title = await p.locator('.tutorial-phase-name').boundingBox();
    const track = await p.locator('.tutorial-phase-track').boundingBox();
    assert.ok(title.x >= stage.x && title.x + title.width <= stage.x + stage.width);
    assert.ok(title.y >= stage.y && track.y + track.height <= stage.y + stage.height);
    assert.equal(await p.locator('.tutorial-phase-track [aria-current="step"]').getAttribute('data-phase'), phase);
  }
  await p.locator('#tutorial-close').click();
  // Real looping attack must remain inside its stage and disappear on navigation.
  await p.setViewportSize({ width: 393, height: 852 });
  await p.locator('#other-tutorial').click();
  await p.locator('.tutorial-attack-ghost').waitFor({ state: 'attached' });
  assert.equal(await p.locator('body > .tutorial-attack-ghost').count(), 0);
  assert.equal(await p.locator('.tutorial-stage > .tutorial-attack-ghost').count(), 1);
  await p.locator('.tutorial-nav-btn').last().click();
  assert.equal(await p.locator('.tutorial-attack-ghost').count(), 0);
  await p.locator('#tutorial-close').click();
  assert.equal(await p.locator('.tutorial-arrow').count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ failures }));
  assert.deepEqual(failures, []);
  console.log(
    `PASS ${sizes.length * TUTORIAL_SCENES.length} full-pane layouts: no clipped text, no scrolling, visible navigation, bounded demos`
  );
} finally {
  await browser.close();
  server.kill();
}
