import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMigrationState,migrationPlan,MIGRATION_FILES} from '../scripts/d1-migration-preflight.mjs';
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
  assert.deepEqual(fresh,{safe:false,apply:[],baseline:[]});
  const manual=migrationPlan(classifyMigrationState(v1,[...base,'provider_events']),[]);
  assert.deepEqual(manual.baseline,['0001_routing_controls.sql']);
  assert.ok(!manual.apply.includes('0001_routing_controls.sql'));
  assert.deepEqual(manual.apply,['0002_approval_bindings.sql','0003_owner_actions.sql','0004_inbound_call_log.sql']);
  const tracked=migrationPlan(classifyMigrationState(v1,[...base,...v2]),['0001_routing_controls.sql','0002_approval_bindings.sql']);
  assert.deepEqual(tracked,{safe:true,apply:['0003_owner_actions.sql','0004_inbound_call_log.sql'],baseline:[]});
  assert.deepEqual(migrationPlan(classifyMigrationState(v1.slice(0,2),base),[]),{safe:false,apply:[],baseline:[]});
  // A baseline discrepancy is informational only; the CLI must not emit
  // conflict-suppressing INSERT OR IGNORE reconciliation SQL.
  assert.deepEqual(manual.baseline,['0001_routing_controls.sql']);
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

test('D1 preflight rejects unknown, duplicate and malformed migration history',()=>{
  const state=classifyMigrationState(v1,[...base,...v2,'owner_actions','inbound_call_log']);
  const valid=[...MIGRATION_FILES];
  assert.deepEqual(migrationPlan(state,valid),{safe:true,apply:[],baseline:[]});
  for(const history of [
    [...valid,'0005_unrecognized.sql'],
    [...valid,'0001_routing_controls.sql'],
    [...valid,''],
    [...valid,null],
    [...valid,17],
    '0001_routing_controls.sql',
    null
  ]){
    assert.deepEqual(migrationPlan(state,history),{safe:false,apply:[],baseline:[]});
  }
});


test('critical schema constraints fail closed on structurally counterfeit tables',async()=>{
  const {validateCriticalSchema}=await import('../scripts/d1-migration-preflight.mjs');
  const names=['id','account_id','destination','idempotency_key','status','created_at','expires_at'];
  const reservation=names.map(name=>({name,pk:name==='id'?1:0,notnull:name==='id'?0:1}));
  const ownerNames=['id','reservation_id','action','prior_status','carrier_code','reason','created_at'];
  const owner=ownerNames.map(name=>({name,pk:name==='id'?1:0,notnull:name==='id'?0:1}));
  const fk=[{from:'reservation_id',table:'reservations',to:'id',on_delete:'RESTRICT'}];
  const accountFk=[{from:'account_id',table:'accounts',to:'id',on_delete:'RESTRICT'}];
  assert.deepEqual(validateCriticalSchema(reservation,owner,fk,true,accountFk),[]);
  assert.deepEqual(validateCriticalSchema(reservation,[],[],false,accountFk),[]);
  const nullable=reservation.map(x=>({...x,notnull:x.name==='account_id'?0:x.notnull}));
  assert.match(validateCriticalSchema(nullable,owner,fk,true,accountFk).join(' '),/reservations.account_id constraint mismatch/);
  const missingOwner=owner.filter(x=>x.name!=='reason');
  assert.match(validateCriticalSchema(reservation,missingOwner,fk,true,accountFk).join(' '),/owner_actions.reason missing/);
  const weakenedFk=[{...fk[0],on_delete:'CASCADE'}];
  assert.match(validateCriticalSchema(reservation,owner,weakenedFk,true,accountFk).join(' '),/foreign key missing or weakened/);
  assert.match(validateCriticalSchema(reservation,owner,[],true,accountFk).join(' '),/foreign key missing/);
  assert.match(validateCriticalSchema(reservation,owner,fk,true,[]).join(' '),/account ownership foreign key missing/);
  assert.match(validateCriticalSchema(reservation,[],[],false,[]).join(' '),/account ownership foreign key missing/);
  assert.match(validateCriticalSchema(reservation,owner,fk,true,[{...accountFk[0],on_delete:'CASCADE'}]).join(' '),/account ownership foreign key missing or weakened/);
  assert.match(validateCriticalSchema(reservation,owner,fk,true,[{...accountFk[0],table:'other_accounts'}]).join(' '),/account ownership foreign key missing or weakened/);
});

test('idempotency uniqueness preflight rejects missing, partial, reversed and expression indexes',async()=>{
  const {validateIdempotencyIndex}=await import('../scripts/d1-migration-preflight.mjs');
  const index={name:'sqlite_autoindex_reservations_2',unique:1,partial:0};
  const keys=[
    {seqno:0,cid:1,name:'account_id',key:1},
    {seqno:1,cid:3,name:'idempotency_key',key:1},
    {seqno:2,cid:-1,name:null,key:0}
  ];
  const details=columns=>[{name:index.name,columns}];
  assert.deepEqual(validateIdempotencyIndex([index],details(keys)),[]);
  const invalid=[
    [[],[]],
    [[{...index,unique:0}],details(keys)],
    [[{...index,partial:1}],details(keys)],
    [[index],details([...keys].reverse().map((x,i)=>({...x,seqno:i})))],
    [[index],details(keys.map(x=>x.name==='idempotency_key'?{...x,cid:-2,name:null}:x))],
    [[index],details(keys.filter(x=>x.name!=='idempotency_key'))],
    [[index],details([...keys,{seqno:3,cid:4,name:'status',key:1}])],
    [[index],[]],
    [null,null]
  ];
  for(const [list,metadata] of invalid){
    assert.match(validateIdempotencyIndex(list,metadata).join(' '),/idempotency index metadata unavailable|UNIQUE\(account_id,idempotency_key\) missing or weakened/);
  }
  assert.deepEqual(validateIdempotencyIndex([{name:'wrong',unique:0,partial:0},index],
    [{name:'wrong',columns:keys},...details(keys)]),[]);
});


test('real SQLite catalog rejects weakened account-scoped uniqueness and foreign keys',async()=>{
  const {spawnSync}=await import('node:child_process');
  const {validateCriticalSchema,validateIdempotencyIndex}=await import('../scripts/d1-migration-preflight.mjs');
  const python=[
    'import json,sqlite3,sys',
    'db=sqlite3.connect(":memory:")',
    'db.execute("PRAGMA foreign_keys=ON")',
    'db.execute("CREATE TABLE accounts(id TEXT PRIMARY KEY)")',
    'fk=" REFERENCES accounts(id) ON DELETE RESTRICT" if sys.argv[1]!="missing-fk" else ""',
    'uq=", UNIQUE(account_id,idempotency_key)" if sys.argv[1]!="missing-unique" else ""',
    'db.execute("CREATE TABLE reservations(id TEXT PRIMARY KEY, account_id TEXT NOT NULL"+fk+", destination TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL"+uq+")")',
    'q=lambda s:[dict(zip([x[0] for x in db.execute(s).description],r)) for r in db.execute(s)]',
    'indexes=q("PRAGMA index_list(reservations)")',
    'details=[{"name":i["name"],"columns":q("PRAGMA index_xinfo(\'"+i["name"].replace("\'","\'\'")+"\')")} for i in indexes if i["unique"] and not i["partial"]]',
    'print(json.dumps({"columns":q("PRAGMA table_info(reservations)"),"fk":q("PRAGMA foreign_key_list(reservations)"),"indexes":indexes,"details":details}))'
  ].join('\n');
  for(const [fixture,expectedValid] of [['valid',true],['missing-unique',false],['missing-fk',false]]){
    const run=spawnSync('python3',['-c',python,fixture],{encoding:'utf8',timeout:10000});
    assert.equal(run.status,0,fixture+': '+run.stderr);
    const data=JSON.parse(run.stdout);
    const failures=[
      ...validateCriticalSchema(data.columns,[],[],false,data.fk),
      ...validateIdempotencyIndex(data.indexes,data.details)
    ];
    assert.equal(failures.length===0,expectedValid,fixture+': '+failures.join('; '));
    if(fixture==='missing-unique')assert.match(failures.join(' '),/UNIQUE\(account_id,idempotency_key\)/);
    if(fixture==='missing-fk')assert.match(failures.join(' '),/account ownership foreign key/);
  }
});
