import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const pages=['index.html','how-it-works/index.html','pricing/index.html','connect/index.html','docs/index.html'];
test('all public pages enforce local-only scripts and strict privacy policy',async()=>{
 execFileSync(process.execPath,['scripts/build-site.mjs'],{cwd:root,env:{...process.env,BASE_PATH:''}});
 for(const page of pages){
  const html=await readFile(join(root,'dist',page),'utf8');
  assert.match(html,/http-equiv="Content-Security-Policy"/,page);
  assert.match(html,/script-src 'self'/,page);
  assert.match(html,/connect-src 'none'/,page);
  assert.match(html,/name="referrer" content="no-referrer"/,page);
  assert.doesNotMatch(html,/https:\/\/fonts\.(googleapis|gstatic)\.com/,page);
 }
});
test('typography does not contact external font providers',async()=>{
 const css=await readFile(join(root,'web/src/styles.css'),'utf8');
 assert.doesNotMatch(css,/@import\s+url\(/i);
 assert.doesNotMatch(css,/fonts\.(googleapis|gstatic)\.com/i);
 assert.match(css,/system-ui/);
});
test('hosting header policy permits Victor product framing and protects the studio',async()=>{
 const h=await readFile(join(root,'_headers'),'utf8');
 for(const item of ["frame-ancestors 'self' https://victor.ceo https://www.victor.ceo","/studio/*","frame-ancestors 'none'","X-Content-Type-Options: nosniff","X-Frame-Options: DENY","Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()"])assert.ok(h.includes(item),item);
});

test('studio permits only same-origin API connections and is excluded from indexing',async()=>{
 for(const page of ['studio/index.html','studio/demo/index.html','studio/routes/index.html','app/index.html']){
  const html=await readFile(join(root,'dist',page),'utf8');
  assert.match(html,/connect-src 'self'/);
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(html,/localStorage|sessionStorage/);
 }
});
test('project-path build keeps CSP and correct local asset URLs',async()=>{
 execFileSync(process.execPath,['scripts/build-site.mjs'],{cwd:root,env:{...process.env,BASE_PATH:'/AgentBridge'}});
 const html=await readFile(join(root,'dist/index.html'),'utf8');
 assert.match(html,/href="\/AgentBridge\/assets\/foundation\/main\.css\?v=/);
 assert.match(html,/src="\/AgentBridge\/assets\/foundation\/main\.js\?v=/);
 assert.match(html,/script-src 'self'/);
});

test('private Worker config and dev secrets are git-ignored',async()=>{
  const {readFileSync}=await import('node:fs');
  const ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8').split('\n').map(s=>s.trim());
  for(const entry of ['backend/wrangler.jsonc','.dev.vars','backend/.dev.vars','.env'])
    assert.ok(ignore.includes(entry),entry+' must be ignored');
});

test('example Worker config ships with routing off and no secrets',async()=>{
  const {readFileSync}=await import('node:fs');
  const text=readFileSync(new URL('../backend/wrangler.example.jsonc',import.meta.url),'utf8');
  for(const flag of ['PRIVATE_TEST_OUTBOUND_ENABLED','SIGNALWIRE_CONNECT_ENABLED','CALLER_PROOF_MODE','CALLER_ID_TRUST_ACCEPTED'])
    assert.match(text,new RegExp('"'+flag+'": ""'),flag);
  for(const secret of ['SIGNALWIRE_SIGNING_KEY"','SIGNALWIRE_API_TOKEN"','OWNER_APPROVAL_TOKEN_SHA256"','TWILIO_AUTH_TOKEN"'])
    assert.ok(!text.includes('"'+secret+':'),secret);
});
