import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{sha256} from '../src/index.mjs';
import {getBridgeSetup,listMyNumbers,searchAvailableNumbers} from '../src/chat-number-tools.mjs';
import {validateMcpEnvelope} from '../src/mcp-validation.mjs';

const TOKEN='ab_'+('t'.repeat(48));
const DID='+12025550123';
const PROJECT='271cda55-9a69-4513-b6de-67271d08b9bf';
const SECRET='private-server-signalwire-token-do-not-echo';
const account={id:'account-a',did:DID,status:'active'};
const base={
  US_BRIDGE_DID:DID,
  SIGNALWIRE_SPACE:'example-space',
  SIGNALWIRE_PROJECT_ID:PROJECT,
  SIGNALWIRE_API_TOKEN:SECRET
};
const response=data=>new Response(JSON.stringify(data),{
  status:200,headers:{'content-type':'application/json'}
});
const noWrites={prepare(sql){throw new Error('No database writes permitted: '+sql);}};
function request(name,args,id=1,token=TOKEN){
  return new Request('https://bridge.example/mcp',{method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',
      params:{name,...(args===undefined?{}:{arguments:args})}})});
}
async function authEnv(override={}){
  const digest=await sha256(TOKEN);
  return {...base,...override,DB:{
    prepare(sql){
      if(!sql.startsWith('SELECT id, did, status FROM accounts'))throw Error('Unexpected SQL: '+sql);
      return {bind(hash){return {first:async()=>hash===digest?account:null};}};
    }
  }};
}

test('setup card is truthful, scoped, and never implies buying or routing works',()=>{
  const result=getBridgeSetup(account,base);
  assert.equal(result.status,200);
  assert.equal(result.body.bridge_number,DID);
  assert.equal(result.body.state,'assigned_unverified');
  assert.equal(result.body.provider_connection,'server_credentials_configured_unverified');
  assert.equal(result.body.purchase_enabled,false);
  assert.equal(result.body.routing_enabled,false);
  assert.equal(result.body.native_grok_calling_verified,false);
  assert.ok(!JSON.stringify(result).includes(SECRET));
  const disabled=getBridgeSetup({...account,status:'disabled'},base);
  assert.equal(disabled.body.bridge_number,null);
  assert.equal(disabled.body.state,'not_assigned');
  const missing=getBridgeSetup(account,{US_BRIDGE_DID:DID});
  assert.equal(missing.body.provider_connection,'operator_connection_required');
});

test('owned-number lookup requests only the assigned DID, returns no other project numbers',async()=>{
  const seen=[];
  const fake=async(url,opts)=>{
    seen.push({url,opts});
    return response({data:[
      {number:DID,capabilities:['voice','sms']},
      {number:'+12025550124',capabilities:['voice']},
      {number:DID,capabilities:['sms']}
    ],links:{next:null}});
  };
  const result=await listMyNumbers(account,base,fake);
  assert.equal(result.status,200);
  assert.equal(result.body.state,'project_inventory_match');
  assert.deepEqual(result.body.numbers,[{
    number:DID,voice:true,ownership:'matched_in_operator_project',routing_enabled:false
  }]);
  assert.equal(result.body.purchase_enabled,false);
  assert.equal(result.body.routing_enabled,false);
  assert.ok(!JSON.stringify(result).includes(SECRET));
  assert.ok(!JSON.stringify(result).includes('+12025550124'));
  assert.equal(seen.length,1);
  const u=new URL(seen[0].url);
  assert.equal(u.hostname,'example-space.signalwire.com');
  assert.equal(u.pathname,'/api/relay/rest/phone_numbers');
  assert.equal(u.searchParams.get('filter_number'),DID);
  assert.equal(u.searchParams.get('page_size'),'10');
  assert.equal(seen[0].opts.method,'GET');
  assert.equal(seen[0].opts.redirect,'error');
  assert.equal(seen[0].opts.cache,'no-store');
  assert.equal(seen[0].opts.headers.authorization,'Basic '+btoa(PROJECT+':'+SECRET));
});

test('owned-number lookup never confuses missing, partial or SMS-only results with verification',async()=>{
  const sms=await listMyNumbers(account,base,async()=>response({
    data:[{number:DID,capabilities:['sms']}],links:{next:null}
  }));
  assert.equal(sms.body.state,'not_confirmed');
  assert.deepEqual(sms.body.numbers,[]);
  const partial=await listMyNumbers(account,base,async()=>response({
    data:[{number:'+12025550124',capabilities:['voice']}],links:{next:'next-page'}
  }));
  assert.equal(partial.body.state,'incomplete_inventory');
  assert.deepEqual(partial.body.numbers,[]);
});

test('provider searches are read-only, bounded to five local voice candidates and never show prices',async()=>{
  const seen=[];
  const fake=async(url,opts)=>{
    seen.push({url,opts});
    return response({data:[
      {e164:'+16185550123',capabilities:['voice','sms']},
      {e164:'+16185550123',capabilities:['voice']},
      {e164:'+12025550123',capabilities:['voice']},
      {e164:'+16185550124',capabilities:['sms']},
      {e164:'sip:invalid',capabilities:['voice']},
      {e164:'+16185550125',capabilities:['voice']}
    ]});
  };
  const result=await searchAvailableNumbers(account,{area_code:'618'},base,fake);
  assert.equal(result.status,200);
  assert.equal(result.body.card_type,'number_choices');
  assert.equal(result.body.purchase_enabled,false);
  assert.equal(result.body.price_verified,false);
  assert.deepEqual(result.body.numbers.map(n=>n.number),['+16185550123','+16185550125']);
  assert.ok(result.body.numbers.every(n=>n.price===null&&n.purchase_enabled===false));
  assert.ok(!JSON.stringify(result).includes(SECRET));
  const u=new URL(seen[0].url);
  assert.equal(u.pathname,'/api/relay/rest/phone_numbers/search');
  assert.equal(u.searchParams.get('areacode'),'618');
  assert.equal(u.searchParams.get('number_type'),'local');
  assert.equal(u.searchParams.get('max_results'),'5');
  assert.equal(seen[0].opts.method,'GET');
});

test('invalid area code, mismatched or inactive account cannot contact provider',async()=>{
  let calls=0;
  const noFetch=async()=>{calls++;throw new Error('Provider must never be contacted');};
  const invalid=await searchAvailableNumbers(account,{area_code:'618&max_results=999'},base,noFetch);
  assert.equal(invalid.status,422);
  const mismatch=await listMyNumbers({...account,did:'+14155550111'},base,noFetch);
  assert.equal(mismatch.status,403);
  const inactive=await searchAvailableNumbers({...account,status:'disabled'},{area_code:'618'},base,noFetch);
  assert.equal(inactive.status,403);
  const invalidHost=await searchAvailableNumbers(account,{area_code:'618'},{...base,
    SIGNALWIRE_SPACE:'bad.example.com'},noFetch);
  assert.equal(invalidHost.body.state,'operator_connection_required');
  assert.equal(calls,0);
});

test('upstream errors, invalid JSON and oversized provider bodies fail closed without exposing secrets',async()=>{
  for(const fake of [
    async()=>new Response('unauthorized',{status:401}),
    async()=>new Response('{not-json'),
    async()=>new Response('X'.repeat(70_000)),
    async()=>response({unexpected:'shape'})
  ]){
    const r=await listMyNumbers(account,base,fake);
    assert.equal(r.status,503);
    assert.equal(r.body.code,'PROVIDER_LOOKUP_UNAVAILABLE');
    assert.equal(r.body.routing_enabled,false);
    assert.ok(!JSON.stringify(r).includes(SECRET));
  }
});

test('MCP validator treats number discovery as strict read-only tools',()=>{
  const check=(name,args)=>{
    const req={jsonrpc:'2.0',id:1,method:'tools/call',params:{name,...args}};
    return validateMcpEnvelope(req);
  };
  for(const name of ['get_bridge_setup','list_my_numbers']){
    assert.equal(check(name,{}).ok,true);
    assert.equal(check(name,{arguments:{}}).ok,true);
    assert.equal(check(name,{arguments:{api_token:'secret'}}).code,-32602);
  }
  assert.equal(check('search_available_numbers',{arguments:{area_code:'202'}}).ok,true);
  for(const args of [{area_code:'1'},{area_code:'202',max_results:100},{area_code:'202&x=y'},{}])
    assert.equal(check('search_available_numbers',{arguments:args}).code,-32602);
  assert.equal(check('purchase_number',{arguments:{}}).code,-32601);
});

test('authenticated MCP works without Twilio; outputs card data and text fallback, never buys',async()=>{
  const env=await authEnv();
  const res=await worker.fetch(request('get_bridge_setup'),env);
  assert.equal(res.status,200);
  const rpc=await res.json();
  assert.equal(rpc.result.structuredContent.card_type,'bridge_setup');
  assert.deepEqual(JSON.parse(rpc.result.content[0].text),rpc.result.structuredContent);
  assert.equal(rpc.result.structuredContent.routing_enabled,false);
  const tools=await worker.fetch(new Request('https://bridge.example/mcp',{
    method:'POST',headers:{authorization:'Bearer '+TOKEN,'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/list'})
  }),env);
  const names=(await tools.json()).result.tools.map(t=>t.name);
  assert.ok(names.includes('list_my_numbers'));
  assert.ok(names.includes('search_available_numbers'));
  assert.ok(!names.includes('purchase_number'));
  const legacy=await worker.fetch(request('prepare_international_call',{
    destination:'+31201234567',idempotency_key:'unique-test-id'
  }),env);
  const l=(await legacy.json()).result;
  assert.equal(l.isError,true);
  assert.equal(JSON.parse(l.content[0].text).error.code,'NOT_CONFIGURED');
});

test('unauthenticated MCP cannot access number tools or provider; no credentials in output',async()=>{
  const env=await authEnv();
  const res=await worker.fetch(request('get_bridge_setup',{},1,'bad'),env);
  assert.equal(res.status,401);
  assert.ok(!(await res.text()).includes(SECRET));
});
