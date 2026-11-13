import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openAccountDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(filename);
  connection.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  connection.exec('CREATE TABLE IF NOT EXISTS ab_schema_migrations(tag TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const migrationDirectory = new URL('./migrations/', import.meta.url);
  for (const file of readdirSync(migrationDirectory).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort()) {
    if (connection.prepare('SELECT tag FROM ab_schema_migrations WHERE tag=?').get(file)) continue;
    connection.exec('BEGIN IMMEDIATE');
    try { connection.exec(readFileSync(new URL(file, migrationDirectory), 'utf8')); connection.prepare('INSERT INTO ab_schema_migrations(tag,applied_at) VALUES(?,?)').run(file, new Date().toISOString()); connection.exec('COMMIT'); }
    catch (error) { connection.exec('ROLLBACK'); throw error; }
  }
  return {
    first: async (sql, params = []) => connection.prepare(sql).get(...params) || null,
    run: async (sql, params = []) => ({ changes: Number(connection.prepare(sql).run(...params).changes) }),
    async batch(statements) {
      connection.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(({ sql, params = [] }) => connection.prepare(sql).run(...params)); connection.exec('COMMIT'); return results; }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
    close: () => connection.close(),
  };
}
