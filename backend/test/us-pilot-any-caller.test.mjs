/** Regression for the removed unauthenticated any_caller paid-routing path. */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {callerProofMode} from '../src/caller-proof.mjs';
import {routingSetup,api,swml,call,DEST} from './helpers/routing-env.mjs';

const FLAGS={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true'};
const ANY={CALLER_PROOF_MODE:'any_caller',ANY_CALLER_RISK_ACCEPTED:'true',TEST_CALLER_E164:'',
  ROUTING_MAX_CALL_SECONDS:'600',ROUTING_MAX_CALLS_PER_DAY:'4',
  ROUTING_MAX_SPEND_CENTS_PER_CALL:'50',ROUTING_MAX_SPEND_CENTS_PER_DAY:'100',RESERVATION_TTL_SECONDS:'900'};
const CID=n=>'3'+String(n).padStart(7,'0')+'-b321-4c08-a3ea-7123449130ab';
const reserve=(env,key)=>worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:key}),env);
const isHangup=doc=>Array.isArray(doc?.sections?.main)&&doc.sections.main.length===1&&'hangup' in doc.sections.main[0];

test('any_caller is not routable even with exact risk opt-in and both flags on',async t=>{
  assert.equal(callerProofMode({CALLER_PROOF_MODE:'any_caller',ANY_CALLER_RISK_ACCEPTED:'true'}),'any_caller');
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY});
  assert.equal((await reserve(env,'any-denied-0001')).status,409);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
  for(const [n,from] of [[1,'+13125550142'],[2,'+13125550143']]){
    const response=await worker.fetch(swml({call:call({call_id:CID(n),from_number:from})}),env);
    assert.equal(response.status,200);
    assert.ok(isHangup(await response.json()));
  }
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations WHERE status=\'connecting\'').get().n,0);
});

test('any_caller missing risk opt-in is also denied',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,...ANY,ANY_CALLER_RISK_ACCEPTED:undefined});
  assert.equal((await reserve(env,'any-denied-0002')).status,409);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
});
