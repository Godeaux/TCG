// Component evidence plus real Collection navigation; not a played-match certification.
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn('python3', ['-m', 'http.server', '8198', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 500));
const browser =
  process.env.TCG_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch(
        process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
      );
const failures = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8198');
  await page.waitForFunction(() => window.__qa);
  const result = await page.evaluate(async () => {
    const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { resolveEffectResult } = await import('/js/game/effects.js');
    const { showCardTooltip, hideCardTooltipImmediate } =
      await import('/js/ui/components/CardTooltip.js');
    const c = createCardInstance(getCardDefinitionById('fish-predator-great-white-shark'), 1);
    s.players[0].field = [c, null, null];
    s.turn = 3;
    s.activePlayerIndex = 0;
    resolveEffectResult(s, { paralyzeCreature: { creature: c } }, { playerIndex: 0 });
    showCardTooltip(c, document.querySelector('#menu-other'));
    const info = document.querySelector('#tooltip-info-boxes').innerText;
    hideCardTooltipImmediate();
    s.menu.stage = 'catalog';
    const names = ['Deck" data-audit="injected', '<b>海 & "Birds"</b>', 'O’Brien 🦈'];
    const values = [];
    for (const name of names) {
      s.menu.success = `Deck ${name} saved successfully!`;
      s.menu.error = `Could not save ${name}`;
      s.catalogBuilder = {
        stage: 'build',
        deckId: 'fish',
        selections: [],
        available: [],
        catalogOrder: [],
        editingDeckName: name,
      };
      (await import('/js/ui/overlays/DeckBuilderOverlay.js')).renderCatalogBuilderOverlay(s, {});
      const input = document.querySelector('#deck-name-input');
      const success = document.querySelector('.deck-status-success');
      const error = document.querySelector('.deck-status-error');
      values.push(
        input.value === name &&
          !input.hasAttribute('data-audit') &&
          success.textContent === s.menu.success &&
          error.textContent === s.menu.error &&
          !success.querySelector('*') &&
          !error.querySelector('*')
      );
    }
    showCardTooltip(c, document.querySelector('#menu-other'));
    return { info, values };
  });
  if (!result.info.includes('Paralyzed') || !result.info.includes('turn 3'))
    failures.push('missing paralysis/deadline');
  if (!result.values.every(Boolean)) failures.push('deck names are not literal');
  await page.keyboard.press('Escape');
  if (await page.locator('#card-hover-tooltip').evaluate((el) => el.classList.contains('visible')))
    failures.push('Escape does not dismiss');
  assert.deepEqual(failures, []);
  // With no close button or navigation, the dialog itself retains keyboard focus.
  await page.evaluate(async () => {
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { showCardTooltip } = await import('/js/ui/components/CardTooltip.js');
    showCardTooltip(
      getCardDefinitionById('fish-predator-great-white-shark'),
      document.querySelector('#menu-other'),
      { modal: true }
    );
  });
  await expect(page.locator('.inspection-close')).toHaveCount(0);
  await expect(page.locator('#card-hover-tooltip')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#card-hover-tooltip')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#card-hover-tooltip')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#card-hover-tooltip')).not.toHaveClass(/visible/);

  for (const [width, height] of [
    [1440, 900],
    [393, 852],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:8198');
    await page.locator('#menu-decks').click();
    await page.locator('#library-collection').click();
    await page.locator('#pe-search').fill('Black Leopards');
    const tile = page.locator('.pe-grid .pe-tile');
    await tile.click();
    const tip = page.locator('#card-hover-tooltip');
    await expect(tip).toHaveClass(/inspection-modal/);
    await expect(tip).toContainText('Ambush');
    const layout = await tip.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        css = getComputedStyle(el);
      const backdrop = document.querySelector('.inspection-backdrop');
      return {
        fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
        background: css.backgroundColor,
        blur: getComputedStyle(backdrop).backdropFilter,
        inert: document.querySelector('#player-experience').inert,
      };
    });
    assert.equal(layout.fits, true, JSON.stringify(layout));
    assert.equal(layout.background, 'rgba(0, 0, 0, 0)');
    assert.equal(layout.blur, 'blur(3px)');
    assert.equal(layout.inert, true);
    await tip.locator('.tooltip-token-link').click();
    await expect(tip).toHaveAttribute('aria-label', 'Inspect Black Leopard');
    await tip.getByRole('button', { name: '← Back', exact: true }).click();
    await expect(tip).toHaveAttribute('aria-label', 'Inspect Black Leopards');
    await page.keyboard.press('Tab');
    assert.equal(await tip.evaluate((el) => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    await expect(tip).not.toHaveClass(/visible/);
    await expect(tile).toBeFocused();
    assert.equal(await page.locator('#player-experience').evaluate((el) => el.inert), false);
    await tile.click();
    await expect(page.locator('.inspection-close')).toHaveCount(0);
    await tip.locator('.tooltip-card-preview').click();
    await expect(tip).not.toHaveClass(/visible/);
    await expect(page.locator('#pe-search')).toHaveValue('Black Leopards');
  }
  // Real touch events, not mouse clicks at a phone-sized viewport.
  const touch = await browser.newPage({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    isMobile: true,
  });
  touch.on('pageerror', (e) => errors.push(e.message));
  await touch.goto('http://127.0.0.1:8198');
  await touch.locator('#menu-decks').tap();
  await touch.locator('#library-collection').tap();
  await touch.locator('#pe-search').fill('Black Leopards');
  await touch.locator('.pe-tile').tap();
  await touch.locator('.tooltip-token-link').tap();
  await expect(touch.locator('#card-hover-tooltip')).toHaveAttribute(
    'aria-label',
    'Inspect Black Leopard'
  );
  await touch.getByRole('button', { name: '← Back', exact: true }).tap();
  await touch.locator('.tooltip-flavor-text').scrollIntoViewIfNeeded();
  await touch.touchscreen.tap(3, 3);
  await expect(touch.locator('#card-hover-tooltip')).not.toHaveClass(/visible/);
  await expect(touch.locator('#pe-search')).toHaveValue('Black Leopards');
  await touch.locator('#pe-search').fill('');
  await touch.locator('.pe-grid .pe-tile').first().tap();
  const firstName = await touch.locator('#card-hover-tooltip').getAttribute('aria-label');
  await touch.getByRole('button', { name: 'Next →', exact: true }).tap();
  assert.notEqual(await touch.locator('#card-hover-tooltip').getAttribute('aria-label'), firstName);
  await expect(touch.locator('.inspection-close')).toHaveCount(0);
  await touch.touchscreen.tap(3, 3);
  assert.equal(await touch.locator('#player-experience').evaluate((el) => el.inert), false);
  await touch.close();
  assert.deepEqual(errors, []);
  console.log('PASS inspector component regressions: production paralysis, literal names, Escape');
} finally {
  await browser.close();
  server.kill();
}
