import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCarrierReconciliation} from '../src/carrier-reconciliation.mjs';

const DID='+12025550123',DEST='+12125550100';
const SEG='48313c74-b321-4c08-a3ea-7123449130ab';
const CALL='38313c74-b321-4c08-a3ea-7123449130ab';
const CHILD='58313c74-b321-4c08-a3ea-7123449130ab';
const PROJECT='271cda55-9a69-4513-b6de-67271d08b9bf';
const SECRET='private-voice-log-read-token';
const row={provider_segment_id:SEG,provider_call_id:CALL,created_at:1800000000,
  destination:DEST,max_cost_cents:50};
const env={US_BRIDGE_DID:DID,SIGNALWIRE_SPACE:'example-space',
  SIGNALWIRE_PROJECT_ID:PROJECT,SIGNALWIRE_VOICE_API_TOKEN:SECRET};
const inbound={id:SEG,status:'completed',direction:'inbound',to:DID,charge:0.01};
const child={id:CHILD,parent_id:SEG,direction:'outbound',to:DEST,status:'completed',charge:0.02};
function provider(inRow=inbound,children=[child],links={}){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    const payload=url.endsWith('/'+SEG)?inRow:{data:children,links};
    return new Response(JSON.stringify(payload),{status:200});
  };
  return {fetchImpl,calls};
}
test('requires two terminal verified carrier segments and sums real A/B charges',async()=>{
  const p=provider();
  const result=await fetchCarrierReconciliation(row,env,p.fetchImpl);
  assert.deepEqual(result,{ok:true,inbound_segment_id:SEG,outbound_segment_id:CHILD,
    actual_cost_cents:3,source:'verified_project_voice_logs',terminal:true});
  assert.equal(p.calls.length,2);
  assert.ok(p.calls[0].url.endsWith('/api/voice/logs/'+SEG));
  assert.equal(new URL(p.calls[1].url).pathname,'/api/voice/logs');
  assert.equal(new URL(p.calls[1].url).searchParams.get('page_size'),'1000');
  for(const c of p.calls){
    assert.equal(c.options.method,'GET');
    assert.equal(c.options.redirect,'error');
    assert.equal(new URL(c.url).hostname,'example-space.signalwire.com');
    assert.equal(c.options.headers.authorization,'Basic '+btoa(PROJECT+':'+SECRET));
    assert.equal(c.options.cache,'no-store');
  }
  assert.ok(!JSON.stringify(result).includes(SECRET));
});
test('unavailable Voice-only credential or invalid UUID never contacts provider',async()=>{
  let calls=0;const fail=async()=>{calls++;throw Error('must not call provider')};
  const a=await fetchCarrierReconciliation(row,{...env,SIGNALWIRE_VOICE_API_TOKEN:undefined},fail);
  assert.equal(a.code,'VOICE_LOG_CREDENTIALS_REQUIRED');
  const b=await fetchCarrierReconciliation({...row,provider_segment_id:'bad'},env,fail);
  assert.equal(b.code,'MISSING_CARRIER_IDENTIFIERS');
  assert.equal(calls,0);
});
test('fail closed on stale, mismatched, multiple or paginated voice logs',async()=>{
  const cases=[
    provider({...inbound,status:'ringing'}),
    provider({...inbound,status:'completed',to:'+12025550144'}),
    provider(inbound,[{...child,status:'ringing'}]),
    provider(inbound,[{...child,to:'+12125550155'}]),
    provider(inbound,[]),
    provider(inbound,[child,{...child,id:'68313c74-b321-4c08-a3ea-7123449130ab'}]),
    provider(inbound,[child],{next:'opaque-page-token'}),
    provider({...inbound,charge:'1.00'}),
    provider(inbound,[{...child,charge:99}])
  ];
  for(const p of cases){
    const r=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    assert.equal(r.ok,false,'unexpected unlock from mismatched carrier logs: '+JSON.stringify(r));
  }
});
test('actual charges above reservation cap never unlock',async()=>{
  const p=provider({...inbound,charge:0.03},[{...child,charge:0.03}]);
  const r=await fetchCarrierReconciliation({...row,max_cost_cents:3},env,p.fetchImpl);
  assert.equal(r.code,'ACTUAL_CHARGE_EXCEEDS_RESERVED_CAP');
});
test('non-200, invalid JSON and oversized provider documents fail closed',async()=>{
  for(const fake of [
    async()=>new Response('Unavailable',{status:503}),
    async()=>new Response('{invalid-json'),
    async()=>new Response('x'.repeat(270000))
  ]){
    const r=await fetchCarrierReconciliation(row,env,fake);
    assert.equal(r.ok,false);
  }
});
