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
