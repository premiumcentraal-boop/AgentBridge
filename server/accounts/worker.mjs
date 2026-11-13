import { createAccountService } from './service.mjs';
import { d1Database } from './database.mjs';
import { assets, page, paths } from 'agentbridge:assets';

const policy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const baseHeaders = { 'Content-Security-Policy': policy, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };
export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    try {
      if (path.startsWith('/api/')) {
        const service = createAccountService({ database: d1Database(env.DB), testerEmail: env.DEMO_TESTER_EMAIL, publicOrigin: env.STUDIO_PUBLIC_ORIGIN || url.origin, platformIdentity: true });
        const response = await service.fetch(request, { clientAddress: request.headers.get('cf-connecting-ip') || 'site-visitor' });
        if (response) { const headers = new Headers(response.headers); for (const [key,value] of Object.entries(baseHeaders)) headers.set(key,value); return new Response(response.body,{status:response.status,headers}); }
        return new Response(JSON.stringify({error:{code:'NOT_FOUND',message:'Endpoint not found.'}}),{status:404,headers:{...baseHeaders,'Content-Type':'application/json'}});
      }
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:baseHeaders});
      if (path === '/health') {
        await env.DB.prepare('SELECT id FROM ab_accounts LIMIT 1').first();
        return new Response(JSON.stringify({ service:'agentbridge-accounts',mode:'account-demo',database_ready:true,routing_enabled:false,purchase_enabled:false }),{headers:{...baseHeaders,'Content-Type':'application/json'}});
      }
      if (path.startsWith('/studio/demo/')) return Response.redirect(url.origin+'/studio/'+path.slice('/studio/demo/'.length),302);
      if (path === '/app' || path === '/app/') return Response.redirect(url.origin+'/studio/',302);
      if (assets[path]) {
        const asset = assets[path], bytes = Uint8Array.from(atob(asset.data), char => char.charCodeAt(0));
        return new Response(request.method === 'HEAD' ? null : bytes,{headers:{...baseHeaders,'Content-Type':asset.type,'Cache-Control':'private, max-age=3600'}});
      }
      const normalized = path.endsWith('/') ? path : path + '/';
      if (!paths.includes(normalized)) return new Response('Page not found',{status:404,headers:baseHeaders});
      return new Response(request.method === 'HEAD' ? null : page,{headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8'}});
    } catch {
      return new Response(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message:'The account service is temporarily unavailable.'}}),{status:503,headers:{...baseHeaders,'Content-Type':'application/json'}});
    }
  },
};
