// CP02 evidence: real cards, hand states, geometry/full-text audit, statuses, exhaustion.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const ROOT = '/Users/nut/.openclaw/workspace/food-chain-tcg';
const OUT = ROOT + '/docs/ui-overhaul/evidence/CP02';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8123', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const { chromium } = await import(ROOT + '/node_modules/@playwright/test/index.mjs');
const browser = await chromium.launch({
  executablePath: '/Users/nut/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
const errs = [];

async function toBoard(ctxOpts, tag) {
  const page = await browser.newPage(ctxOpts);
  page.on('pageerror', (e) => errs.push(tag + ' PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(tag + ' CONSOLE ' + m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => {
    if (!r.url().includes('favicon')) errs.push(tag + ' REQFAIL ' + r.url());
  });
  await page.goto('http://127.0.0.1:8123');
  await page.waitForFunction(() => !!window.__qa);
  await page.evaluate(() => document.getElementById('menu-other')?.click()); await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('other-ai')?.click()); await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('ai-deck-random')?.click()); await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#deck-select-grid > *')?.click()); await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('deck-random')?.click()); await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('deck-confirm')?.click()); await page.waitForTimeout(400);
  for (let i = 0; i < 8; i++) {
    const active = await page.evaluate(() => [...document.querySelectorAll('.overlay.active')].map((o) => o.id));
    if (!active.length) break;
    const clicked = await page.evaluate(() => {
      const ov = [...document.querySelectorAll('.overlay.active')].pop();
      const b = ov.querySelector('#setup-actions button, .setup-button-row button, .coin-flip-actions button, button:not([disabled])');
      if (b) { b.click(); return b.textContent.trim().slice(0, 30); }
      return null;
    });
    if (!clicked) break;
    await page.waitForTimeout(900);
  }
  await page.waitForFunction(() => !document.querySelector('.overlay.active'), { timeout: 20000 }).catch(() => errs.push(tag + ' TIMEOUT overlay'));
  await page.waitForTimeout(600);
  return page;
}

// DOM audit: hand/field card geometry, full text, art policy, statuses
const cardAudit = (page, tag) => page.evaluate((t) => {
  const out = { tag: t, cards: [] };
  const sel = '#active-hand .card:not(.back), .player-field .card, .opponent-field .card';
  for (const el of document.querySelectorAll(sel)) {
    const name = el.querySelector('.card-name');
    const eff = el.querySelector('.card-effect-text');
    const img = el.querySelector('.card-image');
    const cs = name ? getComputedStyle(name) : null;
    const r = el.getBoundingClientRect();
    out.cards.push({
      n: name?.textContent?.trim()?.slice(0, 24) ?? '?',
      w: Math.round(r.width), h: Math.round(r.height),
      ell: cs ? (cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap') : null,
      clip: eff ? eff.scrollHeight - eff.clientHeight : null,
      fit: img ? getComputedStyle(img).objectFit : 'none',
      st: el.querySelector('.card-status')?.dataset?.statuses ?? null,
      exh: el.classList.contains('exhausted-state'),
    });
  }
  const hg = document.getElementById('active-hand');
  out.docScroll = { sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight };
  out.handCount = hg ? hg.querySelectorAll('.card').length : -1;
  return out;
}, tag);

// ---- Phone ----
const ph = await toBoard({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true }, 'phone');
await ph.screenshot({ path: OUT + '/phone-393-board.png' });
errs.push('phone audit ' + JSON.stringify(await cardAudit(ph, 'phone')));
// hover/hold-free: focus first hand card via class to mimic inspect lift
await ph.evaluate(() => document.querySelector('#active-hand .card')?.classList.add('hand-focus'));
await ph.waitForTimeout(300);
await ph.screenshot({ path: OUT + '/phone-393-inspect.png' });
await ph.evaluate(() => document.querySelector('#active-hand .card')?.classList.remove('hand-focus'));
// history
await ph.click('#field-history-btn').catch(() => {});
await ph.waitForTimeout(400);
await ph.screenshot({ path: OUT + '/phone-393-history.png' });
await ph.close();

// ---- Desktop ----
const dp = await toBoard({ viewport: { width: 1440, height: 900 } }, 'desktop');
const st = await dp.evaluate(() => JSON.stringify(window.__qa.getState()).slice(0, 150));
errs.push('desktop state=' + st);
await dp.screenshot({ path: OUT + '/desktop-1440-board.png' });
errs.push('desktop audit ' + JSON.stringify(await cardAudit(dp, 'desktop')));
// desktop hover = mouse over first hand card (real focus path)
const box = await dp.evaluate(() => {
  const c = document.querySelector('#active-hand .card');
  if (!c) return null;
  const b = c.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
if (box) { await dp.mouse.move(box.x, box.y); await dp.waitForTimeout(600); }
await dp.screenshot({ path: OUT + '/desktop-1440-hover.png' });
errs.push('hover focus=' + await dp.evaluate(() => !!document.querySelector('#active-hand .card.hand-focus')));
// play a card if possible to exercise field render + exhaustion (summoning sick)
const played = await dp.evaluate(() => {
  const s = window.__qa.getState();
  const hand = s.players[0]?.hand ?? [];
  const res = window.__qa.act.playCard(0);
  return { handLen: hand.length, played: res?.success ?? false };
});
errs.push('playCard ' + JSON.stringify(played));
await dp.waitForTimeout(600);
await dp.screenshot({ path: OUT + '/desktop-1440-played.png' });
errs.push('after-play audit ' + JSON.stringify(await cardAudit(dp, 'after-play')));
await dp.close();
await browser.close(); srv.kill();
console.log(errs.join('\n'));
