import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const pages=['index.html','how-it-works/index.html','pricing/index.html','connect/index.html','docs/index.html','app/index.html'];
test('all six built pages enforce local-only scripts and strict privacy policy',async()=>{
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
 const css=await readFile(join(root,'assets/styles.css'),'utf8');
 assert.doesNotMatch(css,/@import\s+url\(/i);
 assert.doesNotMatch(css,/fonts\.(googleapis|gstatic)\.com/i);
 assert.match(css,/system-ui/);
});
test('hosting header policy blocks framing, MIME sniffing, device APIs',async()=>{
 const h=await readFile(join(root,'_headers'),'utf8');
 for(const item of ["frame-ancestors 'none'","X-Content-Type-Options: nosniff","X-Frame-Options: DENY","Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()"])assert.ok(h.includes(item),item);
});
test('project-path build keeps CSP and correct local asset URLs',async()=>{
 execFileSync(process.execPath,['scripts/build-site.mjs'],{cwd:root,env:{...process.env,BASE_PATH:'/AgentBridge'}});
 const html=await readFile(join(root,'dist/index.html'),'utf8');
 assert.match(html,/href="\/AgentBridge\/assets\/styles\.css"/);
 assert.match(html,/src="\/AgentBridge\/assets\/app\.js"/);
 assert.match(html,/script-src 'self'/);
});

test('private Worker config and dev secrets are git-ignored',async()=>{
  const {readFileSync}=await import('node:fs');
  const ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8').split('\n').map(s=>s.trim());
  for(const entry of ['backend/wrangler.jsonc','.dev.vars','backend/.dev.vars','.env'])
    assert.ok(ignore.includes(entry),entry+' must be ignored');
});
