import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMigrationState,migrationPlan,baselineSql,MIGRATION_FILES} from '../scripts/d1-migration-preflight.mjs';
const v1=['approved_at','pin_sha256','pin_attempts','provider','provider_call_id','claimed_at','max_call_seconds','max_cost_cents'];
const v2=['provider_events','reservation_approval_bindings','reservation_carrier_legs'];
test('schema preflight discriminates absent, complete and partial without writing to D1',()=>{
  assert.deepEqual(classifyMigrationState([],[]),{v1:'absent',v2:'absent',v3:'absent',v4:'absent',unsafe:false,reasons:[]});
  assert.equal(classifyMigrationState(v1,['provider_events']).v1,'complete');
  assert.equal(classifyMigrationState(v1.slice(0,3),['provider_events']).unsafe,true);
  assert.equal(classifyMigrationState([],['provider_events']).unsafe,true);
  assert.equal(classifyMigrationState(v1,['provider_events','reservation_approval_bindings']).unsafe,true);
  assert.equal(classifyMigrationState(v1,v2).unsafe,false);
  assert.equal(classifyMigrationState([],['reservation_approval_bindings','reservation_carrier_legs']).unsafe,true);
  assert.equal(classifyMigrationState(v1,[...v2,'owner_actions']).v3,'complete');
  assert.equal(classifyMigrationState(v1,['provider_events','owner_actions']).unsafe,true,'0003 without 0002');
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
  assert.deepEqual(migrationPlan(classifyMigrationState(v1.slice(0,2),[]),[]),{safe:false,apply:[],baseline:[]});
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
