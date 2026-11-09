import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMcpEnvelope} from '../src/mcp-validation.mjs';

const valid={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'prepare_international_call',arguments:{destination:'+31201234567',idempotency_key:'unique-test-123'}}};
const check=(input,code)=>{const r=validateMcpEnvelope(input);assert.equal(r.ok,false);assert.equal(r.code,code);};

test('accepts valid prepare, status and cancellation calls',()=>{
 assert.equal(validateMcpEnvelope(valid).ok,true);
 for(const name of ['get_call_status','cancel_international_call'])
  assert.equal(validateMcpEnvelope({jsonrpc:'2.0',id:'a',method:'tools/call',params:{name,arguments:{reservation_id:'12345678-1234-1234-1234-123456789abc'}}}).ok,true);
});
test('rejects batch and scalar envelopes before dispatch',()=>{
 for(const x of [[],[valid],null,'hello',42])check(x,-32600);
});
test('requires strict protocol version, method and request id',()=>{
 check({...valid,jsonrpc:'1.0'},-32600);
 check({...valid,jsonrpc:undefined},-32600);
 check({...valid,id:null},-32600);
 check({...valid,id:1.5},-32600);
 const {id,...noId}=valid;check(noId,-32600);
 check({...valid,method:'unexpected'},-32601);
});
test('notifications are id-free, other requests require ids',()=>{
 assert.equal(validateMcpEnvelope({jsonrpc:'2.0',method:'notifications/initialized'}).ok,true);
 check({jsonrpc:'2.0',id:1,method:'notifications/initialized'},-32600);
});
test('invalid tool inputs fail before any database or carrier access',()=>{
 check({...valid,params:{name:'prepare_international_call',arguments:{destination:'0031201234567',idempotency_key:'unique-test-123'}}},-32602);
 check({...valid,params:{name:'prepare_international_call',arguments:{destination:'+31201234567',idempotency_key:'bad'}}},-32602);
 check({...valid,params:{name:'prepare_international_call',arguments:{...valid.params.arguments,unexpected:true}}},-32602);
 check({...valid,params:{name:'prepare_international_call',arguments:[]}},-32602);
 check({...valid,params:{name:'prepare_international_call',arguments:null}},-32602);
 check({...valid,params:{name:'get_call_status',arguments:{reservation_id:'../../admin'}}},-32602);
 check({...valid,params:{name:'cancel_international_call',arguments:{reservation_id:'12345678-1234-1234-1234-123456789abc',extra:'x'}}},-32602);
 check({...valid,params:{name:'unknown',arguments:{}}},-32601);
});
test('invalid params objects are rejected',()=>{
 for(const params of [[],null,'string'])check({...valid,params},-32602);
});
