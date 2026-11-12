import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_CAPTURE } from '../shared/call-plans.mjs';

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
    CREATE TABLE IF NOT EXISTS studio_call_plans (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, destination TEXT NOT NULL,
      country TEXT NOT NULL, purpose TEXT NOT NULL,
      capture TEXT NOT NULL, permission TEXT NOT NULL CHECK(permission IN ('ask','confirmed')),
      status TEXT NOT NULL CHECK(status IN ('draft','archived')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS studio_capture_preferences (
      id INTEGER PRIMARY KEY CHECK(id=1), preferences TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS studio_numbers (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_number_id TEXT NOT NULL,
      e164 TEXT NOT NULL UNIQUE, country TEXT NOT NULL, label TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('owned','disabled')),
      ownership_source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(provider,provider_number_id)
    );
    CREATE TABLE IF NOT EXISTS studio_connections (
      id TEXT PRIMARY KEY, label TEXT NOT NULL,
      routing_number_id TEXT NOT NULL REFERENCES studio_numbers(id),
      destination TEXT NOT NULL, country TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('saved','archived')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS studio_connections_one_destination
      ON studio_connections(routing_number_id) WHERE status='saved';
    CREATE TABLE IF NOT EXISTS studio_number_orders (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, provider TEXT NOT NULL,
      country TEXT NOT NULL, area_code TEXT NOT NULL, label TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('requested','fulfilled')),
      routing_number_id TEXT REFERENCES studio_numbers(id), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS studio_events (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
    );`);
  db.prepare('INSERT OR IGNORE INTO studio_capture_preferences VALUES(1,?)').run(JSON.stringify(DEFAULT_CAPTURE));
  const event = (type, message) => {
    db.prepare('INSERT INTO studio_events VALUES(?,?,?,?)')
      .run(randomUUID(), type, message, new Date().toISOString());
    db.prepare('DELETE FROM studio_events WHERE id NOT IN (SELECT id FROM studio_events ORDER BY created_at DESC, rowid DESC LIMIT 1000)').run();
  };
  return {
    close: () => db.close(),
    snapshot() {
      return {
        routing_numbers: db.prepare('SELECT * FROM studio_numbers ORDER BY created_at DESC,rowid DESC LIMIT 100').all(),
        connections: db.prepare('SELECT * FROM studio_connections ORDER BY created_at DESC,rowid DESC LIMIT 200').all(),
        number_orders: db.prepare('SELECT * FROM studio_number_orders ORDER BY created_at DESC,rowid DESC LIMIT 100').all(),
        call_plans: db.prepare('SELECT * FROM studio_call_plans ORDER BY created_at DESC, rowid DESC LIMIT 200').all().map(row=>({...row,capture:JSON.parse(row.capture)})),
        capture_preferences: JSON.parse(db.prepare('SELECT preferences FROM studio_capture_preferences WHERE id=1').get().preferences),
        routes: db.prepare('SELECT * FROM studio_routes ORDER BY created_at DESC, rowid DESC LIMIT 200').all(),
        settings: db.prepare('SELECT experience FROM studio_settings WHERE id=1').get(),
        events: db.prepare('SELECT * FROM studio_events ORDER BY created_at DESC, rowid DESC LIMIT 100').all(),
      };
    },
    // Trusted operator/provider ingress only. There is deliberately no HTTP
    // endpoint that lets a browser assert number ownership or mark an order paid.
    registerRoutingNumber({provider,provider_number_id,e164,country,label,ownership_source}, orderId) {
      if(provider!=='signalwire'||country!=='US'||!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e164)||typeof provider_number_id!=='string'||!provider_number_id||provider_number_id.length>100||typeof label!=='string'||!label.trim()||label.length>80||ownership_source!=='operator_project_verified')throw new Error('INVALID_VERIFIED_NUMBER');
      db.exec('BEGIN IMMEDIATE');
      try {
        const order=orderId?db.prepare("SELECT * FROM studio_number_orders WHERE id=? AND status='requested'").get(orderId):null;
        if(orderId&&(!order||order.provider!==provider||order.country!==country||e164.slice(2,5)!==order.area_code))throw new Error('ORDER_MISMATCH');
        const prior=db.prepare('SELECT * FROM studio_numbers WHERE e164=? OR (provider=? AND provider_number_id=?)').get(e164,provider,provider_number_id);
        if(prior&&(prior.provider!==provider||prior.provider_number_id!==provider_number_id||prior.e164!==e164))throw new Error('NUMBER_CONFLICT');
        if(!prior&&db.prepare('SELECT COUNT(*) AS n FROM studio_numbers').get().n>=100)throw new Error('NUMBER_LIMIT');
        const now=new Date().toISOString(),id=prior?.id||randomUUID();
        if(prior)db.prepare("UPDATE studio_numbers SET label=?,status='owned',updated_at=? WHERE id=?").run(label.trim(),now,id);
        else db.prepare('INSERT INTO studio_numbers VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,provider,provider_number_id,e164,country,label.trim(),'owned',ownership_source,now,now);
        if(order)db.prepare("UPDATE studio_number_orders SET status='fulfilled',routing_number_id=? WHERE id=?").run(id,order.id);
        event('number.verified','Routing number verified by the workspace operator.');
        db.exec('COMMIT');return db.prepare('SELECT * FROM studio_numbers WHERE id=?').get(id);
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    createNumberOrder(value) {
      const prior=db.prepare('SELECT * FROM studio_number_orders WHERE request_id=?').get(value.request_id);
      if(prior)return ['provider','country','area_code','label'].every(k=>prior[k]===value[k])?{order:prior}:{error:'REQUEST_CONFLICT'};
      if(db.prepare('SELECT COUNT(*) AS n FROM studio_number_orders').get().n>=100)return {error:'ORDER_LIMIT'};
      const order={id:randomUUID(),...value,status:'requested',routing_number_id:null,created_at:new Date().toISOString()};
      db.prepare('INSERT INTO studio_number_orders VALUES(?,?,?,?,?,?,?,?,?)').run(order.id,order.request_id,order.provider,order.country,order.area_code,order.label,order.status,null,order.created_at);
      event('number.requested','Number purchase requested. No purchase, charge or allocation made.');
      return {order};
    },
    saveNumberConnection(value, id) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing=id?db.prepare("SELECT * FROM studio_connections WHERE id=? AND status='saved'").get(id):null;
        let error;
        if(id&&!existing)error='NOT_FOUND';
        else if(!id&&db.prepare('SELECT COUNT(*) AS n FROM studio_connections').get().n>=200)error='CONNECTION_LIMIT';
        else if(!db.prepare("SELECT id FROM studio_numbers WHERE id=? AND status='owned'").get(value.routing_number_id))error='NUMBER_NOT_OWNED';
        else if(db.prepare("SELECT id FROM studio_numbers WHERE e164=? AND status='owned'").get(value.destination))error='OWN_NUMBER_DESTINATION';
        else if(db.prepare("SELECT id FROM studio_connections WHERE routing_number_id=? AND status='saved' AND id!=?").get(value.routing_number_id,id||''))error='NUMBER_ALREADY_LINKED';
        if(error){db.exec('ROLLBACK');return {error};}
        const now=new Date().toISOString(),connection={id:id||randomUUID(),...value,status:'saved',created_at:existing?.created_at||now,updated_at:now};
        if(existing)db.prepare('UPDATE studio_connections SET label=?,routing_number_id=?,destination=?,country=?,updated_at=? WHERE id=?').run(value.label,value.routing_number_id,value.destination,value.country,now,id);
        else db.prepare('INSERT INTO studio_connections VALUES(?,?,?,?,?,?,?,?)').run(connection.id,value.label,value.routing_number_id,value.destination,value.country,'saved',now,now);
        event('connection.saved','Routing number and destination saved. Carrier routing unchanged.');
        db.exec('COMMIT');return {connection};
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    archiveNumberConnection(id) {
      const result=db.prepare("UPDATE studio_connections SET status='archived',updated_at=? WHERE id=? AND status='saved'").run(new Date().toISOString(),id);
      if(result.changes)event('connection.archived','Saved connection removed.');
      return Boolean(result.changes);
    },
    saveCapturePreferences(preferences) {
      db.prepare('UPDATE studio_capture_preferences SET preferences=? WHERE id=1').run(JSON.stringify(preferences));
      event('capture.preferences_updated','Recording, transcription and join preferences saved. Live capture remains disabled.');
    },
    createCallPlan(value) {
      if(db.prepare('SELECT COUNT(*) AS n FROM studio_call_plans').get().n>=200)return null;
      const now=new Date().toISOString(),plan={id:randomUUID(),...value,status:'draft',created_at:now,updated_at:now};
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO studio_call_plans VALUES(?,?,?,?,?,?,?,?,?,?)').run(plan.id,plan.label,plan.destination,plan.country,plan.purpose,JSON.stringify(plan.capture),plan.permission,plan.status,now,now);
        event('call_plan.created','International call plan saved. No call, capture or join request made.');
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      return plan;
    },
    updateCallPlan(id,value) {
      db.exec('BEGIN');
      try {
        const previous=db.prepare("SELECT created_at FROM studio_call_plans WHERE id=? AND status='draft'").get(id);
        if(!previous){db.exec('ROLLBACK');return null;}
        const now=new Date().toISOString();
        db.prepare("UPDATE studio_call_plans SET label=?,destination=?,country=?,purpose=?,capture=?,permission=?,updated_at=? WHERE id=? AND status='draft'").run(value.label,value.destination,value.country,value.purpose,JSON.stringify(value.capture),value.permission,now,id);
        event('call_plan.updated','Call details and preferences updated. No call, capture or join request made.');
        db.exec('COMMIT');
        return {id,...value,status:'draft',created_at:previous.created_at,updated_at:now};
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    archiveCallPlan(id) {
      const result=db.prepare("UPDATE studio_call_plans SET status='archived',updated_at=? WHERE id=? AND status='draft'").run(new Date().toISOString(),id);
      if(result.changes)event('call_plan.archived','Call plan archived.');
      return Boolean(result.changes);
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
