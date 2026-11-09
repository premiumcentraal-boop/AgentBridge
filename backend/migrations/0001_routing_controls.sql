-- 0001: routing controls (issue #3, ROUTING_PLAN phases 1-2).
-- Apply after schema.sql:  wrangler d1 execute <db> --remote --file backend/migrations/0001_routing_controls.sql
-- Columns are additive; legacy Twilio rows keep working (NULL = not used).
ALTER TABLE reservations ADD COLUMN approved_at INTEGER;          -- owner approval time (two-step)
ALTER TABLE reservations ADD COLUMN pin_sha256 TEXT;              -- SHA-256(reservation_id ":" pin); PIN itself never stored
ALTER TABLE reservations ADD COLUMN pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN provider TEXT;                -- 'signalwire' when claimed by the SWML handler
ALTER TABLE reservations ADD COLUMN provider_call_id TEXT;        -- SignalWire call.call_id (UUID)
ALTER TABLE reservations ADD COLUMN claimed_at INTEGER;
ALTER TABLE reservations ADD COLUMN max_call_seconds INTEGER;
ALTER TABLE reservations ADD COLUMN max_cost_cents INTEGER;       -- worst-case reserved spend for daily caps
CREATE UNIQUE INDEX IF NOT EXISTS reservations_provider_call
  ON reservations(provider,provider_call_id) WHERE provider_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reservations_claimed
  ON reservations(account_id,claimed_at);

-- Durable, idempotent provider event ledger. Replay protection is keyed by the
-- provider call ID + event type, NOT by signature (SignalWire retries reuse it).
-- Stores no phone numbers, bodies or signatures. Retention: delete rows older
-- than 90 days (operator task; see docs/ROUTING_PLAN.md).
CREATE TABLE IF NOT EXISTS provider_events (
  provider TEXT NOT NULL,
  provider_call_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  reservation_id TEXT,
  outcome TEXT NOT NULL,
  PRIMARY KEY (provider,provider_call_id,event_type)
);
CREATE INDEX IF NOT EXISTS provider_events_received ON provider_events(received_at);
