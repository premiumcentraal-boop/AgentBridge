import test from 'node:test';
import assert from 'node:assert/strict';
import {scan,internalPaths,audit,PAGES} from '../scripts/audit-site.mjs';
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
test('website audit covers public pages, direct studio routes and the original gallery',()=>{assert.equal(PAGES.length,34);for(const p of ['signup/index.html','studio/numbers/index.html','studio/demo/numbers/index.html','studio/index.html','studio/demo/index.html','studio/connections/index.html','studio/demo/connections/index.html','studio/routes/index.html','studio/demo/call/index.html','design/index.html','features/index.html','international-calling/index.html','call-memory/index.html','join-call/index.html','studio/calls/index.html','studio/demo/memory/index.html'])assert.ok(PAGES.includes(p),p);});
test('build artifact audit passes for actual built website',async()=>{
 const errors=await audit('dist',process.env.BASE_PATH||'');
 assert.deepEqual(errors,[]);
});
