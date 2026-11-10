import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// Studio records are deliberately separate from chargeable carrier reservations.
export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS studio_routes (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, destination TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft','archived')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS studio_settings (
      id INTEGER PRIMARY KEY CHECK(id=1), experience TEXT NOT NULL DEFAULT 'simple'
        CHECK(experience IN ('simple','guided','advanced'))
    );
    INSERT OR IGNORE INTO studio_settings(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS studio_events (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
    );`);
  const event = (type, message) => {
    db.prepare('INSERT INTO studio_events VALUES(?,?,?,?)')
      .run(randomUUID(), type, message, new Date().toISOString());
    db.prepare('DELETE FROM studio_events WHERE id NOT IN (SELECT id FROM studio_events ORDER BY created_at DESC, rowid DESC LIMIT 1000)').run();
  };
  return {
    close: () => db.close(),
    snapshot() {
      return {
        routes: db.prepare('SELECT * FROM studio_routes ORDER BY created_at DESC, rowid DESC LIMIT 200').all(),
        settings: db.prepare('SELECT experience FROM studio_settings WHERE id=1').get(),
        events: db.prepare('SELECT * FROM studio_events ORDER BY created_at DESC, rowid DESC LIMIT 100').all(),
      };
    },
    createRoute(label, destination) {
      if (db.prepare('SELECT COUNT(*) AS n FROM studio_routes').get().n >= 200) return null;
      const now = new Date().toISOString();
      const route = { id: randomUUID(), label, destination, status: 'draft', created_at: now, updated_at: now };
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO studio_routes VALUES(?,?,?,?,?,?)').run(...Object.values(route));
        event('route.created', 'Route draft saved. No reservation or call created.');
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return route;
    },
    archiveRoute(id) {
      const result = db.prepare("UPDATE studio_routes SET status='archived',updated_at=? WHERE id=? AND status='draft'")
        .run(new Date().toISOString(), id);
      if (result.changes) event('route.archived', 'Route draft archived.');
      return Boolean(result.changes);
    },
    saveSettings(experience) {
      db.prepare('UPDATE studio_settings SET experience=? WHERE id=1').run(experience);
      event('settings.updated', 'Conversation guidance changed to ' + experience + '.');
    },
    event,
  };
}
