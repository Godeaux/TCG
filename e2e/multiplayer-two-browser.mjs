// Two-browser end-to-end multiplayer verification through the app's real modules.
// Covers the acceptance criteria that blocked "multiplayer is broken":
//   1. two fresh profiles authenticate (anonymous auth + username/PIN)
//   2. host creates a lobby, guest joins by code through live RLS
//   3. realtime lobby channel reaches SUBSCRIBED and the row change propagates
//   4. gameplay transport (broadcast on the lobby channel) round-trips
//   5. reconnect persistence (saveGameState / loadGameState) works under live RLS
// Run: node e2e/multiplayer-two-browser.mjs   (repo must be served on :8123)
import { chromium } from '@playwright/test';

const BASE = process.env.TCG_BASE || 'http://127.0.0.1:8123/index.html';
// Prefer the Playwright-managed browser; TCG_CHROME overrides with any local
// Chromium build when the managed one is not installed on the machine.
const EXE = process.env.TCG_CHROME || undefined;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: EXE });

async function side(name) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 160)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/network/supabaseApi.js');
    const { supabase } = await import('/js/network/supabaseClient.js');
    const sync = await import('/js/network/sync.js');
    window.__api = api;
    window.__sb = supabase;
    window.__sync = sync;
    window.__rows = [];
  });
  return { name, ctx, page, errors };
}

const A = await side('A');
const B = await side('B');

const stamp = Date.now().toString(36).slice(-6);
const userA = `zzmp${stamp}a`.slice(0, 16);
const userB = `zzmp${stamp}b`.slice(0, 16);

// 1. accounts + re-login by PIN (the app's own login path)
const mk = (s, u) =>
  s.page.evaluate(
    async ([username, pin]) => {
      const p = await window.__api.createAccountWithPin(username, pin);
      await window.__api.logoutProfile?.().catch(() => {});
      const again = await window.__api.loginWithPin(username, pin);
      return { id: p.id, reloginId: again?.id };
    },
    [u, '1234']
  );

const [accA, accB] = [await mk(A, userA), await mk(B, userB)];
check(
  '1. authenticate + PIN re-login',
  !!accA.id && accA.reloginId === accA.id && !!accB.id,
  `${userA}/${userB}`
);

// 2. lobby create + join by code
const lobby = await A.page.evaluate(
  (hostId) => window.__api.createLobby({ hostId, forceNew: true }),
  accA.id
);
check('2a. host creates lobby (live RLS insert)', !!lobby?.id, `code ${lobby?.code}`);

// 3. realtime: both sides subscribe via the app's own subscribeToLobby,
//    then the guest join must arrive as a postgres_changes row event.
const aSeesJoin = (async () => {
  await A.page.evaluate(() => (window.__rows = []));
  await A.page.evaluate(
    ([id, cbId]) =>
      new Promise((resolve) => {
        // subscribeToLobby already calls subscribe(); build the channel manually
        // only because we need the status callback.
        const ch = window.__sb.channel(`lobby-${id}`);
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'lobbies', filter: `id=eq.${id}` },
          (p) => window.__rows.push({ status: p.new?.status, guest: p.new?.guest_id })
        );
        ch.subscribe((st) => st === 'SUBSCRIBED' && resolve(true));
      }),
    [lobby.id, accA.id]
  );
  const j = await B.page.evaluate(
    ([code, guestId]) => window.__api.joinLobbyByCode({ code, guestId }),
    [lobby.code, accB.id]
  );
  await A.page.waitForTimeout(2500);
  const rows = await A.page.evaluate(() => window.__rows);
  return { j, rows };
})();
const { j: joined, rows } = await aSeesJoin;
check(
  '2b. guest joins by code (RLS update)',
  joined?.guest_id === accB.id,
  `status ${joined?.status}`
);
check(
  '3. realtime lobby row propagates to host',
  rows.some((r) => r.guest === accB.id && r.status === 'full'),
  JSON.stringify(rows).slice(0, 120)
);

// 4. gameplay transport: broadcast on the lobby channel (this is what sync.js uses)
const [bcast] = await Promise.all([
  A.page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const ch = window.__sb.channel(`lobby-${id}-rt`);
        ch.on('broadcast', { event: 'sync_state' }, ({ payload }) => resolve(payload));
        ch.subscribe();
        setTimeout(() => resolve(null), 10000);
      }),
    lobby.id
  ),
  B.page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const ch = window.__sb.channel(`lobby-${id}-rt`);
        ch.subscribe((st) => {
          if (st === 'SUBSCRIBED') {
            window.__sync.setLobbyChannel(ch);
            window.__sync.sendLobbyBroadcast('sync_state', { seq: 42, from: 'B' });
            resolve(true);
          }
        });
      }),
    lobby.id
  ),
]);
check(
  '4. gameplay broadcast round-trips (sync.js transport)',
  bcast?.seq === 42,
  JSON.stringify(bcast)
);

// 5. reconnect persistence
const saved = await A.page.evaluate(
  ([id, state]) =>
    window.__api
      .saveGameState({ lobbyId: id, gameState: state, actionSequence: 7 })
      .then(() => window.__api.loadGameState({ lobbyId: id })),
  [lobby.id, { e2e: true, hp: { p1: 7 } }]
);
check(
  '5. save/load game state (reconnect path, live RLS)',
  saved?.game_state?.e2e === true && saved?.action_sequence === 7,
  `seq ${saved?.action_sequence}`
);

// teardown: close the probe lobby
await A.page.evaluate((id) => window.__api.closeLobby({ lobbyId: id }).catch(() => {}), lobby.id);

console.log('\n' + results.filter((r) => r.pass).length + '/' + results.length + ' checks passed');
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
