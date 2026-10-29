// Local production settlement + JSON recovery probe. Only database IO is replaced.
// This is not a live-account exploit or a human-played match.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out = process.env.TCG_REWARD_OUT || '/tmp/tcg-reward-rejoin';
mkdirSync(out, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '8220', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const context = await browser.newContext();
  await context.route('**/*.supabase.co/**', (r) => r.abort());
  const source = readFileSync('js/network/index.js', 'utf8');
  const start = source.indexOf('export const getSupabaseApi = async');
  assert(start > 0);
  await context.route(
    (u) => u.pathname === '/js/network/index.js',
    (r) =>
      r.fulfill({
        contentType: 'text/javascript',
        body:
          source.slice(0, start) +
          `export const getSupabaseApi = async () => ({
    updateProfilePacks: async ({packs}) => { window.auditDB.packs=packs; window.auditDB.packWrites.push(packs); if(window.auditFailOnce){window.auditFailOnce=false;throw new Error("simulated response lost after durable credit");} },
    updateProfileStats: async ({stats,matches}) => { window.auditDB.stats=structuredClone(stats); window.auditDB.matches=structuredClone(matches); }
  });`,
      })
  );
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8220');
  await page.waitForFunction(() => window.__qa);
  const evidence = await page.evaluate(async (failResponse) => {
    window.auditFailOnce = failResponse;
    const { createGameState } = await import('/js/state/gameState.js');
    const { createCardInstance } = await import('/js/cardTypes.js');
    const { getCardDefinitionById } = await import('/js/cards/index.js');
    const { buildLobbySyncPayload, applyLobbySyncPayload } =
      await import('/js/network/serialization.js');
    const { checkForVictory } = await import('/js/ui/overlays/VictoryOverlay.js');
    window.auditDB = {
      packs: 0,
      stats: { gamesPlayed: 0, gamesWon: 0 },
      matches: [],
      packWrites: [],
    };
    const makeClient = () => {
      const s = createGameState();
      s.menu.mode = 'online';
      s.menu.profile = {
        id: 'audit-host',
        username: 'Audit Host',
        packs: auditDB.packs,
        stats: structuredClone(auditDB.stats),
        matches: structuredClone(auditDB.matches),
      };
      s.menu.lobby = { id: 'same-completed-lobby', host_id: 'audit-host', guest_id: 'audit-guest' };
      return s;
    };
    const flush = async () => {
      await new Promise((r) => setTimeout(r, 20));
    };
    const host = makeClient();
    host.setup.stage = host.deckSelection.stage = host.deckBuilder.stage = 'complete';
    host.phase = 'Main 1';
    host.turn = 6;
    host.players[0].hp = 10;
    host.players[1].hp = 0;
    host.players[0].deck = [
      createCardInstance(getCardDefinitionById('fish-prey-cannibal-fish'), 1),
    ];
    checkForVictory(host);
    await flush();
    const firstAward = auditDB.packs;
    const localBalanceAfterFirst = host.menu.profile.packs;
    checkForVictory(host);
    await flush();
    const sameStateRerender = auditDB.packs;
    const saved = JSON.parse(JSON.stringify(buildLobbySyncPayload(host)));
    const rejoined = [];
    for (let i = 0; i < 3; i++) {
      const restored = makeClient();
      applyLobbySyncPayload(restored, JSON.parse(JSON.stringify(saved)), { forceApply: true });
      const before = {
        victoryProcessed: restored.victoryProcessed,
        hp: restored.players.map((p) => p.hp),
        turn: restored.turn,
      };
      checkForVictory(restored);
      await flush();
      rejoined.push({ before, packs: auditDB.packs, gamesPlayed: auditDB.stats.gamesPlayed });
    }
    return {
      tier: 'production-component + actual JSON recovery; database IO mocked',
      expected: 'one credit per account per completed match, including after restore',
      firstAward,
      localBalanceAfterFirst,
      sameStateRerender,
      savedContainsVictoryProcessed: JSON.stringify(saved).includes('victoryProcessed'),
      rejoined,
      database: auditDB,
    };
  }, process.env.TCG_REWARD_FAIL_RESPONSE === '1');
  writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  assert.equal(evidence.firstAward, 1);
  assert.equal(evidence.sameStateRerender, 1);
  assert.equal(evidence.database.packs, 1, 'completed-match recovery must not credit packs again');
} finally {
  await browser.close();
  server.kill();
}
