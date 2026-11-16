CREATE TABLE ab_transcription_credentials (
  account_id TEXT PRIMARY KEY REFERENCES ab_accounts(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE ab_transcription_jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  recording_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','unknown')),
  document TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id,request_key)
);
--> statement-breakpoint
CREATE INDEX ab_transcription_jobs_recording ON ab_transcription_jobs(account_id,recording_id,status);
