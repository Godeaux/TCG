// Two dedicated QA accounts. Removes only a friendship created by this run.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
if (process.env.TCG_LIVE_UI !== '1') throw Error('Live QA opt-in required');
const server = spawn('python3', ['-m', 'http.server', '8184', '--bind', '127.0.0.1'], {
  stdio: 'ignore',
});
const b = await chromium.launch({ channel: 'chrome' });
const a = await b.newPage(),
  z = await b.newPage();
a.setDefaultTimeout(20000);
z.setDefaultTimeout(20000);
let aid,
  bid,
  created = false;
const out = 'docs/player-experience';
await fs.mkdir(out, { recursive: true });
async function login(p, file) {
  const cred = JSON.parse(await fs.readFile(file, 'utf8'));
  await p.goto('http://127.0.0.1:8184');
  await p.locator('#menu-profile').click();
  await p.locator('#login-username').fill(cred.username);
  await p.locator('#login-pin').fill(cred.pin);
  await p.locator('#login-submit').click();
  await expect(p.locator('#menu-overlay')).toHaveClass(/active/, { timeout: 30000 });
  return p.evaluate(async () => {
    const x = await (await import('/js/network/supabaseApi.js')).fetchProfile();
    return { id: x.id, username: x.username };
  });
}
try {
  const ap = await login(a, '/tmp/tcg-ui-phase2-account.json');
  aid = ap.id;
  const bp = await login(z, '/tmp/tcg-ui-phase2-guest.json');
  bid = bp.id;
  const existing = await a.evaluate(
    async (id) =>
      await (await import('/js/network/supabaseApi.js')).fetchFriendships({ profileId: id }),
    aid
  );
  if (!existing.accepted.some((f) => f.friendId === bid)) {
    if ([...existing.incoming, ...existing.outgoing].some((f) => f.friendId === bid))
      throw Error('Existing QA request must be preserved; cannot create test friendship');
    await a.locator('#other-multiplayer').click();
    await a.locator('[data-pe="add-friend"]').click();
    await a.locator('#pe-add-username').fill(bp.username);
    await a.locator('[data-pe="find-player"]').click();
    await a.locator('[data-pe="add-profile"]').click();
    created = true;
    await expect(a.locator('.pe-notice')).toHaveText('Friend request sent.');
    await z.locator('#other-multiplayer').click();
    await z.locator('[data-pe="requests"]').click();
    await z.locator('[data-pe="accept"]').click();
    await z.locator('[data-pe="close-dialog"]').click();
  } else {
    await a.locator('#other-multiplayer').click();
    await z.locator('#other-multiplayer').click();
  }
  if (await a.locator('[data-pe="public-back"]').count())
    await a.locator('[data-pe="public-back"]').click();
  await expect(a.locator(`[data-pe="invite"][data-friend="${bid}"]`)).toBeVisible({
    timeout: 30000,
  });
  await a.setViewportSize({ width: 1440, height: 900 });
  await a.screenshot({ path: `${out}/desktop-real-friends.png` });
  await a.locator(`[data-pe="view-friend"][data-friend="${bid}"]`).click();
  await expect(a.locator('.pe-hero')).toBeVisible();
  await a.screenshot({ path: `${out}/desktop-real-public-profile.png` });
  await a.setViewportSize({ width: 393, height: 852 });
  await a.screenshot({ path: `${out}/mobile-real-public-profile.png` });
  await a.locator('[data-pe="public-back"]').click();
  await a.locator(`[data-pe="invite"][data-friend="${bid}"]`).click();
  await expect(z.locator('.duel-invite-accept')).toBeVisible({ timeout: 20000 });
  await a.locator('.duel-invite-cancel').click();
  await expect(z.locator('.duel-invite-header h3')).toHaveText('Invite Cancelled', {
    timeout: 10000,
  });
  await z.locator('.duel-invite-dismiss').click();
  await a.locator(`[data-pe="invite"][data-friend="${bid}"]`).click();
  await expect(z.locator('.duel-invite-accept')).toBeVisible({ timeout: 20000 });
  await z.locator('.duel-invite-accept').click();
  await expect(a.locator('#multiplayer-overlay')).toHaveClass(/active/, { timeout: 30000 });
  await expect(z.locator('#multiplayer-overlay')).toHaveClass(/active/, { timeout: 30000 });
  const code = await a.locator('#lobby-code-display').innerText();
  expect(code).not.toBe('----');
  await expect(z.locator('#lobby-code-display')).toHaveText(code);
  console.log('PASS two-account add/find/profile/request/accept/presence/invite/cancel/join');
} catch (error) {
  console.error('Friend screen:', await a.locator('#player-experience').innerText());
  console.error('Receiver:', await z.locator('#player-experience').innerText());
  throw error;
} finally {
  if (aid && bid) {
    await a
      .evaluate(
        async ({ aid, bid, created }) => {
          const api = await import('/js/network/supabaseApi.js');
          if (created) {
            const f = await api.fetchFriendships({ profileId: aid });
            const rel = [...f.accepted, ...f.incoming, ...f.outgoing].find(
              (x) => x.friendId === bid
            );
            if (rel) await api.removeFriendship({ friendshipId: rel.id, profileId: aid });
          }
          const { supabase } = await import('/js/network/supabaseClient.js');
          await supabase
            .from('duel_invites')
            .update({ status: 'cancelled' })
            .eq('sender_id', aid)
            .eq('receiver_id', bid)
            .eq('status', 'pending');
          const lobby = await api.findExistingLobby({ userId: aid }).catch(() => null);
          if (lobby?.id) await api.closeLobby({ lobbyId: lobby.id, userId: aid });
        },
        { aid, bid, created }
      )
      .catch((e) => console.error('QA cleanup:', e.message));
  }
  await b.close();
  server.kill();
}
