import test from 'node:test';
import assert from 'node:assert/strict';
import {previewChatCallFlow,CALL_DIFFICULTIES,REQUIRED_GATES} from '../src/chat-experience.mjs';

test('default simple experience is preview-only and never authorizes a call',()=>{
  const r=previewChatCallFlow();
  assert.equal(r.status,200);
  assert.equal(r.body.difficulty,'simple');
  assert.equal(r.body.state,'preview_only');
  assert.equal(r.body.ready_to_call,false);
  assert.equal(r.body.routing_enabled,false);
  assert.equal(r.body.payment_enabled,false);
  assert.equal(r.body.preference_saved,false);
  assert.equal(r.body.native_call_requires_user_confirmation,true);
  assert.equal(r.body.owner_approval_out_of_band_required,true);
});

test('changing difficulty only changes the presentation, not safety gates',()=>{
  const outputs=CALL_DIFFICULTIES.map(difficulty=>previewChatCallFlow({difficulty}));
  assert.equal(new Set(outputs.map(r=>r.body.sample_message)).size,3);
  for(const r of outputs){
    assert.equal(r.status,200);
    assert.deepEqual(r.body.required_gates,REQUIRED_GATES);
    assert.equal(r.body.ready_to_call,false);
    assert.equal(r.body.grok_bot_native_call_compatibility_verified,false);
    assert.equal(r.body.international_bridge_use_permitted,false);
    assert.equal(r.body.native_call_requires_user_confirmation,true);
    assert.equal(r.body.preference_scope,'this_tool_request_only');
    assert.equal(r.body.steps.length>0,true);
  }
});

test('rejects invalid difficulty and unexpected fields without accepting unsafe opt-ins',()=>{
  for(const input of [
    null,[],{difficulty:'automatic'},{difficulty:'SIMPLE'},{difficulty:5},
    {difficulty:'simple',skip_approval:true},
    {difficulty:'advanced',routing_enabled:true}
  ])assert.equal(previewChatCallFlow(input).status,422);
});

test('does not mutate caller input or share mutable output arrays',()=>{
  const input={difficulty:'guided'};
  const first=previewChatCallFlow(input);
  first.body.required_gates.push('unsafe extra');
  first.body.steps.push('unsafe extra');
  assert.deepEqual(input,{difficulty:'guided'});
  const again=previewChatCallFlow(input);
  assert.deepEqual(again.body.required_gates,REQUIRED_GATES);
  assert.equal(again.body.steps.includes('unsafe extra'),false);
});

test('all chat modes truthfully disclose current platform and live-route limitations',()=>{
  for(const difficulty of CALL_DIFFICULTIES){
    const b=previewChatCallFlow({difficulty}).body;
    assert.match(b.warning,/US-only calls/);
    assert.match(b.warning,/must not be used to evade/);
    assert.equal(b.live_rate_verified,false);
    assert.equal(b.payment_enabled,false);
  }
});

import {validateMcpEnvelope} from '../src/mcp-validation.mjs';

function rpc(difficulty){
  return {jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'preview_chat_call_flow',
    arguments:difficulty===undefined?{}:{difficulty}}};
}

test('hosted MCP accepts all three difficulties and safe default arguments',()=>{
  assert.equal(validateMcpEnvelope(rpc()).ok,true);
  for(const difficulty of CALL_DIFFICULTIES)
    assert.equal(validateMcpEnvelope(rpc(difficulty)).ok,true);
  const missingArgs={jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'preview_chat_call_flow'}};
  assert.equal(validateMcpEnvelope(missingArgs).ok,true);
});

test('hosted MCP rejects unknown difficulty and attempted security overrides',()=>{
  for(const difficulty of ['auto','unsafe','',12,null])
    assert.equal(validateMcpEnvelope(rpc(difficulty)).ok,false);
  const danger=rpc('simple'); danger.params.arguments.skip_approval=true;
  assert.equal(validateMcpEnvelope(danger).ok,false);
});
