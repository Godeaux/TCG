// Dedicated QA account only. Appearance writes are restored in finally.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
if (process.env.TCG_LIVE_UI !== '1') throw Error('Explicit live QA opt-in required');
const server = spawn('python3', ['-m', 'http.server', '8183', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
const browser = await chromium.launch({ channel: 'chrome' });
const p = await browser.newPage();
p.setDefaultTimeout(15000);
const out = 'docs/player-experience';
await fs.mkdir(out, { recursive: true });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
let original, profileId;
async function screenshot(name) {
  await p.mouse.move(0, 0);
  await p.evaluate(() => document.activeElement?.blur());
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/${name}.png` });
}
try {
  await p.goto('http://127.0.0.1:8183');
  await p.locator('#menu-profile').click();
  const a = JSON.parse(await fs.readFile('/tmp/tcg-ui-phase2-account.json', 'utf8'));
  await p.locator('#login-username').fill(a.username);
  await p.locator('#login-pin').fill(a.pin);
  await p.locator('#login-submit').click();
  await expect(p.locator('#menu-overlay')).toHaveClass(/active/, { timeout: 30000 });
  await p.locator('#menu-profile').click();
  await expect(p.locator('#player-experience')).toHaveClass(/active/);
  const data = await p.evaluate(async () => {
    const api = await import('/js/network/supabaseApi.js');
    const profile = await api.fetchProfile();
    return { id: profile.id, style: profile.name_style || {} };
  });
  profileId = data.id;
  original = data.style;
  await p.locator('[data-pe="appearance"]').click();
  for (const [field, name] of [
    ['favoriteArt', 'Axolotl'],
    ['bannerArt', 'Orca'],
    ['avatarArt', 'Hoatzin'],
  ]) {
    await p.locator(`[data-pe="pick-art"][data-field="${field}"]`).click();
    await p.locator('#pe-art-search').fill(name);
    await p.getByRole('button', { name: `Choose ${name}`, exact: true }).click();
  }
  await p.locator('[data-pe="save-appearance"]').click();
  await expect(p.locator('.pe-dialog')).toHaveCount(0);
  const saved = await p.evaluate(
    async (id) =>
      (await (await import('/js/network/supabaseApi.js')).fetchPublicProfile({ profileId: id }))
        .name_style,
    profileId
  );
  expect(saved.appearance).toEqual({
    favoriteArt: 'amphibian-prey-axolotl',
    bannerArt: 'fish-predator-orca',
    avatarArt: 'bird-prey-hoatzin',
  });
  await p.reload();
  await expect(p.locator('#menu-profile')).toHaveAccessibleName('View profile', { timeout: 20000 });
  await p.locator('#menu-profile').click();
  await expect(p.locator('.pe-profile-identity .pe-avatar')).toHaveAttribute(
    'src',
    /bird-prey-hoatzin/
  );
  for (const [tag, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 393, 852],
    ['small', 320, 568],
  ]) {
    await p.setViewportSize({ width, height });
    await screenshot(`${tag}-profile`);
    await p.locator('[data-pe="appearance"]').click();
    await screenshot(`${tag}-appearance`);
    await p.locator('[data-pe="close-dialog"]').click();
    await p.locator('[data-pe="collection"]').click();
    await p.locator('#pe-ownership').selectOption('all');
    await p.locator('#pe-animal').selectOption('fish');
    await p.locator('#pe-search').fill('orca');
    await expect(p.locator('.pe-grid .pe-tile')).toHaveCount(1);
    await p.locator('.pe-grid .pe-tile').click();
    if (width <= 700) {
      await expect(p.locator('.pe-mobile-inspection')).toBeVisible();
      await screenshot(`${tag}-inspect`);
      await p.locator('[data-pe="close-inspect"]').click();
      await expect(p.locator('#pe-search')).toHaveValue('orca');
    }
    await p.locator('#pe-search').fill('');
    await p.locator('#pe-animal').selectOption('all');
    await screenshot(`${tag}-collection`);
    const geometry = await p.locator('.pe-grid .canonical-card').evaluateAll((els) =>
      els.map((el) => {
        const b = el.getBoundingClientRect(),
          i = el.querySelector('.card-inner').getBoundingClientRect(),
          t = el.querySelector('.card-name').getBoundingClientRect();
        return { ratio: b.width / b.height, title: t.height / i.height };
      })
    );
    expect(geometry.length).toBeGreaterThan(0);
    for (const g of geometry) {
      expect(Math.abs(g.ratio - 5 / 7)).toBeLessThan(0.006);
      expect(Math.abs(g.title - 0.1)).toBeLessThan(0.005);
    }
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.locator('[data-pe="decks"]').click();
    await expect(p.locator('.deck-catalog-home')).toBeVisible();
    await p.locator('#library-collection').click();
    await expect(p.locator('#pe-search')).toBeVisible();
    await p.locator('[data-pe="home"]').click();
    await p.locator('#other-multiplayer').click();
    await expect(p.locator('#player-experience h1')).toHaveText('Play with Friends');
    await screenshot(`${tag}-friends`);
    await p.locator('[data-pe="room-code"]').click();
    await expect(p.locator('#lobby-code')).toBeVisible();
    await p.locator('#multiplayer-back').click();
    await p.locator('#menu-profile').click();
  }
  expect(errors).toEqual([]);
  console.log(
    'PASS live appearance save/reload/public read + desktop/mobile collection, inspector, filters, decks and friends entry'
  );
} finally {
  if (profileId && original)
    await p.evaluate(
      async ({ id, style }) => {
        await (
          await import('/js/network/supabaseApi.js')
        ).updateProfileNameStyle({ profileId: id, nameStyle: style });
      },
      { id: profileId, style: original }
    );
  await browser.close();
  server.kill();
}
