import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const out = root + 'docs/ui-overhaul/evidence/spell-presentation';
fs.mkdirSync(out, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '8147', '--bind', '127.0.0.1'], {
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
  for (const size of [
    { width: 393, height: 740 },
    { width: 1440, height: 900 },
  ]) {
    const ctx = await browser.newContext({
      viewport: size,
      hasTouch: size.width < 500,
      isMobile: size.width < 500,
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://127.0.0.1:8147');
    await p.waitForFunction(() => !!window.__qa);
    await p.evaluate(async () => {
      const s = (await import('/js/ui/input/dragAndDrop.js')).getLatestState();
      const { createCardInstance } = await import('/js/cardTypes.js');
      const { getCardDefinitionById } = await import('/js/cards/index.js');
      const c = (id) => createCardInstance(getCardDefinitionById(id), 1);
      s.menu.stage = 'ready';
      s.menu.mode = 'local';
      s.setup.stage = 'complete';
      s.deckSelection.stage = 'complete';
      s.deckBuilder.stage = 'complete';
      s.turn = 3;
      s.phase = 'Main 1';
      s.activePlayerIndex = 0;
      s.cardPlayedThisTurn = false;
      for (const player of s.players) {
        player.field = [
          'fish-prey-electric-eel',
          'fish-predator-atlantic-bluefin-tuna',
          'fish-prey-cannibal-fish',
        ].map(c);
        player.hand = [];
      }
      (await import('/js/ui.js')).renderGame(s);
      window.fxState = s;
      window.fx = await import('/js/ui/effects/spellPresentation.js');
      window.spells = await import('/js/ui/effects/spellEffects.js');
      window.startFx = (id, owner = 0) => {
        window.fx.cancelSpellScenes();
        const config = window.spells.SPELL_VISUAL_EFFECTS[id];
        const targeted =
          ['projectile', 'status'].includes(config.type) ||
          ['copy', 'transmogrify', 'sacrifice-draw', 'metamorphosis', 'small-buff'].includes(
            config.effect
          );
        const effect = {
          spellId: id,
          casterIndex: owner,
          targetOwnerIndex: targeted ? 1 - owner : undefined,
          targetSlotIndex: targeted ? 1 : undefined,
          targetCardId: targeted ? s.players[1 - owner].field[1]?.instanceId : undefined,
        };
        const layer = document.querySelector('#battle-effects');
        const geo = window.fx.captureSpellScene(s, effect, layer, () => 0);
        window.fxDone = window.fx.playSpellPresentation(
          effect,
          s,
          window.spells.SPELL_VISUAL_EFFECTS[id],
          geo,
          layer
        );
        return geo;
      };
    });
    await p.waitForTimeout(300);
    // Audit every registered live spell family: bounded nodes, finite composited
    // keyframes, no state mutations. Representative scenes run in real time below.
    const audit = await p.evaluate(() => {
      const before = JSON.stringify(window.fxState.players),
        rows = [];
      for (const [id, config] of Object.entries(window.spells.SPELL_VISUAL_EFFECTS)) {
        if (config.type === 'trap') continue;
        window.startFx(id);
        const scene = document.querySelector('.spell-scene');
        const animations = scene.getAnimations({ subtree: true });
        rows.push({
          id,
          nodes: scene.childElementCount,
          animations: animations.length,
          safe: animations.every(
            (a) =>
              a.effect.getTiming().iterations === 1 &&
              a.effect
                .getKeyframes()
                .every((f) =>
                  Object.keys(f).every((k) =>
                    [
                      'offset',
                      'computedOffset',
                      'easing',
                      'composite',
                      'transform',
                      'opacity',
                    ].includes(k)
                  )
                )
          ),
        });
      }
      window.fx.cancelSpellScenes();
      return { rows, stateUnchanged: before === JSON.stringify(window.fxState.players) };
    });
    assert(audit.stateUnchanged);
    assert(
      audit.rows.every(
        (r) => (r.nodes > 0 || r.id === 'amphibian-spell-terrain-shift') && r.nodes <= 48 && r.safe
      ),
      JSON.stringify(audit.rows.filter((r) => !r.nodes || !r.safe))
    );
    results.push({ size, audit });
    const recoil = await p.evaluate(() => {
      window.startFx('reptile-spell-meteor');
      const hits = document.getAnimations().filter((a) => a.id === 'spell-card-impact');
      const first = hits[0],
        card = first?.effect.target;
      const style = card?.getAttribute('style');
      card.classList.add('exhausted-state');
      first?.pause();
      if (first) first.currentTime = first.effect.getTiming().delay + 150;
      const lifted = card && getComputedStyle(card).transform;
      window.fx.cancelSpellScenes();
      const settled = getComputedStyle(card).transform;
      card.classList.remove('exhausted-state');
      return {
        settled,
        count: hits.length,
        additive: hits.every((a) => a.effect.composite === 'add'),
        lifted,
        styleRestored: card?.getAttribute('style') === style,
        remaining: document.getAnimations().filter((a) => a.id === 'spell-card-impact').length,
      };
    });
    assert.equal(recoil.count, 6);
    assert(recoil.additive && recoil.lifted !== 'none' && recoil.styleRestored);
    assert(recoil.settled !== 'none' && recoil.settled !== recoil.lifted);
    assert.equal(recoil.remaining, 0);
    results.push({ recoil });
    for (const [id, time] of [
      ['fish-spell-flood', 540],
      ['fish-spell-harpoon', 500],
      ['mammal-spell-blizzard', 580],
      ['reptile-spell-meteor', 540],
      ['reptile-spell-sunshine', 360],
      ['reptile-spell-paralyze', 400],
    ]) {
      await p.evaluate((id) => window.startFx(id), id);
      // Freeze the real Web Animations timeline for deterministic visual review.
      await p.evaluate(
        (t) =>
          document
            .getAnimations()
            .filter((a) => a.id === 'spell-card-impact' || a.effect.target.closest('.spell-scene'))
            .forEach((a) => {
              a.pause();
              a.currentTime = t;
            }),
        time
      );
      await p.screenshot({ path: `${out}/${size.width}-${id}.png` });
    }
    // A killed target still has the exact visible slot geometry, not board center.
    const removed = await p.evaluate(async () => {
      const { GameController } = await import('/js/game/controller.js');
      const { createCardInstance } = await import('/js/cardTypes.js');
      const { getCardDefinitionById } = await import('/js/cards/index.js');
      const s = window.fxState,
        victim = s.players[1].field[1];
      const spell = createCardInstance(getCardDefinitionById('mammal-spell-rifle'), s.turn);
      s.players[0].hand = [spell];
      new GameController(s, {}).execute({
        type: 'PLAY_CARD',
        payload: { card: spell, effectTargets: [{ instanceId: victim.instanceId }] },
      });
      const effect = s.visualEffects.findLast((e) => e.type === 'spell');
      window.spells.preCacheSpellEffectTargets(s);
      (await import('/js/ui.js')).renderGame(s);
      const geo = window.fx.captureSpellScene(
        s,
        effect,
        document.querySelector('#battle-effects'),
        () => 0
      );
      return {
        owner: effect.targetOwnerIndex,
        slot: effect.targetSlotIndex,
        target: geo.target,
        removed: !s.players[1].field[1],
      };
    });
    assert.equal(removed.owner, 1);
    assert.equal(removed.slot, 1);
    assert(removed.removed && removed.target);
    results.push({ removed });
    await p.locator('.spell-card-reveal').waitFor({ state: 'detached' });
    await expect(p.locator('.spell-fx--remnant')).toHaveCount(1);
    await p.evaluate(() => {
      for (const a of document.querySelector('.spell-scene').getAnimations({ subtree: true })) {
        a.pause();
        a.currentTime = 320;
      }
    });
    await p.screenshot({ path: `${out}/${size.width}-lethal-impact.png` });
    await p.waitForTimeout(1900);
    // Run a representative effect unpaused and measure frame timing. Report, do
    // not pretend desktop emulation certifies real iPhone GPU performance.
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const perf = await p.evaluate(async () => {
      const frames = [];
      let last = performance.now(),
        running = true;
      const tick = (now) => {
        frames.push(now - last);
        last = now;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.startFx('fish-spell-flood');
      await window.fxDone;
      running = false;
      frames.sort((a, b) => a - b);
      return {
        frames: frames.length,
        p95ms: frames[Math.floor(frames.length * 0.95)],
        remaining: document.querySelectorAll('.spell-scene').length,
      };
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    assert.equal(perf.remaining, 0);
    results.push({ size, cpuThrottle: 4, perf });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.evaluate(() => window.startFx('fish-spell-flood'));
    const reduced = await p.evaluate(() =>
      [...document.querySelector('.spell-scene').getAnimations({ subtree: true })].every((a) =>
        a.effect.getKeyframes().every((f) => !f.transform)
      )
    );
    assert(reduced);
    assert.equal(
      await p.evaluate(
        () => document.getAnimations().filter((a) => a.id === 'spell-card-impact').length
      ),
      0
    );
    await p.waitForTimeout(300);
    assert.equal(await p.locator('.spell-scene').count(), 0);
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    const budget = await p.evaluate(() => {
      const s = window.fxState,
        layer = document.querySelector('#battle-effects');
      for (let i = 0; i < 12; i++) {
        const e = { spellId: 'fish-spell-flood', casterIndex: 0 };
        window.fx.playSpellPresentation(
          e,
          s,
          window.spells.SPELL_VISUAL_EFFECTS[e.spellId],
          window.fx.captureSpellScene(s, e, layer, () => 0),
          layer
        );
      }
      return {
        scenes: document.querySelectorAll('.spell-scene').length,
        nodes: document.querySelectorAll('.spell-fx').length,
      };
    });
    assert(budget.scenes <= 2 && budget.nodes <= 96);
    results.push({ budget, reduced });
    await p.setViewportSize({ width: size.width, height: size.height - 1 });
    await p.waitForTimeout(100);
    await expect(p.locator('.spell-scene')).toHaveCount(0);
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(out + '/results.json', JSON.stringify({ results, errors }, null, 2));
  console.log(
    JSON.stringify({
      families: results.filter((r) => r.audit).map((r) => r.audit.rows.length),
      performance: results.filter((r) => r.perf),
      errors,
    })
  );
} finally {
  await browser.close();
  server.kill();
}
