import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openAccountDatabase } from '../server/accounts/node-database.mjs';
const file=new URL('../web/.cache/account-site/dist/server/index.js',import.meta.url);
const worker=(await import(file)).default;
function binding(database){
 const statement=(sql,params=[])=>({sql,params,bind(...values){return statement(sql,values);},first:()=>database.first(sql,params),async run(){const result=await database.run(sql,params);return {meta:{changes:result.changes}};}});
 return {prepare:sql=>statement(sql),batch:statements=>database.batch(statements.map(({sql,params})=>({sql,params})))};
}
const origin='https://agentbridge-demo.test';
test('the actual Worker artifact serves real account routes and static assets with private account CSP',async()=>{
 for(const path of ['/','/signup/','/signin/','/studio/','/studio/connections/']){
  const response=await worker.fetch(new Request(origin+path),{});assert.equal(response.status,200,path);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);const html=await response.text();assert.match(html,/data-account-demo="true"/);assert.doesNotMatch(html,/data-offline="true"/);
 }
 const css=await worker.fetch(new Request(origin+'/assets/foundation/main.css'),{});assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);
 const image=await worker.fetch(new Request(origin+'/assets/design-boards/01-signal.png'),{});assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/png/);assert.ok((await image.arrayBuffer()).byteLength>1000);
 const legacy=await worker.fetch(new Request(origin+'/studio/demo/'),{});assert.equal(legacy.status,302);assert.equal(legacy.headers.get('location'),origin+'/studio/');
});
test('the actual Worker artifact uses the DB binding for one verified tester and keeps identity-less service callers out of accounts',async t=>{
 const database=openAccountDatabase(':memory:');t.after(()=>database.close());const env={DB:binding(database),DEMO_TESTER_EMAIL:'tester@example.com',STUDIO_PUBLIC_ORIGIN:origin};
 const health=await worker.fetch(new Request(origin+'/health'),env);assert.equal(health.status,200);assert.equal((await health.json()).database_ready,true);
 let response=await worker.fetch(new Request(origin+'/api/studio/overview'),env);assert.equal(response.status,401);
 const headers={'Content-Type':'application/json',Origin:origin,'oai-authenticated-user-id':'verified-site-owner','oai-authenticated-user-email':'tester@example.com'};
 response=await worker.fetch(new Request(origin+'/api/auth/register',{method:'POST',headers,body:JSON.stringify({name:'Tester',email:'tester@example.com',agent_name:'Agent'})}),env);assert.equal(response.status,201,await response.clone().text());
 response=await worker.fetch(new Request(origin+'/api/studio/overview',{headers}),env);assert.equal(response.status,200);const snapshot=await response.json();assert.equal(snapshot.account.email,'tester@example.com');assert.equal(snapshot.routing_numbers.length,0);assert.equal(snapshot.sandbox,true);assert.equal(snapshot.purchase_enabled,false);
 response=await worker.fetch(new Request(origin+'/api/studio/overview',{headers:{...headers,'oai-authenticated-user-id':'other-user'}}),env);assert.equal(response.status,401);
 assert.equal((await database.first('SELECT COUNT(*) AS n FROM ab_accounts')).n,1);
});
test('the Worker bundle contains no Node imports, operator key configuration or client-side registration mock',async()=>{
 const source=await readFile(file,'utf8');assert.doesNotMatch(source,/from[\s]*["']node:/);assert.doesNotMatch(source,/STUDIO_ACCESS_KEY_SHA256/);assert.doesNotMatch(source,/no account has been created/i);
});

test('the private Site renders the homepage and guides before JavaScript and supports seeking the sample', async () => {
  const home = await (await worker.fetch(new Request(origin), {})).text();
  assert.match(home, /Connect agents[^<]*<span>worldwide<\/span>/);
  const path = home.match(/src="([^"]+\.mp3)"/)[1];
  const url = new URL(path, origin);
  const fetchAsset = (range, method = "GET") => worker.fetch(new Request(url, { method, headers: range ? { range } : {} }), {});
  const full = await fetchAsset(null, "HEAD");
  const length = Number(full.headers.get("content-length"));
  assert.equal(full.headers.get("content-type"), "audio/mpeg");
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.ok(length > 1000);
  const part = await fetchAsset("bytes=0-1");
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 0-1/" + length);
  assert.equal((await part.arrayBuffer()).byteLength, 2);
  const tail = await fetchAsset("bytes=-3");
  assert.equal(tail.headers.get("content-range"), `bytes ${length-3}-${length-1}/${length}`);
  assert.equal((await tail.arrayBuffer()).byteLength, 3);
  assert.equal((await fetchAsset("bytes=" + length + "-")).status, 416);
  const guide = await (await worker.fetch(new Request(origin + "/docs/"), {})).text();
  assert.match(guide, /<h1>Connect your agent<\/h1>/);
  assert.doesNotMatch(guide, /exchange-hero/);
  const studio = await (await worker.fetch(new Request(origin + "/studio/"), {})).text();
  assert.match(studio, /data-theme="dark"/);
});
