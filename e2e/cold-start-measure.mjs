// Local unthrottled browser measurements, not a mobile hardware/network benchmark.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.env.TCG_PERF_OUT || '/tmp/tcg-cold-start';
mkdirSync(out, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '8212', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const rows = [];
try {
  for (const width of [1440, 393]) {
    for (let repeat = 0; repeat < Number(process.env.TCG_PERF_REPEATS || 3); repeat++) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      const failures = [];
      const httpErrors = [];
      page.on('response', (r) => {
        if (r.status() >= 400) httpErrors.push({ url: r.url(), status: r.status() });
      });
      page.on('requestfailed', (r) =>
        failures.push({ url: r.url(), error: r.failure()?.errorText })
      );
      await page.goto('http://127.0.0.1:8212');
      await page.locator('#menu-decks').click();
      await page.locator('#library-collection').click();
      await page.locator('.pe-tile').first().waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.pe-grid img')].every((img) => img.complete)
      );
      const measurement = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const images = [...document.querySelectorAll('.pe-grid img')];
        return {
          navigation: {
            domContentLoadedMs: nav.domContentLoadedEventEnd,
            loadMs: nav.loadEventEnd,
          },
          paint: performance
            .getEntriesByType('paint')
            .map(({ name, startTime }) => ({ name, ms: startTime })),
          collectionReadyObservedMs: performance.now(),
          requests: resources.length,
          transferredBytes: resources.reduce((n, r) => n + r.transferSize, 0),
          images: {
            rendered: images.length,
            decoded: images.filter((img) => img.naturalWidth > 0).length,
            unavailable: images
              .filter((img) => !img.naturalWidth)
              .map((img) => ({
                src: img.getAttribute('src'),
                alt: img.alt,
                hidden: getComputedStyle(img).display === 'none',
              })),
          },
          largestResources: resources
            .filter((r) => r.encodedBodySize > 0)
            .sort((a, b) => b.encodedBodySize - a.encodedBodySize)
            .slice(0, 8)
            .map((r) => ({ path: new URL(r.name).pathname, bytes: r.encodedBodySize })),
        };
      });
      rows.push({ width, repeat, ...measurement, failures, httpErrors });
      await ctx.close();
    }
  }
  writeFileSync(
    `${out}/measurements.json`,
    JSON.stringify(
      {
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        tier: 'local unthrottled Chromium, fresh contexts; overlapping QA CPU load; not real-device or WAN benchmark',
        rows,
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      rows.map(({ width, navigation, requests, transferredBytes, images, failures }) => ({
        width,
        navigation,
        requests,
        transferredBytes,
        images,
        failures,
      }))
    )
  );
} finally {
  await browser.close();
  server.kill();
}
