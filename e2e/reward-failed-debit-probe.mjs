// R-03 failed-debit probe: real renderGame callbacks + actual button clicks.
// Only database IO is replaced (getSupabaseApi in /js/network/index.js routed
// to an in-page stub; all *.supabase.co aborted). No live writes, no credentials.
// Two distinct debit-failure fixtures, per parent:
//   fixture A "preCommitReject": debit rejected before durable commit (server row unchanged).
//   fixture B "committedAckLost": debit durably committed, then response lost (client reverts).
// Tier: production UI + production lobbyManager/ui.js paths; IO stubbed by routing.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const PORT = 8223;
const out = process.env.TCG_DEBIT_OUT || 'docs/qa/evidence/reward-failed-debit';
mkdirSync(out, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch({
  executablePath:
    process.env.TCG_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

try {
  const context = await browser.newContext();
  await context.route('**/*.supabase.co/**', (r) => r.abort());

  const source = readFileSync('js/network/index.js', 'utf8');
  const start = source.indexOf('export const getSupabaseApi = async');
  assert(start > 0, 'getSupabaseApi not found in js/network/index.js');
  const after = source.indexOf('\nexport ', start + 10);
  const origEnd = after > 0 ? after : source.length;
  const stub = `export const getSupabaseApi = async () => new Proxy({
    updateProfilePacks: async ({ packs }) => {
      const mode = window.auditDB.debitMode;
      window.auditDB.packWrites.push({ packs, mode });
      if (mode === 'preCommitReject') {
        window.auditDB.debitFailures++;
        throw new Error('simulated debit rejected before commit');
      }
      if (mode === 'committedAckLost') {
        window.auditDB.packs = packs;           // durable commit happens
        window.auditDB.debitFailures++;
        throw new Error('simulated ack lost after durable debit');
      }
      window.auditDB.packs = packs;             // healthy path
    },
    fetchPlayerCards: async () => { window.auditDB.cardFetches++; return []; },
    savePlayerCards: async ({ cards }) => {
      window.auditDB.grants.push(structuredClone(cards));
      // production shape: rows of {card_id, rarity}
      return cards.map((c) => ({ card_id: c.cardId, rarity: c.rarity }));
    },
    updateProfileStats: async () => {},
  }, {
    get: (t, p) => (p in t ? t[p] : (p === 'then' ? undefined : async () => [])),
  });`;
  await context.route(
    (u) => u.pathname === '/js/network/index.js',
    (r) =>
      r.fulfill({
        contentType: 'text/javascript',
        body: source.slice(0, start) + stub + source.slice(origEnd),
      })
  );

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`http://127.0.0.1:${PORT}`);
  await page.waitForFunction(() => !!document.querySelector('#menu-overlay.active'), null, {
    timeout: 15000,
  });

  const evidence = await page.evaluate(async () => {
    window.auditDB = {
      packs: 1, // server-owned row: exactly one pack on the account
      packWrites: [],
      debitFailures: 0,
      cardFetches: 0,
      grants: [],
      debitMode: 'preCommitReject',
    };
    const ui = await import('/js/ui.js');
    const { createGameState } = await import('/js/state/gameState.js');
    const state = createGameState();
    state.menu.mode = 'online';
    // ActionBus requires a resolvable hostId (ui.js renderGame -> initActionBus
    // reads state.menu.lobby.host_id) before renderGame can run in online mode.
    state.menu.lobby = { host_id: 'probe-1', players: [] };
    state.menu.profile = {
      id: 'probe-1',
      username: 'ProbeOne',
      packs: window.auditDB.packs,
      ownedCards: new Map(),
      stats: { gamesPlayed: 0, gamesWon: 0 },
    };

    const flush = async (ms = 250) => new Promise((r) => setTimeout(r, ms));
    const iterations = [];

    const openOnePack = async (round, mode) => {
      window.auditDB.debitMode = mode;
      state.menu.stage = 'collection';
      ui.renderGame(state);
      await flush();
      const serverBefore = window.auditDB.packs;
      const grantsBefore = window.auditDB.grants.length;

      // ACTUAL production click path: PlayerExperience [data-pe="packs"] ->
      // ui.js:4997 onOpenPack -> updatePackCount (debit) -> startPackOpening.
      await document.querySelector('[data-pe="packs"]').click();
      await flush();
      ui.renderGame(state); // production onUpdate redraw path
      await flush();

      const opened = state.menu.stage === 'pack-opening' || !!document.querySelector('#pack-unopened');
      const unopened = document.querySelector('#pack-unopened');
      let revealed = 0;
      if (opened && unopened) {
        unopened.focus();
        unopened.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })
        );
        await new Promise((r) => setTimeout(r, 1900));
        unopened.dispatchEvent(
          new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true })
        );
        await new Promise((r) => setTimeout(r, 700));
        const revealAll = document.querySelector('#pack-reveal-all');
        if (revealAll) {
          revealAll.click(); // -> updateButtonStates -> onSaveCards -> savePlayerCardsToDatabase
          await new Promise((r) => setTimeout(r, 1800));
          revealed = document.querySelectorAll('.pack-card.revealed').length;
        }
      }
      const done = document.querySelector('#pack-done');
      if (done) {
        done.click();
        await flush();
        ui.renderGame(state);
      }
      iterations.push({
        round,
        fixture: mode,
        serverPacksBefore: serverBefore,
        serverPacksAfter: window.auditDB.packs,
        localPacksAfter: state.menu.profile.packs,
        openedPackDespiteFailedDebit: opened,
        revealedCards: revealed,
        grantCountDelta: window.auditDB.grants.length - grantsBefore,
        grantedCards: window.auditDB.grants.at(-1) || [],
      });
    };

    // Fixture A: debit rejected before commit -> grant must not happen.
    await openOnePack(0, 'preCommitReject');
    // Fixture A repeat: proves the free-grant loop is unbounded per failure.
    await openOnePack(1, 'preCommitReject');
    // Fixture B: debit committed, ack lost -> client reverts; second open then
    // double-spends the single server pack (server row cannot go below 0 write).
    await openOnePack(2, 'committedAckLost');
    await openOnePack(3, 'healthy'); // client thinks it still has a pack after B

    return {
      tier: 'production UI (real clicks/keyboard) + production lobbyManager/ui.js; DB IO stubbed via routing; supabase.co aborted',
      expected: 'pack opens + card grants only when the debit durably commits; client and server balances converge on failure',
      serverPackRowFinal: window.auditDB.packs,
      packWritesAttempted: window.auditDB.packWrites,
      debitFailures: window.auditDB.debitFailures,
      grantCallsTotal: window.auditDB.grants.length,
      iterations,
    };
  });

  writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log('pageerrors:', JSON.stringify(errors));

  const a = evidence.iterations.filter((i) => i.fixture === 'preCommitReject');
  const b = evidence.iterations.filter((i) => i.fixture === 'committedAckLost');
  const freeGrants = a.filter((i) => i.openedPackDespiteFailedDebit && i.grantCountDelta > 0).length;
  const doubleSpend = b.length === 1 && b[0].serverPacksAfter === 0 && b[0].localPacksAfter === 1;

  console.log(`\nRESULT A (pre-commit reject): ${freeGrants}/${a.length} failed debits still granted a full pack of cards`);
  console.log(`RESULT B (committed-ack-lost): double-spend divergence=${doubleSpend}; final server row=${evidence.serverPackRowFinal}`);
  if (freeGrants > 0 || doubleSpend) {
    console.log('REPRODUCED: failed-debit free grant and/or double-spend divergence (bug assertions below intentionally NOT relied on for exit)');
  }
  // Primary bug assertions: these PASS when the vulnerability exists.
  assert.ok(freeGrants > 0, 'expected free grant on rejected debit to reproduce');
  assert.ok(doubleSpend, 'expected committed-ack-lost client/server divergence to reproduce');
} finally {
  await browser.close();
  server.kill();
}
