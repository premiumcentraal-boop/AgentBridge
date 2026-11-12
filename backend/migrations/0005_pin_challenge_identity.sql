-- 0005: bind the original signed SignalWire PIN challenge to its carrier identity.
-- Existing challenges remain NULL and fail closed; do not backfill guessed identities.
-- Caller numbers are hashed, not stored in the event ledger.
ALTER TABLE provider_events ADD COLUMN challenge_segment_id TEXT;
ALTER TABLE provider_events ADD COLUMN challenge_caller_sha256 TEXT;
