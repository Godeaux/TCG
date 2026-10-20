import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { randomInt } from 'node:crypto';
// Live-backend smoke test: creates disposable accounts and a lobby.
// Start a static server on :8123. Run with TCG_CHROME if Playwright's browser is not installed.
// Actions use normal clicks/drags; __qa is read-only observation.
const pin = String(randomInt(100000, 1000000));
const out = process.env.TCG_OUTPUT || '/tmp/tcg-ui-evidence';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
const pages = [],
  contexts = [];
const stamp = Date.now().toString(36).slice(-7);
const state = (p) => p.evaluate(() => window.__qa.getState());
const snap = async (label) => {
  for (let i = 0; i < pages.length; i++) {
    await pages[i].mouse.move(5, 500);
    await pages[i].waitForTimeout(450);
    await pages[i].screenshot({ path: `${out}/${label}-p${i + 1}.png` });
    await fs.writeFile(
      `${out}/${label}-p${i + 1}.json`,
      JSON.stringify(await state(pages[i]), null, 2)
    );
  }
};
try {
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: out, size: { width: 1440, height: 1000 } },
    });
    contexts.push(ctx);
    const p = await ctx.newPage();
    pages.push(p);
    p.setDefaultTimeout(15000);
    p.on('console', (m) => {
      if (/ActionBus|[Rr]ecov|\[lobby\]|\[sync\]|No lobby match/.test(m.text()))
        console.log('BROWSER', i, m.text());
    });
    p.on('pageerror', (e) => console.log('PAGEERROR', i, e.message));
    await p.goto(process.env.TCG_BASE || 'http://127.0.0.1:8123');
    await p.waitForFunction(() => !!window.__qa);
    await p.locator('#menu-other').click();
    await p.locator('#other-multiplayer').click();
    await p.locator('#multiplayer-auth').click();
    await p.locator('#login-username').fill(`qa${stamp}${i}`);
    await p.locator('#login-pin').fill(pin);
    await p.locator('#login-create').click();
    await p.waitForFunction(
      () => !document.querySelector('#login-overlay').classList.contains('active')
    );
    console.log('LOGIN', i);
  }
  const [a, b] = pages;
  // Authentication returns to multiplayer on this client.
  for (const p of pages) {
    if (await p.locator('#menu-overlay').evaluate((el) => el.classList.contains('active'))) {
      await p.locator('#menu-other').click();
      await p.locator('#other-multiplayer').click();
    }
  }
  await a.locator('#lobby-create').click();
  await a.waitForFunction(() =>
    /^[A-Z0-9]{6}$/.test(document.querySelector('#lobby-code-display').textContent.trim())
  );
  const code = (await a.locator('#lobby-code-display').innerText()).trim();
  console.log('LOBBY', code);
  await b.locator('#lobby-join').click();
  await b.locator('#lobby-code').fill(code);
  await b.locator('#lobby-join-form button[type=submit]').click();
  for (const p of pages) await p.locator('#lobby-continue').click();
  console.log('JOINED');
  for (let i = 0; i < 2; i++) {
    const p = pages[i];
    await p.locator('#deck-select-grid .deck-card--create').click();
    await p.locator('.deck-select-panel--' + (i ? 'reptile' : 'fish') + ' .deck-name').click();
    console.log('DECK BUTTONS', await p.locator('#deck-select-grid').innerText());
    await p.getByRole('button', { name: /CONFIRM.*READY/i }).click();
  }
  console.log('DECKS READY');
  for (let n = 0; n < 25; n++) {
    for (const p of pages) {
      const buttons = p.locator('#setup-overlay.active #setup-actions button:visible:enabled');
      if (await buttons.count()) {
        console.log('SETUP', await buttons.first().innerText());
        await buttons.first().click();
      }
      if (await p.locator('#pass-overlay.active #pass-confirm').count())
        await p.locator('#pass-confirm').click();
    }
    const s = await state(a);
    if (s.phase !== 'Setup' && s.players[0].hand.length) break;
    await a.waitForTimeout(600);
  }
  await snap('setup');
  const assert = (ok, msg, detail) => {
    if (!ok) throw new Error(msg + (detail ? `\n${detail}` : ''));
    console.log('PASS', msg);
  };
  assert((await state(a)).localPlayer !== (await state(b)).localPlayer, 'distinct player seats');
  const publicState = (s) =>
    JSON.stringify({
      turn: s.turn,
      phase: s.phase,
      active: s.activePlayer,
      players: s.players
        .map((p) => ({
          index: p.index,
          name: p.name,
          hp: p.hp,
          field: p.field.map((c) => c && { id: c.instanceId, hp: c.currentHp, atk: c.currentAtk }),
          deck: p.deckSize,
          carrion: p.carrion,
        }))
        .sort((x, y) => x.index - y.index),
    });
  async function synced() {
    for (let retry = 0; retry < 30; retry++) {
      const ss = await Promise.all(pages.map(state));
      if (publicState(ss[0]) === publicState(ss[1])) return ss;
      await a.waitForTimeout(200);
    }
    const ss = await Promise.all(pages.map(state));
    throw new Error(
      'Public game states diverged\n--- P1 ---\n' +
        publicState(ss[0]) +
        '\n--- P2 ---\n' +
        publicState(ss[1])
    );
  }
  let plays = 0,
    attacks = 0,
    done = false;
  for (let step = 0; step < Number(process.env.TCG_STEPS || 60); step++) {
    const ss = await synced();
    assert(
      ss.every((s) => s.players.every((p) => p.name === `qa${stamp}${p.index}`)),
      'both player names remain correct'
    );
    if (step === 8 && process.env.TCG_RECONNECT !== '0') {
      const before = ss[1];
      await b.reload();
      await b.waitForFunction(() => !!window.__qa);
      await b.locator('#menu-rejoin').click();
      await b.waitForFunction(() => window.__qa.getState().players[0].hand.length > 0);
      const recovered = (await synced())[1];
      assert(publicState(recovered) === publicState(before), 'guest refresh restores public state');
      const handBefore = JSON.stringify(before.players[0].hand, null, 1);
      const handAfter = JSON.stringify(recovered.players[0].hand, null, 1);
      assert(
        handAfter === handBefore,
        'guest refresh restores private hand',
        `before=${before.players[0].hand?.length} after=${recovered.players[0].hand?.length}\nBEFORE ${handBefore}\nAFTER ${handAfter}`
      );
      await snap('reconnected');
    }
    const win = await a.evaluate(() => window.__qa.isGameOver());
    if (win.over) {
      console.log('WIN', win);
      done = true;
      break;
    }
    const i = ss.findIndex((s) => s.ui.isMyTurn),
      p = pages[i],
      s = ss[i];
    if (!p) throw new Error('Neither client owns the turn');
    console.log(
      'STEP',
      step,
      'player',
      i,
      'turn',
      s.turn,
      s.phase,
      s.players.map((p) => p.hp)
    );
    const modal = p.locator('#selection-panel button:visible');
    if (await modal.count()) {
      const dry = p.getByRole('button', { name: 'Dry drop', exact: true });
      if (await dry.isVisible()) await dry.click();
      else await modal.last().click();
      await p.waitForTimeout(350);
      continue;
    }
    let acted = false;
    if (s.phase.startsWith('Main') && !s.ui.cardPlayedThisTurn) {
      const slot = s.players[0].field.findIndex((c) => !c);
      const card =
        s.players[0].hand.find((c) => c.type === 'Predator') ||
        s.players[0].hand.find((c) => c.type === 'Prey');
      if (slot >= 0 && card) {
        const from = p.locator(`#active-hand .card[data-instance-id="${card.instanceId}"]`);
        const to = p.locator(`.player-field .field-slot[data-slot="${slot}"]`);
        await from.dragTo(to);
        await p.waitForTimeout(400);
        const after = await state(p);
        acted =
          !after.players[0].hand.some((c) => c.instanceId === card.instanceId) ||
          !!after.ui.pendingSelection;
        if (acted) {
          plays++;
          console.log('PLAY', card.name);
        }
      }
    } else if (s.phase === 'Combat') {
      const attacker = s.players[0].field.find((c) => c?.canAttack && c.currentAtk > 0);
      if (attacker) {
        const from = p.locator(`.player-field .card[data-instance-id="${attacker.instanceId}"]`);
        const target = attacker.canAttackPlayer
          ? p.locator(`.player-badge[data-player-index="${s.players[1].index}"]`)
          : p.locator('.opponent-field .card').first();
        if (await target.count()) {
          await from.dragTo(target);
          await p.waitForTimeout(650);
          acted = publicState(s) !== publicState(await state(p));
          if (acted) {
            attacks++;
            console.log('ATTACK', attacker.name);
          }
        }
      }
    }
    if (!acted) {
      await p.mouse.move(5, 500);
      await p.waitForTimeout(400);
      await p.locator('#field-turn-btn').click();
    }
    await p.waitForTimeout(400);
    if (plays >= 2 && step % 8 === 0) await snap('gameplay');
  }
  if (!done) {
    await a.mouse.move(5, 500);
    await a.locator('#field-surrender-btn').click();
    await a.locator('#surrender-yes').click();
    await Promise.all(pages.map((p) => p.waitForFunction(() => window.__qa.isGameOver().over)));
    const winners = await Promise.all(pages.map((p) => p.evaluate(() => window.__qa.isGameOver())));
    assert(winners[0].winner === winners[1].winner, 'both clients agree on concession winner');
    done = true;
    console.log('END_REASON concession after bounded gameplay smoke test');
  }
  await snap('final');
  assert(plays >= 2, 'multiple real card plays');
  assert(attacks >= 1, 'combat changes synchronized state');
  assert(done, 'match ended on both clients');
  await fs.writeFile(`${out}/result.json`, JSON.stringify({ plays, attacks, done }, null, 2));
} catch (e) {
  console.error(e);
  await snap('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  for (let i = 0; i < contexts.length; i++) {
    await contexts[i].close();
    await pages[i].video().saveAs(`${out}/player-${i + 1}.webm`);
  }
  await browser.close();
}
