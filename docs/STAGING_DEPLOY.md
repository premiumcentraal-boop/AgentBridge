# Private staging deploy and first US test calls (owner runbook)

**Who runs this:** the owner, on their own machine, with their own Cloudflare and SignalWire logins.
A coding or chat agent must **not** run `wrangler login`, `wrangler deploy`, `wrangler secret put`,
remote D1 writes, SignalWire number changes, flag changes or calls on the owner's behalf.
Never paste a token, signing key or PIN into chat, GitHub or an MCP connector.

Placeholders used below: `<BRIDGE_DID>` (your SignalWire US number, E.164), `<MY_PHONE>` (the phone
you will call from), `<US_DEST>` (one consenting US number that may receive the forwarded leg),
`<WORKER_URL>` (your staging Worker's HTTPS origin, e.g. `https://agentbridge-api.<you>.workers.dev`).

## 0. Prerequisites (SignalWire dashboard)

- [ ] Trial Mode: either exit it, or verify `<MY_PHONE>` and `<US_DEST>` as allowed numbers (trial accounts can only reach verified numbers).
- [ ] Create a **Numbers-only** API token (local read-only connector) and a separate token with **Voice logs read** access (Worker reconciliation). Revoke the old all-scopes token once the new ones work.
- [ ] Note your **Signing Key** (API page). It is different from any API token.
- [ ] Write down the current US **inbound** and **outbound** per-minute rates with source and date. A low-balance alert is not a spend cap.

## 1. Tooling (pinned Wrangler)

```sh
git clone https://github.com/premiumcentraal-boop/AgentBridge && cd AgentBridge
npm --prefix backend ci          # installs the pinned wrangler (backend/package.json)
cd backend && npx wrangler --version   # expect 4.159.0
npx wrangler login               # owner only, opens a browser
```

## 2. D1 database, schema and migrations

```sh
# still in backend/
npx wrangler d1 create agentbridge-prototype          # copy the printed database_id
cp wrangler.example.jsonc wrangler.jsonc              # git-ignored; never commit
# edit wrangler.jsonc: set database_id (step 3 lists every field)
npx wrangler d1 execute agentbridge-prototype --remote --file schema.sql
npx wrangler d1 export agentbridge-prototype --remote --output ../agentbridge-backup.sql   # backup first
cd .. && node scripts/d1-migration-preflight.mjs --remote agentbridge-prototype && cd backend
```

Read the preflight output before writing anything:
- `OK ... will apply: 0001..., 0002..., 0003...` → run `npx wrangler d1 migrations apply agentbridge-prototype --remote`.
- `NOTICE ... already present but not recorded` (exit 2) → 0001 was applied by hand earlier. **Do not re-run it** (its `ALTER TABLE` statements cannot be repeated). Run the printed `INSERT OR IGNORE INTO d1_migrations ...` baseline command, re-run the preflight, then `migrations apply`.
- `BLOCKED: partial schema` → stop; restore from the backup or reconcile by hand.

0002 and 0003 only use `CREATE ... IF NOT EXISTS` and are safe to re-run.

Create the agent account row (prints a one-time agent token and the SQL; nothing is executed):

```sh
cd .. && node scripts/provision-test-account.mjs <BRIDGE_DID> && cd backend
npx wrangler d1 execute agentbridge-prototype --remote --command "<the INSERT it printed>"
```

## 3. `backend/wrangler.jsonc` fields

| Field | Value |
|---|---|
| `workers_dev` | `true` for a private `*.workers.dev` URL (or keep `false` and add a custom-domain route) |
| `d1_databases[0].database_id` | from step 2 |
| `PUBLIC_BASE_URL` | `<WORKER_URL>` |
| `US_BRIDGE_DID` | `<BRIDGE_DID>` |
| `TEST_CALLER_E164` | `<MY_PHONE>` (the hangup-only handler answers only this caller) |
| `TEST_DESTINATION_E164` | `<US_DEST>` |
| `SIGNALWIRE_PROJECT_ID` | project UUID |
| `SIGNALWIRE_SPACE` | space subdomain only (no `https://`, no `.signalwire.com`) |
| `SIGNALWIRE_SWML_WEBHOOK_URL` | `<WORKER_URL>/telephony/signalwire/swml` (must match exactly) |
| `ROUTING_DESTINATIONS` | `[{"e164":"<US_DEST>","country":"US","rate_cents_per_min":<outbound rate>,"rate_source":"SignalWire pricing page, <date>"}]` |
| `ROUTING_ALLOWED_COUNTRIES` | `US` |
| `ROUTING_MAX_CALL_SECONDS` / `ROUTING_MAX_CALLS_PER_DAY` | `60` / `1` (pilot maximum) |
| `ROUTING_MAX_SPEND_CENTS_PER_CALL` / `_PER_DAY` | at most `100` |
| `US_PILOT_TEST_DESTINATION` | `<US_DEST>` |
| `US_PILOT_DESTINATION_VERIFIED` | `true` only after you confirmed `<US_DEST>` consents and is reachable from your account |
| `US_PILOT_INBOUND_RATE_CENTS_PER_MIN` / `_SOURCE` | inbound rate and its source/date |
| `CALLER_PROOF_MODE` | `dtmf_pin` (the only routable pilot mode) |
| `PRIVATE_TEST_OUTBOUND_ENABLED`, `SIGNALWIRE_CONNECT_ENABLED` | **leave empty** |

## 4. Deploy (flags OFF) and secrets

```sh
npx wrangler deploy                                    # owner-approved, private staging only
cd .. && node scripts/owner-token.mjs && cd backend    # keep the owner token in a password manager
npx wrangler secret put OWNER_APPROVAL_TOKEN_SHA256    # paste the printed hash
npx wrangler secret put SIGNALWIRE_SIGNING_KEY
npx wrangler secret put SIGNALWIRE_VOICE_API_TOKEN     # Voice-logs read token
curl -s <WORKER_URL>/health
```

`TWILIO_AUTH_TOKEN` is not needed: the legacy Twilio route always hangs up.

## 5. Point the number at the Worker

In the SignalWire dashboard, set `<BRIDGE_DID>`'s inbound call handler to an **external SWML webhook**:
`<WORKER_URL>/telephony/signalwire/swml`. Do not use `/telephony/twilio/incoming`.

## 6. Test A: hangup only (flags OFF; no outbound leg possible)

1. Call `<BRIDGE_DID>` from `<MY_PHONE>`. Expected: the call ends immediately.
2. In SignalWire's call logs confirm one short inbound call and **no** outbound leg. Cost: one inbound minute.
3. A call from any other phone is refused (the Worker answers 403, the carrier ends the call).

## 7. Test B: one capped forward (separate explicit owner decision)

1. Prepare a reservation for `<US_DEST>` through the agent API/MCP with the agent token. Note the **8-digit PIN** (shown once) and reservation id.
2. Review and approve out of band:
   ```sh
   export AGENTBRIDGE_API_BASE=<WORKER_URL> AGENTBRIDGE_OWNER_TOKEN=...   # in your own shell only
   node scripts/owner-reservation.mjs review <id>      # check destination, rates, 60 s, estimated cost
   AGENTBRIDGE_PROPOSAL_DIGEST=<digest> node scripts/owner-reservation.mjs approve <id>
   ```
3. Set both flags to `"true"` in `wrangler.jsonc` and `npx wrangler deploy`.
4. Call `<BRIDGE_DID>` from `<MY_PHONE>`, type the PIN then `#`. Expected: connects to `<US_DEST>` for at most 60 s.
5. **Immediately** set both flags back to `""` and `npx wrangler deploy`.
6. Release the lock: `node scripts/owner-reservation.mjs mark-ended <id>`. It succeeds only when SignalWire's Voice Logs show the terminal inbound leg, exactly one terminal outbound child leg to `<US_DEST>`, and charges within the estimate.
7. If `mark-ended` keeps returning `CARRIER_RECONCILIATION_REQUIRED` and the SignalWire dashboard shows the call has ended:
   ```sh
   node scripts/owner-reservation.mjs force-unlock <id>    # retries reconciliation first
   AGENTBRIDGE_FORCE=yes AGENTBRIDGE_UNLOCK_REASON="Ended per SignalWire dashboard <time>" \
     node scripts/owner-reservation.mjs force-unlock <id>
   ```
   A forced unlock is recorded in `owner_actions`, marks the reservation `failed`, and still counts toward the 1-call daily cap. Report the returned `carrier_code` so the reconciliation field mapping can be fixed.

## Rollback

Flags empty + redeploy stops all forwarding. Re-pointing `<BRIDGE_DID>` away from the Worker removes it from the call path entirely. `npx wrangler delete` removes the staging Worker.
