/** Phase 2: SignalWire-only reservation API, destination policy, PIN issuance and owner approval. */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,owner,T0,DEST,INTL,DID,TOKEN} from './helpers/routing-env.mjs';

test('SignalWire-only config serves the reservation API without any Twilio settings',async t=>{
  const {env}=await routingSetup(t);
  assert.equal(env.TWILIO_AUTH_TOKEN,undefined);assert.equal(env.TEST_CALLER_E164,undefined);
  const r=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'sw-only-0001'}),env);
  assert.equal(r.status,201);
  const b=await r.json();
  assert.equal(b.status,'ready');assert.equal(b.owner_approval_required,true);
  assert.equal(b.caller_proof,'none');assert.equal(b.dtmf_pin,undefined);
  assert.deepEqual(b.estimate,{rate_cents_per_min:2,rate_source:'owner-recorded test rate',max_call_seconds:180,max_cost_cents:6,price_verified:false});
  assert.equal(b.expires_at,new Date((T0+240)*1000).toISOString());
  const list=await (await worker.fetch(api('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list'}),env)).json();
  assert.ok(list.result.tools.some(x=>x.name==='prepare_international_call'));
});

test('destinations outside the owner allowlist or in blocked ranges cannot be reserved',async t=>{
  const {env}=await routingSetup(t);
  for(const [dest,code] of [['+12125550199','TEST_DESTINATION_ONLY'],['+19005551234','DESTINATION_BLOCKED'],
    ['+18765551234','DESTINATION_BLOCKED'],['+97912345678','DESTINATION_BLOCKED'],[DID,'INVALID_DESTINATION']]){
    const r=await worker.fetch(api('/v1/reservations','POST',{destination:dest,idempotency_key:'policy-'+dest.slice(1)}),env);
    assert.equal((await r.json()).error.code,code,dest);
  }
  const nl=await worker.fetch(api('/v1/reservations','POST',{destination:INTL,idempotency_key:'policy-nl-1'}),{...env,ROUTING_ALLOWED_COUNTRIES:'US'});
  assert.equal((await nl.json()).error.code,'TEST_DESTINATION_ONLY');
});

test('DTMF mode returns an 8-digit PIN once and stores only its hash',async t=>{
  const {DB,env}=await routingSetup(t,{CALLER_PROOF_MODE:'dtmf_pin'});
  const b=await (await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'pin-key-0001'}),env)).json();
  assert.match(b.dtmf_pin,/^\d{8}$/);assert.equal(b.caller_proof,'dtmf_pin');
  const row=DB.raw.prepare('SELECT pin_sha256 FROM reservations WHERE id=?').get(b.id);
  assert.match(row.pin_sha256,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(DB.raw.prepare('SELECT * FROM reservations').all()).includes(b.dtmf_pin));
  const retry=await (await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'pin-key-0001'}),env)).json();
  assert.equal(retry.dtmf_pin,undefined,'PIN is shown once only');
});

test('two-step approval: only the separate owner token can approve, once, before expiry',async t=>{
  const {DB,env,at}=await routingSetup(t);
  const b=await (await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'approve-0001'}),env)).json();
  assert.equal((await worker.fetch(owner(b.id,'approve',TOKEN),env)).status,401,'account/MCP token cannot approve');
  assert.equal((await worker.fetch(owner(b.id,'approve','x'.repeat(40)),env)).status,401);
  assert.equal((await worker.fetch(new Request('https://api.example.com/v1/owner/reservations/'+b.id+'/approve'),env)).status,405);
  assert.equal((await worker.fetch(owner(b.id),{...env,OWNER_APPROVAL_TOKEN_SHA256:undefined})).status,503);
  const ok=await worker.fetch(owner(b.id),env);
  assert.equal(ok.status,200);
  assert.equal((await worker.fetch(owner(b.id),env)).status,409,'approve twice');
  assert.equal(DB.raw.prepare('SELECT approved_at FROM reservations WHERE id=?').get(b.id).approved_at,T0);
  const c=await (await worker.fetch(api('/v1/reservations/'+b.id+'/cancel','POST'),env)).json();
  assert.equal(c.status,'cancelled');
  const late=await (await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'approve-0002'}),env)).json();
  at(T0+240);
  assert.equal((await worker.fetch(owner(late.id),env)).status,409,'approve after expiry');
  assert.equal((await worker.fetch(owner(late.id,'mark-ended'),env)).status,409,'mark-ended needs an active SignalWire call');
});

test('legacy Twilio route also requires owner approval once owner approval is configured',async t=>{
  const {createHmac}=await import('node:crypto');
  const {env:base}=await routingSetup(t);
  const env={...base,PUBLIC_BASE_URL:'https://api.example.com',TEST_DESTINATION_E164:DEST,
    TEST_CALLER_E164:'+12125550177',TWILIO_AUTH_TOKEN:'private-test-auth-token',PRIVATE_TEST_OUTBOUND_ENABLED:'true'};
  const b=await (await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'twilio-appr-1'}),env)).json();
  const incoming=()=>{const url='https://api.example.com/telephony/twilio/incoming';
    const form=new URLSearchParams({To:DID,From:'+12125550177',CallSid:'CA'+'d'.repeat(32)});
    const signed=url+[...form.keys()].sort().map(k=>k+form.get(k)).join('');
    return new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',
      'x-twilio-signature':createHmac('sha1','private-test-auth-token').update(signed).digest('base64')},body:form.toString()});};
  assert.doesNotMatch(await (await worker.fetch(incoming(),env)).text(),/<Dial/);
  await worker.fetch(owner(b.id),env);
  assert.match(await (await worker.fetch(incoming(),env)).text(),/<Dial/);
});
