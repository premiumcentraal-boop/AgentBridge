import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import worker,{sha256} from '../src/index.mjs';
import {NUMBER_CARD_URI,NUMBER_CARD_MIME,NUMBER_CARD_HTML,
  numberCardResource,readNumberCardResource} from '../src/chat-card.mjs';
import {validateMcpEnvelope} from '../src/mcp-validation.mjs';

const TOKEN='ab_'+('c'.repeat(48));
const DID='+12025550123';
async function env(){
  const digest=await sha256(TOKEN);
  return {US_BRIDGE_DID:DID,DB:{prepare(sql){
    if(!sql.startsWith('SELECT id, did, status FROM accounts'))
      throw Error('Card discovery must never write to D1');
    return {bind(tokenHash){return {first:async()=>tokenHash===digest?{
      id:'account-a',status:'active',did:DID
    }:null};}};
  }}};
}
function mcp(method,params,token=TOKEN){
  return new Request('https://bridge.example/mcp',{method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:7,method,...(params?{params}:{})})});
}

test('card resource uses the MCP Apps MIME type and explicitly requests no network or device access',()=>{
  const resource=numberCardResource();
  assert.equal(resource.uri,NUMBER_CARD_URI);
  assert.equal(resource.mimeType,'text/html;profile=mcp-app');
  assert.deepEqual(resource._meta.ui.csp,{connectDomains:[],resourceDomains:[]});
  const read=readNumberCardResource(NUMBER_CARD_URI).contents[0];
  assert.equal(read.text,NUMBER_CARD_HTML);
  assert.equal(read.mimeType,NUMBER_CARD_MIME);
  assert.ok(read.text.startsWith('<!doctype html>'));
  assert.ok(read.text.includes('ui/initialize'));
  assert.ok(read.text.includes('ui/notifications/initialized'));
  assert.ok(read.text.includes('ui/notifications/tool-result'));
  assert.ok(read.text.includes('appInfo:'));
  assert.ok(read.text.includes('protocolVersion:'));
  assert.ok(!read.text.includes('.innerHTML'));
  assert.ok(!read.text.includes('fetch('));
  assert.ok(!read.text.includes('<button'));
  assert.throws(()=>readNumberCardResource('ui://agentbridge/other'),TypeError);
});

test('authenticated MCP lists and serves UI resource and links every number tool to it',async()=>{
  const e=await env();
  const listed=await worker.fetch(mcp('resources/list'),e);
  assert.equal(listed.status,200);
  const resource=(await listed.json()).result.resources[0];
  assert.equal(resource.uri,NUMBER_CARD_URI);
  const read=await worker.fetch(mcp('resources/read',{uri:NUMBER_CARD_URI}),e);
  assert.equal(read.status,200);
  const body=(await read.json()).result.contents[0];
  assert.equal(body.mimeType,NUMBER_CARD_MIME);
  assert.match(body.text,/AgentBridge number card/);
  const tools=await worker.fetch(mcp('tools/list'),e);
  const names=(await tools.json()).result.tools;
  assert.deepEqual(names.map(t=>t.name),[
    'get_bridge_setup','list_my_numbers','search_available_numbers'
  ],'incomplete private calling setup must advertise read-only chat tools only');
  for(const tool of names){
    assert.equal(tool.annotations.readOnlyHint,true);
    assert.equal(tool._meta.ui.resourceUri,NUMBER_CARD_URI);
    assert.deepEqual(tool._meta.ui.visibility,['model','app']);
  }
});

test('resource reads reject unexpected URIs and extra parameters before dispatch',()=>{
  const valid=(params)=>validateMcpEnvelope({jsonrpc:'2.0',id:1,method:'resources/read',params});
  assert.equal(valid({uri:NUMBER_CARD_URI}).ok,true);
  assert.equal(valid({uri:'ui://agentbridge/other'}).code,-32602);
  assert.equal(valid({uri:NUMBER_CARD_URI,extra:'x'}).code,-32602);
  assert.equal(valid({}).code,-32602);
  assert.equal(validateMcpEnvelope({jsonrpc:'2.0',id:1,method:'resources/list',params:{a:1}}).code,-32602);
});

test('card script completes correct Apps handshake and renders untrusted strings only as text',()=>{
  const script=NUMBER_CARD_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  class Node{
    constructor(){this.textContent='';this.children=[];}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(){this.children=[];}
  }
  const nodes=Object.fromEntries(['title','summary','numbers','notice'].map(id=>[id,new Node()]));
  const messages=[];
  const parent={postMessage(value){messages.push(value);}};
  let callback;
  const win={parent,addEventListener(name,handler){if(name==='message')callback=handler;}};
  runInNewContext(script,{window:win,document:{
    getElementById(id){return nodes[id];},
    createElement(){return new Node();}
  }});
  assert.equal(messages[0].method,'ui/initialize');
  assert.equal(messages[0].params.protocolVersion,'2026-01-26');
  assert.equal(messages[0].params.appInfo.name,'agentbridge-number-card');
  callback({source:parent,data:{jsonrpc:'2.0',id:1,result:{}}});
  assert.equal(messages[1].method,'ui/notifications/initialized');
  callback({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',
    params:{structuredContent:{card_type:'number_choices',mode:'preview',
      area_code:'618',numbers:[{number:'<img src=x onerror=alert(1)>'}],
      warning:'Not a real number. No purchase.'}}}});
  assert.equal(nodes.title.textContent,'US number candidates');
  assert.equal(nodes.numbers.children.length,1);
  assert.equal(nodes.numbers.children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(nodes.numbers.children[0].children[1].textContent,'Candidate only · not reserved');
  assert.equal(nodes.notice.textContent,'Not a real number. No purchase.');
  callback({source:{},data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',
    params:{structuredContent:{card_type:'number_choices',mode:'preview',area_code:'999',numbers:[]}}}});
  assert.equal(nodes.summary.textContent,'Area code 618 · prices not verified',
    'messages from frames other than the parent are ignored');
});

test('UI resource and cards require bearer authentication',async()=>{
  const e=await env();
  const res=await worker.fetch(mcp('resources/read',{uri:NUMBER_CARD_URI},'bad'),e);
  assert.equal(res.status,401);
  const raw=await res.text();
  assert.ok(!raw.includes(NUMBER_CARD_HTML.slice(0,50)));
});
