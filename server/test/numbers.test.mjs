import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../app.mjs';
import {openStore} from '../store.mjs';
import {importStudioNumber} from '../../scripts/import-studio-number.mjs';

const key='number-model-test-key-not-a-real-access-key',origin='https://agentbridge.victor.ceo';
const verified=(suffix='110')=>({provider:'signalwire',provider_number_id:'verified-'+suffix,e164:'+12025550'+suffix,country:'US',label:'Line '+suffix,ownership_source:'operator_project_verified'});
const connection=number=>({label:'London office',routing_number_id:number.id,destination:'+44 (20) 7946 0123',country:'GB'});
const order=()=>({request_id:randomUUID(),provider:'signalwire',country:'US',area_code:'202',label:'Main line'});
async function harness(t){
 const store=openStore(':memory:');let requests=0;
 const server=createApp({store,env:{NODE_ENV:'production',STUDIO_ACCESS_KEY_SHA256:createHash('sha256').update(key).digest('hex'),STUDIO_PUBLIC_ORIGIN:origin},fetcher:()=>{requests++;throw Error('No provider mutation permitted');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const call=(path,options={})=>fetch('http://127.0.0.1:'+server.address().port+'/api/studio/'+path,{...options,headers:{Origin:origin,'Content-Type':'application/json',...options.headers}});
 const session=await call('session',{method:'POST',body:JSON.stringify({key})}),cookie=session.headers.get('set-cookie').split(';')[0];
 return {store,call,headers:{Cookie:cookie},requests:()=>requests};
}
test('number inventory, pairings and requests are private and origin protected',async t=>{
 const h=await harness(t);
 for(const path of ['numbers','connections'])assert.equal((await h.call(path)).status,401);
 for(const [path,payload] of [['number-orders',order()],['connections',{}]]){
  assert.equal((await h.call(path,{method:'POST',body:JSON.stringify(payload)})).status,401);
  assert.equal((await h.call(path,{method:'POST',headers:{...h.headers,Origin:'https://elsewhere.test'},body:JSON.stringify(payload)})).status,403);
 }
 assert.equal((await h.call('numbers',{method:'POST',headers:h.headers,body:JSON.stringify({...verified(),status:'owned'})})).status,404);
 assert.equal(h.store.snapshot().routing_numbers.length,0);assert.equal(h.requests(),0);
});
test('a connection requires an owned routing number, persists both numbers and can be edited and archived',async t=>{
 const h=await harness(t),first=h.store.registerRoutingNumber(verified()),second=h.store.registerRoutingNumber(verified('111'));
 const result=await h.call('connections',{method:'POST',headers:h.headers,body:JSON.stringify(connection(first))});assert.equal(result.status,201);
 const data=await result.json();assert.equal(data.connection.routing_number_id,first.id);assert.equal(data.connection.destination,'+442079460123');assert.equal(data.connection.status,'saved');assert.equal(data.routing_enabled,false);
 const updated=await h.call('connections/'+data.connection.id,{method:'PATCH',headers:h.headers,body:JSON.stringify({...connection(second),label:'Amsterdam office',country:'NL',destination:'+31 20 123 4567'})});assert.equal(updated.status,200);
 assert.equal((await updated.json()).connection.routing_number_id,second.id);
 const snapshot=await(await h.call('export',{headers:h.headers})).json();assert.equal(snapshot.connections[0].destination,'+31201234567');assert.equal(snapshot.routing_numbers.length,2);
 assert.equal((await h.call('connections/'+data.connection.id,{method:'DELETE',headers:h.headers})).status,200);
 assert.equal(h.store.snapshot().connections[0].status,'archived');
 assert.equal((await h.call('connections',{method:'POST',headers:h.headers,body:JSON.stringify(connection(second))})).status,201);assert.equal(h.requests(),0);
});
test('forged ownership, routing activation, duplicate assignments and owned-number loops are rejected',async t=>{
 const h=await harness(t),first=h.store.registerRoutingNumber(verified()),second=h.store.registerRoutingNumber(verified('111'));
 const post=value=>h.call('connections',{method:'POST',headers:h.headers,body:JSON.stringify(value)});
 assert.equal((await post({...connection(first),routing_number_id:randomUUID()})).status,422);
 for(const destination of [first.e164,second.e164])assert.equal((await post({...connection(first),country:'US',destination})).status,422);
 for(const patch of [{status:'active'},{routing_enabled:true},{provider:'signalwire'},{country:'NL'},{destination:'911'},{label:'bad\0name'}])assert.equal((await post({...connection(first),...patch})).status,422);
 assert.equal((await post(connection(first))).status,201);assert.equal((await post({...connection(first),label:'Other office'})).status,409);
 assert.equal(h.store.snapshot().connections.length,1);assert.equal(h.requests(),0);
});
test('number purchase requests are idempotent preparation and never create owned inventory or charges',async t=>{
 const h=await harness(t),value=order();
 const post=value=>h.call('number-orders',{method:'POST',headers:h.headers,body:JSON.stringify(value)});
 const first=await post(value);assert.equal(first.status,202);const data=await first.json();assert.equal(data.order.status,'requested');assert.equal(data.charged,false);assert.equal(data.purchase_enabled,false);
 assert.equal((await(await post(value)).json()).order.id,data.order.id);
 assert.equal((await post({...value,label:'Changed request'})).status,409);
 for(const patch of [{provider:'arbitrary'},{country:'GB'},{area_code:'9111'},{status:'fulfilled'},{paid:true},{routing_number_id:randomUUID()}])assert.equal((await post({...order(),...patch})).status,422);
 assert.equal((await post({...order(),label:'x'.repeat(5000)})).status,400);
 const inventory=await(await h.call('numbers',{headers:h.headers})).json();assert.equal(inventory.numbers.length,0);assert.equal(inventory.orders.length,1);assert.equal(h.requests(),0);
});
test('legacy drafts and the new number pair survive SQLite reopen; bounded collections reject overflow',()=>{
 const dir=mkdtempSync(join(tmpdir(),'agentbridge-numbers-')),path=join(dir,'studio.sqlite');
 try{
  let s=openStore(path);s.createRoute('Legacy office','+442079460123');const n=s.registerRoutingNumber(verified());
  s.saveNumberConnection({...connection(n),destination:'+442079460123'});const requested=s.createNumberOrder(order()).order;
  s.close();s=openStore(path);let state=s.snapshot();assert.equal(state.routes.length,1);assert.equal(state.connections[0].routing_number_id,state.routing_numbers[0].id);assert.equal(state.number_orders[0].id,requested.id);
  for(let i=1;i<100;i++)s.createNumberOrder(order());assert.equal(s.createNumberOrder(order()).error,'ORDER_LIMIT');
  for(let i=1;i<100;i++)s.registerRoutingNumber({...verified(String(110+i)),provider_number_id:'number-'+i});
  assert.throws(()=>s.registerRoutingNumber({...verified('250'),provider_number_id:'overflow'}),/NUMBER_LIMIT/);s.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('trusted import verifies exact SignalWire voice inventory with GET before assigning a number',async()=>{
 const store=openStore(':memory:'),env={SIGNALWIRE_SPACE:'example-space',SIGNALWIRE_PROJECT_ID:'11111111-1111-4111-8111-111111111111',SIGNALWIRE_API_TOKEN:'provider-test-token-not-real'};let reads=0;
 try{
  const fetcher=async(url,options)=>{reads++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.match(url,/^https:\/\/example-space\.signalwire\.com\/api\/relay\/rest\/phone_numbers\?/);return Response.json({data:[{id:'provider-number-1',number:'+12025550110',capabilities:['voice']}]});};
  await assert.rejects(importStudioNumber({env,number:'+12025550110',label:'Main',confirmedOwner:false,store,fetcher}));assert.equal(reads,0);
  await assert.rejects(importStudioNumber({env,number:'+12025550111',label:'Other',confirmedOwner:true,store,fetcher}));assert.equal(store.snapshot().routing_numbers.length,0);
  const pending=store.createNumberOrder(order()).order;
  const number=await importStudioNumber({env,number:'+12025550110',label:'Main',orderId:pending.id,confirmedOwner:true,store,fetcher});assert.equal(number.status,'owned');assert.equal(store.snapshot().number_orders[0].status,'fulfilled');assert.equal(reads,2);
 }finally{store.close();}
});
