import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const out = root + 'docs/spell-coverage-2026-10-28';
fs.mkdirSync(out, { recursive: true });
const port = process.env.TCG_PORT || '8166';
const server = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
});
process.on('exit', () => server.kill());
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const results = [],
  errors = [];
try {
  const demo = process.env.TCG_DEMO;
  const ctx = await browser.newContext({
    viewport: { width: demo ? 393 : 1440, height: demo ? 852 : 900 },
    ...(demo ? { recordVideo: { dir: out + '/video', size: { width: 393, height: 852 } } } : {}),
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${port}`);
  await p.waitForFunction(() => window.__qa);
  const ids = await p.evaluate(async () => {
    const registry = await import('/js/cards/index.js');
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { createGameState } = await import('/js/state/gameState.js');
    const { GameController } = await import('/js/game/controller.js');
    const transport = await import('/js/network/serialization.js');
    const ui = await import('/js/ui.js');
    const fx = await import('/js/ui/effects/spellPresentation.js');
    const config = (await import('/js/ui/effects/spellEffects.js')).SPELL_VISUAL_EFFECTS;
    const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
    const opening = createGameState();
    for (const player of opening.players)
      player.deck = Array.from({ length: 6 }, () =>
        createCardInstance(registry.getCardDefinitionById('fish-prey-blobfish'), 1)
      );
    ui.setupInitialDraw(opening, 5);
    if (
      opening.players.some((p) => p.hand.length !== 5 || p.deck.length !== 1) ||
      opening.historyEvents.events.length
    )
      throw Error('Production opening deal must not populate history');
    let generation = 100;
    window.castSpell = async (id, owner, replay) => {
      fx.cancelSpellScenes();
      Object.assign(s, createGameState());
      s.menu.stage = 'ready';
      s.menu.mode = 'local';
      s.setup.stage = 'complete';
      s.deckSelection.stage = 'complete';
      s.deckBuilder.stage = 'complete';
      s.turn = 3;
      s.phase = 'Main 1';
      s.activePlayerIndex = owner;
      s.cardPlayedThisTurn = false;
      s.historyEvents.matchGeneration = ++generation;
      const c = (id) => createCardInstance(registry.getCardDefinitionById(id), 1);
      for (const player of s.players) {
        player.field = [c('fish-prey-blobfish'), c('fish-predator-atlantic-bluefin-tuna'), null];
        player.hand = [];
        player.traps = [];
        player.deck = Array.from({ length: 8 }, () => c('fish-prey-blobfish'));
        player.carrion = [c('fish-prey-cannibal-fish')];
      }
      const spell = c(id);
      s.players[owner].hand = [spell];
      ui.renderGame(s);
      const getLocal = (await import('/js/state/selectors.js')).getLocalPlayerIndex;
      const geometry = fx.captureSpellScene(
        s,
        {},
        document.querySelector('#battle-effects'),
        getLocal
      );
      for (const rect of geometry.slots.filter((r) => r.occupied)) {
        if (s.players[rect.owner].field[rect.slot]?.instanceId !== rect.id)
          throw Error('Spell geometry mapped to wrong owner: ' + rect.owner);
      }
      window.seen = [];
      if (!window.fxObserver) {
        window.fxObserver = new MutationObserver((records) => {
          for (const r of records)
            for (const n of r.addedNodes)
              if (n.classList?.contains('spell-scene'))
                window.seen.push({
                  id: n.dataset.spell,
                  nodes: n.childElementCount,
                  motif: n.dataset.motif,
                });
        });
        window.fxObserver.observe(document.querySelector('#battle-effects'), { childList: true });
      }
      const controller = new GameController(
        s,
        {},
        {
          onSelectionNeeded: (prompt) => {
            if (prompt.selectOption) prompt.onSelect(prompt.selectOption.options[0]);
            else {
              const input = prompt.selectTarget.candidates;
              const candidates = typeof input === 'function' ? input() : input;
              if (!candidates.length) throw Error('No valid fixture candidates for ' + id);
              prompt.onSelect(candidates[0].value ?? candidates[0]);
            }
          },
        }
      );
      if (id === 'fish-spell-washout' && !replay) {
        await ui.handlePlayCard(s, spell, () => ui.renderGame(s));
      } else {
        const result = controller.execute({ type: 'PLAY_CARD', payload: { card: spell } });
        if (!result.success) throw Error(id + ': ' + result.error);
      }
      if (replay) {
        const payload = JSON.parse(JSON.stringify(transport.buildLobbySyncPayload(s)));
        // Present the same authoritative serialized event after field mutation.
        transport.applyLobbySyncPayload(s, payload, { forceApply: true });
      }
      ui.renderGame(s);
      return {
        configured: !!config[id],
        effects: s.visualEffects.filter((e) => e.type === 'spell' && e.spellId === id).length,
      };
    };
    return registry
      .getAllCards()
      .filter((c) => ['Spell', 'Free Spell'].includes(c.type))
      .map((c) => c.id);
  });
  assert.equal(ids.length, 61);
  const cases = ids.map((id, i) => ({
    id,
    owner: i % 2,
    replay: i % 2 === 1,
    width: i % 2 ? 393 : 1440,
  }));
  for (const width of [393, 1440])
    for (const owner of [0, 1])
      for (const replay of [false, true])
        cases.push({ id: 'fish-spell-washout', owner, replay, width });
  const samples = new Set([
    'fish-spell-washout',
    'token-scale-arrows',
    'token-present',
    'mammal-spell-six-layered-neocortex',
    'token-rainbow',
    'token-hand-egg',
  ]);
  const selected = demo
    ? [{ id: demo, owner: 0, replay: false, width: 393 }]
    : cases.filter((c) => !process.env.TCG_SPELL || c.id === process.env.TCG_SPELL);
  for (const test of selected) {
    await p.setViewportSize({ width: test.width, height: test.width < 500 ? 852 : 900 });
    const cast = await p.evaluate(
      ({ id, owner, replay }) => window.castSpell(id, owner, replay),
      test
    );
    assert(cast.configured, test.id + ' must have explicit visual config');
    assert.equal(cast.effects, 1);
    await p.waitForFunction((id) => window.seen.some((s) => s.id === id && s.nodes > 0), test.id, {
      timeout: 5500,
    });
    const seen = await p.evaluate(() => window.seen);
    assert.equal(seen.filter((s) => s.id === test.id).length, 1, 'One animation per cast');
    if (samples.has(test.id)) {
      await p.waitForTimeout(400);
      await p.screenshot({
        path: `${out}/${test.id}-${test.width}-${test.owner}-${test.replay ? 'replay' : 'cast'}.png`,
      });
    }
    if (demo) await p.waitForTimeout(1400);
    results.push({ ...test, ...cast, ...seen[0] });
    console.log('PASS', test.id, test.width, test.owner, test.replay ? 'snapshot' : 'local');
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + (demo ? '/demo-results.json' : '/cast-results.json'),
    JSON.stringify({ results, errors }, null, 2)
  );
  console.log('PASS', results.length, 'real casts / snapshot presentations');
  const video = p.video();
  await ctx.close();
  if (video) await video.saveAs(`${out}/${demo}.webm`);
} finally {
  await browser.close();
  server.kill();
}
