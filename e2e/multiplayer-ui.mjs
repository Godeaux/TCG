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
let trapRequests = 0;
const trapEvidence = [];
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
    await ctx.addInitScript(() => {
      window.__headerSamples = [];
      setInterval(() => {
        if (
          !window.__qa ||
          window.__qa.act.menu.getMenuState().stage !== 'ready' ||
          window.__qa.getState().phase === 'Setup'
        )
          return;
        const header = document.querySelector('#scoreboard-row');
        if (!header) return;
        const ancestors = [];
        for (let el = header.parentElement; el; el = el.parentElement) {
          if (el.scrollTop) ancestors.push({ name: el.className || el.tagName, top: el.scrollTop });
        }
        window.__headerSamples.push({
          time: Date.now(),
          y: header.getBoundingClientRect().y,
          ancestors,
        });
      }, 100);
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
      await p.locator('#other-multiplayer').click();
    }
  }
  await a.locator('#lobby-create').click();
  await a.waitForFunction(() =>
    /^[A-Z0-9]{6}$/.test(document.querySelector('#lobby-code-display').textContent.trim())
  );
  const code = (await a.locator('#lobby-code-display').innerText()).trim();
  console.log('LOBBY', code);
  await b.locator('#lobby-code').waitFor();
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
  async function answerTraps() {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const activate = p
        .locator('#reaction-overlay.active')
        .getByRole('button', { name: 'Activate', exact: true });
      if (await activate.count()) {
        const before = await state(p);
        const title = await p.locator('#reaction-title').innerText();
        const name = title.replace(/^Activate /, '').replace(/\?$/, '');
        console.log('TRAP_ACTIVATE', i, name);
        await activate.click();
        trapRequests++;
        trapEvidence.push({
          player: i,
          name,
          before: before.players[0].hand.filter((c) => c.type === 'Trap').map((c) => c.instanceId),
        });
        await p.waitForTimeout(250);
      }
    }
  }
  const inventories = () =>
    Promise.all(
      pages.map((page) =>
        page.evaluate(async () => {
          const { getActionBus } = await import('/js/network/actionBus.js');
          return getActionBus()
            .getState()
            .players.map((player) => ({
              hand: player.hand.map((c) => ({ id: c.id, instanceId: c.instanceId })),
              deck: player.deck.map((c) => ({ id: c.id, instanceId: c.instanceId })),
            }));
        })
      )
    );
  async function synced() {
    for (let retry = 0; retry < 30; retry++) {
      await answerTraps();
      const ss = await Promise.all(pages.map(state));
      const cards = await inventories();
      if (
        publicState(ss[0]) === publicState(ss[1]) &&
        JSON.stringify(cards[0]) === JSON.stringify(cards[1])
      )
        return ss;
      await a.waitForTimeout(200);
    }
    const ss = await Promise.all(pages.map(state));
    await fs.writeFile(
      `${out}/diverged-inventories.json`,
      JSON.stringify(await inventories(), null, 2)
    );
    throw new Error(
      'Game states or private card identities diverged\n--- P1 ---\n' +
        publicState(ss[0]) +
        '\n--- P2 ---\n' +
        publicState(ss[1])
    );
  }
  let plays = 0,
    attacks = 0,
    done = false;
  // Modal card/option pickers rendered outside #selection-panel intercept every
  // click until dismissed. Returns true if a modal was handled.
  const dismissModal = async (p) => {
    for (const sel of ['.card-selection-overlay', '.option-selection-overlay']) {
      const box = p.locator(`${sel}:visible`);
      if (await box.count()) {
        const opts = box.locator('.card, .option-selection-btn, button:not(.cancel-targeting)');
        if (await opts.count()) {
          console.log(
            'MODAL_PICK',
            sel,
            await opts
              .first()
              .innerText()
              .catch(() => '')
          );
          await opts.first().click({ force: true });
        } else {
          await box.locator('.cancel-targeting').last().click({ force: true });
        }
        await p.waitForTimeout(350);
        return true;
      }
    }
    return false;
  };
  // Sequencing counters plus the count of guest intents the host actually
  // CONFIRMED (reached a terminal outcome), which is the only honest measure
  // of "the guest has really finished something" before a reload.
  const busSnapshot = (page) =>
    page.evaluate(async () => {
      const { getActionBus } = await import('/js/network/actionBus.js');
      const bus = getActionBus();
      return {
        seq: bus._seq,
        nextExpectedIntent: bus._nextExpectedIntent,
        lastProcessedIntent: bus._lastProcessedIntent,
        intentCounter: bus._intentCounter,
        confirmedGuestIntents: bus.getActionLog().filter((e) => e.intentId).length,
        queuedIntents: [...bus._intentQueue.keys()],
        pendingIntents: [...bus._pendingIntents.keys()],
      };
    });
  // One string that pins the whole match: public board + every private card
  // identity + the PRNG position. A reload that replayed, dropped or reordered
  // anything — including a single random number — changes it.
  const fingerprint = (page) =>
    page.evaluate(async () => {
      const { getActionBus } = await import('/js/network/actionBus.js');
      const { getGameRandomState } = await import('/js/state/gameState.js');
      const s = getActionBus().getState();
      const id = (c) => (c ? [c.id, c.instanceId, c.currentAtk, c.currentHp] : null);
      return JSON.stringify({
        turn: s.turn,
        phase: s.phase,
        active: s.activePlayerIndex,
        players: s.players.map((p) => ({
          hp: p.hp,
          field: p.field.map(id),
          hand: p.hand.map((c) => [c.id, c.instanceId]),
          deck: p.deck.map((c) => [c.id, c.instanceId]),
          exile: p.exile.map((c) => [c.id, c.instanceId]),
          carrion: p.carrion.map((c) => [c.id, c.instanceId]),
        })),
        rng: getGameRandomState(),
      });
    });
  // Pass the turn until `index` owns it. Returning false means the bounded
  // attempt ran out — callers assert on it, so a missing turn is a failure
  // rather than a silently skipped check.
  const passUntilTurn = async (index, limit = 12) => {
    for (let i = 0; i < limit; i++) {
      if (await pages[index].evaluate(() => window.__qa.isGameOver().over)) return false;
      const s = await state(pages[index]);
      if (s.ui.isMyTurn) return true;
      const other = 1 - index;
      await answerTraps();
      if (await dismissModal(pages[other])) continue;
      await pages[other].mouse.move(5, 500);
      await pages[other].waitForTimeout(250);
      if (await dismissModal(pages[other])) continue;
      const sel = pages[other].locator('#selection-panel button:visible');
      if (await sel.count())
        await sel
          .first()
          .click()
          .catch(() => {});
      await pages[other]
        .locator('#field-turn-btn')
        .click()
        .catch(() => {});
      await pages[other].waitForTimeout(600);
    }
    return false;
  };
  let refreshDone = false;
  for (let step = 0; step < Number(process.env.TCG_STEPS || 60); step++) {
    const ss = await synced();
    assert(
      ss.every((s) => s.players.every((p) => p.name === `qa${stamp}${p.index}`)),
      'both player names remain correct'
    );
    const reconnectPlayer = Number(process.env.TCG_RECONNECT_PLAYER ?? 1);
    if (!refreshDone && process.env.TCG_RECONNECT !== '0' && step >= 8) {
      if (reconnectPlayer === 0) {
        // Precondition, enforced rather than assumed: the guest must already
        // have finished >=2 CONFIRMED intents, otherwise the reload proves
        // nothing about restored progress and the run reports a false pass.
        const countersBefore = await busSnapshot(a);
        console.log('HOST_RECONNECT_PRECONDITION', JSON.stringify(countersBefore));
        if (countersBefore.confirmedGuestIntents < 2) {
          console.log(
            'HOST_RECONNECT_WAITING confirmedGuestIntents=' + countersBefore.confirmedGuestIntents
          );
        } else {
          refreshDone = true;
          const before = { host: await fingerprint(a), guest: await fingerprint(b) };
          const cardsBefore = await inventories();
          const seqBefore = countersBefore.seq;

          await a.reload();
          await a.waitForFunction(() => !!window.__qa);
          await a.locator('#menu-rejoin').click();
          await a.waitForFunction(() => window.__qa.getState().players[0].hand.length > 0);
          await a.waitForTimeout(1000);

          const after = { host: await fingerprint(a), guest: await fingerprint(b) };
          const countersAfter = { host: await busSnapshot(a), guest: await busSnapshot(b) };
          console.log('COUNTERS_AFTER_RECONNECT', JSON.stringify(countersAfter));
          const cardsAfter = await inventories();
          await fs.writeFile(
            `${out}/host-reconnect-counters.json`,
            JSON.stringify({ countersBefore, countersAfter, before, after, seqBefore }, null, 2)
          );
          await snap('host-reconnected');

          // Unconditional checks. Each client is compared against the record
          // captured before the reload, never merely against each other, and
          // nothing is skipped when a mismatch is observed.
          assert(
            after.host === before.host,
            'host refresh restores its own checkpoint exactly',
            `\nBEFORE ${before.host}\nAFTER  ${after.host}`
          );
          assert(
            after.guest === before.guest,
            'surviving guest is untouched by the host refresh',
            `\nBEFORE ${before.guest}\nAFTER  ${after.guest}`
          );
          assert(
            JSON.stringify(cardsAfter) === JSON.stringify(cardsBefore),
            'exact hand/deck identities preserved across host refresh',
            `\nBEFORE ${JSON.stringify(cardsBefore)}\nAFTER  ${JSON.stringify(cardsAfter)}`
          );
          assert(
            countersAfter.host.seq === seqBefore,
            `restored host resumes at actionSequence ${seqBefore}`,
            `got ${countersAfter.host.seq}`
          );
          assert(
            countersAfter.host.lastProcessedIntent >= 2,
            'restored host resumes past the guest intents it already finished',
            JSON.stringify(countersAfter.host)
          );
          assert(
            countersAfter.host.queuedIntents.length === 0,
            'no intent stranded in the buffer by the refresh',
            JSON.stringify(countersAfter.host)
          );

          // Post-rejoin proof, both directions. Reaching the required turn is
          // earned by passing legally; failure is a bounded timeout, not a skip.
          assert(
            await passUntilTurn(1),
            'reached the guest turn after the host refresh (bounded pass limit)'
          );
          const guestSeqBefore = (await busSnapshot(a)).seq;
          await b.locator('#field-turn-btn').click();
          await b.waitForTimeout(3000);
          const afterGuest = await busSnapshot(a);
          console.log('POST_RELOAD_GUEST_ACTION', JSON.stringify({ guestSeqBefore, afterGuest }));
          assert(
            afterGuest.seq === guestSeqBefore + 1,
            'post-reload guest action is confirmed by the restored host',
            `host seq ${guestSeqBefore} -> ${afterGuest.seq}`
          );
          assert(
            (await busSnapshot(b)).pendingIntents.length === 0,
            'guest is not left pending after its post-reload action'
          );

          assert(
            await passUntilTurn(0),
            'reached the host turn after the host refresh (bounded pass limit)'
          );
          const hostSeqBefore = (await busSnapshot(a)).seq;
          await a.locator('#field-turn-btn').click();
          await a.waitForTimeout(3000);
          const afterHost = await busSnapshot(a);
          console.log('POST_RELOAD_HOST_ACTION', JSON.stringify({ hostSeqBefore, afterHost }));
          assert(
            afterHost.seq === hostSeqBefore + 1,
            'the refreshed host can still confirm its own action',
            `seq ${hostSeqBefore} -> ${afterHost.seq}`
          );
          await synced();
          continue;
        }
      } else {
        refreshDone = true;
        const before = ss[1];
        await b.reload();
        await b.waitForFunction(() => !!window.__qa);
        await b.locator('#menu-rejoin').click();
        await b.waitForFunction(() => window.__qa.getState().players[0].hand.length > 0);
        const recovered = (await synced())[1];
        assert(
          publicState(recovered) === publicState(before),
          'guest refresh restores public state'
        );
        const handBefore = JSON.stringify(before.players[0].hand, null, 1);
        const handAfter = JSON.stringify(recovered.players[0].hand, null, 1);
        assert(
          handAfter === handBefore,
          'guest refresh restores private hand',
          `before=${before.players[0].hand?.length} after=${recovered.players[0].hand?.length}\nBEFORE ${handBefore}\nAFTER ${handAfter}`
        );
        await snap('reconnected');
      }
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
    const targeting = p.locator('#targeting-banner:visible');
    if (await targeting.count()) {
      const targets = p.locator('.effect-target:visible');
      if (await targets.count()) await targets.first().click();
      else await targeting.locator('.skip-targeting').click();
      await p.waitForTimeout(350);
      continue;
    }
    // Modal card/option pickers rendered outside #selection-panel intercept
    // every click until dismissed; handle them before anything else.
    if (await dismissModal(p)) continue;
    await p.mouse.move(5, 500);
    await p.waitForTimeout(300);
    const modal = p.locator('#selection-panel button:visible');
    if (await modal.count()) {
      const dry = p.getByRole('button', { name: 'Dry drop', exact: true });
      if (await dry.isVisible()) await dry.click();
      else {
        const choices = p.locator('#selection-panel .selection-list button:visible:enabled');
        const choice = (await choices.count())
          ? choices.first()
          : modal.filter({ hasNotText: /^(Hide|Show)$/ }).last();
        console.log('SELECTION', await choice.innerText());
        await choice.click();
      }
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
    await answerTraps();
    // A play/trap may surface a modal picker mid-iteration that would eat the
    // turn-button click; clear it first.
    if (await dismissModal(p)) continue;
    if (!acted) {
      await p.mouse.move(5, 500);
      await p.waitForTimeout(400);
      if (await dismissModal(p)) continue;
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
  const finalStates = await Promise.all(pages.map(state));
  const activatedTraps = trapEvidence.filter(
    (t) =>
      finalStates.every((s) =>
        s.players.find((player) => player.index === t.player).exile.includes(t.name)
      ) &&
      !finalStates[t.player].players[0].hand.some(
        (card) => t.before.includes(card.instanceId) && card.name === t.name
      )
  );
  if (process.env.TCG_REQUIRE_TRAPS === '0') console.log('NOT REQUIRED: trap activation coverage');
  else
    assert(activatedTraps.length > 0, 'activated traps leave hand and reach exile on both clients');
  for (let i = 0; i < pages.length; i++) {
    const winner = await pages[i].evaluate(() => window.__qa.isGameOver().winner);
    assert(
      (await pages[i].locator('.victory-title').innerText()) ===
        (winner === finalStates[i].localPlayer ? 'VICTORY' : 'DEFEAT'),
      'correct local victory/defeat title'
    );
  }
  await fs.writeFile(
    `${out}/traps.json`,
    JSON.stringify({ trapRequests, trapEvidence, activatedTraps }, null, 2)
  );
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
    const samples = await pages[i].evaluate(() => window.__headerSamples || []);
    await fs.writeFile(`${out}/header-p${i + 1}.json`, JSON.stringify(samples));
    if (samples.length) {
      const min = Math.min(...samples.map((s) => s.y));
      const max = Math.max(...samples.map((s) => s.y));
      console.log('HEADER_RANGE', i, min, max);
      if (max - min > 1) {
        console.error('FAIL header moved during gameplay', i, max - min);
        process.exitCode = 1;
      }
    }
    await contexts[i].close();
    await pages[i].video().saveAs(`${out}/player-${i + 1}.webm`);
  }
  await browser.close();
}
