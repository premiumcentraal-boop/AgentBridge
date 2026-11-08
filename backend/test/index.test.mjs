import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateE164,escapeXml,hangupXml,dialXml,verifyTwilioSignature,prepareReservation,sha256} from '../src/index.mjs';
test('E.164 rejects local, malformed and excessive numbers',()=>{
 for(const n of ['0031201234567','+0','+120','+12345678901234567890','+31-20-1234','+31123<script>'])assert.equal(validateE164(n),false);
 assert.equal(validateE164('+31201234567'),true);
 assert.equal(validateE164('+442079460000'),true);
});
test('TwiML XML escapes input and caps call duration',()=>{
 assert.equal(escapeXml('<&>"\''),'&lt;&amp;&gt;&quot;&apos;');
 assert.match(hangupXml(),/<Hangup\/>/);
 assert.match(dialXml('+31201234567','https://api.test/callback',500),/timeLimit="180"/);
 assert.throws(()=>dialXml('123','https://api.test/callback'));
 assert.throws(()=>dialXml('+31201234567','http://api.test/callback'));
});
test('token digests are deterministic without exposing token',async()=>{
 const a=await sha256('token-example');assert.equal(a.length,64);assert.equal(a,await sha256('token-example'));assert.notEqual(a,'token-example');
});
test('Twilio verifies a signed form and rejects tampering',async()=>{
 const url='https://api.example.com/telephony/twilio/incoming';
 const body='To=%2B12025550123&From=%2B12125550177&CallSid=CA123';
 const params=new URLSearchParams(body),keys=[...params.keys()].sort();
 const sign=createHmac('sha1','unit-test-secret').update(url+keys.map(k=>k+params.get(k)).join('')).digest('base64');
 const req=new Request(url,{method:'POST',headers:{'x-twilio-signature':sign},body});
 assert.equal(await verifyTwilioSignature(req,body,'unit-test-secret','https://api.example.com'),true);
 assert.equal(await verifyTwilioSignature(req,body+'&Other=1','unit-test-secret','https://api.example.com'),false);
});
test('test destination allowlist rejects arbitrary calls',async()=>{
 const a={id:'test',did:'+12025550123',status:'active'},e={US_BRIDGE_DID:'+12025550123',TEST_DESTINATION_E164:'+31201234567'};
 const out=await prepareReservation(a,{destination:'+442079460000',idempotency_key:'unique-123456'},e);
 assert.equal(out.status,403);
});
test('reservation requires idempotency key',async()=>{
 const a={id:'test',did:'+12025550123',status:'active'},e={US_BRIDGE_DID:'+12025550123',TEST_DESTINATION_E164:'+31201234567'};
 const out=await prepareReservation(a,{destination:'+31201234567',idempotency_key:'bad'},e);
 assert.equal(out.status,422);
});
test('disabled accounts cannot reserve',async()=>{
 const out=await prepareReservation({id:'test',did:'+12025550123',status:'disabled'},{destination:'+31201234567',idempotency_key:'unique-12345'},{US_BRIDGE_DID:'+12025550123',TEST_DESTINATION_E164:'+31201234567'});
 assert.equal(out.status,403);
});
