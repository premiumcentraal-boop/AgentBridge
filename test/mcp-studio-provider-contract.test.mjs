import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectIntegration} from '../server/integration.mjs';
import {getBridgeSetup, listMyNumbers} from '../backend/src/chat-number-tools.mjs';

// Exercise the actual read-only producer and Studio consumer together. No carrier
// credentials, paid provider calls, D1 writes, or network traffic are involved.
const DID = '+16185550123';
const account = {id:'offline-operator',status:'active',did:DID};
const env = {
  US_BRIDGE_DID:DID, SIGNALWIRE_SPACE:'offline-test',
  SIGNALWIRE_PROJECT_ID:'offline-project', SIGNALWIRE_API_TOKEN:'offline-token-value',
  AGENTBRIDGE_BACKEND_URL:'https://backend.example.test/',
  AGENTBRIDGE_ACCOUNT_TOKEN:'offline-account-token'
};

function fixture(records, next=null) {
  const requests=[];
  const provider = async (url, options) => {
    requests.push({url:String(url),method:options.method});
    return new Response(JSON.stringify({data:records,links:{next}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  const mcp = async (url, options) => {
    const request=JSON.parse(options.body);
    assert.equal(request.jsonrpc,'2.0');
    assert.equal(request.method,'tools/call');
    const {name}=request.params;
    const result=name==='get_bridge_setup'
      ? getBridgeSetup(account,env)
      : name==='list_my_numbers'
        ? await listMyNumbers(account,env,provider)
        : assert.fail('Unexpected MCP tool: '+name);
    return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,
      result:{structuredContent:result.body,isError:result.status>=400}}),{status:200});
  };
  return {requests,mcp};
}

test('producer to Studio: one exact voice DID is preview-connected only',async()=>{
  const {requests,mcp}=fixture([{number:DID,capabilities:['voice']}]);
  const result=await inspectIntegration(env,mcp);
  assert.equal(result.status,'connected');
  assert.match(result.message,/not verified/i);
  assert.equal(result.numbers.numbers.length,1);
  assert.equal(result.numbers.routing_enabled,false);
  assert.equal(result.numbers.purchase_enabled,false);
  assert.equal(requests.length,1);
  assert.equal(requests[0].method,'GET');
});

for(const [label,records,next] of [
  ['duplicate DID',[{number:DID,capabilities:['voice']},{number:DID,capabilities:['voice']}],null],
  ['mixed filtered inventory',[{number:DID,capabilities:['voice']},{number:'+16185550124',capabilities:['voice']}],null],
  ['wrong DID',[{number:'+16185550124',capabilities:['voice']}],null],
  ['SMS-only DID',[{number:DID,capabilities:['sms']}],null],
  ['pagination',[{number:DID,capabilities:['voice']}],'cursor-next'],
  ['empty inventory',[],null],
]) {
  test('producer to Studio: '+label+' cannot report connected',async()=>{
    const {requests,mcp}=fixture(records,next);
    const result=await inspectIntegration(env,mcp);
    assert.equal(result.status,'needs_setup');
    assert.equal(result.numbers.numbers.length,0);
    assert.equal(result.numbers.routing_enabled,false);
    assert.equal(result.numbers.purchase_enabled,false);
    assert.equal(requests.length,1);
    assert.equal(requests[0].method,'GET');
  });
}
