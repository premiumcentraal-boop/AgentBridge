import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.mjs';
import { openStore } from '../store.mjs';
import { inspectIntegration } from '../integration.mjs';

const key = 'studio-test-private-access-key-with-entropy';
const keyHash = createHash('sha256').update(key).digest('hex');
async function harness(t, overrides={}) {
  const store=openStore(':memory:');
  const server=createApp({store,env:{NODE_ENV:'production',STUDIO_ACCESS_KEY_SHA256:keyHash,STUDIO_PUBLIC_ORIGIN:'https://agentbridge.victor.ceo',...overrides}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port;
  const request=(path,options={})=>fetch(url+'/api/studio/'+path,{...options,headers:{Origin:'https://agentbridge.victor.ceo','Content-Type':'application/json',...options.headers}});
  const login=async()=>{
    const response=await request('session',{method:'POST',body:JSON.stringify({key})});
    assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
  };
  return {request,login,url,store};
}
test('private data and writes require authentication; default deployment fails closed',async t=>{
  const {request}=await harness(t,{STUDIO_ACCESS_KEY_SHA256:'',STUDIO_DEV_MODE:'true'});
  const session=await (await request('session')).json();
  assert.equal(session.configured,false);assert.equal(session.authenticated,false);
  assert.equal((await request('session',{method:'POST',body:JSON.stringify({key:'local-development'})})).status,503);
  assert.equal((await request('overview')).status,401);
  assert.equal((await request('routes',{method:'POST',body:'{}'})).status,401);
  assert.equal((await request('export')).status,401);
});
test('access keys are checked, cookies are secure and sign-out invalidates the session',async t=>{
  const {request}=await harness(t);
  assert.equal((await request('session',{method:'POST',body:JSON.stringify({key:'wrong'})})).status,401);
  const response=await request('session',{method:'POST',body:JSON.stringify({key})});
  const setCookie=response.headers.get('set-cookie');
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/api/studio','Max-Age=28800'])assert.ok(setCookie.includes(flag));
  const cookie=setCookie.split(';')[0];
  assert.equal((await request('overview',{headers:{Cookie:cookie}})).status,200);
  await request('session',{method:'DELETE',headers:{Cookie:cookie}});
  assert.equal((await request('overview',{headers:{Cookie:cookie}})).status,401);
});
test('cross-origin requests cannot change sessions or authenticated drafts',async t=>{
  const {request,login}=await harness(t),cookie=await login();
  for(const Origin of ['https://attacker.example','null','https://victor.ceo']) {
    assert.equal((await request('routes',{method:'POST',headers:{Origin,Cookie:cookie},body:JSON.stringify({label:'Office',destination:'+12125550124'})})).status,403);
  }
  assert.equal((await request('session',{method:'POST',headers:{Origin:'https://attacker.example'},body:JSON.stringify({key})})).status,403);
});
test('draft lifecycle, settings, activity and export persist real workspace state without calls',async t=>{
  const {request,login}=await harness(t),cookie=await login(),headers={Cookie:cookie};
  const result=await request('routes',{method:'POST',headers,body:JSON.stringify({label:'Test office',destination:'+1 (212) 555-0124',status:'approved',calling_enabled:true})});
  assert.equal(result.status,201);const {route,calling_enabled}=await result.json();assert.equal(calling_enabled,false);assert.equal(route.status,'draft');assert.equal(route.destination,'+12125550124');
  await request('settings',{method:'PATCH',headers,body:JSON.stringify({experience:'guided'})});
  let snapshot=await (await request('overview',{headers})).json();
  assert.equal(snapshot.routing_enabled,false);assert.equal(snapshot.routes.length,1);assert.equal(snapshot.settings.experience,'guided');assert.equal(snapshot.events.length,2);
  assert.equal((await request('routes/'+route.id+'/archive',{method:'POST',headers,body:'{}'})).status,200);
  assert.equal((await request('routes/'+route.id+'/archive',{method:'POST',headers,body:'{}'})).status,404);
  const exported=await request('export',{headers});snapshot=await exported.json();
  assert.equal(snapshot.routes[0].status,'archived');assert.equal(snapshot.mode,'prototype');assert.match(exported.headers.get('content-disposition'),/attachment/);
  assert.equal((await request('routes/'+route.id+'/approve',{method:'POST',headers,body:'{}'})).status,404);
});
test('invalid, oversized, malformed and injection-like inputs cannot alter the schema',async t=>{
  const {request,login}=await harness(t),cookie=await login(),headers={Cookie:cookie};
  for(const destination of ['911','12125550124','+123','+0'.padEnd(16,'1')])assert.equal((await request('routes',{method:'POST',headers,body:JSON.stringify({label:'Office',destination})})).status,422);
  for(const label of ['', 'x'.repeat(81),'bad\u0000label'])assert.equal((await request('routes',{method:'POST',headers,body:JSON.stringify({label,destination:'+12125550124'})})).status,422);
  for(const body of ['{','null','[]',JSON.stringify({label:'x'.repeat(5000)})])assert.equal((await request('routes',{method:'POST',headers,body})).status,400);
  assert.equal((await request('settings',{method:'PATCH',headers,body:JSON.stringify({experience:'unsafe'})})).status,422);
  const result=await request('routes',{method:'POST',headers,body:JSON.stringify({label:"');DROP TABLE studio_routes;--",destination:'+12125550124'})});
  assert.equal(result.status,201);assert.equal((await (await request('overview',{headers})).json()).routes.length,1);
});
test('SQLite workspace survives reopening; no browser storage is used for records',()=>{
  const dir=mkdtempSync(join(tmpdir(),'agentbridge-studio-')),filename=join(dir,'workspace.sqlite');
  try {let store=openStore(filename);store.createRoute('Office','+12125550124');store.saveSettings('advanced');store.close();store=openStore(filename);assert.equal(store.snapshot().routes[0].label,'Office');assert.equal(store.snapshot().settings.experience,'advanced');store.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('studio exposes no carrier endpoints and keeps private pages unframed and uncached',async t=>{
  const {url}=await harness(t);
  const health=await (await fetch(url+'/health')).json();assert.equal(health.routing_enabled,false);
  const privateResponse=await fetch(url+'/api/studio/session');assert.equal(privateResponse.headers.get('cache-control'),'no-store');assert.equal(privateResponse.headers.get('x-frame-options'),'DENY');assert.match(privateResponse.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const publicResponse=await fetch(url+'/');assert.match(publicResponse.headers.get('content-security-policy'),/frame-ancestors 'self' https:\/\/victor.ceo/);assert.equal(publicResponse.headers.get('x-frame-options'),null);
  for(const path of ['/telephony/signalwire/swml','/v1/reservations','/mcp'])assert.equal((await fetch(url+path,{method:'POST'})).status,405);
  assert.equal((await fetch(url+'/.env')).status,404);
});
test('login retries are bounded without trusting spoofed forwarding headers',async t=>{
  const {request}=await harness(t);
  for(let i=0;i<10;i++)assert.equal((await request('session',{method:'POST',headers:{'X-Forwarded-For':`192.0.2.${i}`},body:JSON.stringify({key:'wrong'})})).status,401);
  assert.equal((await request('session',{method:'POST',body:JSON.stringify({key})})).status,429);
});
test('integration uses only allowlisted read-only tools and does not forward private errors',async()=>{
  const env={AGENTBRIDGE_BACKEND_URL:'https://private.example',AGENTBRIDGE_ACCOUNT_TOKEN:'secret-test-token'},names=[];
  const result=await inspectIntegration(env,async(url,options)=>{
    assert.equal(url.href,'https://private.example/mcp');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer secret-test-token');
    const body=JSON.parse(options.body);names.push(body.params.name);
    return Response.json({jsonrpc:'2.0',id:body.id,result:{structuredContent:{status:'preview'}}});
  });
  assert.equal(result.status,'connected');assert.deepEqual(names,['get_bridge_setup','list_my_numbers']);
  for(const AGENTBRIDGE_BACKEND_URL of ['http://private.example','https://user:password@private.example','https://private.example/path'])assert.equal((await inspectIntegration({...env,AGENTBRIDGE_BACKEND_URL},()=>{throw new Error('must not fetch');})).status,'error');
  const failure=await inspectIntegration(env,async()=>Response.json({error:'secret-test-token'},{status:500}));assert.equal(failure.status,'error');assert.ok(!JSON.stringify(failure).includes('secret-test-token'));
  assert.equal((await inspectIntegration({})).status,'not_configured');
});
