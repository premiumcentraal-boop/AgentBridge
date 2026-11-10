/**
 * Issue #9: exact expiry boundaries with a fixed clock and a real SQLite schema.
 * An expired or idempotently retried reservation must never become routable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker,{sha256} from '../src/index.mjs';
import {createD1} from './helpers/d1.mjs';

const T0=1_800_000_000;
const DID='+12025550123',DEST='+31201234567',CALLER='+12125550177';
const TOKEN='ab_'+'k'.repeat(48);
const TWILIO='private-test-auth-token';
const BASE='https://api.example.com';

async function setup(t,extra={}){
  t.mock.timers.enable({apis:['Date'],now:T0*1000});
  const DB=createD1();
  DB.raw.prepare("INSERT INTO accounts (id,api_key_sha256,did,status) VALUES ('acct',?,?,'active')").run(await sha256(TOKEN),DID);
  const env={DB,PUBLIC_BASE_URL:BASE,US_BRIDGE_DID:DID,TEST_DESTINATION_E164:DEST,
    TEST_CALLER_E164:CALLER,TWILIO_AUTH_TOKEN:TWILIO,PRIVATE_TEST_OUTBOUND_ENABLED:'true',
    OWNER_APPROVAL_TOKEN_SHA256:'a'.repeat(64),...extra};
  const at=s=>t.mock.timers.setTime(s*1000);
  return {DB,env,at};
}
const api=(path,method='GET',body)=>new Request(BASE+path,{method,
  headers:{authorization:'Bearer '+TOKEN,...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined});
const mcp=(name,args)=>api('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
function twilioIncoming(sid='CA'+'b'.repeat(32)){
  const url=BASE+'/telephony/twilio/incoming';
  const form=new URLSearchParams({To:DID,From:CALLER,CallSid:sid});
  const signed=url+[...form.keys()].sort().map(k=>k+form.get(k)).join('');
  return new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',
    'x-twilio-signature':createHmac('sha1',TWILIO).update(signed).digest('base64')},body:form.toString()});
}
async function create(env,key='boundary-key-1'){
  const r=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:key}),env);
  assert.equal(r.status,201);
  const reservation=await r.json();
  // This suite isolates expiry semantics; explicit owner approval is a prerequisite.
  env.DB.raw.prepare('UPDATE reservations SET approved_at=? WHERE id=?').run(Math.floor(Date.now()/1000),reservation.id);
  return reservation;
}

test('#9: one second before expiry the route is still ready and routable exactly once',async t=>{
  const {env,at}=await setup(t);
  const r=await create(env);
  assert.equal(r.status,'ready');
  at(T0+90-1);
  const get=await (await worker.fetch(api('/v1/reservations/'+r.id),env)).json();
  assert.equal(get.status,'ready');
  const first=await (await worker.fetch(twilioIncoming(),env)).text();
  assert.match(first,/<Dial/);
  const replay=await (await worker.fetch(twilioIncoming('CA'+'c'.repeat(32)),env)).text();
  assert.doesNotMatch(replay,/<Dial/);
});

test('#9: at exactly expires_at every surface reports expired and nothing routes',async t=>{
  const {DB,env,at}=await setup(t);
  const r=await create(env);
  at(T0+90);
  const get=await (await worker.fetch(api('/v1/reservations/'+r.id),env)).json();
  assert.equal(get.status,'expired');assert.equal(get.us_access_number,null);
  const status=await (await worker.fetch(mcp('get_call_status',{reservation_id:r.id}),env)).json();
  const body=JSON.parse(status.result.content[0].text);
  assert.equal(body.status,'expired');assert.equal(body.us_access_number,null);
  const xml=await (await worker.fetch(twilioIncoming(),env)).text();
  assert.doesNotMatch(xml,/<Dial/);assert.match(xml,/<Hangup\/>/);
  const cancel=await worker.fetch(api('/v1/reservations/'+r.id+'/cancel','POST'),env);
  assert.equal(cancel.status,409);
  const retry=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'boundary-key-1'}),env);
  assert.equal(retry.status,409);
  assert.equal((await retry.json()).error.code,'RESERVATION_EXPIRED');
  const row=DB.raw.prepare('SELECT status,call_sid FROM reservations WHERE id=?').get(r.id);
  assert.equal(row.status,'expired');assert.equal(row.call_sid,null);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM reservations').get().n,1);
});

test('#9: idempotent retry after expiry never inserts or reopens; a new key is required',async t=>{
  const {DB,env,at}=await setup(t);
  const r=await create(env);
  at(T0+91);
  for(let i=0;i<3;i++){
    const retry=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'boundary-key-1'}),env);
    assert.equal(retry.status,409);
    const b=await retry.json();
    assert.equal(b.error.code,'RESERVATION_EXPIRED');
    assert.equal(b.reservation.status,'expired');
    assert.equal(b.reservation.us_access_number,null);
    assert.equal(b.reservation.retry,'new_idempotency_key_required');
    assert.equal(b.reservation.expires_at,new Date((T0+90)*1000).toISOString());
  }
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM reservations').get().n,1);
  const xml=await (await worker.fetch(twilioIncoming(),env)).text();
  assert.doesNotMatch(xml,/<Dial/);
  const fresh=await create(env,'boundary-key-2');
  assert.notEqual(fresh.id,r.id);assert.equal(fresh.status,'ready');
});

test('#9: consumed reservation retried with the same key is terminal, not ready',async t=>{
  const {env}=await setup(t);
  await create(env);
  assert.match(await (await worker.fetch(twilioIncoming(),env)).text(),/<Dial/);
  const retry=await worker.fetch(api('/v1/reservations','POST',{destination:DEST,idempotency_key:'boundary-key-1'}),env);
  assert.equal(retry.status,409);
  assert.equal((await retry.json()).error.code,'RESERVATION_NOT_READY');
});
