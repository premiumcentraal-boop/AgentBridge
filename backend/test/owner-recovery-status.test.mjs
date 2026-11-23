import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,approveReservation,BASE,OWNER,TOKEN,DEST,T0} from './helpers/routing-env.mjs';

const request=(id,token=OWNER,method='GET')=>new Request(BASE+'/v1/owner/reservations/'+id+'/recovery-status',{
  method,headers:{authorization:'Bearer '+token}
});
async function reservation(t){
  const {env,DB}=await routingSetup(t);
  const created=await (await worker.fetch(api('/v1/reservations','POST',{
    destination:DEST,idempotency_key:'recovery-status-fixture'
  }),env)).json();
  assert.equal((await approveReservation(env,created.id)).status,200);
  return {env,DB,id:created.id};
}
const read=async(env,id,token,method)=>worker.fetch(request(id,token,method),env);

test('recovery status is owner-only, method-limited and non-cacheable',async t=>{
  const {env,DB,id}=await reservation(t);
  assert.equal((await read(env,id,TOKEN)).status,401);
  assert.equal((await read(env,id,'not-the-owner')).status,401);
  assert.equal((await read(env,id,OWNER,'POST')).status,405);
  assert.equal((await read(env,'not-a-uuid')).status,404);
  assert.equal((await read(env,'00000000-0000-4000-8000-000000000000')).status,404);
  const response=await read(env,id);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).recovery,'none');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions').get().n,0);
});

test('matching committed force-unlock evidence is stable and contains no private details',async t=>{
  const {env,DB,id}=await reservation(t);
  const at=T0+15;
  DB.raw.prepare("UPDATE reservations SET status='failed',completed_at=? WHERE id=?").run(at,id);
  DB.raw.prepare("INSERT INTO owner_actions (id,reservation_id,action,prior_status,carrier_code,reason,created_at) VALUES (?,?, 'force_unlock','connecting','CARRIER_UNAVAILABLE','Private dashboard details',?)")
    .run('audit-1',id,at);
  let carrierCalls=0;
  t.mock.method(globalThis,'fetch',async()=>{carrierCalls++;throw Error('carrier must not be consulted')});
  for(let i=0;i<2;i++){
    const response=await read(env,id);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.recovery,'verified_force_unlock');
    assert.deepEqual(body.audit,{action_id:'audit-1',created_at:at,carrier_code:'CARRIER_UNAVAILABLE'});
    assert.ok(!JSON.stringify(body).includes(DEST));
    assert.ok(!JSON.stringify(body).includes('Private dashboard'));
  }
  assert.equal(carrierCalls,0);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_actions').get().n,1);
});

test('failed without matching audit and duplicate audit fail closed',async t=>{
  const {env,DB,id}=await reservation(t);
  const at=T0+15;
  DB.raw.prepare("UPDATE reservations SET status='failed',completed_at=? WHERE id=?").run(at,id);
  assert.equal((await (await read(env,id)).json()).recovery,'ambiguous');
  const insert=DB.raw.prepare("INSERT INTO owner_actions (id,reservation_id,action,prior_status,carrier_code,reason,created_at) VALUES (?,?,'force_unlock','connecting','NO_LOG','Manual check',?)");
  insert.run('audit-1',id,at-1);
  assert.equal((await (await read(env,id)).json()).recovery,'ambiguous');
  DB.raw.prepare("UPDATE owner_actions SET created_at=? WHERE id='audit-1'").run(at);
  assert.equal((await (await read(env,id)).json()).recovery,'verified_force_unlock');
  insert.run('audit-2',id,at);
  assert.equal((await (await read(env,id)).json()).recovery,'ambiguous');
  DB.raw.exec('DROP TABLE owner_actions');
  const response=await read(env,id);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error.code,'RECOVERY_EVIDENCE_UNAVAILABLE');
});

test('completed reservation requires durable carrier reconciliation evidence',async t=>{
  const {env,DB,id}=await reservation(t);
  DB.raw.prepare("UPDATE reservations SET status='completed',completed_at=? WHERE id=?").run(T0+15,id);
  assert.equal((await (await read(env,id)).json()).recovery,'ambiguous');
  DB.raw.prepare('INSERT INTO reservation_carrier_legs (reservation_id,provider_segment_id,claimed_at,reconciled_at,actual_cost_cents) VALUES (?,?,?,?,?)')
    .run(id,'48313c74-b321-4c08-a3ea-7123449130ab',T0,T0+15,3);
  assert.equal((await (await read(env,id)).json()).recovery,'verified_carrier_completion');
});
