// CP02 evidence part 5: real touch tap/hold/scroll/cancel — no accidental actions.
import { spawn } from 'node:child_process';
const ROOT = '/Users/nut/.openclaw/workspace/food-chain-tcg';
const OUT = ROOT + '/docs/ui-overhaul/evidence/CP02';
const srv = spawn('python3', ['-m', 'http.server', '8123', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const { chromium } = await import(ROOT + '/node_modules/@playwright/test/index.mjs');
const browser = await chromium.launch({
  executablePath: '/Users/nut/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:8123');
await page.waitForFunction(() => !!window.__qa);
await page.evaluate(() => document.getElementById('menu-other')?.click()); await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('other-ai')?.click()); await page.waitForTimeout(200);
await page.evaluate(() => document.getElementById('ai-deck-random')?.click()); await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('#deck-select-grid > *')?.click()); await page.waitForTimeout(800);
await page.evaluate(() => document.getElementById('deck-random')?.click()); await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('deck-confirm')?.click()); await page.waitForTimeout(400);
for (let i = 0; i < 8; i++) {
  if (!(await page.evaluate(() => document.querySelectorAll('.overlay.active').length))) break;
  await page.evaluate(() => {
    const ov = [...document.querySelectorAll('.overlay.active')].pop();
    (ov.querySelector('button:not([disabled])'))?.click();
  });
  await page.waitForTimeout(900);
}
await page.waitForFunction(() => !document.querySelector('.overlay.active'), { timeout: 20000 }).catch(() => errs.push('overlay timeout'));

const snap = () => page.evaluate(() => {
  const s = window.__qa.getState();
  return JSON.stringify({ hand: s.players[0].hand.length, field: s.players[0].field.filter(Boolean).length, hp: s.players[0].hp, logLen: (s.recentLog || []).length });
});
const before = await snap();

const cardBox = async () => page.evaluate(() => {
  const c = document.querySelector('#active-hand .card');
  if (!c) return null;
  const b = c.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});

// 1) quick tap on a hand card (inspect/select) — must not play/attack
let b = await cardBox();
await page.touchscreen.tap(b.x, b.y);
await page.waitForTimeout(500);
const afterTap = await snap();
errs.push('after tap same=' + (afterTap === before));
await page.screenshot({ path: OUT + '/phone-393-tap.png' });

// 2) touch-drag up toward field then cancel back (touchend on same card = not a play)
b = await cardBox();
await page.touchscreen.tap(b.x, b.y).catch(() => {}); // ensure hit
// manual drag: dispatch real touch sequence via CDP-less Playwright low-level
const cdp = await ctx.newCDPSession(page);
const drag = async (x0, y0, x1, y1, holdMs) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] });
  }
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
b = await cardBox();
await drag(b.x, b.y, b.x, b.y - 320, 100); // drag up toward field, end over field = attempted play
await page.waitForTimeout(600);
const afterDragUp = await snap();
await page.screenshot({ path: OUT + '/phone-393-drag-cancel.png' });
// 3) hold in place (long press) — must not fire an action
b = await cardBox();
await drag(b.x, b.y, b.x, b.y, 800);
await page.waitForTimeout(500);
const afterHold = await snap();
errs.push('hold same as tap=' + (afterHold === afterTap) + ' dragUp changed=' + (afterDragUp !== before) + ' (cost-locked turn1 play may legally reject)');
errs.push('before ' + before + ' afterTap ' + afterTap + ' afterDragUp ' + afterDragUp + ' afterHold ' + afterHold);

// 4) vertical scroll on page must not trigger a card action
await drag(196, 700, 196, 500, 0);
await page.waitForTimeout(400);
const afterScroll = await snap();
errs.push('scroll same=' + (afterScroll === afterHold));
errs.push('DONE');
await browser.close(); srv.kill();
console.log(errs.join('\n'));
