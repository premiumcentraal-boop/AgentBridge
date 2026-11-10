-- 0002: bind an independent owner approval to the precise US pilot policy snapshot.
-- Created exactly once by the approved migration process, after 0001.
-- IF NOT EXISTS keeps this table creation repeatable; 0001 ALTER statements are not.
CREATE TABLE IF NOT EXISTS reservation_approval_bindings (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations(id) ON DELETE RESTRICT,
  policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64),
  approved_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS approval_bindings_created
  ON reservation_approval_bindings(approved_at);

-- Carrier logs identify the SWML segment ID, not just the call's stable call_id.
-- Store the claimed leg's segment ID only; reconciliation is read-only until
-- BOTH the inbound and its child outbound logs have terminal status.
CREATE TABLE IF NOT EXISTS reservation_carrier_legs (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations(id) ON DELETE RESTRICT,
  provider_segment_id TEXT NOT NULL UNIQUE,
  claimed_at INTEGER NOT NULL,
  reconciled_at INTEGER,
  actual_cost_cents INTEGER CHECK(actual_cost_cents>=0)
);
CREATE INDEX IF NOT EXISTS carrier_legs_claimed ON reservation_carrier_legs(claimed_at);
