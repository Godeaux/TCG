import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
try {
  const page = await browser.newPage();
  await page.goto(process.env.TCG_BASE || 'http://127.0.0.1:8123');
  await page.waitForFunction(() => !!window.__qa);
  for (const [localIndex, winnerIndex, expected] of [
    [0, 0, 'VICTORY'],
    [1, 0, 'DEFEAT'],
    [0, 1, 'DEFEAT'],
    [1, 1, 'VICTORY'],
    [0, null, 'DRAW'],
  ]) {
    await page.evaluate(
      async ({ localIndex, winnerIndex }) => {
        const { createGameState } = await import('/js/state/gameState.js');
        const { showVictoryScreen } = await import('/js/ui/overlays/VictoryOverlay.js');
        const s = createGameState();
        s.menu.mode = 'online';
        s.menu.lobby = { host_id: 'host', guest_id: 'guest' };
        s.menu.profile = { id: localIndex ? 'guest' : 'host' };
        showVictoryScreen(
          winnerIndex === null ? null : s.players[winnerIndex],
          {},
          { state: s, isOnline: true, isDraw: winnerIndex === null }
        );
      },
      { localIndex, winnerIndex }
    );
    assert.equal(await page.locator('.victory-title').innerText(), expected);
    console.log('PASS', localIndex, winnerIndex, expected);
  }
} finally {
  await browser.close();
}
