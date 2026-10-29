// R-03/R-01 two-client double-spend: two real browser pages (independent UI
// state), production updatePackCount/save callbacks, ONE shared Node-side mock
// IO ledger, ONE server pack, two openings. Only DB IO is replaced; all
// *.supabase.co requests are aborted. No live writes, no credentials.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const PORT = 8224;
const out = process.env.TCG_2CLIENT_OUT || 'docs/qa/evidence/reward-two-client';
mkdirSync(out, { recursive: true });

// Shared ledger: the single "server row" both browser clients write through.
const ledger = { packs: 1, packWrites: [], grants: [] };

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
  assert(start > 0);
  const after = source.indexOf('\nexport ', start + 10);
  const origEnd = after > 0 ? after : source.length;
  const stub = `const call = (m, a) => window.auditCall(m, a);
export const getSupabaseApi = async () => new Proxy({
  updateProfilePacks: async ({ packs }) => call('updateProfilePacks', { packs }),
  fetchPlayerCards: async () => call('fetchPlayerCards', {}),
  savePlayerCards: async ({ cards }) => call('savePlayerCards', { cards }),
  updateProfileStats: async () => call('updateProfileStats', {}),
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

  // Single Node-side ledger shared by BOTH pages through the binding.
  context.exposeBinding('auditCall', async (_src, method, args) => {
    if (method === 'updateProfilePacks') {
      ledger.packWrites.push({ packs: args.packs, at: Date.now() });
      ledger.packs = args.packs; // absolute write, like production update
      return null;
    }
    if (method === 'savePlayerCards') {
      ledger.grants.push({ count: args.cards.length, cards: args.cards });
      return args.cards.map((c) => ({ card_id: c.cardId, rarity: c.rarity }));
    }
    if (method === 'fetchPlayerCards') return [];
    return null;
  });

  const boot = async (who) => {
    const page = await context.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.goto(`http://127.0.0.1:${PORT}`);
    await page.waitForFunction(() => !!document.querySelector('#menu-overlay.active'), null, {
      timeout: 15000,
    });
    await page.evaluate(async ({ id, packs }) => {
      const ui = await import('/js/ui.js');
      const { createGameState } = await import('/js/state/gameState.js');
      window.__ui = ui;
      const state = createGameState();
      state.menu.mode = 'online';
      state.menu.lobby = { host_id: id, players: [] };
      state.menu.profile = {
        id,
        username: id,
        packs, // loaded while the server row still says 1 (both clients start fresh)
        ownedCards: new Map(),
        stats: { gamesPlayed: 0, gamesWon: 0 },
      };
      window.__state = state;
      state.menu.stage = 'collection';
      ui.renderGame(state);
    }, { id: who, packs: ledger.packs });
    return { page, errs };
  };

  const openPack = async (page) =>
    page.evaluate(async () => {
      const ui = window.__ui;
      const state = window.__state;
      const flush = async (ms = 250) => new Promise((r) => setTimeout(r, ms));
      state.menu.stage = 'collection';
      ui.renderGame(state);
      await flush();
      await document.querySelector('[data-pe="packs"]').click(); // production click path
      await flush();
      ui.renderGame(state);
      await flush();
      const opened = state.menu.stage === 'pack-opening' || !!document.querySelector('#pack-unopened');
      const unopened = document.querySelector('#pack-unopened');
      let revealed = 0;
      if (opened && unopened) {
        unopened.focus();
        unopened.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
        await new Promise((r) => setTimeout(r, 1900));
        unopened.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
        await new Promise((r) => setTimeout(r, 700));
        const revealAll = document.querySelector('#pack-reveal-all');
        if (revealAll) {
          revealAll.click();
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
      return { opened, revealed, localPacks: state.menu.profile.packs };
    });

  // Client A and client B both load at packs=1, then BOTH open a pack.
  const A = await boot('probe-A');
  const B = await boot('probe-B');
  const aResult = await openPack(A.page);
  const ledgerAfterA = { ...ledger, packWrites: [...ledger.packWrites], grants: [...ledger.grants] };
  const bResult = await openPack(B.page);

  const evidence = {
    tier: 'two production browser clients; production ui.js/lobbyManager callbacks; shared Node-side ledger replaces only getSupabaseApi; supabase.co aborted',
    expected: 'one server pack permits one open + one grant total across clients',
    initialServerPacks: 1,
    clientA: { ...aResult },
    ledgerAfterA: {
      packs: ledgerAfterA.packs,
      grantCount: ledgerAfterA.grants.length,
    },
    clientB: { ...bResult },
    finalLedger: {
      packs: ledger.packs,
      grantCount: ledger.grants.length,
      totalCardsGranted: ledger.grants.reduce((n, g) => n + g.count, 0),
      packWrites: ledger.packWrites.map((w) => w.packs),
    },
  };
  writeFileSync(`${out}/evidence.json`, JSON.stringify({ evidence, ledger }, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log('pageerrors A/B:', JSON.stringify(A.errs), JSON.stringify(B.errs));

  const doubleSpend =
    aResult.opened && bResult.opened && ledger.grants.length === 2 && ledger.packs === 0;
  assert.ok(
    doubleSpend,
    'expected both clients to open+grant against a single server pack (double-spend)'
  );
  console.log(
    `\nREPRODUCED: 2 packs opened, ${evidence.finalLedger.totalCardsGranted} cards granted, 2 grant calls, server pack row ended at ${ledger.packs} — single pack double-spent via absolute-write lost update with production UI on both clients`
  );
} finally {
  await browser.close();
  server.kill();
}
