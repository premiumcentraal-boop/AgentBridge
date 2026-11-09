import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/index.mjs';

const url='https://api.example.com/telephony/twilio/dial-complete';
const sid='CA'+'a'.repeat(32);
const token='offline-test-token';
function makeRequest(raw){
  const params=new URLSearchParams(raw);
  const canonical=url+[...new Set(params.keys())].sort().map(k=>k+params.getAll(k).join('')).join('');
  const signature=createHmac('sha1',token).update(canonical).digest('base64');
  return new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature},body:raw});
}
function fixture(){
  const writes=[];
  const env={
    DB:{prepare(sql){
      if(!sql.startsWith('UPDATE reservations SET status='))throw Error('Unexpected SQL: '+sql);
      return {bind(...args){return {run:async()=>{writes.push(args);return {meta:{changes:1}};}}}};
    }},
    PUBLIC_BASE_URL:'https://api.example.com',US_BRIDGE_DID:'+12025550123',
    TEST_DESTINATION_E164:'+31201234567',TEST_CALLER_E164:'+12125550177',
    TWILIO_AUTH_TOKEN:token
  };
  return {env,writes};
}
test('unknown, missing, nonterminal and ambiguous callbacks preserve the connecting lock',async()=>{
  const bad=[
    'CallSid='+sid,
    'CallSid='+sid+'&DialCallStatus=ringing',
    'CallSid='+sid+'&DialCallStatus=unexpected',
    'CallSid='+sid+'&DialCallStatus=',
    'CallSid=bad&DialCallStatus=completed',
    'CallSid='+sid+'&CallSid='+sid+'&DialCallStatus=completed',
    'CallSid='+sid+'&DialCallStatus=completed&DialCallStatus=failed'
  ];
  for(const raw of bad){
    const {env,writes}=fixture();
    const response=await worker.fetch(makeRequest(raw),env);
    assert.equal(response.status,200,raw);
    assert.match(await response.text(),/<Hangup\/>/);
    assert.equal(writes.length,0,'callback must not release active lock: '+raw);
  }
});
test('known Twilio Dial terminal statuses perform one conditional transition',async()=>{
  for(const [status,expected] of Object.entries({
    completed:'completed',busy:'failed',failed:'failed','no-answer':'failed',canceled:'failed'
  })){
    const {env,writes}=fixture();
    const response=await worker.fetch(makeRequest(new URLSearchParams({CallSid:sid,DialCallStatus:status}).toString()),env);
    assert.equal(response.status,200);
    assert.match(await response.text(),/<Hangup\/>/);
    assert.equal(writes.length,1,status);
    assert.equal(writes[0][0],expected,status);
    assert.equal(writes[0][2],sid,status);
  }
});
