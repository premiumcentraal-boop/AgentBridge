import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/index.mjs';

const url='https://api.example.com/telephony/twilio/incoming';
const did='+12025550123',caller='+12125550177',destination='+31201234567';
const sid='CA'+'a'.repeat(32);
const token='offline-signed-form-token';
function signedRequest(raw){
  const form=new URLSearchParams(raw);
  const canonical=url+[...new Set(form.keys())].sort().map(k=>k+form.getAll(k).join('')).join('');
  const signature=createHmac('sha1',token).update(canonical).digest('base64');
  return new Request(url,{method:'POST',headers:{
    'content-type':'application/x-www-form-urlencoded',
    'x-twilio-signature':signature
  },body:raw});
}
function fixture(){
  let reads=0,writes=0;
  return {
    get reads(){return reads;},get writes(){return writes;},
    DB:{prepare(sql){
      if(sql.startsWith('SELECT r.id'))return {bind(){return {first:async()=>{reads++;return {id:'reservation',destination};}}}};
      if(sql.startsWith('UPDATE reservations SET status='))return {bind(){return {run:async()=>{writes++;return {meta:{changes:1}};}}}};
      throw Error('Unexpected SQL: '+sql);
    }},
    PUBLIC_BASE_URL:'https://api.example.com',US_BRIDGE_DID:did,
    TEST_DESTINATION_E164:destination,TEST_CALLER_E164:caller,
    TWILIO_AUTH_TOKEN:token,PRIVATE_TEST_OUTBOUND_ENABLED:'true'
  };
}
test('signed duplicate or absent inbound routing identity never reads or consumes a reservation',async()=>{
  const base=new URLSearchParams({To:did,From:caller,CallSid:sid});
  for(const field of ['To','From','CallSid']){
    const duplicate=new URLSearchParams(base);duplicate.append(field,base.get(field));
    const contradictory=new URLSearchParams(base);contradictory.append(field,'unexpected');
    const missing=new URLSearchParams(base);missing.delete(field);
    for(const form of [duplicate,contradictory,missing]){
      const env=fixture();
      const response=await worker.fetch(signedRequest(form.toString()),env);
      assert.equal(response.status,200,field);
      const xml=await response.text();
      assert.match(xml,/<Hangup\/>/,field);
      assert.doesNotMatch(xml,/<Dial/,field);
      assert.equal(env.reads,0,'no reservation read: '+field);
      assert.equal(env.writes,0,'no reservation consumption: '+field);
    }
  }
});
test('single signed routing identity still hangs up with SignalWire-only pilot flags',async()=>{
  const env=fixture();
  const form=new URLSearchParams({To:did,From:caller,CallSid:sid});
  const response=await worker.fetch(signedRequest(form.toString()),env);
  assert.equal(response.status,200);
  const xml=await response.text();
  assert.match(xml,/<Hangup\/>/);
  assert.doesNotMatch(xml,/<Dial/);
  assert.equal(env.reads,0);
  assert.equal(env.writes,0);
});
