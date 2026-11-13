CREATE TABLE IF NOT EXISTS ab_accounts (
  id TEXT PRIMARY KEY,
  singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK(singleton = 1),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  auth_provider TEXT NOT NULL CHECK(auth_provider IN ('password','chatgpt')),
  auth_subject TEXT UNIQUE,
  password_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ab_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ab_sessions_expiry ON ab_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ab_workspaces (
  account_id TEXT PRIMARY KEY REFERENCES ab_accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ab_auth_attempts (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
