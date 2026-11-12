import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { inspectIntegration } from './integration.mjs';
import { validateCallPlan, validateCapture } from '../shared/call-plans.mjs';
import { validateNumberConnection, validateNumberOrder } from '../shared/numbers.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STUDIO_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const PUBLIC_CSP = STUDIO_CSP.replace("connect-src 'self'", "connect-src 'none'").replace("frame-ancestors 'none'", "frame-ancestors 'self' https://victor.ceo https://www.victor.ceo");
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const digest = text => createHash('sha256').update(text).digest();

export function createApp({ env = process.env, store = openStore(env.STUDIO_DATABASE_PATH || resolve(ROOT, 'data/studio.sqlite')), fetcher } = {}) {
  const sessions = new Map(), attempts = new Map();
  const keyHash = /^[a-f0-9]{64}$/.test(env.STUDIO_ACCESS_KEY_SHA256 || '') ? Buffer.from(env.STUDIO_ACCESS_KEY_SHA256, 'hex') : null;
  const isDev = env.STUDIO_DEV_MODE === 'true' && env.NODE_ENV !== 'production';
  const configured = Boolean(keyHash || isDev);
  const cookies = req => String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('ab_studio='))?.slice(10);
  function authenticated(req) {
    const token = cookies(req), expiry = token && sessions.get(token);
    if (!expiry) return false;
    if (expiry <= Date.now()) { sessions.delete(token); return false; }
    return true;
  }
  const server = http.createServer(async (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { res.writeHead(400).end(); return; }
    const privatePath = pathname.startsWith('/api/') || pathname.startsWith('/studio') || pathname.startsWith('/app');
    res.setHeader('Content-Security-Policy', privatePath ? STUDIO_CSP : PUBLIC_CSP);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (privatePath) { res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); }
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    const fail = (status, code, message) => json(status, { error: { code, message } });
    async function body() {
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new Error('JSON_REQUIRED');
      // Drain oversized input without destroying the response socket or buffering it.
      const chunks = await new Promise((accept, reject) => {
        let size=0, rejected=false; const parts=[];
        req.on('data', chunk => {
          size+=chunk.length;
          if(size>4096){ if(!rejected){rejected=true;parts.length=0;reject(new Error('BODY_TOO_LARGE'));}return; }
          if(!rejected)parts.push(chunk);
        });
        req.on('end',()=>{if(!rejected)accept(parts);});
        req.on('error',reject);
      });
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INVALID_BODY');
      return data;
    }
    try {
      if (pathname === '/health' && ['GET','HEAD'].includes(req.method)) return json(200, { service: 'agentbridge-studio', mode: 'prototype', routing_enabled: false });
      if (pathname.startsWith('/api/')) {
        // Prevent cross-origin session changes, including CSRF via a framed product.
        if (!['GET','HEAD'].includes(req.method)) {
          const expected = env.STUDIO_PUBLIC_ORIGIN || (isDev ? `http://${req.headers.host}` : 'https://agentbridge.victor.ceo');
          if (req.headers.origin !== expected || req.headers['sec-fetch-site'] === 'cross-site') return fail(403, 'ORIGIN_REJECTED', 'Open the studio directly to make changes.');
        }
        if (pathname === '/api/studio/session') {
          if (req.method === 'GET') return json(200, { configured, authenticated: authenticated(req), dev_mode: isDev });
          if (req.method === 'DELETE') { sessions.delete(cookies(req)); res.setHeader('Set-Cookie', `ab_studio=; HttpOnly; SameSite=Strict; Path=/api/studio; Max-Age=0${isDev ? '' : '; Secure'}`); return json(200, { ok: true }); }
          if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
          if (!configured) return fail(503, 'SETUP_REQUIRED', 'Studio access must be configured by the operator.');
          const ip = req.socket.remoteAddress; // Do not trust client-controlled forwarding headers.
          let attempt = attempts.get(ip);
          if (!attempt || attempt.until <= Date.now()) { attempt = { count: 0, until: Date.now() + 15*60_000 }; attempts.set(ip, attempt); }
          if (++attempt.count > 10) return fail(429, 'RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
          const data = await body();
          const valid = keyHash ? typeof data.key === 'string' && data.key.length <= 256 && timingSafeEqual(digest(data.key), keyHash) : isDev && data.key === 'local-development';
          if (!valid) return fail(401, 'INVALID_KEY', 'The access key is not valid.');
          attempts.delete(ip);
          // Keep in-memory session state bounded and expire it after eight hours.
          for (const [token, expiry] of sessions) if (expiry <= Date.now()) sessions.delete(token);
          if (sessions.size >= 50) sessions.delete(sessions.keys().next().value);
          const token = randomBytes(32).toString('hex'); sessions.set(token, Date.now() + 8*60*60_000);
          res.setHeader('Set-Cookie', `ab_studio=${token}; HttpOnly; SameSite=Strict; Path=/api/studio; Max-Age=28800${isDev ? '' : '; Secure'}`);
          return json(200, { authenticated: true });
        }
        if (!authenticated(req)) return fail(401, 'UNAUTHORIZED', 'Sign in to your studio.');
        if(pathname==='/api/studio/numbers'&&req.method==='GET'){
          const state=store.snapshot();return json(200,{numbers:state.routing_numbers,orders:state.number_orders,purchase_enabled:false,routing_enabled:false});
        }
        if(pathname==='/api/studio/number-orders'&&req.method==='POST'){
          const validated=validateNumberOrder(await body());
          if(validated.error)return fail(422,'INVALID_NUMBER_ORDER',validated.error);
          const result=store.createNumberOrder(validated.value);
          return result.error?fail(409,result.error,result.error==='REQUEST_CONFLICT'?'This request identifier belongs to another order.':'The number request limit has been reached.'):json(202,{...result,purchase_enabled:false,charged:false});
        }
        if(pathname==='/api/studio/connections'&&req.method==='GET')return json(200,{connections:store.snapshot().connections,routing_enabled:false});
        const connectionMatch=pathname.match(/^\/api\/studio\/connections\/([a-f0-9-]{36})$/);
        if((pathname==='/api/studio/connections'&&req.method==='POST')||(connectionMatch&&req.method==='PATCH')){
          const validated=validateNumberConnection(await body());
          if(validated.error)return fail(422,'INVALID_CONNECTION',validated.error);
          const result=store.saveNumberConnection(validated.value,connectionMatch?.[1]);
          const errors={NUMBER_NOT_OWNED:[422,'Choose an owned routing number.'],NUMBER_ALREADY_LINKED:[409,'This routing number already has a destination.'],OWN_NUMBER_DESTINATION:[422,'Choose an outside destination, not one of your routing numbers.'],NOT_FOUND:[404,'Connection not found.'],CONNECTION_LIMIT:[409,'The connection limit has been reached.']};
          if(result.error){const [status,message]=errors[result.error]||[409,'Connection could not be saved.'];return fail(status,result.error,message);}
          return json(connectionMatch?200:201,{...result,routing_enabled:false,calling_enabled:false});
        }
        if(connectionMatch&&req.method==='DELETE')return store.archiveNumberConnection(connectionMatch[1])?json(200,{ok:true,routing_enabled:false}):fail(404,'NOT_FOUND','Connection not found.');
        if (pathname === '/api/studio/overview' && req.method === 'GET') return json(200, { ...store.snapshot(), routing_enabled: false, integration_configured: Boolean(env.AGENTBRIDGE_BACKEND_URL && env.AGENTBRIDGE_ACCOUNT_TOKEN) });
        if (pathname === '/api/studio/call-plans' && req.method === 'POST') {
          const validated=validateCallPlan(await body());
          if(validated.error)return fail(422,'INVALID_CALL_PLAN',validated.error);
          const plan=store.createCallPlan(validated.value);
          return plan?json(201,{plan,calling_enabled:false,recording_enabled:false,joining_enabled:false}):fail(409,'PLAN_LIMIT','This studio can store up to 200 call plans.');
        }
        const planMatch=pathname.match(/^\/api\/studio\/call-plans\/([a-f0-9-]{36})\/archive$/);
        if(planMatch&&req.method==='POST')return store.archiveCallPlan(planMatch[1])?json(200,{ok:true}):fail(404,'NOT_FOUND','Plan not found or already archived.');
        if (pathname === '/api/studio/capture-preferences' && req.method === 'PATCH') {
          const validated=validateCapture(await body());
          if(validated.error)return fail(422,'INVALID_CAPTURE_PREFERENCES',validated.error);
          store.saveCapturePreferences(validated.value);
          return json(200,{preferences:validated.value,recording_enabled:false,transcription_enabled:false,joining_enabled:false});
        }
        if (pathname === '/api/studio/routes' && req.method === 'POST') {
          const data = await body(), label = typeof data.label === 'string' ? data.label.trim() : '', destination = typeof data.destination === 'string' ? data.destination.replace(/[\s().-]/g, '') : '';
          if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label) || !/^\+[1-9]\d{7,14}$/.test(destination)) return fail(422, 'INVALID_ROUTE', 'Enter a name (up to 80 characters) and an E.164 phone number.');
          const route = store.createRoute(label, destination);
          return route ? json(201, { route, calling_enabled: false }) : fail(409, 'DRAFT_LIMIT', 'This studio can store up to 200 drafts.');
        }
        const routeMatch = pathname.match(/^\/api\/studio\/routes\/([a-f0-9-]{36})\/archive$/);
        if (routeMatch && req.method === 'POST') return store.archiveRoute(routeMatch[1]) ? json(200, { ok: true }) : fail(404, 'NOT_FOUND', 'Draft not found or already archived.');
        if (pathname === '/api/studio/settings' && req.method === 'PATCH') {
          const data = await body();
          if (!['simple','guided','advanced'].includes(data.experience)) return fail(422, 'INVALID_EXPERIENCE', 'Choose Simple, Guided or Advanced.');
          store.saveSettings(data.experience); return json(200, { ok: true });
        }
        if (pathname === '/api/studio/integration' && req.method === 'GET') return json(200, await inspectIntegration(env, fetcher));
        if (pathname === '/api/studio/export' && req.method === 'GET') { res.setHeader('Content-Disposition', 'attachment; filename="agentbridge-studio.json"'); return json(200, { ...store.snapshot(), mode: 'prototype', routing_enabled: false }); }
        return fail(404, 'NOT_FOUND', 'Endpoint not found.');
      }
      if (!['GET','HEAD'].includes(req.method)) return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      if (pathname === '/app' || pathname === '/app/') { res.writeHead(302, { Location: '/studio/?demo=1' }); res.end(); return; }
      const dist = resolve(ROOT, 'dist');
      const file = resolve(dist, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!file.startsWith(dist + sep)) return fail(404, 'NOT_FOUND', 'Page not found.');
      try {
        const info = await stat(file);
        if (!info.isFile()) { res.writeHead(302, { Location: pathname + '/' }); res.end(); return; }
        const content = await readFile(file), type = MIME[extname(file)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length, 'Cache-Control': privatePath ? 'no-store' : extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
        res.end(req.method === 'HEAD' ? undefined : content);
      } catch { return fail(404, 'NOT_FOUND', 'Page not found.'); }
    } catch (error) {
      if (['BODY_TOO_LARGE','JSON_REQUIRED','INVALID_BODY'].includes(error.message) || error instanceof SyntaxError || error instanceof TypeError) return fail(400, 'INVALID_BODY', 'Send a JSON object no larger than 4 KB.');
      return fail(500, 'INTERNAL_ERROR', 'The request could not be completed.');
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('close', () => store.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  const host=process.env.STUDIO_DEV_MODE==='true'&&process.env.NODE_ENV!=='production'?'127.0.0.1':'0.0.0.0';
  server.listen(Number(process.env.PORT || 3000), host, () => console.log('AgentBridge product and studio server is ready.'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close());
}
