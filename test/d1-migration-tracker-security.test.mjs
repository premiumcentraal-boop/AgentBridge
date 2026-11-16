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
