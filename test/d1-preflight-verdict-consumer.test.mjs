import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretPreflightObservation as interpret} from '../scripts/d1-preflight-verdict-consumer.mjs';
import {MIGRATION_FILES} from '../scripts/d1-migration-preflight.mjs';
// Existing truth-table fixtures describe plan states; derive the corresponding
// complete producer history unless a test explicitly supplies an applied list.
const check=(exitCode,raw)=>{
  let report;
  try {report=JSON.parse(raw);} catch {return interpret(exitCode,raw);}
  if(report && typeof report==='object' && !Array.isArray(report) && report.plan &&
     Array.isArray(report.plan.apply) && Array.isArray(report.plan.baseline) &&
     !Object.hasOwn(report,'applied')){
    report.applied=MIGRATION_FILES.filter(name=>!report.plan.apply.includes(name)&&!report.plan.baseline.includes(name));
    raw=JSON.stringify(report);
  }
  return interpret(exitCode,raw);
};

const valid = () => ({unsafe:false,plan:{safe:true,apply:['0001_routing_controls.sql'],baseline:[]},
  verdict:{version:1,status:'observational_only',reason:'PENDING_MIGRATIONS',
    atomicSnapshot:false,authorizesMigration:false,requiresOperatorApproval:true,
    requiresExclusiveMaintenanceWindow:true,requiresVerifiedBackup:true}});
test('consumer never interprets a successful observation as migration authorization',()=>{
  assert.deepEqual(check(0,JSON.stringify(valid())),{
    accepted:true,status:'observational_only',authorizesMigration:false,requiresManualApproval:true});
});
test('consumer rejects missing, malformed, unsupported and unsafe verdicts',()=>{
  const mutations=[
    x=>{delete x.verdict;},x=>{x.verdict.version=2;},x=>{x.verdict.status='approved';},
    x=>{x.verdict.authorizesMigration=true;},x=>{x.verdict.atomicSnapshot=true;},
    x=>{x.verdict.requiresOperatorApproval=false;},
    x=>{x.verdict.requiresExclusiveMaintenanceWindow=false;},
    x=>{x.verdict.requiresVerifiedBackup=false;},
    x=>{x.unsafe=true;},x=>{x.plan.safe=false;},
    x=>{x.plan.baseline=['0001_routing_controls.sql'];},
    x=>{x.verdict.reason='NO_PENDING_MIGRATIONS';},
    x=>{x.verdict.reason='UNKNOWN';},x=>{x.plan.apply=null;}
  ];
  for(const mutate of mutations){const v=valid();mutate(v);
    assert.equal(check(0,JSON.stringify(v)).accepted,false,mutate.toString());}
  for(const raw of ['', '{', 'null', '[]', '{}',' '.repeat(262145)])
    assert.equal(check(0,raw).accepted,false);
  assert.equal(check(1,JSON.stringify(valid())).accepted,false);
  assert.equal(check(null,JSON.stringify(valid())).accepted,false);
});
test('blocked reports are accepted only as blocked observations, never permission',()=>{
  const v=valid();v.unsafe=true;v.plan.safe=false;
  // Unsafe producer reports never propose migrations, even as observations.
  v.plan.apply=[];
  v.verdict.status='blocked';v.verdict.reason='UNSAFE_SCHEMA_OR_HISTORY';
  assert.deepEqual(check(0,JSON.stringify(v)),{
    accepted:true,status:'blocked',authorizesMigration:false,requiresManualApproval:true});
});


test('consumer rejects counterfeit, duplicated and overlapping migration plan entries',()=>{
  const mutations=[
    x=>{x.plan.apply=[null];},
    x=>{x.plan.apply=[42];},
    x=>{x.plan.apply=['../0001_routing_controls.sql'];},
    x=>{x.plan.apply=['0001_routing_controls.sql '];},
    x=>{x.plan.apply=['9999_unknown.sql'];},
    x=>{x.plan.apply=['0001_routing_controls.sql','0001_routing_controls.sql'];},
    x=>{x.plan.baseline=[null];},
    x=>{x.plan.baseline=['../../evil.sql'];},
    x=>{x.plan.baseline=['0002_approval_bindings.sql','0002_approval_bindings.sql'];},
    x=>{x.plan.baseline=['0001_routing_controls.sql'];},
  ];
  for (const mutate of mutations) {
    const report=valid(); mutate(report);
    assert.equal(check(0,JSON.stringify(report)).accepted,false,mutate.toString());
  }
  const clean=valid();
  clean.plan.apply=['0001_routing_controls.sql','0002_approval_bindings.sql'];
  assert.equal(check(0,JSON.stringify(clean)).accepted,true);
  const blocked=valid();
  blocked.plan.apply=[];
  blocked.plan.baseline=['0002_approval_bindings.sql'];
  blocked.verdict.status='blocked';
  blocked.verdict.reason='UNRECONCILED_MIGRATION_HISTORY';
  assert.equal(check(0,JSON.stringify(blocked)).accepted,true);
  blocked.plan.apply=['0002_approval_bindings.sql'];
  assert.equal(check(0,JSON.stringify(blocked)).accepted,false);
});

test('reason/status truth table rejects contradictory blocked plans',()=>{
  const base=valid();
  const cases=[
    // Valid producer states.
    {unsafe:false,safe:true,apply:[],baseline:[],status:'observational_only',reason:'NO_PENDING_MIGRATIONS',accept:true},
    {unsafe:false,safe:true,apply:['0001_routing_controls.sql'],baseline:[],status:'observational_only',reason:'PENDING_MIGRATIONS',accept:true},
    {unsafe:false,safe:true,apply:[],baseline:['0001_routing_controls.sql'],status:'blocked',reason:'UNRECONCILED_MIGRATION_HISTORY',accept:true},
    {unsafe:true,safe:false,apply:[],baseline:[],status:'blocked',reason:'UNSAFE_SCHEMA_OR_HISTORY',accept:true},
    // A blocked verdict cannot use the clean pending reason.
    {unsafe:true,safe:false,apply:[],baseline:[],status:'blocked',reason:'PENDING_MIGRATIONS',accept:false},
    {unsafe:true,safe:false,apply:[],baseline:[],status:'blocked',reason:'NO_PENDING_MIGRATIONS',accept:false},
    {unsafe:false,safe:false,apply:[],baseline:[],status:'blocked',reason:'UNSAFE_SCHEMA_OR_HISTORY',accept:false},
    {unsafe:true,safe:true,apply:[],baseline:[],status:'blocked',reason:'UNSAFE_SCHEMA_OR_HISTORY',accept:false},
    {unsafe:true,safe:false,apply:['0001_routing_controls.sql'],baseline:[],status:'blocked',reason:'UNSAFE_SCHEMA_OR_HISTORY',accept:false},
    {unsafe:true,safe:false,apply:[],baseline:['0001_routing_controls.sql'],status:'blocked',reason:'UNSAFE_SCHEMA_OR_HISTORY',accept:false},
    {unsafe:false,safe:true,apply:[],baseline:['0001_routing_controls.sql'],status:'blocked',reason:'PENDING_MIGRATIONS',accept:false},
    {unsafe:false,safe:true,apply:['0001_routing_controls.sql'],baseline:[],status:'blocked',reason:'PENDING_MIGRATIONS',accept:false},
  ];
  for(const c of cases){
    const report=structuredClone(base);
    report.unsafe=c.unsafe;
    report.plan={safe:c.safe,apply:c.apply,baseline:c.baseline};
    report.verdict.status=c.status;
    report.verdict.reason=c.reason;
    const outcome=check(0,JSON.stringify(report));
    assert.equal(outcome.accepted,c.accept,JSON.stringify(c));
    assert.equal(outcome.authorizesMigration,c.accept?false:undefined);
  }
});


test('complete migration inventory is mandatory and cannot overlap recorded history',()=>{
  const report=valid();
  report.applied=['0002_approval_bindings.sql','0003_owner_actions.sql']; // 0004 omitted
  assert.equal(interpret(0,JSON.stringify(report)).reason,'INCOMPLETE_MIGRATION_INVENTORY');
  report.applied.push('0004_inbound_call_log.sql');
  assert.equal(interpret(0,JSON.stringify(report)).accepted,true);
  report.applied.push('0001_routing_controls.sql');
  assert.equal(interpret(0,JSON.stringify(report)).reason,'INCOMPLETE_MIGRATION_INVENTORY');
  report.applied=[null];
  assert.equal(interpret(0,JSON.stringify(report)).reason,'INVALID_APPLIED_HISTORY');
  delete report.applied;
  assert.equal(interpret(0,JSON.stringify(report)).reason,'INVALID_APPLIED_HISTORY');
});
