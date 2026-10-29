// Production component fixtures with untrusted strings; no account or network writes.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn('python3', ['-m', 'http.server', '8210', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
const browser = await chromium.launch(
  process.env.TCG_CHROME ? { executablePath: process.env.TCG_CHROME } : {}
);
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8210');
  await page.waitForFunction(() => window.__qa);
  const results = await page.evaluate(async () => {
    const { updateRematchStatus } = await import('/js/ui/overlays/VictoryOverlay.js');
    const { renderProfileOverlay } = await import('/js/ui/overlays/ProfileOverlay.js');
    const names = ['<b data-audit="name">Opponent</b>', 'O’Brien & 海 "🦈"'];
    const results = [];
    for (const name of names) {
      for (const choice of ['menu', 'rematch', 'rematch-deck']) {
        updateRematchStatus({
          players: [{ name: 'Me' }, { name }],
          rematch: { choices: [null, choice] },
        });
        const status = document.querySelector('#victory-opponent-status');
        results.push({
          label: choice,
          literal:
            status.textContent ===
            `${choice === 'menu' ? '❌' : '✅'} ${name} ${choice === 'menu' ? 'left' : 'wants to play again'}`,
          injected: !!status.querySelector('[data-audit]'),
        });
      }
      renderProfileOverlay({
        menu: {
          stage: 'profile',
          profile: {
            matches: [
              { won: true, opponent: name, opponentDeck: name, playerHp: 8, opponentHp: 0 },
            ],
          },
        },
      });
      const row = document.querySelector('.profile-match-item');
      results.push({
        label: 'history',
        literal:
          row.querySelector('.profile-match-opponent').textContent === `vs ${name} (${name})`,
        injected: !!row.querySelector('[data-audit]'),
      });
    }
    return results;
  });
  assert(
    results.every((r) => r.literal && !r.injected),
    JSON.stringify(results)
  );
  console.log('PASS: rematch choices and profile history preserve literal opponent/deck names');
} finally {
  await browser.close();
  server.kill();
}
