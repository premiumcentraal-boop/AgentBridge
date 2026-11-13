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
CREATE TABLE ab_live_workspaces (
  account_id TEXT PRIMARY KEY REFERENCES ab_accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
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
CREATE INDEX ab_provider_operations_target ON ab_provider_operations(account_id,kind,target,status);
--> statement-breakpoint
CREATE TABLE ab_provider_locks (
  account_id TEXT PRIMARY KEY REFERENCES ab_accounts(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
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
