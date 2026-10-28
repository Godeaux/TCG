// Production controller resolves combat while its legacy target chooser is open.
// Deterministic local fixture; not live-network certification.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', '8155', '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
try {
  for (const seat of [0, 1]) {
    const p = await browser.newPage();
    await p.goto('http://127.0.0.1:8155');
    await p.waitForFunction(() => !!window.__qa);
    await p.evaluate(async (seat) => {
      const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
      const { createCardInstance } = await import('/js/cardTypes.js');
      const { getCardDefinitionById } = await import('/js/cards/index.js');
      s.menu.stage = 'ready';
      s.menu.mode = 'local';
      s.setup.stage = 'complete';
      s.deckSelection.stage = 'complete';
      s.deckBuilder.stage = 'complete';
      s.turn = 3;
      s.phase = 'Combat';
      s.activePlayerIndex = seat;
      s.passPending = false;
      for (const player of s.players) {
        player.field = [null, null, null];
        player.hand = [];
        player.hp = 10;
      }
      s.players[seat].field[0] = createCardInstance(
        getCardDefinitionById('fish-predator-shortfin-mako'),
        1
      );
      s.players[1 - seat].field[0] = createCardInstance(
        getCardDefinitionById('fish-predator-great-white-shark'),
        1
      );
      window.fixtureState = s;
      (await import('/js/ui.js')).renderGame(s);
    }, seat);
    await p.locator('.player-field').getByRole('button', { name: 'Attack', exact: true }).click();
    assert.equal(await p.locator('#selection-panel .selection-list button').count(), 2);
    await p.evaluate(async (seat) => {
      const { getGameController } = await import('/js/ui.js');
      const s = window.fixtureState;
      window.oldTargetButton = document.querySelector('#selection-panel .selection-list button');
      window.resolved = getGameController().execute({
        type: 'RESOLVE_ATTACK',
        payload: {
          attacker: s.players[seat].field[0],
          target: { type: 'creature', card: s.players[1 - seat].field[0] },
        },
      });
    }, seat);
    assert.equal(
      await p.evaluate((seat) => window.fixtureState.players[seat].field[0] === null, seat),
      true,
      'Attacker died to retaliation'
    );
    assert.equal(
      await p.locator('#selection-panel').evaluate((e) => e.childElementCount),
      0,
      'Resolved combat must remove stale chooser'
    );
    const before = await p.evaluate(() => JSON.stringify(window.fixtureState.historyEvents));
    await p.evaluate(() => window.oldTargetButton.click());
    assert.equal(
      await p.evaluate(() => JSON.stringify(window.fixtureState.historyEvents)),
      before,
      'Detached stale button must not dispatch'
    );
    console.log('PASS stale combat panel + detached button', seat);
    await p.close();
  }
} finally {
  await browser.close();
  server.kill();
}
