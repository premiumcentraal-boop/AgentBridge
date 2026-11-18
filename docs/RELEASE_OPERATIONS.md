# Release operations

This is a BYOK release candidate. Do not announce the complete live-call product until the gates in RELEASE_READINESS.md pass on agentbridge.victor.ceo.

## Deploy without losing customer data

Follow RAILWAY_STUDIO.md. Use one Node 24 replica, a durable `/data` volume, the existing account database and the existing `PROVIDER_CREDENTIALS_KEY`. Do not rotate that key or copy private Sites accounts into public Railway silently. Configure verified Resend sending credentials, `STUDIO_SIGNUP_MODE=public`, the canonical HTTPS origin and explicit agent callback countries. The customer enters SignalWire and optional xAI keys inside authenticated Studio forms.

Before rollout, take a Railway volume backup and a consistent account database backup from the running service:

```sh
node scripts/backup-accounts.mjs /data/accounts.sqlite /private-backups/accounts-2026-11-16.sqlite
```

Use an actual private mounted backup location. The script uses SQLite's online backup API, verifies integrity and foreign keys, writes mode 0600 and refuses to overwrite an existing file. Retain the wrapping key separately in the host secret manager/password manager. An account export excludes credentials and is not a full disaster-recovery backup.

On a staging service, restore the snapshot into a fresh private `/data` volume, reuse the correct wrapping key, start the reviewed build and verify sign-in, contacts and provider-key decryption. Never test restore by overwriting the only production volume. Keep the restored service inaccessible to the public and prevent unattended carrier actions. A restore can resurrect old sessions/tokens; revoke them before any restored service is exposed. Backups contain private phone numbers and conversation text.

Migrations 0000 through 0005 are append-only and run transactionally on Node startup. Sites uses its existing D1 binding and migration journal. Preserve all older migration bytes. Roll back the application image while retaining the database and key; never roll back by deleting customer records.

## Readiness and drift

`/health` and `/healthz` report process/configuration/version/build information. `/readyz` returns 503 unless public accounts, email and encrypted storage are configured. It does not claim a real call, inbox delivery or Grok integration has passed. `/build.json` identifies the static build. Build metadata and runtime version must agree.

```sh
npm run launch:check -- https://agentbridge.victor.ceo EXPECTED_GITHUB_COMMIT_SHA
```

The probe is read-only. It checks public account policy, registration/recovery availability, access boundaries, security headers, exact OAuth/MCP discovery and release drift. It never buys a number, dials or sends an email. Railway must actually deploy the reviewed source commit; a GitHub merge is not deployment evidence.

## Paid operations and incident recovery

Provider purchases, route changes, callbacks and recording controls have durable operation IDs, per-account locks and ownership checks. A timeout can mean a chargeable write succeeded. Unknown writes are blocked from automatic replay. Refresh and reconcile provider state, then use the Studio operation review flow only after checking SignalWire. Never clear a pending operation just to make a button work.

Agent-requested callbacks require a separate owner approval for the exact callback and destination. Native Grok calling retains its own confirmation. Carrier status is read from SignalWire rather than inferred from an animation. Callback legs and forwarding are capped at 300 seconds. Static forwarding is a customer-enabled public phone route: anyone who knows that routing number can call it while activated, and the customer's provider project pays. It is not the legacy proof-gated reservation flow. Deactivate unused forwarding and configure provider spending limits. Do not advertise caller verification or per-agent spending caps for static forwarding.

Saved transcription is explicit, limited to completed owned recordings of 30 minutes/16 MB, and rate-limited to 20 requests per account/hour. It sends multipart audio to the fixed xAI STT endpoint with a server-held encrypted key. Successful jobs are reused. Uncertain results are not resent. Check xAI usage and provider availability before recovery; do not claim provider charges have been reversed.

Account deletion requires the current password (or the verified private Sites identity), typed DELETE and a disconnected carrier. App grants and local customer data cascade away. Carrier numbers, recordings and billing remain with SignalWire. Delete carrier recordings separately when required. Password reset revokes all browser sessions and connected-agent grants.

## Required production smoke test

1. Register with a real email; verify delivery, consume the link, sign in/out and reset the password. Check previous sessions and app grants stop working. Confirm a second account has no access to the first account's records.
2. Restart the deployment and verify the account, contacts, keys and history survive. Test a private backup restore on staging.
3. Connect an actual Grok custom connector over OAuth, save a contact, prepare by name and by formatted phone, report a factual outcome, prepare again and verify recall. Revoke the app and verify a later tool call fails. Record the Grok version and actual tested transport.
4. Using consenting phones and the customer's test project, import/search a number, explicitly buy only if needed, save a destination, activate/deactivate forwarding and verify the previous handler is restored. Test an approved callback, end and transfer, then check provider logs and duration caps.
5. On a consenting call, start/pause/resume/stop recording, play authenticated audio, transcribe with a real xAI key, retrieve the saved text in history/context and delete both local transcript and carrier audio. Check provider-side charges and privacy behavior.
6. Select Enable Studio call room on a new callback. On mobile and desktop, join listening and speaking, mute each source, turn on captions with participant consent, invite a contact, transfer and rejoin. Confirm leaving preserves both phone legs and a service restart ends active rooms cleanly. Record the actual audio and carrier observations privately.

Keep evidence as redacted timestamps, release SHA, actual provider call IDs and pass/fail observations in private operational records. Do not put audio, transcripts, credentials or customer phone numbers in public GitHub issues.
