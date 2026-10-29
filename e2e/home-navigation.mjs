import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
const server = spawn('python3', ['-m', 'http.server', '8174', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
process.on('exit', () => server.kill());
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
await fs.mkdir('docs/home-navigation', { recursive: true });
try {
  const p = await browser.newPage();
  p.setDefaultTimeout(15000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  for (const [width, height] of [
    [1440, 900],
    [393, 852],
    [375, 600],
    [320, 568],
  ]) {
    await p.setViewportSize({ width, height });
    await p.mouse.move(0, 0);
    await p.goto(process.env.TCG_BASE || 'http://127.0.0.1:8174');
    await expect(p.locator('#settings-button-container')).toHaveAttribute('data-location', 'home');
    await expect(p.locator('.menu-actions-grid button:visible')).toHaveCount(4);
    await p.waitForTimeout(400);
    await expect(p.locator('#menu-other')).toHaveText('Practice');
    const practice = await p.locator('#menu-other').boundingBox();
    const decks = await p.locator('#menu-decks').boundingBox();
    expect(practice.x).toBeLessThan(decks.x);
    expect(Math.abs(practice.y - decks.y)).toBeLessThan(1);
    await expect(p.locator('#menu-profile')).toHaveAccessibleName('Log in');
    const account = await p.locator('#menu-profile').boundingBox();
    const menu = await p.locator('#settings-fab').boundingBox();
    expect(account.x + account.width).toBeLessThan(menu.x);
    expect(Math.abs(account.y - menu.y)).toBeLessThan(1);
    const help = await p.locator('#other-tutorial').boundingBox();
    expect(help.height).toBeGreaterThanOrEqual(44);
    expect(height - help.y - help.height).toBeLessThanOrEqual(35);
    const tip = await p.locator('#menu-splash-text').boundingBox();
    expect(tip.y + tip.height).toBeLessThanOrEqual(help.y);
    await p.screenshot({ animations: 'disabled', path: `docs/home-navigation/${width}-home.png` });
    await p.locator('#menu-profile').click();
    await expect(p.locator('#login-overlay')).toHaveClass(/active/);
    expect(
      await p.evaluate(
        async () => (await import('/js/ui/input/dragAndDrop.js')).getLatestState().menu.profile
      )
    ).toBeFalsy();
    await p.reload();
    await p.locator('#menu-other').click();
    await expect(p.locator('#ai-setup-overlay')).toHaveClass(/active/);
    await expect(p.locator('#ai-vs-ai')).toBeHidden();
    await p.locator('.practice-advanced summary').click();
    await expect(p.locator('#ai-vs-ai')).toBeVisible();
    await p.screenshot({ animations: 'disabled', path: `docs/home-navigation/${width}-practice.png` });
    await p.locator('#ai-vs-ai').click();
    await expect(p.locator('#ai-vs-ai-deck-overlay')).toHaveClass(/active/);
    await p.reload();
    await p.locator('#settings-fab').click();
    await expect(p.locator('#settings-menu-view')).toHaveCount(0);
    await expect(p.locator('#other-credits')).toBeVisible();
    const box = await p.locator('#settings-menu').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await p.waitForTimeout(350);
    await p.screenshot({ animations: 'disabled', path: `docs/home-navigation/${width}-menu.png` });
    await p.keyboard.press('Escape');
    await expect(p.locator('#settings-fab')).toBeFocused();
    await p.locator('#settings-fab').click();
    await p.locator('#other-credits').click();
    await expect(p.locator('#credits-overlay')).toHaveClass(/active/);
    await p.locator('#credits-back').click();
    await expect(p.locator('#menu-overlay')).toHaveClass(/active/);
    await p.locator('#other-tutorial').click();
    await expect(p.locator('#tutorial-overlay')).toHaveClass(/active/);
    await p.reload();
    await p.locator('#settings-fab').click();
    await p.locator('#settings-menu-settings').click();
    await expect(p.locator('#settings-floating-overlay')).toHaveClass(/active/);
    await p.locator('#settings-overlay-done').click();
    await p.locator('#settings-fab').click();
    await p.locator('#settings-menu-report').click();
    await expect(p.locator('#bug-title-input')).toBeVisible();
    await expect(p.locator('#bug-tab-list')).toHaveCount(0);
    await p.screenshot({ animations: 'disabled', path: `docs/home-navigation/${width}-report.png` });
    await p.locator('#bug-overlay-close').click();
    await p.locator('#other-multiplayer').click();
    await expect(p.locator('#player-experience h1')).toHaveText('Play with Friends');
    await p.locator('[data-pe="room-code"]').click();
    await expect(p.locator('#lobby-create')).toBeVisible();
    await expect(p.locator('#lobby-code')).toBeVisible();
    await expect(p.locator('#multiplayer-overlay')).toHaveClass(/active/);
    await p.locator('#multiplayer-back').click();
    await p.locator('#menu-find-match').click();
    await expect(p.locator('#multiplayer-overlay')).toHaveClass(/active/);
    await p.locator('#multiplayer-back').click();
    await p.locator('#menu-decks').click();
    await expect(p.locator('.deck-catalog-home')).toBeVisible();
    await expect(p.locator('#menu-profile')).toBeHidden();
    await expect(p.locator('.library-guest-intro')).toBeVisible();
    await expect(p.locator('#deck-select-overlay')).toHaveCSS('opacity', '1');
    await expect(p.locator('#menu-overlay')).toHaveCSS('opacity', '0');
    await p.screenshot({ path: `docs/home-navigation/${width}-library.png` });
    await p.locator('#settings-fab').click();
    await expect(p.locator('#other-credits')).toBeHidden();
    await p.keyboard.press('Escape');
    await p.locator('#library-collection').click();
    await expect(p.locator('#player-experience h1')).toHaveText('My Cards');
    console.log(
      `PASS ${width}x${height}: home composition, login, practice, decks, credits, tutorial, sound/settings, bug report and Escape`
    );
  }
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  server.kill();
}
