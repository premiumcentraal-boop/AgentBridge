-- Customer-scoped MCP authorization and durable contact/call context.
CREATE TABLE ab_agent_clients (
  client_id TEXT PRIMARY KEY,
  metadata TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE ab_agent_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES ab_agent_clients(client_id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
--> statement-breakpoint
CREATE TABLE ab_agent_grants (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES ab_agent_clients(client_id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_used_at INTEGER
);
--> statement-breakpoint
CREATE INDEX ab_agent_grants_account ON ab_agent_grants(account_id,revoked_at);
--> statement-breakpoint
CREATE TABLE ab_agent_codes (
  code_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES ab_agent_grants(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
--> statement-breakpoint
CREATE TABLE ab_agent_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES ab_agent_grants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('access','refresh')),
  scopes TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
--> statement-breakpoint
CREATE INDEX ab_agent_tokens_grant ON ab_agent_tokens(grant_id);
--> statement-breakpoint
CREATE TABLE ab_contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  e164 TEXT NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id,e164)
);
--> statement-breakpoint
CREATE INDEX ab_contacts_name ON ab_contacts(account_id,name COLLATE NOCASE);
--> statement-breakpoint
CREATE TABLE ab_call_intents (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES ab_agent_grants(id) ON DELETE CASCADE,
  document TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX ab_call_intents_account ON ab_call_intents(account_id,created_at);
--> statement-breakpoint
CREATE TABLE ab_call_outcomes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  intent_id TEXT NOT NULL UNIQUE REFERENCES ab_call_intents(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  document TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX ab_call_outcomes_contact ON ab_call_outcomes(account_id,destination,created_at);
