import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,swml,call,BASE,OWNER,TOKEN,DEST,CALLER} from './helpers/routing-env.mjs';

const FLAGS={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true'};
const OPT_IN={CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',
  US_PILOT_ALLOW_CALLER_ID_PROOF:'true',TEST_CALLER_E164:CALLER,
  ROUTING_MAX_CALL_SECONDS:'600',ROUTING_MAX_CALLS_PER_DAY:'4',
  ROUTING_MAX_SPEND_CENTS_PER_CALL:'50',ROUTING_MAX_SPEND_CENTS_PER_DAY:'100'};
const CID=n=>'3'+String(n).padStart(7,'0')+'-b321-4c08-a3ea-7123449130ab';
const reserve=(env,key)=>worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:key}),env);
async function inbound(env,over){
  const r=await worker.fetch(swml({call:call(over)}),env);
  return {status:r.status,doc:r.status===200?await r.json():null};
}
const connectOf=doc=>doc?.sections?.main?.find(s=>s.connect)?.connect;
const isHangup=doc=>Array.isArray(doc?.sections?.main)&&doc.sections.main.length===1&&'hangup' in doc.sections.main[0];

test('caller-ID routing stays denied for every risk-opt-in combination',async t=>{
  for(const overrides of [{},{CALLER_ID_TRUST_ACCEPTED:undefined},{US_PILOT_ALLOW_CALLER_ID_PROOF:undefined},
    {US_PILOT_ALLOW_CALLER_ID_PROOF:'TRUE'},{TEST_CALLER_E164:'+13125550100'}]){
    const {env,DB}=await routingSetup(t,{...FLAGS,...OPT_IN,...overrides});
    const res=await reserve(env,'cid-denied-'+Object.keys(overrides).join('-').slice(0,40));
    assert.equal(res.status,409,JSON.stringify(overrides));
    assert.match((await res.json()).error.message,/CALLER_AUTH_REQUIRED/);
    const matching=await inbound(env,{call_id:CID(1),from_number:env.TEST_CALLER_E164||CALLER});
    assert.equal(matching.status,200);
    assert.ok(isHangup(matching.doc),'matching caller ID never authorizes forwarding');
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
    assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM provider_events WHERE outcome='connect'").get().n,0);
  }
});

test('caller-ID mode cannot bypass authorization by relaxing spending caps',async t=>{
  for(const [k,v] of [['ROUTING_MAX_CALLS_PER_DAY','5'],['ROUTING_MAX_SPEND_CENTS_PER_DAY','101'],['ROUTING_MAX_CALL_SECONDS','601']]){
    const {env}=await routingSetup(t,{...FLAGS,...OPT_IN,[k]:v});
    const res=await reserve(env,'cid-cap-'+k.length);
    assert.equal(res.status,409,k);
    assert.match((await res.json()).error.message,/CALLER_AUTH_REQUIRED/);
  }
});

test('owner-only inbound call log endpoint',async t=>{
  const {env}=await routingSetup(t,{...OPT_IN});
  await inbound(env,{call_id:CID(4),from_number:'+14155550123'});
  const get=tok=>worker.fetch(new Request(BASE+'/v1/owner/inbound-calls?limit=5',{headers:{authorization:'Bearer '+tok}}),env);
  assert.equal((await get(TOKEN)).status,401,'agent token cannot read caller IDs');
  const r=await get(OWNER);
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.calls.length,1);
  assert.equal(body.calls[0].from_number,'+14155550123');
  assert.equal(body.calls[0].handler,'swml_hangup_only');
  assert.match(body.calls[0].received_at_iso,/^\d{4}-\d\d-\d\dT/);
  assert.equal((await worker.fetch(new Request(BASE+'/v1/owner/inbound-calls',{method:'POST',headers:{authorization:'Bearer '+OWNER}}),env)).status,405);
});
