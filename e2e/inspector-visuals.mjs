// Collection is real navigation. Status examples are explicitly staged fixtures.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const out = process.env.TCG_VISUAL_OUT || '../qa-evidence/overnight-2026-10-29/visuals';
mkdirSync(out, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '8202', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
try {
  for (const mode of [
    'collection-desktop',
    'collection-mobile',
    'barrier-desktop',
    'paralysis-desktop',
  ]) {
    const page = await browser.newPage({
      viewport: {
        width: mode.includes('mobile') ? 393 : 1200,
        height: mode.includes('mobile') ? 852 : 850,
      },
    });
    await page.goto('http://127.0.0.1:8202');
    await page.locator('#menu-decks').click();
    await page.locator('#library-collection').click();
    if (mode.startsWith('collection')) {
      await page.locator('#pe-search').fill('Black Leopards');
      await page.locator('.pe-grid .pe-tile').click();
    } else {
      await page.evaluate(async (mode) => {
        const { createCardInstance } = await import('/js/cardTypes.js');
        const { getCardDefinitionById } = await import('/js/cards/index.js');
        const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
        const c = createCardInstance(getCardDefinitionById('fish-predator-alligator-gar'), 3);
        s.menu.stage = 'ready';
        s.menu.mode = 'local';
        s.setup.stage = s.deckSelection.stage = s.deckBuilder.stage = 'complete';
        s.turn = 3;
        s.phase = 'Main 1';
        s.activePlayerIndex = 0;
        s.players[0].field = [c, null, null];
        if (mode === 'paralysis-desktop')
          (await import('/js/game/effects.js')).resolveEffectResult(
            s,
            { paralyzeCreature: { creature: c } },
            { playerIndex: 0 }
          );
        (await import('/js/ui.js')).renderGame(s);
        (await import('/js/ui/components/CardTooltip.js')).showCardTooltip(
          c,
          document.querySelector('.player-field .card'),
          { modal: true }
        );
      }, mode);
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${mode}.png` });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
