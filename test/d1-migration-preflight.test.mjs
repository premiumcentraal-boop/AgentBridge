import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMigrationState} from '../scripts/d1-migration-preflight.mjs';
const v1=['approved_at','pin_sha256','pin_attempts','provider','provider_call_id','claimed_at','max_call_seconds','max_cost_cents'];
test('schema preflight discriminates absent, complete and partial without writing to D1',()=>{
  assert.deepEqual(classifyMigrationState([],[]),{v1:'absent',v2:'absent',unsafe:false,reasons:[]});
  assert.equal(classifyMigrationState(v1,['provider_events']).v1,'complete');
  assert.equal(classifyMigrationState(v1.slice(0,3),['provider_events']).unsafe,true);
  assert.equal(classifyMigrationState([],['provider_events']).unsafe,true);
  assert.equal(classifyMigrationState(v1,['provider_events','reservation_approval_bindings']).unsafe,true);
  assert.equal(classifyMigrationState(v1,['provider_events','reservation_approval_bindings','reservation_carrier_legs']).unsafe,false);
  assert.equal(classifyMigrationState([],['reservation_approval_bindings','reservation_carrier_legs']).unsafe,true);
});
