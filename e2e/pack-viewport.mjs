import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
const server = spawn('python3', ['-m', 'http.server', '8173', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const out = 'docs/profile-pack-polish/viewport';
await fs.mkdir(out, { recursive: true });
try {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://127.0.0.1:8173');
  await p.waitForFunction(() => !!window.__qa);
  await p.evaluate(async () => {
    const pack = await import('/js/ui/overlays/PackOpeningOverlay.js');
    pack.startPackOpening();
    pack.renderPackOpeningOverlay({ menu: { stage: 'pack-opening' } }, {});
  });
  await p.locator('#pack-unopened').focus();
  await p.keyboard.down('Space');
  await p.waitForTimeout(1700);
  await p.keyboard.up('Space');
  await p.locator('#pack-reveal-all').click();
  await expect(p.locator('#pack-done')).toBeVisible();
  await p.waitForTimeout(1800);
  const finishes = await p.locator('.pack-card').evaluateAll(wrappers => wrappers.map(wrapper => {
    const card = wrapper.querySelector('.canonical-card');
    return { awarded: wrapper.dataset.rarity, rendered: card?.dataset.rarity,
      seal: card?.querySelector('.card-rarity-seal')?.getAttribute('aria-label') };
  }));
  expect(finishes).toHaveLength(5);
  for (const finish of finishes) {
    expect(finish.rendered).toBe(finish.awarded);
    expect(finish.seal).toBe(`${finish.awarded} rarity`);
  }
  for (const [width, height] of [
    [320, 568],
    [375, 600],
    [375, 667],
    [375, 812],
    [393, 740],
    [393, 852],
    [430, 932],
    [1440, 900],
  ]) {
    await p.setViewportSize({ width, height });
    // Include the real save-status slot without making any persistence call.
    await p.locator('#pack-save-status').evaluate((el) => {
      el.textContent = 'Cards saved to collection!';
      el.style.display = '';
    });
    await p.waitForTimeout(250);
    const bounds = await p.evaluate(() => {
      const overlay = document.querySelector('#pack-opening-overlay');
      return {
        scroll: overlay.scrollHeight - overlay.clientHeight,
        rects: [
          ...document.querySelectorAll(
            '#pack-cards-phase .pack-card, #pack-cards-phase .pack-card-rarity-badge, #pack-cards-phase .pack-opening-title, #pack-save-status, #pack-done'
          ),
        ].map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        }),
      };
    });
    expect(bounds.scroll, `${width}x${height} scroll`).toBeLessThanOrEqual(1);
    for (const r of bounds.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(width);
      expect(r.bottom).toBeLessThanOrEqual(height);
    }
    await p.screenshot({ path: `${out}/${width}x${height}.png` });
    console.log(
      `PASS ${width}x${height}: all five cards, labels, status and Done fit without scrolling`
    );
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  server.kill();
}
