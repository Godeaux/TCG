// Two production clients; only ActionBus transport/storage replaced, never rules/UI.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname,
  OUT = ROOT + 'docs/ui-overhaul/evidence/acceptance/transport';
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8144', '--bind', '127.0.0.1'], {
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
  await ctx.route((url) => url.pathname === '/js/network/actionBus.js', (r) =>
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
  await p.goto('http://127.0.0.1:8144');
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
async function action(seat, type, payload = {}) {
  const result = await pages[seat].evaluate(
    async ({ type, payload }) =>
      (await import('/js/network/actionBus.js')).getActionBus().dispatch({ type, payload }),
    { type, payload }
  );
  assert.equal(result.success, true, JSON.stringify({ type, result }));
  await equal(type);
}
try {
  pages = [await client(0), await client(1)];
  await pages[0].evaluate(async () => {
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
    s.activePlayerIndex = 0;
    s.firstPlayerIndex = 0;
    s.skipFirstDraw = true;
    for (let seat = 0; seat < 2; seat++) {
      const ids = [
        'amphibian-prey-axolotl',
        'fish-predator-wahoo',
        'fish-prey-atlantic-flying-fish',
        'fish-prey-black-mullet',
        'fish-prey-blobfish',
      ];
      s.players[seat].name = seat ? 'Local Guest' : 'Local Host';
      s.players[seat].hand = ids.map((id) => createCardInstance(getCardDefinitionById(id), 1));
      s.players[seat].deck = getAllCards()
        .filter((c) => c.id.startsWith('fish-') && !ids.includes(c.id))
        .slice(0, 15)
        .map((c) => createCardInstance(c, 1));
      s.players[seat].field = [null, null, null];
      s.players[seat].hp = 10;
    }
  });
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
  // Actual DOM drag plays a card, not an API-only substitute for the input path.
  await pages[0]
    .locator('#active-hand .card')
    .first()
    .dragTo(pages[0].locator('.player-field .field-slot').first());
  await equal('host mouse play');
  assert.equal(
    await pages[0].evaluate(
      async () =>
        (await import('/js/ui/input/dragAndDrop.js')).getLatestState().players[0].field[0]?.id
    ),
    'amphibian-prey-axolotl'
  );
  await action(0, 'END_TURN');
  await pages[1]
    .locator('#active-hand .card')
    .first()
    .dragTo(pages[1].locator('.player-field .field-slot').first());
  await equal('guest optimistic mouse play');
  await action(1, 'END_TURN');
  await pages[0].locator('#active-hand .card[data-card-id="fish-predator-wahoo"]').count();
  const pred = pages[0].locator('#active-hand .card').filter({ hasText: 'Wahoo' });
  await pred.dragTo(pages[0].locator('.player-field .field-slot').first());
  await equal('predator drop consumes prey');
  assert.equal(
    await pages[0].evaluate(
      async () =>
        (await import('/js/ui/input/dragAndDrop.js'))
          .getLatestState()
          .historyEvents.events.filter((e) => e.kind === 'consume').length
    ),
    1
  );
  await action(0, 'ADVANCE_PHASE');
  await pages[0]
    .locator('.player-field .field-slot .card')
    .first()
    .dragTo(pages[0].locator('#rival-strip .player-name'));
  await equal('host direct face attack');
  // Actual guest tab refresh; restore authoritative snapshot and bus sequence, not game logic.
  const recovery = await pages[0].evaluate(async () => ({
    payload: JSON.parse(
      JSON.stringify(
        (await import('/js/network/serialization.js')).buildLobbySyncPayload(
          (await import('/js/ui/input/dragAndDrop.js')).getLatestState()
        )
      )
    ),
    seq: (await import('/js/network/actionBus.js')).getActionBus().getSequencingState(),
  }));
  recovery.seq.lastSentIntent = await pages[1].evaluate(
    async () =>
      (await import('/js/network/actionBus.js')).getActionBus().getSequencingState().lastSentIntent
  );
  await pages[1].reload();
  await pages[1].waitForFunction(() => !!window.__qa);
  await pages[1].evaluate(async (recovery) => {
    const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
    (await import('/js/network/serialization.js')).applyLobbySyncPayload(s, recovery.payload, {
      forceApply: true,
    });
    s.menu.mode = 'online';
    s.menu.stage = 'ready';
    s.menu.profile = { id: 'local-guest', username: 'Local Guest' };
    s.menu.lobby = { id: 1, host_id: 'local-host', guest_id: 'local-guest' };
    s.deckBuilder.stage = 'complete';
    (await import('/js/ui.js')).renderGame(s);
    (await import('/js/network/actionBus.js')).getActionBus().restoreSequencing(recovery.seq);
  }, recovery);
  await equal('guest reload authoritative restore');
  await action(0, 'END_TURN');
  await action(1, 'ADVANCE_PHASE');
  await pages[1]
    .locator('.player-field .field-slot .card')
    .first()
    .dragTo(pages[1].locator('.opponent-field .field-slot .card').first());
  await equal('guest creature combat after reload');
  for (const page of pages) {
    await page.locator('#carrion-pile-container').click();
    assert((await page.locator('#selection-panel').innerText()).includes('Axolotl'));
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.locator('#exile-pile-container').click();
    assert((await page.locator('#selection-panel').innerText()).includes('Empty'));
    await page.getByRole('button', { name: 'OK', exact: true }).click();
  }
  await equal('both seats inspect Carrion and Exile without mutation');
  await action(1, 'END_TURN');
  await action(0, 'ADVANCE_PHASE');
  await pages[0]
    .locator('.player-field .field-slot .card')
    .first()
    .dragTo(pages[0].locator('#rival-strip .player-name'));
  await equal('lethal direct attack');
  assert.equal(
    await pages[0].evaluate(
      async () => (await import('/js/ui/input/dragAndDrop.js')).getLatestState().players[1].hp
    ),
    0
  );
  await pages[0].locator('#victory-overlay').waitFor({ state: 'visible' });
  assert.equal(await pages[0].locator('.victory-title').innerText(), 'VICTORY');
  assert.equal(await pages[1].locator('.victory-title').innerText(), 'DEFEAT');
  for (let seat = 0; seat < 2; seat++)
    await pages[seat].screenshot({ path: OUT + `/seat-${seat}-victory.png` });
  // Exercise actual rematch UI/callback with the peer choice already received.
  // Lobby subscription delivery is outside this local ActionBus transport harness.
  for (let seat = 0; seat < 2; seat++) {
    await pages[seat].evaluate(async (seat) => {
      const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
      s.rematch.choices[1 - seat] = 'rematch';
    }, seat);
    await pages[seat].locator('#victory-rematch').click();
    await pages[seat].waitForTimeout(1200);
    const reset = await pages[seat].evaluate(async () => {
      const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
      return { events: s.historyEvents.events.length, phase: s.phase, winner: s.winner };
    });
    assert.deepEqual(
      reset,
      { events: 0, phase: 'Setup', winner: null },
      'Actual same-deck rematch clears old match history'
    );
  }
  assert.deepEqual(errors, []);
  assert(
    !messages.some((m) => m.type === 'recovery_request'),
    'No silent recovery may mask divergence'
  );
  fs.writeFileSync(OUT + '/results.json', JSON.stringify({ steps, messages, errors }, null, 2));
  console.log('PASS local transport match', JSON.stringify(steps));
} catch (e) {
  if (pages)
    for (let i = 0; i < pages.length; i++)
      await pages[i].screenshot({ path: OUT + `/failure-${i}.png` });
  console.log('STEPS', JSON.stringify(steps));
  throw e;
} finally {
  await browser.close();
  srv.kill();
}
