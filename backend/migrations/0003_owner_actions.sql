-- 0003: append-only audit log for owner-only interventions (force unlock).
-- Safe to re-run: CREATE ... IF NOT EXISTS only. Apply after 0001 and 0002.
-- Stores no phone numbers, PINs, tokens or carrier bodies; the reason is
-- owner-typed free text (bounded to 500 characters by the Worker).
CREATE TABLE IF NOT EXISTS owner_actions (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('force_unlock')),
  prior_status TEXT NOT NULL,
  carrier_code TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS owner_actions_reservation ON owner_actions(reservation_id,created_at);
