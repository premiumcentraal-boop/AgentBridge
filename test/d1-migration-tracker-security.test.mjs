import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMigrationTracker} from '../scripts/d1-migration-preflight.mjs';

const columns=[
  {name:'id',type:'INTEGER',pk:1,notnull:0},
  {name:'name',type:'TEXT',pk:0,notnull:0},
  {name:'applied_at',type:'TIMESTAMP',pk:0,notnull:1}
];
const indexes=[{name:'sqlite_autoindex_d1_migrations_1',unique:1,partial:0}];
const details=[{name:indexes[0].name,columns:[{seqno:0,cid:1,name:'name',key:1},{seqno:1,cid:-1,name:null,key:0}]}];

test('valid Wrangler-style tracker schema is accepted',()=>{
  assert.deepEqual(validateMigrationTracker(columns,indexes,details),[]);
});
test('missing migration name and missing uniqueness fail closed',()=>{
  assert.match(validateMigrationTracker(columns.filter(c=>c.name!=='name'),indexes,details).join(' '),/name TEXT/);
  assert.match(validateMigrationTracker(columns,[],[]).join(' '),/UNIQUE\(name\)/);
});
test('wrong, partial, expression and composite unique indexes fail closed',()=>{
  for(const variant of [
    {indexes:[{...indexes[0],partial:1}],details},
    {indexes,details:[{...details[0],columns:[{seqno:0,cid:-2,name:null,key:1}]}]},
    {indexes,details:[{...details[0],columns:[{seqno:0,cid:0,name:'id',key:1}]}]},
    {indexes,details:[{...details[0],columns:[{seqno:0,cid:1,name:'name',key:1},{seqno:1,cid:0,name:'id',key:1}]}]}
  ])assert.notDeepEqual(validateMigrationTracker(columns,variant.indexes,variant.details),[]);
});
test('nullable tracker timestamp and missing primary key fail closed',()=>{
  assert.match(validateMigrationTracker(columns.map(c=>c.name==='applied_at'?{...c,notnull:0}:c),indexes,details).join(' '),/applied_at/);
  assert.match(validateMigrationTracker(columns.map(c=>c.name==='id'?{...c,pk:0}:c),indexes,details).join(' '),/primary key/);
});

test('real SQLite tracker catalogs reject counterfeit migration history tables',async()=>{
  const {spawnSync}=await import('node:child_process');
  const python=[
    'import json,sqlite3,sys',
    'db=sqlite3.connect(":memory:")',
    'kind=sys.argv[1]',
    'if kind=="valid": db.execute("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)")',
    'elif kind=="no-unique": db.execute("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)")',
    'elif kind=="partial": db.execute("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)"); db.execute("CREATE UNIQUE INDEX tracker_partial ON d1_migrations(name) WHERE name IS NOT NULL")',
    'elif kind=="composite": db.execute("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL, UNIQUE(name,applied_at))")',
    'elif kind=="nullable-time": db.execute("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")',
    'elif kind=="wrong-pk": db.execute("CREATE TABLE d1_migrations(id TEXT PRIMARY KEY, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)")',
    'q=lambda s:[dict(zip([x[0] for x in db.execute(s).description],r)) for r in db.execute(s)]',
    'indexes=q("PRAGMA index_list(d1_migrations)")',
    'details=[{"name":i["name"],"columns":q("PRAGMA index_xinfo(\'"+i["name"].replace("\'","\'\'")+"\')")} for i in indexes if i["unique"] and not i["partial"]]',
    'print(json.dumps({"columns":q("PRAGMA table_info(d1_migrations)"),"indexes":indexes,"details":details}))'
  ].join('\\n');
  for(const [kind,valid] of [['valid',true],['no-unique',false],['partial',false],['composite',false],['nullable-time',false],['wrong-pk',false]]){
    const run=spawnSync('python3',['-c',python,kind],{encoding:'utf8',timeout:10000});
    assert.equal(run.status,0,kind+': '+run.stderr);
    const data=JSON.parse(run.stdout);
    const failures=validateMigrationTracker(data.columns,data.indexes,data.details);
    assert.equal(failures.length===0,valid,kind+': '+failures.join('; '));
  }
});
