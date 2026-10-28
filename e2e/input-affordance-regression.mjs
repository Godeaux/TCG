// Native desktop input, both local seat perspectives. Real card instances and UI.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', '8156', '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const failures = [];
try {
  for (const mode of ['mouse', 'touch'])
    for (const seat of [0, 1])
      for (const scenario of ['zero-target', 'rival-row']) {
        const p = await browser.newPage({
          viewport: mode === 'touch' ? { width: 393, height: 852 } : { width: 1440, height: 900 },
          hasTouch: mode === 'touch',
          isMobile: mode === 'touch',
        });
        p.setDefaultTimeout(12000);
        const cdp = await p.context().newCDPSession(p);
        const drag = async (target) => {
          const source = p.locator('#active-hand .card').first();
          if (mode === 'mouse') {
            await source.dragTo(target);
            return;
          }
          const a = await source.boundingBox(),
            b = await target.boundingBox();
          assert(a && b, 'Drag bounds exist');
          const x = a.x + a.width / 2,
            y = a.y + a.height / 2,
            tx = b.x + b.width / 2,
            ty = b.y + b.height / 2;
          const touch = (type, x, y) =>
            cdp.send('Input.dispatchTouchEvent', {
              type,
              touchPoints:
                type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }],
            });
          await touch('touchStart', x, y);
          await p.waitForTimeout(80);
          for (let j = 1; j <= 12; j++) {
            await touch('touchMove', x + ((tx - x) * j) / 12, y + ((ty - y) * j) / 12);
            await p.waitForTimeout(20);
          }
          await touch('touchEnd');
        };

        await p.goto('http://127.0.0.1:8156');
        await p.waitForFunction(() => !!window.__qa);
        await p.evaluate(
          async ({ seat, scenario }) => {
            const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
            const { createCardInstance } = await import('/js/cardTypes.js');
            const { getCardDefinitionById } = await import('/js/cards/index.js');
            s.menu.stage = 'ready';
            s.menu.mode = 'local';
            s.setup.stage = 'complete';
            s.deckSelection.stage = 'complete';
            s.deckBuilder.stage = 'complete';
            s.turn = 3;
            s.phase = scenario === 'zero-target' ? 'Combat' : 'Main 1';
            s.activePlayerIndex = seat;
            s.passPending = false;
            s.cardPlayedThisTurn = false;
            for (const player of s.players) {
              player.field = [null, null, null];
              player.hand = [];
              player.hp = 10;
            }
            const card = createCardInstance(getCardDefinitionById('fish-prey-black-drum'), s.turn);
            if (scenario === 'zero-target') {
              card.summonedTurn = s.turn;
              s.players[seat].field[0] = card;
            } else s.players[seat].hand = [card];
            window.fixtureState = s;
            (await import('/js/ui.js')).renderGame(s);
          },
          { seat, scenario }
        );
        try {
          if (scenario === 'zero-target') {
            assert.equal(
              await p
                .locator('.player-field')
                .getByRole('button', { name: 'Attack', exact: true })
                .count(),
              0,
              'No Attack with zero legal targets'
            );
            assert.equal(
              await p.locator('.player-field .can-attack-pulse').count(),
              0,
              'No misleading attack pulse'
            );
            // Summoning exhaustion must NOT suppress legal creature attacks.
            await p.evaluate(async (seat) => {
              const s = window.fixtureState;
              const { createCardInstance } = await import('/js/cardTypes.js');
              const { getCardDefinitionById } = await import('/js/cards/index.js');
              s.players[1 - seat].field[0] = createCardInstance(
                getCardDefinitionById('fish-prey-blobfish'),
                1
              );
              (await import('/js/ui.js')).renderGame(s);
            }, seat);
            await p
              .locator('.player-field')
              .getByRole('button', { name: 'Attack', exact: true })
              .click();
            assert.equal(
              await p.locator('#selection-panel .selection-list button').count(),
              1,
              'Only the creature is legal, not direct player damage'
            );
            await p.locator('#selection-panel .selection-list button').click();
            assert.equal(
              await p.evaluate(
                (seat) => window.fixtureState.players[1 - seat].field[0] === null,
                seat
              ),
              true,
              'Legal same-turn creature attack resolves'
            );
          } else {
            const snapshot = () =>
              p.evaluate(() => {
                const s = window.fixtureState;
                return JSON.stringify({
                  players: s.players,
                  played: s.cardPlayedThisTurn,
                  phase: s.phase,
                });
              });
            const before = await snapshot();
            await drag(p.locator('.opponent-field .field-slot').first());
            await p.waitForTimeout(300);
            assert.equal(
              await snapshot(),
              before,
              'Rival-row drop must not spend card or alter either player'
            );
            await drag(p.locator('.player-field .field-slot').first());
            await p.waitForTimeout(300);
            assert.equal(
              await p.evaluate((seat) => window.fixtureState.players[seat].hand.length, seat),
              0,
              'Valid own-row retry spends card'
            );
            assert.equal(
              await p.evaluate((seat) => window.fixtureState.players[seat].field[0]?.id, seat),
              'fish-prey-black-drum'
            );
          }
          console.log('PASS', mode, seat, scenario);
        } catch (e) {
          failures.push({ mode, seat, scenario, error: e.message });
        }
        await p.close();
      }
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  server.kill();
}
