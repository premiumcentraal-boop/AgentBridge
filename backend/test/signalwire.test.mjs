import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/index.mjs';
import {
  SIGNALWIRE_SWML_PATH,signalWireHangup,signalWireConnectPlan,
  inspectSignalWireNumbers,verifySignalWireSwmlSignature
} from '../src/signalwire.mjs';

const webUrl='https://bridge.example'+SIGNALWIRE_SWML_PATH;
const projectId='271cda55-9a69-4513-b6de-67271d08b9bf';
const config={
  SIGNALWIRE_SIGNING_KEY:'unit-test-signing-key-secret-32bytes',
  SIGNALWIRE_PROJECT_ID:projectId,
  SIGNALWIRE_SWML_WEBHOOK_URL:webUrl,
  US_BRIDGE_DID:'+12025550123',
  TEST_CALLER_E164:'+12125550177',
  TEST_DESTINATION_E164:'+31201234567'
};
const call={
  project_id:projectId,call_id:'38313c74-b321-4c08-a3ea-7123449130ab',
  direction:'inbound',type:'phone',from_number:config.TEST_CALLER_E164,
  to_number:config.US_BRIDGE_DID
};
const makeRequest=(payload={call},url=webUrl,sign=true)=>{
  const raw=JSON.stringify(payload);
  const sig=createHmac('sha256',config.SIGNALWIRE_SIGNING_KEY).update(webUrl+raw).digest('hex');
  return new Request(url,{method:'POST',headers:{
    'content-type':'application/json',
    ...(sign?{'x-signalwire-sha256-signature':sig}:{})
  },body:raw});
};

test('offline SWML connect document only contains phone bridging and hangup',()=>{
  const doc=signalWireConnectPlan('+31201234567','+12025550123');
  assert.equal(doc.sections.main[0].connect.to,'+31201234567');
  assert.equal(doc.sections.main[0].connect.from,'+12025550123');
  assert.equal(doc.sections.main[0].connect.answer_on_bridge,true);
  assert.deepEqual(doc.sections.main.at(-1),{hangup:{}});
  assert.ok(!JSON.stringify(doc).includes('"ai"'));
  assert.deepEqual(signalWireHangup(),{version:'1.0.0',sections:{main:[{hangup:{}}]}});
  for(const dest of ['123','+0','+12025550123','sip:bad','+31201234567<script>'])
    assert.throws(()=>signalWireConnectPlan(dest,'+12025550123'));
});

test('BYO read-only inventory uses only pinned SignalWire host and never returns token',async()=>{
  const requests=[];
  const fakeFetch=async(url,options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({links:{next:null},data:[
      {id:'n1',number:'+12025550123',capabilities:['voice','sms']},
      {id:'n2',number:'+12025550124',capabilities:['sms']},
      {id:'n3',number:'junk',capabilities:['voice']}
    ]}),{status:200});
  };
  const token='swapi_opaque_secret_never_return';
  const result=await inspectSignalWireNumbers(
    {space:'my-space',projectId,apiToken:token},fakeFetch);
  assert.deepEqual(result.voice_numbers,[{id:'n1',number:'+12025550123',voice:true}]);
  assert.equal(result.read_only,true);
  assert.equal(result.has_more,false);
  assert.ok(!JSON.stringify(result).includes(token));
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,
    'https://my-space.signalwire.com/api/relay/rest/phone_numbers?page_size=100');
  assert.equal(requests[0].options.method,'GET');
  assert.equal(requests[0].options.redirect,'error');
  assert.equal(requests[0].options.headers.authorization,
    'Basic '+btoa(projectId+':'+token));
});
test('BYO inventory rejects SSRF, malformed config, and failing provider calls',async()=>{
  let contacted=false;
  const fake=async()=>{contacted=true;throw new Error('should not call');};
  for(const space of ['https://evil.com','evil.com','a/b','a..b','UPPER','-bad','x:443']){
    await assert.rejects(inspectSignalWireNumbers(
      {space,projectId,apiToken:'opaque-test-token'},fake),TypeError);
  }
  assert.equal(contacted,false);
  const deny=async()=>new Response('',{status:401});
  await assert.rejects(inspectSignalWireNumbers({
    space:'example',projectId,apiToken:'opaque-test-token'
  },deny),/unavailable \(401\)/);
  await assert.rejects(inspectSignalWireNumbers({
    space:'example',projectId,apiToken:'opaque-test-token'
  },async()=>new Response('{bad',{status:200})),/Invalid SignalWire inventory/);
});
test('SWML signatures require exact canonical URL and unmodified raw JSON',async()=>{
  const raw=JSON.stringify({call});
  const sig=createHmac('sha256',config.SIGNALWIRE_SIGNING_KEY)
    .update(webUrl+raw).digest('hex');
  assert.equal(await verifySignalWireSwmlSignature(
    raw,sig,config.SIGNALWIRE_SIGNING_KEY,webUrl,webUrl),true);
  assert.equal(await verifySignalWireSwmlSignature(
    raw+' ',sig,config.SIGNALWIRE_SIGNING_KEY,webUrl,webUrl),false);
  assert.equal(await verifySignalWireSwmlSignature(
    raw,sig,config.SIGNALWIRE_SIGNING_KEY,webUrl,webUrl+'?q=1'),false);
  assert.equal(await verifySignalWireSwmlSignature(
    raw,'bad',config.SIGNALWIRE_SIGNING_KEY,webUrl,webUrl),false);
  assert.equal(await verifySignalWireSwmlSignature(
    raw,sig,config.SIGNALWIRE_SIGNING_KEY,'http://bridge.example'+SIGNALWIRE_SWML_PATH,
    'http://bridge.example'+SIGNALWIRE_SWML_PATH),false);
});
test('Worker SWML endpoint is always no-dial, including signed allowed calls',async()=>{
  const result=await worker.fetch(makeRequest(),{
    ...config,SIGNALWIRE_PRIVATE_TEST_ROUTING:'true',DB:{
      prepare(){throw new Error('must never use D1 for a routing attempt');}
    }
  });
  assert.equal(result.status,200);
  const xml=await result.json();
  assert.deepEqual(xml,signalWireHangup());
  assert.equal(JSON.stringify(xml).includes('connect'),false);
});
test('Worker rejects forged, mismatched or misconfigured SignalWire inbound requests',async()=>{
  const noSig=await worker.fetch(makeRequest({call},webUrl,false),config);
  assert.equal(noSig.status,403);
  // A correctly signed call from an unknown caller gets a free hangup (logged), never a connect.
  const wrongCaller=await worker.fetch(makeRequest({
    call:{...call,from_number:'+12125550178'}
  }),config);
  assert.equal(wrongCaller.status,200);
  assert.deepEqual(await wrongCaller.json(),signalWireHangup());
  const badFrom=await worker.fetch(makeRequest({call:{...call,from_number:'anonymous'}}),config);
  assert.equal(badFrom.status,403);
  const wrongProject=await worker.fetch(makeRequest({
    call:{...call,project_id:'11111111-1111-4111-8111-111111111111'}
  }),config);
  assert.equal(wrongProject.status,403);
  const wrongType=await worker.fetch(makeRequest({
    call:{...call,type:'sip'}
  }),config);
  assert.equal(wrongType.status,403);
  const wrongUrl=await worker.fetch(makeRequest({call},webUrl+'?x=1'),config);
  assert.equal(wrongUrl.status,403);
  const absentKey=await worker.fetch(makeRequest(),{
    ...config,SIGNALWIRE_SIGNING_KEY:undefined
  });
  assert.equal(absentKey.status,503);
  const oversized=await worker.fetch(new Request(webUrl,{method:'POST',
    headers:{'content-type':'application/json'},body:'X'.repeat(17000)}),config);
  assert.equal(oversized.status,413);
});

test('streaming SWML parser rejects chunked over-limit bodies without reading remaining chunks',async()=>{
  let reads=0,cancelled=false;
  const stream=new ReadableStream({
    pull(controller){
      reads++;
      if(reads===1)controller.enqueue(new Uint8Array(10000).fill(65));
      else if(reads===2)controller.enqueue(new Uint8Array(7000).fill(66));
      else controller.enqueue(new Uint8Array(10000).fill(67));
    },
    cancel(){cancelled=true;}
  });
  const request=new Request(webUrl,{method:'POST',duplex:'half',
    headers:{'content-type':'application/json'},body:stream});
  const result=await worker.fetch(request,config);
  assert.equal(result.status,413);
  assert.ok(reads<=3,'stream must stop without draining an unbounded body');
  assert.equal(cancelled,true);
});
test('streaming SWML parser rejects invalid UTF-8 before JSON handling',async()=>{
  const request=new Request(webUrl,{method:'POST',
    headers:{'content-type':'application/json'},body:new Uint8Array([0xff,0xfe])});
  const result=await worker.fetch(request,config);
  assert.equal(result.status,400);
});
test('SWML body exactly at byte cap passes the size gate and reaches signature check',async()=>{
  const body=' '.repeat(16384);
  const request=new Request(webUrl,{method:'POST',
    headers:{'content-type':'application/json'},body});
  const result=await worker.fetch(request,config);
  assert.equal(result.status,403);
});

test('blank TEST_CALLER_E164: signed calls still hang up cleanly and the caller ID is logged for the owner',async()=>{
  const {createD1}=await import('./helpers/d1.mjs');
  const DB=createD1();
  const env={...config,TEST_CALLER_E164:'',TEST_DESTINATION_E164:'',DB};
  const agent='+14155550123';
  const r=await worker.fetch(makeRequest({call:{...call,from_number:agent}}),env);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),signalWireHangup());
  // SignalWire retry with the same call_id is not logged twice.
  await worker.fetch(makeRequest({call:{...call,from_number:agent}}),env);
  const rows=DB.raw.prepare('SELECT * FROM inbound_call_log').all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].from_number,agent);
  assert.equal(rows[0].to_number,config.US_BRIDGE_DID);
  assert.equal(rows[0].caller_matches_test_caller,0);
  assert.equal(rows[0].outcome,'hangup_unknown_caller');
  assert.ok(!JSON.stringify(rows).includes(config.SIGNALWIRE_SIGNING_KEY));
  // Unsigned/forged requests are rejected and never logged.
  assert.equal((await worker.fetch(makeRequest({call:{...call,call_id:'48313c74-b321-4c08-a3ea-7123449130ab'}},webUrl,false),env)).status,403);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM inbound_call_log').get().n,1);
  // No reservations were read or created.
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
});

test('inventory byte cap stops chunked streams early and cancels unread data',async()=>{
  let pulls=0,cancelled=false;
  const body=new ReadableStream({
    pull(controller){pulls++;controller.enqueue(new Uint8Array(100_000).fill(65));},
    cancel(){cancelled=true;}
  });
  await assert.rejects(inspectSignalWireNumbers(
    {space:'example',projectId,apiToken:'opaque-test-token'},
    async()=>new Response(body,{status:200})),/response too large/);
  assert.equal(cancelled,true);
  assert.ok(pulls<=4,'must not drain entire upstream body');
});
test('inventory enforces actual bytes, not UTF-16 characters, and ignores false length',async()=>{
  const cfg={space:'example',projectId,apiToken:'opaque-test-token'};
  const multi='é'.repeat(125_001);
  await assert.rejects(inspectSignalWireNumbers(cfg,async()=>new Response(multi)),/too large/);
  const falseLength=new Response(' '.repeat(250_001));
  falseLength.headers.set('content-length','1');
  await assert.rejects(inspectSignalWireNumbers(cfg,async()=>falseLength),/too large/);
  const early=new Response('ok');
  early.headers.set('content-length','250001');
  await assert.rejects(inspectSignalWireNumbers(cfg,async()=>early),/too large/);
});
test('inventory accepts exact byte cap, rejects malformed UTF-8 and preserves pagination',async()=>{
  const cfg={space:'example',projectId,apiToken:'opaque-test-token'};
  const json=JSON.stringify({data:[{id:'one',number:'+12025550123',capabilities:['voice']}],links:{next:'next'}});
  const exact=json+' '.repeat(250_000-Buffer.byteLength(json));
  const result=await inspectSignalWireNumbers(cfg,async()=>new Response(exact));
  assert.equal(result.has_more,true);
  assert.equal(result.voice_numbers.length,1);
  await assert.rejects(inspectSignalWireNumbers(cfg,async()=>new Response(new Uint8Array([0xff,0xfe]))),/Invalid SignalWire inventory/);
  await assert.rejects(inspectSignalWireNumbers(cfg,async()=>new Response('{}')),/Invalid SignalWire inventory/);
});
