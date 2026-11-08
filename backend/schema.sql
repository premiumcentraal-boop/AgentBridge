-- AgentBridge D1 test schema. Production requires additional billing and audit tables.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY,
 api_key_sha256 TEXT NOT NULL UNIQUE,
 did TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'disabled' CHECK(status IN ('active','disabled')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS reservations (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 destination TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ready','connecting','completed','failed','expired','cancelled')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 completed_at INTEGER,
 call_sid TEXT UNIQUE,
 UNIQUE(account_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_reservation_per_account
 ON reservations(account_id) WHERE status IN ('ready','connecting');
CREATE INDEX IF NOT EXISTS reservations_by_account_created
 ON reservations(account_id,created_at DESC);
CREATE INDEX IF NOT EXISTS reservations_expiry
 ON reservations(status,expires_at);
