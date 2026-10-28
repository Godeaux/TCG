// Real app navigation; dedicated QA login, no account/deck writes.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
if (process.env.TCG_LIVE_UI !== '1') throw Error('QA login requires TCG_LIVE_UI=1');
const out = 'docs/releases/v0.17-preview';
await fs.mkdir(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.TCG_CHROME });
let p = await b.newPage();
p.setDefaultTimeout(12000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
async function capture(name, location) {
  for (const [tag, w, h] of [
    ['pc', 1440, 900],
    ['phone', 393, 852],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(350);
    await p.evaluate(() => document.activeElement?.blur());
    if (location)
      await expect(p.locator('#settings-button-container')).toHaveAttribute(
        'data-location',
        location
      );
    await p.screenshot({ path: `${out}/${tag}-${name}.png` });
    if (location) {
      await expect(p.locator('#settings-fab')).toBeVisible();
      await p.locator('#settings-fab').click();
      await expect(p.locator('#settings-menu')).toHaveClass(/active/);
      await p.waitForTimeout(250);
      const r = await p.locator('#settings-menu').boundingBox();
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(w + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(h + 1);
      await p.screenshot({ path: `${out}/${tag}-${name}-open.png` });
      await p.keyboard.press('Escape');
      await expect(p.locator('#settings-fab')).toBeFocused();
    } else await expect(p.locator('#settings-fab')).toBeHidden();
  }
}
try {
  await p.goto(process.env.TCG_BASE || 'http://127.0.0.1:8162');
  await capture('home', 'home');
  await p.locator('#settings-fab').click();
  await p.locator('#settings-menu-settings').click();
  await capture('settings', null);
  await p.locator('#settings-overlay-done').click();
  await expect(p.locator('#settings-fab')).toBeVisible();
  await p.locator('#menu-find-match').click();
  await p.locator('#multiplayer-auth').click();
  const a = JSON.parse(await fs.readFile('/tmp/tcg-ui-phase2-account.json', 'utf8'));
  await p.locator('#login-username').fill(a.username);
  await p.locator('#login-pin').fill(a.pin);
  await p.locator('#login-submit').click();
  await p.locator('#login-overlay.active').waitFor({ state: 'hidden' });
  if (await p.locator('#multiplayer-overlay.active').count())
    await p.locator('#multiplayer-back').click();
  await p.locator('#menu-decks').click();
  await p.locator('.deck-preview-name').first().waitFor();
  await capture('library', 'library');
  await p.locator('.deck-preview-name').first().click();
  await capture('editor', 'editor');
  await p.locator('#deck-full-row .card').first().click();
  await capture('inspector', null);
  await p.locator('#card-hover-tooltip .tooltip-card-preview').click();
  await p.locator('#deck-exit').click();
  await p.locator('.deck-catalog-back-btn').click();
  // Isolate the board sample from the authenticated saved-deck flow.
  await p.close();
  p = await b.newPage();
  p.setDefaultTimeout(12000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(process.env.TCG_BASE || 'http://127.0.0.1:8162');
  await p.locator('#menu-other').click();
  await p.locator('#other-ai').click();
  await capture('setup', null);
  await p.locator('#ai-deck-random').click();
  await p.locator('.deck-select-panel--fish').click();
  await p.locator('#deck-random').click();
  await p.evaluate(async () => {
    (await import('/js/ui/input/dragAndDrop.js')).getLatestState().menu.aiSpeed = 'paused';
  });
  await p.locator('#deck-confirm').click();
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(800);
    if (!(await p.locator('.overlay.active').count())) break;
    const buttons = p.locator('.overlay.active button:visible:not([disabled])');
    if (await buttons.count()) await buttons.first().click();
  }
  await expect(p.locator('.overlay.active')).toHaveCount(0);
  await p.evaluate(async () => (await import('/js/ai/AIGameManager.js')).cleanupAI());
  await capture('board', 'game');
  await p.locator('.board-diagnostics summary').click();
  await p.screenshot({ path: `${out}/phone-board-tools.png` });
  await p.keyboard.press('Escape');
  const hit = await p.evaluate(() => {
    const r = document.querySelector('#rival-strip').getBoundingClientRect();
    return Boolean(document.elementFromPoint((r.left + r.right) / 2, 20)?.closest('#rival-strip'));
  });
  expect(hit).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    'PASS contextual anchors, dropdown bounds, Escape/focus, dialog hiding, real AI-board navigation; no page errors'
  );
} finally {
  await b.close();
}
