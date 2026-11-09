import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../src/index.mjs';
import worker from '../src/index.mjs';

const TOKEN='ab_'+('A'.repeat(48));
const env={
  PUBLIC_BASE_URL:'https://api.example.com',
  US_BRIDGE_DID:'+12025550123',TEST_DESTINATION_E164:'+31201234567',
  TEST_CALLER_E164:'+12125550177',TWILIO_AUTH_TOKEN:'not-a-real-token'
};
async function setup(){
  const digest=await sha256(TOKEN);
  let writes=0, reads=0;
  return {
    env:{...env,DB:{prepare(sql){
      reads++;
      if(sql.includes('SELECT id, did, status FROM accounts'))return {bind(value){
        return {first:async()=>value===digest?{
          id:'test',did:env.US_BRIDGE_DID,status:'active'
        }:null};
      }};
      return {bind(){return {run:async()=>{writes++;return {meta:{changes:1}};},
        first:async()=>{writes++;return null;}}}};
    }}},
    counters:()=>({reads,writes})
  };
}
function streamRequest(path,chunks,contentType='application/json',token=TOKEN){
  let offset=0,cancelled=false;
  const stream=new ReadableStream({
    pull(controller){if(offset>=chunks.length){controller.close();return;}
      controller.enqueue(chunks[offset++]);},
    cancel(){cancelled=true;}
  });
  const request=new Request('https://api.example.com'+path,{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':contentType},
    body:stream,duplex:'half'
  });
  return {request,wasCancelled:()=>cancelled};
}
const bytes=x=>new TextEncoder().encode(x);

test('authenticated MCP and REST reject chunked >4096 bytes before database side effects',async()=>{
  for(const path of ['/mcp','/v1/reservations']){
    const {env,counters}=await setup();
    const body=streamRequest(path,[bytes(' '.repeat(4096)),bytes('x'),bytes('unread')]);
    const response=await worker.fetch(body.request,env);
    assert.equal(response.status,400);
    assert.equal(body.wasCancelled(),true);
    assert.equal(counters().writes,0);
  }
});
test('malformed UTF-8 is rejected by MCP and REST without reservation writes',async()=>{
  for(const path of ['/mcp','/v1/reservations']){
    const {env,counters}=await setup();
    const body=streamRequest(path,[new Uint8Array([0xc3,0x28])]);
    const response=await worker.fetch(body.request,env);
    assert.equal(response.status,400);
    assert.equal(counters().writes,0);
  }
});
test('JSON content type must match media type, not merely contain substring',async()=>{
  const {env,counters}=await setup();
  const req=streamRequest('/mcp',[bytes('{}')],'text/plain; note=application/json');
  const res=await worker.fetch(req.request,env);
  assert.equal(res.status,400);
  assert.equal(counters().writes,0);
});
test('valid bounded JSON still supports MCP ping without reservation writes',async()=>{
  const {env,counters}=await setup();
  const req=streamRequest('/mcp',[bytes('{"jsonrpc":"2.0",'),bytes('"id":1,"method":"ping"}')]);
  const res=await worker.fetch(req.request,env);
  assert.equal(res.status,200);
  assert.deepEqual((await res.json()).result,{});
  assert.equal(counters().writes,0);
});
test('unauthenticated large requests do not read body or touch reservation state',async()=>{
  const {env,counters}=await setup();
  const req=streamRequest('/v1/reservations',[bytes('x'.repeat(6000))],'application/json','invalid');
  const res=await worker.fetch(req.request,env);
  assert.equal(res.status,401);
  assert.equal(counters().writes,0);
});
