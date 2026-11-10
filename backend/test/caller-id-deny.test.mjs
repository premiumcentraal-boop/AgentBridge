/** A spoofed caller ID is not caller authentication, even with owner risk opt-ins. */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,swml,call} from './helpers/routing-env.mjs';
import {pilotPolicy} from '../src/approval-policy.mjs';
import {signalWireHangup} from '../src/signalwire.mjs';

const OPT_IN={
  PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true',
  CALLER_PROOF_MODE:'capped_caller_id',CALLER_ID_TRUST_ACCEPTED:'true',
  US_PILOT_ALLOW_CALLER_ID_PROOF:'true',TEST_CALLER_E164:'+13125550142'
};

test('caller-ID risk acceptance cannot authorize paid reservation creation',async t=>{
  const {env,DB}=await routingSetup(t,OPT_IN);
  const response=await worker.fetch(api('/v1/reservations','POST',{
    destination:env.US_PILOT_TEST_DESTINATION,idempotency_key:'cid-denied-0001'
  }),env);
  assert.equal(response.status,409);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
});

test('signed matching caller-ID request cannot claim a reservation',async t=>{
  const {env,DB}=await routingSetup(t,OPT_IN);
  const response=await worker.fetch(swml({call:call({from_number:env.TEST_CALLER_E164})}),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),signalWireHangup());
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM provider_events WHERE outcome='connect'").get().n,0);
});

test('policy denies caller-ID mode even with both risk acceptance flags',async t=>{
  const {env}=await routingSetup(t,OPT_IN);
  const row={id:'11111111-1111-4111-8111-111111111111',
    account_id:'22222222-2222-4222-8222-222222222222',
    destination:env.US_PILOT_TEST_DESTINATION,expires_at:2000000000,status:'ready'};
  assert.deepEqual(pilotPolicy(row,env),{ok:false,code:'CALLER_AUTH_REQUIRED'});
});
