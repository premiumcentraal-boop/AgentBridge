-- 0004: owner-readable log of SIGNED inbound calls to the bridge DID.
-- Purpose: learn/confirm the caller ID of the owner's AI calling agent before
-- trusting it. Rows are written only after the SignalWire signature, project,
-- DID and inbound/phone checks pass. Stores caller/callee E.164 numbers:
-- retention is an owner task (delete rows older than 30 days).
-- Safe to re-run: CREATE ... IF NOT EXISTS only. Apply after 0001-0003.
CREATE TABLE IF NOT EXISTS inbound_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_call_id TEXT NOT NULL,
  handler TEXT NOT NULL,
  from_number TEXT,
  to_number TEXT,
  caller_matches_test_caller INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(provider,provider_call_id,handler)
);
CREATE INDEX IF NOT EXISTS inbound_call_log_received ON inbound_call_log(received_at);
