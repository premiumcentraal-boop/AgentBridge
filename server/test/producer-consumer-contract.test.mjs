import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectIntegration} from '../integration.mjs';
import {getBridgeSetup,listMyNumbers} from '../../backend/src/chat-number-tools.mjs';

// Producer-to-consumer contract: invoke actual backend functions, never handcraft
// the cards consumed by Studio. All network calls are synthetic read-only GETs.
const did='+12025550123';
const account={id:'offline-account',status:'active',did};
const providerEnv={
  US_BRIDGE_DID:did,SIGNALWIRE_SPACE:'offline-test',
  SIGNALWIRE_PROJECT_ID:'00000000-0000-4000-8000-000000000000',
  SIGNALWIRE_API_TOKEN:'synthetic-private-token',
};
const studioEnv={
  AGENTBRIDGE_BACKEND_URL:'https://private.example/',
  AGENTBRIDGE_ACCOUNT_TOKEN:'synthetic-studio-bearer',
};
function providerResponse(data,links={next:null}){
  return new Response(JSON.stringify({data,links}),{status:200});
}
async function exercise({assigned=true,providerStatus=200,data=[],textOnly=false,configured=true}={}){
  const requests=[];
  const actualAccount=assigned?account:{...account,did:'+12025550124'};
  const env=configured?providerEnv:{...providerEnv,SIGNALWIRE_API_TOKEN:''};
  const providerFetch=async (url,init)=>{
    requests.push({kind:'provider',url:String(url),method:init.method,headers:init.headers});
    if(providerStatus!==200)return new Response('provider secret', {status:providerStatus});
    return providerResponse(data);
  };
  const rpcFetch=async (_url,init)=>{
    const rpc=JSON.parse(init.body);
    requests.push({kind:'rpc',name:rpc.params.name,method:init.method});
    const output=rpc.params.name==='get_bridge_setup'
      ?getBridgeSetup(actualAccount,env)
      :await listMyNumbers(actualAccount,env,providerFetch);
    const card=output.body;
    const result=textOnly?{content:[{type:'text',text:'Read-only preview'},
      {type:'text',text:JSON.stringify(card)}]}:{structuredContent:card};
    return Response.json({jsonrpc:'2.0',id:rpc.id,result});
  };
  return {result:await inspectIntegration(studioEnv,rpcFetch),requests};
}
for(const textOnly of [false,true]){
  const transport=textOnly?'text fallback':'structured content';
  test('actual backend producer and Studio consumer agree on matched DID via '+transport,async()=>{
    const {result,requests}=await exercise({textOnly,data:[{number:did,capabilities:['voice']}]});
    assert.equal(result.status,'connected');
    assert.match(result.message,/not verified/);
    assert.deepEqual(requests.filter(r=>r.kind==='rpc').map(r=>r.name),
      ['get_bridge_setup','list_my_numbers']);
    assert.equal(requests.filter(r=>r.kind==='provider').length,1);
    assert.equal(requests.find(r=>r.kind==='provider').method,'GET');
    assert.ok(!JSON.stringify(result).includes(providerEnv.SIGNALWIRE_API_TOKEN));
    assert.ok(!JSON.stringify(result).includes(studioEnv.AGENTBRIDGE_ACCOUNT_TOKEN));
  });
  test('actual backend producer keeps empty, mismatched and SMS-only inventory unconfirmed via '+transport,async()=>{
    for(const data of [[],[{number:'+12025550124',capabilities:['voice']}],
      [{number:did,capabilities:['sms']}]]) {
      const {result}=await exercise({textOnly,data});
      assert.equal(result.status,'needs_setup');
      assert.notEqual(result.status,'connected');
    }
  });
  test('actual backend provider errors never become connected via '+transport,async()=>{
    const {result}=await exercise({textOnly,providerStatus:503});
    assert.equal(result.status,'error');
    assert.ok(!JSON.stringify(result).includes('provider secret'));
  });
  test('unassigned or unconfigured producer never implies verified DID via '+transport,async()=>{
    for(const options of [{assigned:false},{configured:false}]) {
      const {result,requests}=await exercise({...options,textOnly});
      assert.notEqual(result.status,'connected');
      assert.equal(requests.filter(r=>r.kind==='provider').length,0);
    }
  });
}
