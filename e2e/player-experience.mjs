import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8185', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 400));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [width, height] of [
    [1440, 900],
    [393, 852],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:8185');
    await page.locator('#menu-decks').click();
    await expect(page.locator('.deck-catalog-home')).toBeVisible();
    await page.locator('#library-collection').click();
    await expect(page.locator('#player-experience')).toHaveClass(/active/);
    await page.locator('#pe-search').fill('orca');
    await expect(page.locator('.pe-grid .pe-tile')).toHaveCount(1);
    const proportions = await page.locator('.pe-grid .canonical-card').evaluate((el) => {
      const box = el.getBoundingClientRect();
      const inner = el.querySelector('.card-inner').getBoundingClientRect();
      const title = el.querySelector('.card-name').getBoundingClientRect();
      return [box.width / box.height, title.height / inner.height];
    });
    expect(Math.abs(proportions[0] - 5 / 7)).toBeLessThan(0.006);
    expect(Math.abs(proportions[1] - 0.1)).toBeLessThan(0.005);
    await page.locator('.pe-grid .pe-tile').click();
    if (width <= 700) {
      await expect(page.locator('.pe-mobile-inspection')).toBeVisible();
      await page.locator('[data-pe="close-inspect"]').click();
    }
    await expect(page.locator('#pe-search')).toHaveValue('orca');
    await page.locator('#pe-search').fill('no such creature');
    await expect(page.locator('.pe-grid .pe-tile')).toHaveCount(0);
    await page.locator('#pe-search').fill('');
    expect(await page.locator('.pe-grid .pe-tile').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.locator('[data-pe="home"]').click();
    await page.locator('#other-multiplayer').click();
    await expect(page.locator('#player-experience h1')).toHaveText('Play with Friends');
    await page.locator('[data-pe="room-code"]').click();
    await expect(page.locator('#lobby-code')).toBeVisible();
  }
  expect(errors).toEqual([]);
  console.log(
    'PASS player workspace: real cards, search, inspection, navigation, three viewport sizes'
  );
} finally {
  await browser.close();
  server.kill();
}
