import { mkdirSync } from 'node:fs';
mkdirSync(new URL('../docs/release-2026-10-27/', import.meta.url), { recursive: true });
import { chromium, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8163', '--bind', '127.0.0.1'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
});
process.on('exit', () => server.kill());
await new Promise((r) => setTimeout(r, 500));
const browser =
  process.env.TCG_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({
        ...(process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}),
      });
const failures = [];
try {
  const p = await browser.newPage();
  for (const [width, height] of [
    [393, 852],
    [375, 600],
    [1440, 900],
  ]) {
    await p.setViewportSize({ width, height });
    await p.goto(process.env.TCG_BASE || 'http://127.0.0.1:8163');
    await p.locator('#menu-other').click();
    await p.locator('#other-tutorial').click();
    const count = Number((await p.locator('.tutorial-nav-counter').innerText()).split('/')[1]);
    for (let i = 0; i < count; i++) {
      const metrics = await p.locator('.tutorial-stage').evaluate((stage) =>
        [...stage.querySelectorAll('.tutorial-stage-slot:not(:empty)')].map((slot) => ({
          left: slot.offsetLeft,
          right: slot.offsetLeft + slot.querySelector('.card').offsetWidth,
          width: stage.clientWidth,
          cardWidth: slot.querySelector('.card').offsetWidth,
          slotWidth: slot.clientWidth,
        }))
      );
      if (
        !metrics.every(
          (r) => r.left >= 0 && r.right <= r.width + 1 && r.cardWidth <= r.slotWidth + 1
        )
      )
        failures.push({ width, scene: i + 1, metrics });
      if (i === 0) {
        await p.waitForTimeout(800);
        await p.screenshot({
          path: new URL('../docs/release-2026-10-27/tutorial-' + width + '.png', import.meta.url)
            .pathname,
        });
      }
      if (i < count - 1) await p.locator('.tutorial-nav-btn').last().click();
    }
  }
  console.log(JSON.stringify({ failures }));
  assert.deepEqual(failures, []);
  console.log('PASS 75 tutorial scene/viewport layouts');
} finally {
  await browser.close();
  server.kill();
}
