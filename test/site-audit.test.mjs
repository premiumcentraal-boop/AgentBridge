import test from 'node:test';
import assert from 'node:assert/strict';
import {scan,internalPaths,audit,PAGES} from '../scripts/audit-site.mjs';
import { createApp } from '../server/app.mjs';
import { openStore } from '../server/store.mjs';
import { openAccountDatabase } from '../server/accounts/node-database.mjs';
const page=(body,extra='')=>'<!doctype html><html lang="en"><head><title>Test</title><meta name="description" content="Example"></head><body><a href="#main">Skip</a><main id="main"><h1>Test</h1>'+body+'</main>'+extra+'</body></html>';
test('valid accessible markup passes structural checks',()=>{assert.deepEqual(scan(page('<label for="tel">Number</label><input id="tel" type="tel"><button>Send</button>'),'test'),[]);});
test('missing input labels, image alt and duplicate ids fail',()=>{
 const errors=scan(page('<input id="tel"><img src="/favicon.svg"><div id="same"></div><div id="same"></div>'),'test').join('\n');
 for(const expected of ['input missing associated label','image missing alt','duplicate id same'])assert.match(errors,new RegExp(expected));
});
test('invalid landmarks and aria references are rejected',()=>{
 const html=page('<button aria-controls="missing">Open</button>').replace('<main id="main">','<div id="main">').replace('</main>','</div>');
 const errors=scan(html,'test').join('\n');
 assert.match(errors,/expected exactly one main/);assert.match(errors,/aria-controls references missing id/);
});
test('missing skip target and broken fragments are caught',()=>{
 const errors=scan(page('<a href="#unknown">Broken</a>').replace('id="main"','id="other"'),'test').join('\n');
 assert.match(errors,/broken fragment #unknown/);
});
test('internal URLs resolve in both root and project-site builds',()=>{
 const html='<a href="/pricing/"></a><script src="/assets/app.js"></script>';
 assert.deepEqual(internalPaths(html),['pricing/index.html','assets/app.js']);
 assert.deepEqual(internalPaths(html.replaceAll('="/','="/AgentBridge/'),'/AgentBridge'),['pricing/index.html','assets/app.js']);
 assert.throws(()=>internalPaths(html,'/AgentBridge'),/missing BASE_PATH/);
});
test('website audit covers public pages, direct studio routes and the original gallery',()=>{assert.equal(PAGES.length,40);for(const p of ['signup/index.html','signin/index.html','verify-email/index.html','forgot-password/index.html','reset-password/index.html','studio/numbers/index.html','studio/demo/numbers/index.html','studio/index.html','studio/demo/index.html','studio/connections/index.html','studio/demo/connections/index.html','studio/routes/index.html','studio/demo/call/index.html','design/index.html','features/index.html','international-calling/index.html','call-memory/index.html','join-call/index.html','studio/calls/index.html','studio/demo/memory/index.html','studio/agents/index.html','studio/demo/agents/index.html'])assert.ok(PAGES.includes(p),p);});
test('build artifact audit passes for actual built website',async()=>{
 const errors=await audit('dist',process.env.BASE_PATH||'');
 assert.deepEqual(errors,[]);
});

test('the marketing entry reflects public email signup readiness without loading a private session', async (t) => {
  for (const mailReady of [false, true]) {
    const database = openAccountDatabase(':memory:');
    const store = openStore(':memory:');
    const server = createApp({
      store, accountDatabase: database,
      env: {
        STUDIO_SIGNUP_MODE: 'public',
        STUDIO_PUBLIC_ORIGIN: 'https://agentbridge.example',
        AUTH_EMAIL_FROM: 'Studio <hello@example.test>',
        RESEND_API_KEY: mailReady ? 're_' + 'test'.repeat(10) : '',
        AGENTBRIDGE_CALLING_COUNTRIES: 'us, gb',
      },
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const page = await fetch(origin);
    const html = await page.text();
    const session = await (await fetch(origin + '/api/auth/session')).json();
    assert.equal(page.status, 200);
    assert.equal(session.registration_available, mailReady);
    assert.equal(html.includes('data-public-signup="true"'), mailReady);
    assert.match(html, /data-callback-countries="US,GB"/);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'none'/);
    if (mailReady) {
      const samplePath = html.match(/src="([^"]+\.mp3)"/)[1];
      const audio = await fetch(origin + samplePath, {headers:{Range:'bytes=0-1'}});
      assert.equal(audio.status, 206);
      assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
      assert.match(audio.headers.get('content-range'), /^bytes 0-1\/\d+$/);
      assert.equal((await audio.arrayBuffer()).byteLength, 2);
    }
  }
});
