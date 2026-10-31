export function createUsernameAccount({ auth, invoke, rpc }) {
  const profile = async () => {
    const { data: session } = await auth.getSession();
    if (!session?.session || session.session.user?.is_anonymous) return null;
    const { data, error } = await rpc('tcg_current_profile');
    if (error) throw error;
    return data || null;
  };
  const authenticate = async (action, username, password) => {
    if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(username.trim()))
      throw new Error('Username must be 3–24 letters, numbers or underscores.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128)
      throw new Error('Password must be 8–128 characters.');
    const { data, error } = await invoke('tcg-accounts', {
      body: { action, username: username.trim(), password },
    });
    if (error || data?.error) {
      let message = data?.error || 'Unable to sign in. Please retry.';
      if (error?.context?.json) {
        try {
          message = (await error.context.json()).error || message;
        } catch {
          /* Use generic message. */
        }
      }
      throw new Error(message);
    }
    if (!data?.session?.access_token || !data?.session?.refresh_token)
      throw new Error('Account response was incomplete. Try logging in again.');
    const { error: sessionError } = await auth.setSession(data.session);
    if (sessionError) throw sessionError;
    const account = await profile();
    if (!account) throw new Error('Account unavailable. Try logging in again.');
    return account;
  };
  return {
    profile,
    login: (username, password) => authenticate('login', username, password),
    signup: (username, password) => authenticate('signup', username, password),
    async logout() {
      const { error } = await auth.signOut({ scope: 'local' });
      if (error) throw error;
      return true;
    },
  };
}
