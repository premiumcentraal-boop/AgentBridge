/**
 * Test-only Cloudflare D1 stand-in backed by Node's built-in SQLite, so the
 * real schema, migrations, constraints and conditional updates are exercised.
 */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';

const backend=join(dirname(fileURLToPath(import.meta.url)),'..','..');
export function schemaSql({migrations=true}={}){
  let sql=readFileSync(join(backend,'schema.sql'),'utf8');
  const dir=join(backend,'migrations');
  if(migrations&&existsSync(dir))
    for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())sql+='\n'+readFileSync(join(dir,f),'utf8');
  return sql;
}
export function createD1(opts){
  const db=new DatabaseSync(':memory:');
  db.exec(schemaSql(opts));
  const log=[];
  const D1={
    log,raw:db,
    prepare(sql){
      const make=(params)=>({
        bind:(...p)=>make(p),
        async first(){log.push(sql);return db.prepare(sql).get(...params)??null;},
        async all(){log.push(sql);return {results:db.prepare(sql).all(...params)};},
        async run(){log.push(sql);const r=db.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}};}
      });
      return make([]);
    },
    // Mirrors D1 batch(): statements run sequentially inside one transaction;
    // any error rolls back every statement in the batch.
    async batch(statements){
      log.push('BATCH');
      db.exec('BEGIN');
      try{
        const out=[];
        for(const s of statements)out.push(await s.run());
        db.exec('COMMIT');
        return out;
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
  };
  return D1;
}
