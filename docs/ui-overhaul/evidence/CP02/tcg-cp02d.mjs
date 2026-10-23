// CP02 evidence part 4: zero ATK / zero HP-remainder / zero NUT render correctly.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:8123');
await page.waitForFunction(() => !!window.__qa);

const zeros = await page.evaluate(async () => {
  const m = await import('/js/ui/components/Card.js');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#111;padding:12px;display:flex;gap:10px';
  document.body.appendChild(host);
  const cases = [
    { label: 'zero-atk-prey', card: { type: 'Prey', id: 'z1', name: 'Zero Zero Fish', atk: 0, hp: 2, currentAtk: 0, currentHp: 2, nutrition: 0, keywords: [], abilities: [] } },
    { label: 'buffed-damaged', card: { type: 'Predator', id: 'z2', name: 'Delta Fish', atk: 2, hp: 4, currentAtk: 5, currentHp: 1, keywords: [], abilities: [] } },
    { label: 'spell-no-stats', card: { type: 'Spell', id: 'z3', name: 'No Stats Spell', keywords: [], abilities: [] } },
  ];
  const out = [];
  for (const c of cases) {
    const el = m.renderCard(c.card, { context: 'field' });
    el.style.width = '200px';
    host.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 250));
  host.querySelectorAll('.card').forEach((el, i) => {
    const stats = el.querySelector('.card-stats-text');
    out.push({
      label: cases[i].label,
      text: stats ? stats.textContent.replace(/\s+/g, ' ').trim() : null,
      hasZero: stats ? stats.textContent.includes('0') : null,
      classes: stats ? [...stats.querySelectorAll('span')].map((s) => s.className) : [],
    });
  });
  return out;
});
errs.push('zeros ' + JSON.stringify(zeros));
await page.screenshot({ path: OUT + '/desktop-1440-zero-stats.png' });
await browser.close(); srv.kill();
console.log(errs.join('\n'));
