// CP02 evidence part 2: field play (exhaustion) + synthetic status/strength/long-text grid.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push('CONSOLE ' + m.text().slice(0, 140)); });
page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP' + r.status() + ' ' + r.url().slice(0, 120)); });
await page.goto('http://127.0.0.1:8123');
await page.waitForFunction(() => !!window.__qa);
await page.evaluate(() => document.getElementById('menu-other')?.click()); await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('other-ai')?.click()); await page.waitForTimeout(200);
await page.evaluate(() => document.getElementById('ai-deck-random')?.click()); await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('#deck-select-grid > *')?.click()); await page.waitForTimeout(800);
await page.evaluate(() => document.getElementById('deck-random')?.click()); await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('deck-confirm')?.click()); await page.waitForTimeout(400);
for (let i = 0; i < 8; i++) {
  const active = await page.evaluate(() => [...document.querySelectorAll('.overlay.active')].length);
  if (!active) break;
  await page.evaluate(() => {
    const ov = [...document.querySelectorAll('.overlay.active')].pop();
    (ov.querySelector('#setup-actions button, .setup-button-row button, .coin-flip-actions button, button:not([disabled])'))?.click();
  });
  await page.waitForTimeout(900);
}
await page.waitForFunction(() => !document.querySelector('.overlay.active'), { timeout: 20000 }).catch(() => errs.push('overlay timeout'));

// Wait for our turn, then play every affordable hand card (up to 4 tries).
let playedCount = 0;
for (let round = 0; round < 6; round++) {
  // Wait for our turn instead of bailing out.
  let mine = false;
  for (let t = 0; t < 20; t++) {
    mine = await page.evaluate(() => { const s = window.__qa.getState(); return s.activePlayer === s.localPlayer && !document.querySelector('.overlay.active'); });
    if (mine) break;
    await page.waitForTimeout(1200);
  }
  if (!mine) { errs.push('turn wait timeout round=' + round); break; }
  const res = await page.evaluate(() => {
    const s = window.__qa.getState();
    let played = 0;
    for (let i = (s.players[0].hand.length - 1); i >= 0 && played < 4; i--) {
      const r = window.__qa.act.playCard(i);
      if (r?.success) played++;
    }
    return { played, hand: window.__qa.getState().players[0].hand.length };
  });
  playedCount += res.played || 0;
  await page.waitForTimeout(500);
  if (playedCount > 0) break; // one successful play round is enough for exhaustion evidence
  await page.evaluate(() => window.__qa.act.endTurn?.());
  await page.waitForTimeout(900);
}
errs.push('playedCount=' + playedCount);
const fieldAudit = await page.evaluate(() => {
  const out = { fieldCards: [], exhausted: 0 };
  document.querySelectorAll('.player-field .card, .opponent-field .card').forEach((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.fieldCards.push({
      n: el.querySelector('.card-name')?.textContent?.trim()?.slice(0, 20),
      exh: el.classList.contains('exhausted-state'),
      filter: cs.filter, opacity: cs.opacity,
      w: Math.round(r.width), h: Math.round(r.height),
      ell: (() => { const n = el.querySelector('.card-name'); return n ? getComputedStyle(n).textOverflow : null; })(),
    });
    if (el.classList.contains('exhausted-state')) out.exhausted++;
  });
  return out;
});
errs.push('fieldAudit ' + JSON.stringify(fieldAudit));
await page.screenshot({ path: OUT + '/desktop-1440-field-exhausted.png' });

// Synthetic status / strength / long-text grid rendered by the real renderer.
const synth = await page.evaluate(async () => {
  const m = await import('/js/ui/components/Card.js');
  const host = document.createElement('div');
  host.id = 'cp02-synth';
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#111;padding:12px;display:flex;gap:10px;flex-wrap:wrap;width:1440px';
  document.body.appendChild(host);
  const base = { type: 'Predator', id: 'synth', name: 'Synth', atk: 2, hp: 3, currentAtk: 2, currentHp: 3, keywords: [], abilities: [] };
  const cases = [
    { label: 'barrier', card: { ...base, instanceId: 'a', name: 'Barrier Beast', hasBarrier: true } },
    { label: 'frozen', card: { ...base, instanceId: 'b', name: 'Frozen Fish', frozen: true } },
    { label: 'paralyzed', card: { ...base, instanceId: 'c', name: 'Paralyzed Pike', paralyzed: true, frozenDiesTurn: 2 } },
    { label: 'drydropped+cancelled', card: { ...base, instanceId: 'd', name: 'Dry Dropped Darter', dryDropped: true, abilitiesCancelled: true } },
    { label: 'token+strength', card: { ...base, instanceId: 'e', name: 'Token Lancetfish', isToken: true, currentAtk: 5 } },
    { label: 'longtext', card: { ...base, type: 'Prey', nutrition: 3, instanceId: 'f', name: 'Extremely Verbose Velvetfish', effectText: 'When summoned: draw a card. Then, if you control a predator with greater than 4 attack, deal 1 damage to each opposing creature. At the end of your turn, restore 1 nutrition. This ability triggers once per turn and cannot be responded to by trap cards, and it still functions while this card would otherwise be affected by dry drop restrictions elsewhere in the rules text.' } },
  ];
  const report = [];
  for (const c of cases) {
    const el = m.renderCard(c.card, { showEffectSummary: true, state: window.__qa.getState(), ownerIndex: 0, context: 'field' });
    el.style.width = '200px';
    host.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 250));
  host.querySelectorAll('.card').forEach((el, i) => {
    const eff = el.querySelector('.card-effect-text');
    report.push({
      label: cases[i]?.label,
      status: el.querySelector('.card-status')?.dataset?.statuses ?? null,
      statsText: el.querySelector('.card-stats-text')?.textContent?.replace(/\s+/g, ' ')?.trim() ?? null,
      nameEllipsis: (() => { const n = el.querySelector('.card-name'); return n ? getComputedStyle(n).textOverflow : null; })(),
      nameOverflow: (() => { const n = el.querySelector('.card-name'); if (!n) return null; return n.scrollHeight - n.clientHeight; })(),
      fullTextInDom: eff ? eff.dataset.fullText === 'true' : null,
      textComplete: eff ? eff.textContent.length > 40 : null,
      overflowScrolls: eff ? eff.scrollHeight > eff.clientHeight : null,
      cardClips: (() => { const c = el.querySelector('.card-content-area'); return c ? c.scrollHeight - c.clientHeight : null; })(),
    });
  });
  return report;
});
errs.push('synth ' + JSON.stringify(synth, null, 0));
await page.screenshot({ path: OUT + '/desktop-1440-status-grid.png' });

// Phone version of the same grid
const phoneShot = page;
await page.setViewportSize({ width: 393, height: 852 });
await page.evaluate(() => {
  const h = document.getElementById('cp02-synth');
  if (h) { h.style.width = '393px'; }
});
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/phone-393-status-grid.png' });
errs.push('DONE');
await browser.close(); srv.kill();
console.log(errs.join('\n'));
