import test from 'node:test';
import assert from 'node:assert/strict';
import {callerProofMode,generatePin,pinHash,verifyPin,constantTimeEqualHex,PIN_DIGITS} from '../src/caller-proof.mjs';
import {createD1} from './helpers/d1.mjs';

test('caller proof defaults to none; caller-ID trust needs explicit owner acceptance',()=>{
  assert.equal(callerProofMode({}),'none');
  assert.equal(callerProofMode({CALLER_PROOF_MODE:'DTMF_PIN'}),'none');
  assert.equal(callerProofMode({CALLER_PROOF_MODE:'dtmf_pin'}),'dtmf_pin');
  const base={CALLER_PROOF_MODE:'capped_caller_id',TEST_CALLER_E164:'+12125550177',US_BRIDGE_DID:'+12025550123'};
  assert.equal(callerProofMode(base),'none');
  assert.equal(callerProofMode({...base,CALLER_ID_TRUST_ACCEPTED:'yes'}),'none');
  assert.equal(callerProofMode({...base,CALLER_ID_TRUST_ACCEPTED:'true'}),'capped_caller_id');
  assert.equal(callerProofMode({...base,CALLER_ID_TRUST_ACCEPTED:'true',TEST_CALLER_E164:'+12025550123'}),'none');
  assert.equal(callerProofMode({...base,CALLER_ID_TRUST_ACCEPTED:'true',TEST_CALLER_E164:'anonymous'}),'none');
});
test('PINs are 8 random digits; hashes are bound to the reservation',async()=>{
  const seen=new Set();
  for(let i=0;i<200;i++){const p=generatePin();assert.match(p,new RegExp('^\\d{'+PIN_DIGITS+'}$'));seen.add(p);}
  assert.ok(seen.size>195);
  const h=await pinHash('res-a','12345678');
  assert.equal(await verifyPin('res-a','12345678',h),true);
  assert.equal(await verifyPin('res-b','12345678',h),false,'PIN from another reservation');
  for(const bad of ['1234567','123456789','1234567a','',undefined,' 12345678','12345678#'])
    assert.equal(await verifyPin('res-a',bad,h),false);
  assert.equal(await verifyPin('res-a','12345678','not-a-hash'),false);
  assert.equal(constantTimeEqualHex('ab','abc'),false);
});
test('migration adds ledger with replay-proof primary key and additive reservation columns',async()=>{
  const DB=createD1();
  const ins="INSERT INTO provider_events (provider,provider_call_id,event_type,received_at,outcome) VALUES ('signalwire','c1','swml_inbound',1,'ok')";
  await DB.prepare(ins).run();
  await assert.rejects(()=>DB.prepare(ins).run(),/UNIQUE|PRIMARY/);
  const cols=DB.raw.prepare('PRAGMA table_info(reservations)').all().map(c=>c.name);
  for(const c of ['approved_at','pin_sha256','pin_attempts','provider','provider_call_id','claimed_at','max_call_seconds','max_cost_cents'])
    assert.ok(cols.includes(c),c);
  const legacy=createD1({migrations:false});
  assert.ok(!legacy.raw.prepare('PRAGMA table_info(reservations)').all().some(c=>c.name==='approved_at'));
});
