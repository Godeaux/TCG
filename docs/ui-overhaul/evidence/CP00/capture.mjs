// CP00 baseline screenshots of the REAL app driven through the production
// Play-vs-AI flow. Usage: node /tmp/tcg-shot.mjs <outdir>
import { chromium } from '/Users/nut/.openclaw/workspace/food-chain-tcg/node_modules/@playwright/test/index.mjs';
import { mkdirSync } from 'fs';

const out = process.argv[2] || '/tmp/tcg-shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    '/Users/nut/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
const pageErrors = [];

async function openBoard(width, height, touch) {
  const p = await browser.newPage({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
  });
  pageErrors.push = pageErrors.push.bind(pageErrors);
  p.on('pageerror', (e) => pageErrors.push(`${width}s: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${width}c: ${m.text()}`);
  });
  await p.goto('http://127.0.0.1:8123', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!window.__qa, null, { timeout: 20000 });
  await p.waitForSelector('#menu-overlay.active', { timeout: 10000 });
  await p.click('#menu-other');
  await p.click('#other-ai');
  await p.click('#ai-deck-random');
  await p.waitForSelector('#deck-select-overlay.active');
  await p.click('#deck-select-grid > *:nth-child(1)');
  await p.waitForSelector('#deck-overlay.active');
  await p.click('#deck-random');
  await p.click('#deck-confirm');
  await p.waitForSelector('#setup-overlay.active', { timeout: 10000 });
  // Roll dice if a roll button is offered, then take any offered choices.
  for (let i = 0; i < 6; i++) {
    const done = await p.evaluate(() => {
      const btns = [...document.querySelectorAll('#setup-actions button')].filter(
        (b) => b.offsetParent !== null
      );
      if (btns.length) {
        btns[0].click();
        return false;
      }
      const setupActive = document.querySelector('#setup-overlay')?.classList.contains('active');
      return !setupActive;
    });
    if (done) break;
    await p.waitForTimeout(1200);
  }
  await p
    .waitForFunction(
      () => !document.querySelector('#setup-overlay')?.classList.contains('active'),
      null,
      { timeout: 25000 }
    )
    .catch(() => {});
  await p.waitForTimeout(1500);
  return p;
}

const shots = [];
// Phone 393x852 (approved reference viewport)
let p = await openBoard(393, 852, true);
await p.screenshot({ path: `${out}/phone-393-board.png` });
shots.push([
  'phone-393-board',
  await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]),
]);
// Open history drawer if present for a history-region baseline
const histBtn = await p.$('#history-toggle, [data-action="toggle-history"], #history-button');
if (histBtn) {
  await histBtn.click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/phone-393-history.png` });
}
await p.close();

// Phone 375x812
p = await openBoard(375, 812, true);
await p.screenshot({ path: `${out}/phone-375-board.png` });
shots.push([
  'phone-375-board',
  await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]),
]);
await p.close();

// Desktop 1440x900
p = await openBoard(1440, 900, false);
await p.screenshot({ path: `${out}/desktop-1440-board.png` });
shots.push([
  'desktop-1440-board',
  await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]),
]);
await p.close();

// Menu baselines (no game)
for (const [name, w, h, touch] of [
  ['phone-393-menu', 393, 852, true],
  ['desktop-1440-menu', 1440, 900, false],
]) {
  const mp = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch });
  await mp.goto('http://127.0.0.1:8123', { waitUntil: 'domcontentloaded' });
  await mp.waitForFunction(() => !!window.__qa, null, { timeout: 20000 });
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${out}/${name}.png` });
  await mp.close();
}

await browser.close();
console.log(JSON.stringify({ shots, pageErrors: pageErrors.slice(0, 15) }, null, 1));
