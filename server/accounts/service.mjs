import { AccountError, deny, emptyWorkspace, publicAccount } from './model.mjs';
import { workspaceRequest } from './workspace.mjs';
import { manageProvider, providerSummary, publicProviderError } from './provider-control.mjs';
import { liveWorkspaceRequest } from './live-workspace.mjs';
import { authLimit, digest, normalizeEmail as email, onlyFields as only, randomToken, validEmail, validName as named } from './auth-primitives.mjs';
import { createEmailAuth } from './email-auth.mjs';

const cookieToken = request => request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('ab_customer='))?.slice('ab_customer='.length);
const privateHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
export async function boundedAccountBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) deny(400, 'JSON_REQUIRED', 'Send a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) deny(400, 'INVALID_BODY', 'Enter the request details.');
  const chunks = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); deny(413, 'BODY_TOO_LARGE', 'The request is too large.'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) deny(400, 'INVALID_BODY', 'Send a JSON object.');
    return data;
  } catch (error) { if (error instanceof AccountError) throw error; deny(400, 'INVALID_BODY', 'Send a valid JSON object.'); }
  finally { reader.releaseLock(); }
}
export function createAccountService({ database, testerEmail, publicOrigin, passwords, platformIdentity = false, signupInviteHash, vaultKey, fetcher, signupMode, mailer }) {
  // The private Sites identity flow stays private; public email accounts use the
  // Node/Railway adapter and never trust browser-supplied identity headers.
  const publicSignup = signupMode === 'public' && !platformIdentity;
  const allowedEmail = email(testerEmail), configured = Boolean(database) && (publicSignup ? Boolean(passwords) : validEmail(allowedEmail));
  const method = platformIdentity ? 'chatgpt' : 'password';
  const secure = !publicOrigin?.startsWith('http://127.0.0.1') && !publicOrigin?.startsWith('http://localhost');
  const cookie = (token, age = 28800) => `ab_customer=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const json = (status, value, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...privateHeaders, ...extra } });
  const identity = request => platformIdentity ? { subject: request.headers.get('oai-authenticated-user-id'), email: email(request.headers.get('oai-authenticated-user-email')) } : null;
  async function accountFor(request) {
    if (!configured) return null;
    if (platformIdentity) {
      const user = identity(request);
      if (!user.subject || user.email !== allowedEmail) return null;
      return database.first("SELECT * FROM ab_accounts WHERE auth_provider='chatgpt' AND auth_subject=? AND email=?", [user.subject, user.email]);
    }
    const token = cookieToken(request);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return database.first('SELECT a.* FROM ab_accounts a JOIN ab_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? AND (?=0 OR a.email_verified_at IS NOT NULL)', [await digest(token), Date.now(), publicSignup ? 1 : 0]);
  }
  async function limit(request, route, clientAddress) {
    return authLimit(database, route + ':' + (clientAddress || 'unknown'));
  }
  async function session(account) {
    if (platformIdentity) return {};
    const token = randomToken(), stamp = new Date().toISOString();
    await database.run('DELETE FROM ab_sessions WHERE expires_at<=?', [Date.now()]);
    await database.run('DELETE FROM ab_sessions WHERE token_hash IN (SELECT token_hash FROM ab_sessions WHERE account_id=? ORDER BY created_at DESC LIMIT -1 OFFSET 19)', [account.id]);
    await database.run('INSERT INTO ab_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)', [await digest(token), account.id, Date.now() + 8 * 60 * 60_000, stamp]);
    return { 'Set-Cookie': cookie(token) };
  }
  const emailAuth = createEmailAuth({ database, passwords, mailer, session, json });
  return {
    async fetch(request, { clientAddress } = {}) {
      const path = new URL(request.url).pathname, verb = request.method;
      const authPath = path.startsWith('/api/auth/');
      const studioPath = path.startsWith('/api/studio/');
      if (!authPath && !studioPath) return null;
      try {
        const route = authPath ? path.slice('/api/auth/'.length) : path.slice('/api/studio/'.length);
        const current = await accountFor(request);
        if (!['GET', 'HEAD'].includes(verb)) {
          const expected = publicOrigin || new URL(request.url).origin;
          if (request.headers.get('origin') !== expected || request.headers.get('sec-fetch-site') === 'cross-site') deny(403, 'ORIGIN_REJECTED', 'Open AgentBridge directly to make changes.');
        }
        if (route === 'session' && verb === 'GET') {
          const count = configured ? await database.first('SELECT COUNT(*) AS n FROM ab_accounts') : { n: 0 };
          const user = identity(request);
          const provider=current?await providerSummary(database,current.id,vaultKey):null;
          return json(200, { configured, authenticated: Boolean(current), account: publicAccount(current), sandbox: Boolean(current), provider_live_enabled:provider?.live_enabled||false, mode: provider?.live_enabled?'live-testing':'demo', auth_method: method, registration_available: configured && (publicSignup ? Boolean(mailer?.ready) : count.n === 0 && (platformIdentity || /^[a-f0-9]{64}$/.test(signupInviteHash || ""))), signup_mode: publicSignup ? 'public' : 'tester', email_verification_required: publicSignup, password_reset_available: publicSignup && Boolean(mailer?.ready), invitation_required: !platformIdentity && !publicSignup, account_exists: publicSignup ? undefined : count.n > 0, verified_email: platformIdentity && user?.subject && user.email === allowedEmail ? user.email : undefined, signin_url: '/signin-with-chatgpt?return_to=%2Fstudio%2F', signout_url: '/signout-with-chatgpt?return_to=%2Fsignin%2F' });
        }
        if (!configured) deny(503, 'SETUP_REQUIRED', 'The account service needs to be configured.');
        if (authPath && publicSignup && verb === 'POST' && ['register', 'forgot-password', 'verify-email', 'reset-password'].includes(route)) {
          return await emailAuth({ route, readBody: () => boundedAccountBody(request), clientAddress });
        }
        if (authPath && route === 'register' && verb === 'POST') {
          const input = await boundedAccountBody(request); only(input, platformIdentity ? ['name', 'email', 'agent_name'] : ['name', 'email', 'agent_name', 'password', 'invite_token']);
          await limit(request, 'register', clientAddress);
          const address = email(input.email);
          if (address !== allowedEmail) deny(403, 'INVITE_REQUIRED', 'Registration is reserved for the invited tester.');
          if (!platformIdentity && (!/^[a-f0-9]{64}$/.test(signupInviteHash || '') || typeof input.invite_token !== 'string' || input.invite_token.length > 256 || await digest(input.invite_token) !== signupInviteHash)) deny(403, 'INVITE_REQUIRED', 'Use your private tester invitation to create this account.');
          if (!named(input.name) || !named(input.agent_name)) deny(422, 'INVALID_PROFILE', 'Enter your name and an agent name, each up to 80 characters.');
          const user = identity(request);
          if (platformIdentity && (!user.subject || user.email !== allowedEmail)) deny(401, 'SIGNIN_REQUIRED', 'Continue with ChatGPT using the invited email first.');
          if (!platformIdentity && (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128 || !input.password.trim())) deny(422, 'INVALID_PASSWORD', 'Choose a password of 12 to 128 characters.');
          if (await database.first('SELECT id FROM ab_accounts LIMIT 1')) deny(409, 'ACCOUNT_EXISTS', 'The tester account already exists. Please sign in.');
          const stamp = new Date().toISOString(), account = { id: crypto.randomUUID(), email: address, name: input.name.trim(), agent_name: input.agent_name.trim(), auth_provider: method, auth_subject: platformIdentity ? user.subject : null, password_hash: platformIdentity ? null : await passwords.hash(input.password), created_at: stamp, updated_at: stamp };
          try {
            await database.batch([
              { sql: 'INSERT INTO ab_accounts(id,email,name,agent_name,auth_provider,auth_subject,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', params: [account.id, account.email, account.name, account.agent_name, account.auth_provider, account.auth_subject, account.password_hash, stamp, stamp] },
              { sql: 'INSERT INTO ab_workspaces(account_id,revision,document,updated_at) VALUES(?,0,?,?)', params: [account.id, JSON.stringify(emptyWorkspace()), stamp] },
            ]);
          } catch (error) { if (await database.first('SELECT id FROM ab_accounts LIMIT 1')) deny(409, 'ACCOUNT_EXISTS', 'The tester account already exists. Please sign in.'); throw error; }
          return json(201, { authenticated: true, sandbox: true, account: publicAccount(account), redirect: '/studio/' }, await session(account));
        }
        if (authPath && route === 'login' && verb === 'POST') {
          if (platformIdentity) return json(200, { redirect: '/signin-with-chatgpt?return_to=%2Fstudio%2F' });
          const input = await boundedAccountBody(request); only(input, ['email', 'password']);
          const bucket = await limit(request, 'login', clientAddress);
          if (publicSignup) {
            await authLimit(database, 'login-global', { maximum: 300 });
            await authLimit(database, 'login-email:' + email(input.email), { maximum: 30 });
          }
          if (typeof input.password !== 'string' || input.password.length > 128 || input.password.length < 1) deny(401, 'INVALID_LOGIN', 'The email or password is not correct.');
          const account = await database.first("SELECT * FROM ab_accounts WHERE email=? AND auth_provider='password'", [email(input.email)]);
          const valid = await passwords.verify(input.password, account?.password_hash);
          if (!account || (!publicSignup && account.email !== allowedEmail) || !valid) deny(401, 'INVALID_LOGIN', 'The email or password is not correct.');
          if (publicSignup && !account.email_verified_at) deny(403, 'EMAIL_NOT_VERIFIED', 'Verify your email first. Use Create account or Forgot password to request a link.');
          await database.run('DELETE FROM ab_auth_attempts WHERE bucket=?', [bucket]);
          return json(200, { authenticated: true, sandbox: true, account: publicAccount(account), redirect: '/studio/' }, await session(account));
        }
        if ((route === 'session' && verb === 'DELETE') || (authPath && route === 'logout' && verb === 'POST')) {
          const token = cookieToken(request);
          if (token && /^[a-f0-9]{64}$/.test(token)) await database.run('DELETE FROM ab_sessions WHERE token_hash=?', [await digest(token)]);
          return json(200, { ok: true, redirect: platformIdentity ? '/signout-with-chatgpt?return_to=%2Fsignin%2F' : '/signin/' }, { 'Set-Cookie': cookie('', 0) });
        }
        if (!current) deny(401, 'UNAUTHORIZED', 'Sign in to your AgentBridge account.');
        if(studioPath&&(route.startsWith('provider/')||route.startsWith('live/'))) {
          const args={database,account:current,path:route,method:verb,readBody:()=>boundedAccountBody(request),vaultKey,fetcher};
          const result=route.startsWith('provider/')?await manageProvider(args):await liveWorkspaceRequest({...args,path:route.slice(5)});
          if(result instanceof Response)return result;
          if(result)return json(result.status,result.body);
          deny(404,'NOT_FOUND','Provider endpoint not found.');
        }
        if (authPath && route === 'account' && verb === 'PATCH') {
          const input = await boundedAccountBody(request); only(input, ['name', 'agent_name']);
          if (!named(input.name) || !named(input.agent_name)) deny(422, 'INVALID_PROFILE', 'Enter your name and agent name.');
          await database.run('UPDATE ab_accounts SET name=?,agent_name=?,updated_at=? WHERE id=?', [input.name.trim(), input.agent_name.trim(), new Date().toISOString(), current.id]);
          return json(200, { account: publicAccount({ ...current, name: input.name.trim(), agent_name: input.agent_name.trim() }) });
        }
        if (studioPath) {
          const result = await workspaceRequest({ database, account: current, path: route, method: verb, readBody: () => boundedAccountBody(request) });
          return json(result.status, result.body, route === 'export' ? { 'Content-Disposition': 'attachment; filename="agentbridge-demo-workspace.json"' } : {});
        }
        deny(404, 'NOT_FOUND', 'Endpoint not found.');
      } catch (error) {
        error=publicProviderError(error);
        const status = error instanceof AccountError || error.status === 429 ? error.status : 500;
        return json(status, { error: { code: status === 500 ? 'INTERNAL_ERROR' : error.code, message: status === 500 ? 'The request could not be completed.' : error.message } });
      }
    },
  };
}
