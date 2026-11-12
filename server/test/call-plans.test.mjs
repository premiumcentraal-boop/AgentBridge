import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../app.mjs';
import {openStore} from '../store.mjs';
import {DEFAULT_CAPTURE,validateCallPlan,validateCapture} from '../../shared/call-plans.mjs';
const key='call-plan-test-key-for-private-workspace-only';
const origin='https://agentbridge.victor.ceo';
const plan=()=>({label:'Amsterdam viewing',country:'NL',destination:'+31 (20) 123-4567',purpose:'Ask about Tuesday. Get a reference.',capture:{...DEFAULT_CAPTURE,recording:true,transcription:true,language:'nl'},permission:'ask'});
async function harness(t){
 const store=openStore(':memory:');let fetched=0;
 const server=createApp({store,env:{NODE_ENV:'production',STUDIO_PUBLIC_ORIGIN:origin,STUDIO_ACCESS_KEY_SHA256:createHash('sha256').update(key).digest('hex')},fetcher:()=>{fetched++;throw new Error('No provider operation is permitted');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const request=(path,options={})=>fetch('http://127.0.0.1:'+server.address().port+'/api/studio/'+path,{...options,headers:{Origin:origin,'Content-Type':'application/json',...options.headers}});
 const session=await request('session',{method:'POST',body:JSON.stringify({key})});const cookie=session.headers.get('set-cookie').split(';')[0];
 return {store,request,cookie,fetched:()=>fetched};
}
test('international call plans are authenticated preparation and never call a provider',async t=>{
 const h=await harness(t),payload=JSON.stringify(plan());
 assert.equal((await h.request('call-plans',{method:'POST',body:payload})).status,401);
 assert.equal((await h.request('call-plans',{method:'POST',headers:{Cookie:h.cookie,Origin:'https://attacker.example'},body:payload})).status,403);
 const response=await h.request('call-plans',{method:'POST',headers:{Cookie:h.cookie},body:payload});assert.equal(response.status,201);
 const result=await response.json();assert.equal(result.plan.destination,'+31201234567');assert.equal(result.plan.status,'draft');assert.equal(result.plan.permission,'ask');
 for(const field of ['calling_enabled','recording_enabled','joining_enabled'])assert.equal(result[field],false);
 assert.equal(h.fetched(),0);
 let data=await (await h.request('overview',{headers:{Cookie:h.cookie}})).json();assert.equal(data.call_plans.length,1);assert.equal(data.routes.length,0);assert.equal(data.capture_preferences.recording,false);
 assert.equal((await h.request('call-plans/'+result.plan.id+'/archive',{method:'POST',headers:{Cookie:h.cookie},body:'{}'})).status,200);
 assert.equal((await h.request('call-plans/'+result.plan.id+'/archive',{method:'POST',headers:{Cookie:h.cookie},body:'{}'})).status,404);
 data=await (await h.request('export',{headers:{Cookie:h.cookie}})).json();assert.equal(data.call_plans[0].status,'archived');assert.equal(data.routing_enabled,false);
});
test('optional capture and join preferences persist without enabling capture or callbacks',async t=>{
 const h=await harness(t),preferences={...DEFAULT_CAPTURE,transcription:true,language:'nl',retention_days:7,join_method:'phone',join_number:'+31 (6) 1234 5678'};
 const response=await h.request('capture-preferences',{method:'PATCH',headers:{Cookie:h.cookie},body:JSON.stringify(preferences)});assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.preferences.recording,false);assert.equal(result.preferences.transcription,true);assert.equal(result.preferences.join_number,'+31612345678');
 for(const field of ['recording_enabled','transcription_enabled','joining_enabled'])assert.equal(result[field],false);
 const data=await (await h.request('overview',{headers:{Cookie:h.cookie}})).json();assert.equal(data.capture_preferences.language,'nl');assert.equal(h.fetched(),0);
 assert.match(data.events[0].message,/Live capture remains disabled/);
});
test('capture and call-plan validation rejects forged activation, mismatched countries and unsafe payloads',async t=>{
 const h=await harness(t),headers={Cookie:h.cookie};
 for(const patch of [{country:'GB'},{destination:'911'},{label:''},{purpose:3},{permission:'approved'},{status:'connected'},{recording_url:'https://attacker.example/audio'},{capture:{...DEFAULT_CAPTURE,recording:'yes'}},{capture:{...DEFAULT_CAPTURE,join_method:'phone',join_number:'911'}}]){
  const response=await h.request('call-plans',{method:'POST',headers,body:JSON.stringify({...plan(),...patch})});assert.equal(response.status,422,JSON.stringify(patch));
 }
 for(const patch of [{language:'xx'},{retention_days:365},{join_number:{}},{join_method:'phone',join_number:''},{recording:true,call_id:'unowned'}])assert.equal((await h.request('capture-preferences',{method:'PATCH',headers,body:JSON.stringify({...DEFAULT_CAPTURE,...patch})})).status,422);
 assert.equal((await h.request('call-plans',{method:'POST',headers,body:JSON.stringify({...plan(),purpose:'x'.repeat(5000)})})).status,400);
 assert.equal(h.store.snapshot().call_plans.length,0);assert.equal(h.fetched(),0);
 assert.ok(validateCapture({recording:false,transcription:true}).value);
 assert.ok(validateCallPlan({...plan(),capture:{...DEFAULT_CAPTURE,recording:false,transcription:false}}).value);
});
test('call plans and privacy preferences survive database reopen and remain bounded',()=>{
 const dir=mkdtempSync(join(tmpdir(),'agentbridge-call-plans-')),filename=join(dir,'studio.sqlite');
 try{
  let store=openStore(filename);const value=validateCallPlan(plan()).value;store.createCallPlan(value);store.saveCapturePreferences({...DEFAULT_CAPTURE,transcription:true});store.close();
  store=openStore(filename);assert.equal(store.snapshot().call_plans[0].capture.language,'nl');assert.equal(store.snapshot().capture_preferences.recording,false);assert.equal(store.snapshot().capture_preferences.transcription,true);
  for(let i=1;i<200;i++)assert.ok(store.createCallPlan({...value,label:'Plan '+i}));assert.equal(store.createCallPlan(value),null);assert.equal(store.snapshot().call_plans.length,200);store.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
