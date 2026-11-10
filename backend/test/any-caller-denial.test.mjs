/** Regression: a signed carrier request is not proof of caller identity. */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,swml,call,SWML_URL} from './helpers/routing-env.mjs';
import {pilotPolicy} from '../src/approval-policy.mjs';
import {signalWireHangup} from '../src/signalwire.mjs';

const OPT_IN={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true',
  CALLER_PROOF_MODE:'any_caller',ANY_CALLER_RISK_ACCEPTED:'true'};

test('any_caller opt-ins cannot create an unauthenticated paid reservation',async t=>{
  const {env,DB}=await routingSetup(t,OPT_IN);
  const response=await worker.fetch(api('/v1/reservations','POST',{
    destination:env.US_PILOT_TEST_DESTINATION,idempotency_key:'deny-any-caller-0001'}),env);
  assert.equal(response.status,409);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservations').get().n,0);
});

test('signed arbitrary inbound caller always hangs up without consuming reservations',async t=>{
  const {env,DB}=await routingSetup(t,OPT_IN);
  const response=await worker.fetch(swml({call:call({from_number:'+13125550999'})},SWML_URL),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),signalWireHangup());
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM provider_events WHERE outcome='connect'").get().n,0);
});

test('policy rejects any_caller even with a valid-looking owner opt-in',async t=>{
  const {env}=await routingSetup(t,OPT_IN);
  const row={id:'11111111-1111-4111-8111-111111111111',account_id:'22222222-2222-4222-8222-222222222222',
    destination:env.US_PILOT_TEST_DESTINATION,expires_at:2000000000,status:'ready'};
  const decision=pilotPolicy(row,env);
  assert.equal(decision.ok,false);
  assert.equal(decision.code,'CALLER_AUTH_REQUIRED');
});
