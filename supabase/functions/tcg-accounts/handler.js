// Provider Auth owns password hashing and session issuance. No password is stored
// in game tables, logs or browser storage. Internal aliases are not player email.
export function accountHandler({ admin, passwordClient, ipHash, ready = false }) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const reply = (status, value) => new Response(JSON.stringify(value), { status, headers });
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (request.method !== 'POST') return reply(405, {error:'Use POST.'});
    if (!ready) return reply(503, {error:'Account upgrade in progress. Please try again shortly.'});
    try {
      const body = await request.text();
      if (body.length > 2048) return reply(413, {error:'Request too large.'});
      const { action, username, password } = JSON.parse(body);
      if (!['signup','login'].includes(action) || typeof username !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(username.trim()) || typeof password !== 'string' || password.length < 8 || password.length > 128)
        return reply(400, {error:'Use a 3–24 character username (letters, numbers, underscores) and an 8–128 character password.'});
      const handle = username.trim();
      const key = handle.toLowerCase();
      const {data:allowed,error:limitError} = await admin.rpc('tcg_account_attempt', {p_username:key,p_ip:await ipHash(request),p_signup:action==='signup'});
      if (limitError) return reply(503, {error:'Account service unavailable. Please retry.'});
      if (!allowed) return reply(429, {error:'Too many attempts. Please try again in 15 minutes.'});
      let email;
      if (action === 'signup') {
        // Random provider-only alias: no user email is collected or contacted.
        email = `${crypto.randomUUID()}@accounts.invalid`;
        const {data:created,error:createError} = await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{tcg_account_kind:'username'}});
        if (createError || !created?.user?.id) return reply(400,{error:'Could not create account. Please retry.'});
        const {error:enrollError} = await admin.rpc('tcg_register_username',{p_auth:created.user.id,p_username:handle});
        if (enrollError) {
          // Only the provider user created by this request; never a claimed name.
          await admin.auth.admin.deleteUser(created.user.id);
          return reply(enrollError.code==='23505'?409:503,{error:enrollError.code==='23505'?'Username already taken. Try logging in.':'Account service unavailable. Please retry.'});
        }
      } else {
        const {data:alias,error} = await admin.rpc('tcg_account_alias',{p_username:key});
        if (error) return reply(503,{error:'Account service unavailable. Please retry.'});
        // Always call provider password verification, including unknown usernames.
        email = alias || 'unknown-account@accounts.invalid';
      }
      const {data,error} = await passwordClient().auth.signInWithPassword({email,password});
      if (error || !data?.session) return reply(401,{error:'Incorrect username or password.'});
      return reply(200,{session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token}});
    } catch {
      // Never echo provider internals, request credentials or stack traces.
      return reply(400,{error:'Unable to process account request. Please retry.'});
    }
  };
}
