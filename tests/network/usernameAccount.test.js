import { describe, it, expect, vi } from 'vitest';
import { createUsernameAccount } from '../../js/network/usernameAccount.js';
import { accountHandler } from '../../supabase/functions/tcg-accounts/handler.js';
const fixture = () => {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } }),
    setSession: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue({}),
  };
  const invoke = vi
    .fn()
    .mockResolvedValue({ data: { session: { access_token: 'access', refresh_token: 'refresh' } } });
  const rpc = vi.fn().mockResolvedValue({ data: { id: 'profile' } });
  return { auth, invoke, rpc, client: createUsernameAccount({ auth, invoke, rpc }) };
};
describe('username account client', () => {
  it('uses only username/password; loads identity from server after setting provider session', async () => {
    const { client, auth, invoke, rpc } = fixture();
    expect(await client.signup(' Player ', 'longpassword')).toEqual({ id: 'profile' });
    expect(invoke).toHaveBeenCalledWith('tcg-accounts', {
      body: { action: 'signup', username: 'Player', password: 'longpassword' },
    });
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
    expect(rpc).toHaveBeenCalledWith('tcg_current_profile');
  });
  it('never sets a session after a rejected password', async () => {
    const { client, auth, invoke } = fixture();
    invoke.mockResolvedValue({ data: { error: 'Incorrect username or password.' } });
    await expect(client.login('Player', 'wrongpassword')).rejects.toThrow('Incorrect');
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it('rejects malformed credentials without contacting server', async () => {
    const { client, invoke } = fixture();
    await expect(client.signup('x', 'short')).rejects.toThrow('Username');
    await expect(client.signup('Player', 'short')).rejects.toThrow('Password');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('does not load a persistent profile for a guest', async () => {
    const { client, auth, rpc } = fixture();
    auth.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    expect(await client.profile()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('logout never releases a permanent owner mapping', async () => {
    const { client, auth, rpc } = fixture();
    await client.logout();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
const serverFixture = () => {
  const provider = {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'a', refresh_token: 'r', user: { email: 'private' } } },
      }),
    },
  };
  const admin = {
    rpc: vi.fn(async (name) => ({
      data:
        name === 'tcg_account_attempt'
          ? true
          : name === 'tcg_account_alias'
            ? 'internal@accounts.invalid'
            : 'profile',
    })),
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'created' } } }),
        deleteUser: vi.fn().mockResolvedValue({}),
      },
    },
  };
  const send = async (action = 'signup', extra = {}) =>
    accountHandler({
      admin,
      passwordClient: () => provider,
      ipHash: async () => 'hashed-ip',
      ready: true,
    })(
      new Request('https://test.invalid', {
        method: 'POST',
        body: JSON.stringify({ action, username: 'Player', password: 'longpassword', ...extra }),
      })
    );
  return { admin, provider, send };
};
describe('provider account gateway', () => {
  it('creates a provider-managed password account with a non-contact internal alias', async () => {
    const { admin, send } = serverFixture();
    const r = await send();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ session: { access_token: 'a', refresh_token: 'r' } });
    const args = admin.auth.admin.createUser.mock.calls[0][0];
    expect(args.email).toMatch(/@accounts.invalid$/);
    expect(args.password).toBe('longpassword');
    expect(args.app_metadata).toEqual({ tcg_account_kind: 'username' });
  });
  it('fails closed on rate-limit storage errors', async () => {
    const { admin, send, provider } = serverFixture();
    admin.rpc.mockResolvedValue({ error: { message: 'db unavailable' } });
    expect((await send()).status).toBe(503);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(provider.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('rejects throttled attempts before password verification', async () => {
    const { admin, send, provider } = serverFixture();
    admin.rpc.mockResolvedValue({ data: false });
    expect((await send('login')).status).toBe(429);
    expect(provider.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('deletes only its own newly created provider identity on username collision', async () => {
    const { admin, send } = serverFixture();
    admin.rpc.mockImplementation(async (name) =>
      name === 'tcg_register_username' ? { error: { code: '23505' } } : { data: true }
    );
    expect((await send()).status).toBe(409);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith('created');
  });
  it('returns the same login failure for unknown names and wrong passwords', async () => {
    const { admin, send, provider } = serverFixture();
    admin.rpc.mockImplementation(async (name) => ({
      data: name === 'tcg_account_attempt' ? true : null,
    }));
    provider.auth.signInWithPassword.mockResolvedValue({ error: { message: 'provider internal' } });
    const r = await send('login');
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'Incorrect username or password.' });
    expect(provider.auth.signInWithPassword).toHaveBeenCalledOnce();
  });
  it('keeps the endpoint unavailable until cutover is enabled', async () => {
    const { admin } = serverFixture();
    const h = accountHandler({ admin });
    expect((await h(new Request('https://test.invalid', { method: 'POST' }))).status).toBe(503);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
