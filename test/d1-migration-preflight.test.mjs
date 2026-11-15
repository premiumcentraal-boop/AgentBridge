import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMigrationState,migrationPlan,baselineSql,MIGRATION_FILES} from '../scripts/d1-migration-preflight.mjs';
const v1=['approved_at','pin_sha256','pin_attempts','provider','provider_call_id','claimed_at','max_call_seconds','max_cost_cents'];
const base=['accounts','reservations'];
const v2=['provider_events','reservation_approval_bindings','reservation_carrier_legs'];
test('schema preflight discriminates absent, complete and partial without writing to D1',()=>{
  assert.deepEqual(classifyMigrationState([],base),{v1:'absent',v2:'absent',v3:'absent',v4:'absent',unsafe:false,reasons:[]});
  assert.equal(classifyMigrationState(v1,[...base,'provider_events']).v1,'complete');
  assert.equal(classifyMigrationState(v1.slice(0,3),[...base,'provider_events']).unsafe,true);
  assert.equal(classifyMigrationState([],[...base,'provider_events']).unsafe,true);
  assert.equal(classifyMigrationState(v1,[...base,'provider_events','reservation_approval_bindings']).unsafe,true);
  assert.equal(classifyMigrationState(v1,[...base,...v2]).unsafe,false);
  assert.equal(classifyMigrationState([],[...base,'reservation_approval_bindings','reservation_carrier_legs']).unsafe,true);
  assert.equal(classifyMigrationState(v1,[...base,...v2,'owner_actions']).v3,'complete');
  assert.equal(classifyMigrationState(v1,[...base,'provider_events','owner_actions']).unsafe,true,'0003 without 0002');
});
test('migration plan never schedules 0001 when its columns already exist (0001 is not re-runnable)',()=>{
  const fresh=migrationPlan(classifyMigrationState([],[]),[]);
  assert.deepEqual(fresh,{safe:true,apply:MIGRATION_FILES,baseline:[]});
  const manual=migrationPlan(classifyMigrationState(v1,['provider_events']),[]);
  assert.deepEqual(manual.baseline,['0001_routing_controls.sql']);
  assert.ok(!manual.apply.includes('0001_routing_controls.sql'));
  assert.deepEqual(manual.apply,['0002_approval_bindings.sql','0003_owner_actions.sql','0004_inbound_call_log.sql']);
  const tracked=migrationPlan(classifyMigrationState(v1,v2),['0001_routing_controls.sql','0002_approval_bindings.sql']);
  assert.deepEqual(tracked,{safe:true,apply:['0003_owner_actions.sql','0004_inbound_call_log.sql'],baseline:[]});
  assert.deepEqual(migrationPlan(classifyMigrationState(v1.slice(0,2),base),[]),{safe:false,apply:[],baseline:[]});
  const sql=baselineSql(['0001_routing_controls.sql']);
  assert.match(sql,/INSERT OR IGNORE INTO d1_migrations \(name\) VALUES \('0001_routing_controls.sql'\)/);
  assert.doesNotMatch(sql,/ALTER TABLE/);
  assert.equal(baselineSql([]),'');
});

test('preflight runs the pinned wrangler from backend/ (no repo-root node_modules needed)',async()=>{
  const {readFileSync}=await import('node:fs');
  const src=readFileSync(new URL('../scripts/d1-migration-preflight.mjs',import.meta.url),'utf8');
  assert.match(src,/cwd:BACKEND/);
  assert.doesNotMatch(src,/'--config','backend\/wrangler\.jsonc'/);
});


test('D1 preflight blocks fresh databases without an approved base schema',()=>{
  const empty=classifyMigrationState([],[]);
  assert.equal(empty.unsafe,true);
  assert.match(empty.reasons.join(' '),/Missing base accounts\/reservations/);
  assert.deepEqual(migrationPlan(empty),{safe:false,apply:[],baseline:[]});
  for(const tables of [[],['accounts'],['reservations']]){
    assert.equal(classifyMigrationState([],tables).unsafe,true);
  }
  assert.equal(classifyMigrationState([],base).unsafe,false);
});

test('D1 preflight blocks migration-history drift instead of silently skipping missing objects',()=>{
  const state=classifyMigrationState([],base);
  assert.deepEqual(migrationPlan(state,['0001_routing_controls.sql']),{safe:false,apply:[],baseline:[]});
  const partial=classifyMigrationState(v1,[...base,'provider_events']);
  assert.deepEqual(migrationPlan(partial,['0002_approval_bindings.sql']),{safe:false,apply:[],baseline:[]});
  const complete=classifyMigrationState(v1,[...base,'provider_events']);
  assert.equal(migrationPlan(complete,['0001_routing_controls.sql']).safe,true);
});
