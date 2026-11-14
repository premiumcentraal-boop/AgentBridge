-- Rebuild the single-tester parent without its singleton constraint.
-- Preserve all account IDs, workspaces, sessions and encrypted provider records.
-- Child tables are copied before removal so foreign-key cascades cannot erase data.
--> statement-breakpoint
CREATE TABLE _signup_backup_ab_accounts AS SELECT * FROM ab_accounts;
--> statement-breakpoint
CREATE TABLE _signup_backup_ab_sessions AS SELECT * FROM ab_sessions;
--> statement-breakpoint
CREATE TABLE _signup_backup_ab_workspaces AS SELECT * FROM ab_workspaces;
--> statement-breakpoint
CREATE TABLE _signup_backup_ab_provider_connections AS SELECT * FROM ab_provider_connections;
--> statement-breakpoint
CREATE TABLE _signup_backup_ab_live_workspaces AS SELECT * FROM ab_live_workspaces;
--> statement-breakpoint
CREATE TABLE _signup_backup_ab_provider_operations AS SELECT * FROM ab_provider_operations;
--> statement-breakpoint
CREATE TABLE _signup_backup_ab_provider_locks AS SELECT * FROM ab_provider_locks;
--> statement-breakpoint
CREATE TABLE _signup_backup_ab_live_routes AS SELECT * FROM ab_live_routes;
--> statement-breakpoint
DROP TABLE ab_live_routes;
--> statement-breakpoint
DROP TABLE ab_provider_locks;
--> statement-breakpoint
DROP TABLE ab_provider_operations;
--> statement-breakpoint
DROP TABLE ab_live_workspaces;
--> statement-breakpoint
DROP TABLE ab_provider_connections;
--> statement-breakpoint
DROP TABLE ab_workspaces;
--> statement-breakpoint
DROP TABLE ab_sessions;
--> statement-breakpoint
DROP TABLE ab_accounts;
--> statement-breakpoint
CREATE TABLE ab_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  auth_provider TEXT NOT NULL CHECK(auth_provider IN ('password','chatgpt')),
  auth_subject TEXT UNIQUE,
  password_hash TEXT,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO ab_accounts(id,email,name,agent_name,auth_provider,auth_subject,password_hash,created_at,updated_at) SELECT id,email,name,agent_name,auth_provider,auth_subject,password_hash,created_at,updated_at FROM _signup_backup_ab_accounts;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ab_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO ab_sessions SELECT * FROM _signup_backup_ab_sessions;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ab_workspaces (
  account_id TEXT PRIMARY KEY REFERENCES ab_accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO ab_workspaces SELECT * FROM _signup_backup_ab_workspaces;
--> statement-breakpoint
CREATE TABLE ab_provider_connections (
  account_id TEXT PRIMARY KEY REFERENCES ab_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider='signalwire'),
  space TEXT NOT NULL,
  project_id TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  token_hint TEXT NOT NULL,
  live_enabled INTEGER NOT NULL DEFAULT 0 CHECK(live_enabled IN (0,1)),
  verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO ab_provider_connections SELECT * FROM _signup_backup_ab_provider_connections;
--> statement-breakpoint
CREATE TABLE ab_live_workspaces (
  account_id TEXT PRIMARY KEY REFERENCES ab_accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO ab_live_workspaces SELECT * FROM _signup_backup_ab_live_workspaces;
--> statement-breakpoint
CREATE TABLE ab_provider_operations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','unknown')),
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id,request_key)
);
--> statement-breakpoint
INSERT INTO ab_provider_operations SELECT * FROM _signup_backup_ab_provider_operations;
--> statement-breakpoint
CREATE TABLE ab_provider_locks (
  account_id TEXT PRIMARY KEY REFERENCES ab_accounts(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO ab_provider_locks SELECT * FROM _signup_backup_ab_provider_locks;
--> statement-breakpoint
CREATE TABLE ab_live_routes (
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  number_id TEXT NOT NULL,
  script_id TEXT,
  script_url TEXT,
  encrypted_previous_config TEXT,
  status TEXT NOT NULL CHECK(status IN ('configuring','active','inactive','unknown')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(account_id,connection_id)
);
--> statement-breakpoint
INSERT INTO ab_live_routes SELECT * FROM _signup_backup_ab_live_routes;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ab_sessions_expiry ON ab_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX ab_provider_operations_target ON ab_provider_operations(account_id,kind,target,status);
--> statement-breakpoint
DROP TABLE _signup_backup_ab_accounts;
--> statement-breakpoint
DROP TABLE _signup_backup_ab_sessions;
--> statement-breakpoint
DROP TABLE _signup_backup_ab_workspaces;
--> statement-breakpoint
DROP TABLE _signup_backup_ab_provider_connections;
--> statement-breakpoint
DROP TABLE _signup_backup_ab_live_workspaces;
--> statement-breakpoint
DROP TABLE _signup_backup_ab_provider_operations;
--> statement-breakpoint
DROP TABLE _signup_backup_ab_provider_locks;
--> statement-breakpoint
DROP TABLE _signup_backup_ab_live_routes;
--> statement-breakpoint
CREATE TABLE ab_email_tokens (
  token_hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
  email TEXT NOT NULL,
  account_id TEXT REFERENCES ab_accounts(id) ON DELETE CASCADE,
  profile TEXT,
  expires_at INTEGER NOT NULL,
  consumed_by TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX ab_email_tokens_email ON ab_email_tokens(email,purpose);
--> statement-breakpoint
CREATE INDEX ab_email_tokens_expiry ON ab_email_tokens(expires_at);
