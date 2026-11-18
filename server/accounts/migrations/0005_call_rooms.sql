ALTER TABLE ab_live_routes ADD COLUMN media_token_hash TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX ab_live_routes_media_token ON ab_live_routes(media_token_hash) WHERE media_token_hash IS NOT NULL;
--> statement-breakpoint
CREATE TABLE ab_media_inbound (
  account_id TEXT NOT NULL REFERENCES ab_accounts(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  PRIMARY KEY(account_id,call_id)
);
