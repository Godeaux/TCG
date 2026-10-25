import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname,
  OUT = ROOT + 'docs/ui-overhaul/evidence/acceptance/input';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8145', '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
process.on('exit', () => srv.kill());
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const results = [],
  errors = [];
try {
  for (const mode of ['mouse', 'touch'])
    for (const seat of [0, 1]) {
      const ctx = await browser.newContext({
        viewport: mode === 'touch' ? { width: 393, height: 852 } : { width: 1440, height: 900 },
        hasTouch: mode === 'touch',
        isMobile: mode === 'touch',
      });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto('http://127.0.0.1:8145');
      await p.waitForFunction(() => !!window.__qa);
      const cdp = await ctx.newCDPSession(p);
      for (const kind of [
        'legal',
        'exhausted',
        'Passive',
        'Harmless',
        'Lure',
        'own-face',
        'control',
        'outside-strip',
        'empty-slot',
      ]) {
        await p.evaluate(
          async ({ seat, kind }) => {
            const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
            const { createCardInstance } = await import('/js/cardTypes.js');
            const { getCardDefinitionById } = await import('/js/cards/index.js');
            const { resolveEffectResult } = await import('/js/game/effects.js');
            const grantKeyword = (creature, keyword) =>
              resolveEffectResult(
                s,
                { grantKeyword: { creature, keyword } },
                { playerIndex: seat }
              );
            s.menu.stage = 'ready';
            s.menu.mode = 'local';
            s.setup.stage = 'complete';
            s.deckSelection.stage = 'complete';
            s.deckBuilder.stage = 'complete';
            s.turn = 3;
            s.phase = 'Combat';
            s.activePlayerIndex = seat;
            s.passPending = false;
            s.historyEvents = (await import('/js/game/historyEvents.js')).resetHistoryStream();
            for (const player of s.players) {
              player.field = [null, null, null];
              player.hand = [];
              player.hp = 10;
            }
            const card = createCardInstance(getCardDefinitionById('fish-predator-wahoo'), 1);
            s.players[seat].field[0] = card;
            if (kind === 'exhausted') card.hasAttacked = true;
            if (['Passive', 'Harmless'].includes(kind)) grantKeyword(card, kind);
            if (kind === 'Lure') {
              const lure = createCardInstance(getCardDefinitionById('fish-prey-black-mullet'), 1);
              grantKeyword(lure, 'Lure');
              s.players[1 - seat].field[0] = lure;
            }
            const { GameController } = await import('/js/game/controller.js');
            if (!window.wrapped) {
              const execute = GameController.prototype.execute;
              GameController.prototype.execute = function (a) {
                if (a.type === 'RESOLVE_ATTACK') window.attackCalls++;
                return execute.call(this, a);
              };
              window.wrapped = true;
            }
            window.attackCalls = 0;
            window.inputState = s;
            (await import('/js/ui.js')).renderGame(s);
          },
          { seat, kind }
        );
        const source = p.locator('.player-field .field-slot .card').first();
        let target =
          kind === 'empty-slot'
            ? p.locator('.opponent-field .field-slot').last()
            : kind === 'own-face'
              ? p.locator('#own-strip .player-name')
              : kind === 'control'
                ? p.locator('#field-history-btn')
                : p.locator('#rival-strip .player-name');
        {
          const a = await source.boundingBox(),
            b =
              kind === 'outside-strip'
                ? await p.locator('#rival-strip').boundingBox()
                : await target.boundingBox();
          assert(a && b, `${mode} seat${seat} ${kind} missing bounds`);
          const x = a.x + a.width / 2,
            y = a.y + a.height / 2,
            tx = kind === 'outside-strip' ? b.x + b.width + 3 : b.x + b.width / 2,
            ty = b.y + b.height / 2;
          if (mode === 'touch') {
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
          } else {
            await p.mouse.move(x, y);
            await p.mouse.down();
            await p.mouse.move(tx, ty, { steps: 12 });
            await p.mouse.up();
          }
        }
        await p.waitForTimeout(100);
        const actual = await p.evaluate(() => ({
          calls: window.attackCalls,
          hp: window.inputState.players.map((p) => p.hp),
          events: window.inputState.historyEvents.events.filter((e) => e.kind === 'attack').length,
        }));
        assert.equal(
          actual.calls,
          kind === 'legal' ? 1 : 0,
          `${mode} seat${seat} ${kind}: ${JSON.stringify(actual)}`
        );
        assert.equal(actual.events, kind === 'legal' ? 1 : 0);
        assert.equal(actual.hp[1 - seat], kind === 'legal' ? 7 : 10);
        results.push({ mode, seat, kind, ...actual });
      }
      await ctx.close();
    }
  assert.deepEqual(errors, []);
  fs.writeFileSync(OUT + '/results.json', JSON.stringify({ results, errors }, null, 2));
  console.log('PASS', results.length, 'native input cases');
} finally {
  await browser.close();
  srv.kill();
}
