// Two production clients; only ActionBus transport/storage replaced, never rules/UI.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Deterministic regression fixture; NOT live-backend coverage.
const ROOT = new URL('..', import.meta.url).pathname,
  OUT = '/tmp/tcg-consumption-choice-regression';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8153', '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
process.on('exit', () => srv.kill());
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const errors = [],
  steps = [],
  messages = [];
const actionBus = fs
  .readFileSync(ROOT + 'js/network/actionBus.js', 'utf8')
  .replace("from './sync.js'", "from '/__local_transport.js'");
async function client(seat) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/js/network/actionBus.js', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: actionBus })
  );
  await ctx.route('**/__local_transport.js', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: `window.transportQueue=[];export function sendLobbyBroadcast(channel,message){window.transportQueue.push(JSON.parse(JSON.stringify(message)));} export function saveGameStateToDatabase(){} export function setSequencingSnapshotProvider(){}`,
    })
  );
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://127.0.0.1:8153');
  await p.waitForFunction(() => !!window.__qa);
  return p;
}
let pages;
async function pump() {
  for (let i = 0; i < 24; i++) {
    let count = 0;
    for (let seat = 0; seat < 2; seat++) {
      const batch = await pages[seat].evaluate(() => window.transportQueue.splice(0));
      count += batch.length;
      for (const msg of batch) {
        messages.push({ from: seat, type: msg.type, seq: msg.seq });
        await pages[1 - seat].evaluate(
          async (m) => (await import('/js/network/actionBus.js')).getActionBus().handleMessage(m),
          msg
        );
      }
    }
    if (!count) return;
  }
  throw new Error('Transport failed to quiesce');
}
async function equal(label) {
  await pump();
  const states = await Promise.all(
    pages.map((p) =>
      p.evaluate(async () => {
        const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
        return {
          hp: s.players.map((p) => p.hp),
          phase: s.phase,
          turn: s.turn,
          active: s.activePlayerIndex,
          players: s.players.map((p) => ({
            hand: p.hand.map((c) => [c.id, c.instanceId]),
            field: p.field.map((c) => c && [c.id, c.instanceId, c.currentAtk, c.currentHp]),
            deck: p.deck.map((c) => [c.id, c.instanceId]),
          })),
          history: s.historyEvents,
          recovering: (await import('/js/network/actionBus.js')).getActionBus().isRecovering(),
        };
      })
    )
  );
  assert.deepEqual(states[1], states[0], label);
  assert.equal(states[0].recovering, false, label);
  steps.push({
    label,
    turn: states[0].turn,
    phase: states[0].phase,
    hp: states[0].hp,
    events: states[0].history.events.length,
  });
}
const cancelChoice = async (p, retry) => {
  await pump();
  const snapshot = () =>
    Promise.all(
      pages.map((page) =>
        page.evaluate(async () => {
          const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
          return JSON.stringify({
            players: s.players,
            turn: s.turn,
            phase: s.phase,
            played: s.cardPlayedThisTurn,
          });
        })
      )
    );
  const before = await snapshot();
  await p
    .locator('.card-selection-overlay')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await p.waitForTimeout(250);
  await pump();
  assert.deepEqual(await snapshot(), before, 'Cancel must not mutate either client');
  assert.equal(await p.locator('.card-selection-overlay').count(), 0, 'Cancel closes picker');
  await retry();
};
try {
  for (const actor of [0, 1]) {
    for (const route of ['direct', 'checkbox', 'additional']) {
      pages = [await client(0), await client(1)];
      await pages[0].evaluate(
        async ({ actor, route }) => {
          const { getLatestState } = await import('/js/ui/input/dragAndDrop.js');
          const { createCardInstance } = await import('/js/cardTypes.js');
          const { getCardDefinitionById, getAllCards } = await import('/js/cards/index.js');
          const { initializeGameRandom } = await import('/js/state/gameState.js');
          initializeGameRandom(735);
          const s = getLatestState();
          s.randomSeed = 735;
          s.setup = { stage: 'complete', winnerIndex: 0, rolls: [6, 1] };
          s.deckSelection.stage = 'complete';
          s.deckBuilder.stage = 'complete';
          s.menu.stage = 'ready';
          s.phase = 'Main 1';
          s.turn = 1;
          s.activePlayerIndex = actor;
          s.firstPlayerIndex = actor;
          s.skipFirstDraw = true;
          for (let seat = 0; seat < 2; seat++) {
            const ids = [
              'fish-predator-orca',
              'fish-predator-wahoo',
              'fish-prey-atlantic-flying-fish',
              'fish-prey-blobfish',
            ];
            s.players[seat].name = seat ? 'Local Guest' : 'Local Host';
            s.players[seat].hand = ids.map((id) =>
              createCardInstance(getCardDefinitionById(id), 1)
            );
            s.players[seat].deck = getAllCards()
              .filter(
                (c) =>
                  c.id.startsWith('fish-') &&
                  !ids.includes(c.id) &&
                  c.id !== 'fish-prey-black-mullet'
              )
              .slice(0, 15)
              .map((c) => createCardInstance(c, 1));
            s.players[seat].field = [
              createCardInstance(getCardDefinitionById('fish-prey-black-mullet'), 1),
              null,
              null,
            ];
            if (route === 'additional') {
              s.players[seat].field[2] = s.players[seat].hand.pop();
            }
            s.players[seat].hp = 10;
          }
        },
        { actor, route }
      );
      const initial = await pages[0].evaluate(async () =>
        JSON.parse(
          JSON.stringify(
            (await import('/js/network/serialization.js')).buildLobbySyncPayload(
              (await import('/js/ui/input/dragAndDrop.js')).getLatestState()
            )
          )
        )
      );
      for (let seat = 0; seat < 2; seat++)
        await pages[seat].evaluate(
          async ({ seat, initial }) => {
            const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
            (await import('/js/network/serialization.js')).applyLobbySyncPayload(s, initial, {
              forceApply: true,
            });
            s.menu.mode = 'online';
            s.menu.stage = 'ready';
            s.menu.profile = {
              id: seat ? 'local-guest' : 'local-host',
              username: seat ? 'Local Guest' : 'Local Host',
            };
            s.menu.lobby = { id: 1, host_id: 'local-host', guest_id: 'local-guest' };
            s.deckBuilder.stage = 'complete';
            (await import('/js/ui.js')).renderGame(s);
          },
          { seat, initial }
        );
      await equal('controlled opening');
      const p = pages[actor];
      await p
        .locator('#active-hand .card')
        .first()
        .dragTo(p.locator('.player-field .field-slot').nth(route === 'checkbox' ? 1 : 0));
      if (route === 'checkbox') {
        await p.getByRole('button', { name: 'Consume', exact: true }).click();
        await p.locator('#selection-panel input[type=checkbox]').first().check();
        await p
          .locator('#selection-panel button')
          .filter({ hasText: /Confirm/ })
          .click();
      }
      await cancelChoice(p, async () => {
        if (route === 'checkbox') {
          await p.locator('#selection-panel input[type=checkbox]').first().check();
          await p
            .locator('#selection-panel button')
            .filter({ hasText: /Confirm/ })
            .click();
        } else {
          await p
            .locator('#active-hand .card')
            .first()
            .dragTo(p.locator('.player-field .field-slot').first());
        }
      });
      await p.locator('.card-selection-overlay .card').first().click();
      if (route === 'additional') {
        await p.locator('#selection-panel input[type=checkbox]').first().check();
        await p
          .locator('#selection-panel button')
          .filter({ hasText: /Confirm/ })
          .click();
        await cancelChoice(p, async () => {
          await p.locator('#selection-panel input[type=checkbox]').first().check();
          await p
            .locator('#selection-panel button')
            .filter({ hasText: /Confirm/ })
            .click();
        });
        await p.locator('.card-selection-overlay .card').first().click();
      }
      await p.waitForTimeout(300);
      await equal('Orca consumption tutor resolves identically on both clients');
      const counts = await p.evaluate(() => window.__qa.getState().players[0]);
      assert.equal(counts.deckSize, 14, 'exactly one tutored card leaves deck');
      assert.equal(
        counts.hand.length,
        route === 'additional' ? 3 : 4,
        'one predator spent, one tutored card gained'
      );
      assert.deepEqual(errors, []);
      console.log('PASS Orca consumption tutor', { actor, route });
      for (const page of pages) await page.context().close();
    }
  }
} finally {
  await browser.close();
  srv.kill();
}
