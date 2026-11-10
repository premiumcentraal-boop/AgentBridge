import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/index.mjs';

const url='https://api.example.com/telephony/twilio/incoming';
const destination='+31201234567',did='+12025550123',caller='+12125550177';
const sid='CA'+'a'.repeat(32);
const token='private-test-auth-token';
function request(){
  const form=new URLSearchParams({To:did,From:caller,CallSid:sid});
  const body=form.toString();
  const signed=url+[...form.keys()].sort().map(k=>k+form.get(k)).join('');
  const signature=createHmac('sha1',token).update(signed).digest('base64');
  return new Request(url,{method:'POST',headers:{
    'content-type':'application/x-www-form-urlencoded',
    'x-twilio-signature':signature
  },body});
}
function env(flag){
  let updates=0;
  return {
    get updates(){return updates;},
    DB:{prepare(sql){
      if(sql.startsWith('SELECT r.id'))return {bind(){return {first:async()=>({id:'reservation',destination})}}};
      if(sql.startsWith('UPDATE reservations SET status='))return {bind(){return {run:async()=>{updates++;return {meta:{changes:1}}}}}};
      throw Error('Unexpected database operation: '+sql);
    }},
    PUBLIC_BASE_URL:'https://api.example.com',
    US_BRIDGE_DID:did,TEST_DESTINATION_E164:destination,
    TEST_CALLER_E164:caller,TWILIO_AUTH_TOKEN:token,
    ...(flag===undefined?{}:{PRIVATE_TEST_OUTBOUND_ENABLED:flag})
  };
}
test('a signed, matching inbound request cannot dial without explicit private-test opt-in',async()=>{
  for(const flag of [undefined,'','false','TRUE','1',' true ']){
    const e=env(flag);
    const res=await worker.fetch(request(),e);
    assert.equal(res.status,200);
    const xml=await res.text();
    assert.match(xml,/<Hangup\/>/);
    assert.doesNotMatch(xml,/<Dial/);
    assert.equal(e.updates,0,'reservation must not be consumed by denied call');
  }
});
test('SignalWire routing flag must never activate legacy Twilio (no second provider)',async()=>{
  const e=env('true');
  const res=await worker.fetch(request(),e);
  assert.equal(res.status,200);
  const xml=await res.text();
  assert.match(xml,/<Hangup\/>/);
  assert.doesNotMatch(xml,/<Dial/);
  assert.equal(e.updates,0);
});
