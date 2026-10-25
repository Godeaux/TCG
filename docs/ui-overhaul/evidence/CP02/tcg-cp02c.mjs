// CP02 evidence part 3: exhausted visual applied to .card-inner, hand 0/1/5/9 geometry.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const ROOT = '/Users/nut/.openclaw/workspace/food-chain-tcg';
const OUT = ROOT + '/docs/ui-overhaul/evidence/CP02';
const srv = spawn('python3', ['-m', 'http.server', '8123', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const { chromium } = await import(ROOT + '/node_modules/@playwright/test/index.mjs');
const browser = await chromium.launch({
  executablePath: '/Users/nut/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
const errs = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

// 1) Exhausted visual: measure inner filter + slot transform on real field cards.
const exh = await page.evaluate(async () => {
  const m = await import('/js/ui/components/Card.js');
  const slot = document.querySelector('.player-field .field-slot');
  if (!slot) return { error: 'no field slot; play a card first' };
  const card = { type: 'Predator', id: 'synth-exh', name: 'Exhaustion Probe', atk: 3, hp: 2, currentAtk: 3, currentHp: 2, keywords: [], abilities: [] };
  const el = m.renderCard(card, { context: 'field' });
  el.classList.add('exhausted-state');
  slot.innerHTML = '';
  slot.appendChild(el);
  await new Promise((r) => setTimeout(r, 250));
  const inner = el.querySelector('.card-inner');
  const cs = getComputedStyle(inner);
  const out = { innerFilter: cs.filter, cardTransform: getComputedStyle(el).transform, artOpacity: getComputedStyle(el.querySelector('.card-image') || inner).opacity };
  el.remove();
  return out;
});
errs.push('exhaustedVisual ' + JSON.stringify(exh));

// 2) Hand counts 0/1/5/9 via the production hand renderer.
const hands = await page.evaluate(async () => {
  const m = await import('/js/ui/components/Hand.js');
  const state = window.__qa.getState();
  // Deep-copy so each iteration can inject a synthetic hand into players[0].
  const base = JSON.parse(JSON.stringify(state));
  const out = [];
  for (const n of [0, 1, 5, 9]) {
    const hand = Array.from({ length: n }, (_, i) => ({
      type: 'Predator', id: 'synth-h', name: i === 8 ? 'Extra Long Named Fish' : 'Hand Card ' + (i + 1),
      instanceId: 'h' + i, atk: 1, hp: 1, currentAtk: 1, currentHp: 1, keywords: [], abilities: [], nutrition: null,
    }));
    const fake = JSON.parse(JSON.stringify(base));
    fake.activePlayerIndex = fake.activePlayer ?? 0;
    fake.players[0].hand = hand;
    // AI modes render player 0's hand from live state; point the live hand at ours.
    window.__qa.overrideHandForTest?.(fake);
    try { m.renderHand(fake, {}); } catch (e) { return { error: 'renderHand ' + e.message }; }
    await new Promise((r) => setTimeout(r, 300));
    const cards = [...document.querySelectorAll('#active-hand .card')];
    const zones = cards.map((c) => { const b = c.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right) }; });
    const doc = document.documentElement;
    out.push({
      n,
      rendered: cards.length,
      width: zones[0]?.w ?? null,
      height: zones[0]?.h ?? null,
      overflowX: zones.length ? Math.max(...zones.map((z) => z.r)) - window.innerWidth : 0,
      hScroll: doc.scrollWidth - doc.clientWidth,
      vScroll: doc.scrollHeight - doc.clientHeight,
    });
  }
  return out;
});
errs.push('hands ' + JSON.stringify(hands));
await page.screenshot({ path: OUT + '/desktop-1440-hand-9.png' });
// phone hand 9
await page.setViewportSize({ width: 393, height: 852 });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/phone-393-hand-9.png' });
errs.push('DONE');
await browser.close(); srv.kill();
console.log(errs.join('\n'));
