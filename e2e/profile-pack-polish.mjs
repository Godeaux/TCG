// Real app navigation; dedicated QA login, no account/deck writes.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
if (process.env.TCG_LIVE_UI !== '1') throw Error('QA login requires TCG_LIVE_UI=1');
const out = 'docs/profile-pack-polish';
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
  await p.locator('#menu-profile').click();
  for (const [tag, w, h] of [
    ['pc', 1440, 900],
    ['phone', 393, 852],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/${tag}-profile-after.png` });
  }
  await p.locator('#collection-filter').selectOption('all');
  for (const [tag, w, h] of [
    ['pc', 1440, 900],
    ['phone', 393, 852],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.mouse.move(0, 0);
    await p.locator('.collection-grid').scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${tag}-collection.png` });
  }
  // Actual production pack generation/rendering; no persistence callbacks and
  // no pack-count mutation. This previews real cards, never fabricated inventory.
  const generated = await p.evaluate(async () => {
    const ui = await import('/js/ui.js');
    const state = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
    state.menu.stage = 'main';
    ui.renderGame(state);
    const pack = await import('/js/ui/overlays/PackOpeningOverlay.js');
    const cards = pack.startPackOpening();
    pack.renderPackOpeningOverlay({ menu: { stage: 'pack-opening' } }, {});
    return cards.map((c) => c.id);
  });
  for (const [tag, w, h] of [
    ['pc', 1440, 900],
    ['phone', 393, 852],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${tag}-pack-sealed.png` });
  }
  await p.locator('#pack-unopened').focus();
  await p.keyboard.down('Space');
  await p.waitForTimeout(1700);
  await p.keyboard.up('Space');
  await p.locator('#pack-reveal-all').waitFor({ state: 'visible' });
  await p.locator('#pack-reveal-all').click();
  await p.locator('#pack-done').waitFor({ state: 'visible' });
  await p.waitForTimeout(1200);
  for (const [tag, w, h] of [
    ['pc', 1440, 900],
    ['pc-small', 1280, 800],
    ['phone', 393, 852],
    ['phone-small', 375, 812],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    await p.locator('#pack-opening-overlay').evaluate((el) => (el.scrollTop = 0));
    await p.waitForTimeout(350);
    const layout = await p.evaluate(() => ({
      width: innerWidth,
      scroll: document.querySelector('#pack-opening-overlay').scrollWidth,
      cards: [...document.querySelectorAll('.pack-card .canonical-card')].map((el) => {
        const r = el.getBoundingClientRect(),
          art = el.querySelector('.card-image-container').getBoundingClientRect();
        return { w: r.width, h: r.height, art: art.height / r.height };
      }),
      badges: [...document.querySelectorAll('.pack-card-rarity-badge')].map((el) => {
        const badge = el.getBoundingClientRect(),
          card = el.parentElement.querySelector('.card').getBoundingClientRect();
        return badge.top >= card.bottom;
      }),
    }));
    expect(layout.scroll).toBeLessThanOrEqual(w + 1);
    expect(layout.cards).toHaveLength(generated.length);
    for (const c of layout.cards) expect(Math.abs(c.w / c.h - 5 / 7)).toBeLessThan(0.01);
    expect(layout.badges.every(Boolean)).toBe(true);
    await p.screenshot({ path: `${out}/${tag}-pack-revealed.png` });
    await p.locator('#pack-done').scrollIntoViewIfNeeded();
    await expect(p.locator('#pack-done')).toBeInViewport();
    await p.locator('.pack-card.revealed').last().hover();
    await p.waitForTimeout(350);
    const bottom = await p.evaluate(() => {
      const card = document.querySelector('.pack-card:last-child').getBoundingClientRect();
      const done = document.querySelector('#pack-done').getBoundingClientRect();
      return { cardBottom: card.bottom, doneTop: done.top };
    });
    expect(bottom.cardBottom + 26).toBeLessThanOrEqual(bottom.doneTop);
    await p.screenshot({ path: `${out}/${tag}-pack-actions.png` });
  }
  expect(errors).toEqual([]);
  console.log(
    'PASS real QA profile, real catalog and generated pack layout; keyboard opening, canonical proportions, rarity separation, reachable actions; no persistence callbacks'
  );
} finally {
  await b.close();
}
