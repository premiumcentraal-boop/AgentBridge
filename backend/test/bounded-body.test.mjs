import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readBoundedWebhookBody,MAX_WEBHOOK_BYTES} from '../src/bounded-body.mjs';
import worker from '../src/index.mjs';

function requestFromChunks(chunks,headers={}){
  let i=0,cancelled=false;
  const stream=new ReadableStream({
    pull(controller){
      if(i>=chunks.length){controller.close();return;}
      controller.enqueue(chunks[i++]);
    },
    cancel(){cancelled=true;}
  });
  return {request:new Request('https://api.example.com/telephony/twilio/incoming',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},
    body:stream,duplex:'half'
  }),wasCancelled:()=>cancelled};
}
const bytes=(s)=>new TextEncoder().encode(s);
test('bounded reader accepts split UTF-8 at exact byte limit',async()=>{
  const source='a'.repeat(MAX_WEBHOOK_BYTES-2)+'é';
  const data=bytes(source);
  const {request}=requestFromChunks([data.slice(0,MAX_WEBHOOK_BYTES-1),data.slice(MAX_WEBHOOK_BYTES-1)]);
  assert.equal(await readBoundedWebhookBody(request),source);
});
test('bounded reader cancels oversized streaming body without reading all chunks',async()=>{
  const chunks=[bytes('x'.repeat(MAX_WEBHOOK_BYTES)),bytes('y'),bytes('unread')];
  const body=requestFromChunks(chunks);
  assert.equal(await readBoundedWebhookBody(body.request),null);
  assert.equal(body.wasCancelled(),true);
});
test('bounded reader rejects malformed UTF-8 and invalid declared length',async()=>{
  const invalid=requestFromChunks([new Uint8Array([0xc3,0x28])]);
  assert.equal(await readBoundedWebhookBody(invalid.request),null);
  for(const header of ['16001','NaN','-1','1e10']){
    const r=requestFromChunks([bytes('x')],{'content-length':header});
    assert.equal(await readBoundedWebhookBody(r.request),null);
    assert.equal(r.wasCancelled(),true);
  }
});
test('signed inbound Twilio request still authenticates and hangs up with no active route',async()=>{
  const url='https://api.example.com/telephony/twilio/incoming';
  const token='test-token';
  const raw='To=%2B12025550123&From=%2B12125550177&CallSid=CA'+'a'.repeat(32);
  const params=new URLSearchParams(raw);
  const sig=createHmac('sha1',token).update(url+[...params.keys()].sort().map(k=>k+params.get(k)).join('')).digest('base64');
  const env={
    DB:{prepare(){return {bind(){return {first:async()=>null}}}}},
    PUBLIC_BASE_URL:'https://api.example.com',US_BRIDGE_DID:'+12025550123',
    TEST_DESTINATION_E164:'+31201234567',TEST_CALLER_E164:'+12125550177',
    TWILIO_AUTH_TOKEN:token
  };
  const {request}=requestFromChunks([bytes(raw.slice(0,35)),bytes(raw.slice(35))],{'x-twilio-signature':sig});
  const res=await worker.fetch(request,env);
  assert.equal(res.status,200);
  assert.match(await res.text(),/<Hangup\/>/);
});
test('oversized Twilio callback never reaches signature or D1',async()=>{
  const body=requestFromChunks([bytes('x'.repeat(MAX_WEBHOOK_BYTES)),bytes('x')]);
  const env={DB:{prepare(){throw Error('D1 must not be called');}},
    PUBLIC_BASE_URL:'https://api.example.com',US_BRIDGE_DID:'+12025550123',
    TEST_DESTINATION_E164:'+31201234567',TEST_CALLER_E164:'+12125550177',
    TWILIO_AUTH_TOKEN:'token'};
  const res=await worker.fetch(body.request,env);
  assert.equal(res.status,403);
  assert.equal(body.wasCancelled(),true);
});
