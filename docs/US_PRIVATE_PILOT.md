# AgentBridge US-only private pilot — release-gated checklist

Owner command-by-command runbook: [STAGING_DEPLOY.md](STAGING_DEPLOY.md).

**Status: code review and offline validation, NOT cleared to place a forwarded call.**
This document describes the safe order to reach a first **US-to-US** consenting test, not international calling, a resale product, or Grok Bot compatibility proof. All routing flags stay OFF during setup and testing of infrastructure. No automatic deployment, telecom API provisioning or carrier calls are performed by the repository.

## Built controls (merged via PR #26)

1. The legacy Twilio signed inbound webhook always responds with Hangup; the shared PRIVATE_TEST_OUTBOUND_ENABLED variable cannot enable a second unmetered provider.
2. SignalWire's original inbound call ID and **segment ID** must be signed and valid; each PIN transfer is bound to its original approved reservation. PIN hashes are one-use and attempts capped. Caller ID by itself is spoofable.
3. A reservation can be prepared only for **one explicitly approved US destination**, with US_PILOT_TEST_DESTINATION matching the exact number and US_PILOT_DESTINATION_VERIFIED='true'. Caller proof defaults to CALLER_PROOF_MODE='dtmf_pin'. Caller-ID mode is rejected unless the owner sets **both** CALLER_ID_TRUST_ACCEPTED=true and US_PILOT_ALLOW_CALLER_ID_PROOF=true (see *Caller-ID residual risk* below). The software caps are owner-configured within hard pilot ceilings of **600 seconds (10 minutes) per onward connect, 4 claimed calls/day and $1 estimated spend per call and per day** (example config: 60 s, 1 call/day). These **are not carrier-enforced dollar caps**.
4. The estimate includes the owner-recorded outbound B-leg rate for every started minute of the cap, plus the inbound A-leg rate for the same minutes and three more (PIN/answer/ringing overhead). Source strings must be provided for both. Actual carrier costs can differ, and the app must not represent these as live quotes.
5. A separate owner token GET **/v1/owner/reservations/:id/review** returns the immutable exact destination, expiration, both rates, caller proof, policy caps and proposed spend. The owner, not Grok Bot, reviews those numbers. POST **/v1/owner/reservations/:id/approve** requires JSON containing the reviewed proposal_digest; the database stores a one-use fingerprint. Routing validates this fingerprint again. Reconfiguring price, country, rate source, caller mode or cap invalidates the approval.
6. The routed SWML response is generated only for approved, unexpired, signed and one-time claimed SignalWire calls while *both* PRIVATE_TEST_OUTBOUND_ENABLED and SIGNALWIRE_CONNECT_ENABLED equal the exact string 'true'. Any failed check hangs up.
7. Active reservations remain locked until **/v1/owner/reservations/:id/mark-ended** successfully verifies both the signed-call-associated SignalWire Voice Logs A-leg and exactly one B-leg, terminal status, expected DID/destination and recorded charges through a read-only scoped Voice API token. Missing, incomplete, paginated, mismatched, excessive, duplicated or nonterminal records do not unlock. Field names follow SignalWire's published Voice Logs API; live behaviour still needs one real call to confirm. If a call stays locked after it has visibly ended, the owner-only **/v1/owner/reservations/:id/force-unlock** retries reconciliation, then requires `force:true` and a reason, writes an `owner_actions` audit row (migration 0003) and still counts the call toward the daily cap.

## Operator-side prerequisites — NO forwarding until all are confirmed

- [ ] A consenting recipient and caller each have verified/purchased numbers **eligible under the current SignalWire account's Trial Mode** and carrier terms. US-to-US only. Never assume international permission is available.
- [ ] Revoke the all-scopes “Grokbot” token **after** creating and confirming a new **Numbers-only** token for local inventory. Keep separate, least-privilege provider credentials for Voice Logs reconciliation in the Worker, and a distinct SWML signing key. Never paste keys into chat or GitHub.
- [ ] Verify SignalWire's actual inbound and domestic outbound per-minute charges from current provider records, their source/date, billing increments and any applicable extra charges. Decide whether the available balance, project restrictions and notifications genuinely limit exposure. **A low-balance alert is not a hard spend cap.** Do not enable paid routing without satisfactory provider-side exposure controls or explicit review of an independently bounded financial risk.
- [ ] Independently confirm the exact SWML payload including call.segment_id, prompt/transfer PIN behavior, the voice-log /api/voice/logs and /:id response fields, parent_id correlation and whether the provider actually enforces max_duration. Offline mocks do NOT prove real interoperability.
- [ ] Verify Grok Bot can lawfully place a US call, can use the number and send DTMF digits under the applicable account and platform terms. If DTMF is unavailable, there is no authorized US-pilot connect path; do **not** substitute caller-ID-only authentication.
- [ ] Set up Cloudflare staging using a **separate test D1 database**, isolated secrets and manually approved internet-reachable Worker URL. The current remote connector is not deployed automatically.
- [ ] Both flags remain OFF. Confirm the US DID is NOT pointed at any chargeable router while testing webhook signature behavior. A signed hangup-only webhook can be tested safely with offline fixtures first; any real PSTN call requires explicit owner approval.

## D1 migration safety

The original schema is in backend/schema.sql. The additive but non-repeatable **0001_routing_controls.sql** adds columns with ALTER TABLE. **0002_approval_bindings.sql** creates immutable approval and carrier-leg tables. **0003_owner_actions.sql** creates the force-unlock audit table. 0002/0003 are re-runnable; the preflight prints a plan that never schedules 0001 when its columns already exist, and prints the `d1_migrations` baseline SQL for a hand-applied 0001. Do not simply rerun 0001 over an existing D1 that already has those columns.

1. Identify the correct Cloudflare account/database ID and make a recoverable **backup** before any D1 migration.
2. From the repository root, ensure the private backend/wrangler.jsonc has the correct D1 binding and migrations_dir='migrations'. Never check it into Git.
3. Run the **read-only** preflight: `node scripts/d1-migration-preflight.mjs --remote agentbridge-prototype`. Inspect version state, partial schema and whether d1_migrations is tracked.
4. If the base schema exists and v1/v2 are absent, use the documented **Wrangler D1 migrations list/apply** workflow. Compare the planned SQL and database identifier before applying. This is a privileged manual operation, not performed by the script.
5. If the preflight says v1 is complete but d1_migrations is absent, STOP: manually reconcile the migration baseline with a staged backup. Never re-run ALTER TABLE just to create a tracking record.
6. For interrupted/partial migrations, STOP and inspect backup/schema state. The preflight refuses to recommend automatic repair; do not assume a partially applied migration can safely be rerun.

## Safe development and local Grok Bot connector

- All four local stdio MCP tools remain read-only: get_bridge_setup, list_my_numbers, list_project_numbers and search_available_numbers. They cannot approve, buy, dial or forward.
- `bash scripts/setup-local-mcp.sh` now **defaults to current origin/main**, requires a clean working tree, and performs a fast-forward-only update; it refuses stale, diverged or dirty source. Test a PR branch explicitly only in an isolated disposable checkout using AGENTBRIDGE_SETUP_REF.
- Locally: `npm run ci` and `npm --prefix local-mcp test` (after npm ci), then the stdio smoke-client; these are offline checks with mock providers.
- Manually compare the current Grok Bot connector's entrypoint against the tested source before restarting it. No automatic access to Grok Bot cloud computer is assumed.

## Safe dry-run order (routing flags OFF)

1. Run the full CI and unit/integration tests, including default-off SWML, owner approval, swapped DTMF call binding, and invalid carrier log tests.
2. Run D1 read-only preflight; prepare and inspect migration backups/changes.
3. Validate read-only SignalWire inventory, token scopes and DID assignment without carrier mutations.
4. With staging deployment *separately approved*, validate /health, authentication, owner review/approval boundaries, malformed/forged SWML requests and strictly hangup-only responses. Keep both routing flags unset; do not use any actual call as part of these steps.
5. Produce a written US pilot release review including evidence of carrier billing restrictions, accurate cost estimates, DTMF capability, original call segment correlations and rollback actions.
6. **Only after a separate explicit user approval for one real consenting call** may an operator manually enable the two flags and update the DID's inbound SWML resource. Restore both to OFF afterwards. This document does not grant that approval.

## Remaining live-release blockers

- Carrier-side enforceable spend exposure is **unverified**; billing estimates can be wrong, and the project may have only a balance alert.
- SignalWire log settlement/parent linkage and strict terminal check are **offline-tested, not carrier-tested**. Unknown or outstanding carrier segments intentionally leave a call locked.
- Grok Bot's voice agent placed a real bridged US call on 2026-11-10 in `any_caller` mode; its DTMF support remains **unverified** and its outbound caller ID rotates per call. `dtmf_pin` stays the default; `capped_caller_id` and `any_caller` are owner opt-ins with accepted residual risk (below).
- Cloudflare authentication/D1 migration state and real provider token scoping have not been independently confirmed.
- Multi-tenant accounts, payments, number purchases, status callback reconciliation, international routes and resale operations remain out of scope.

This is a **developer/private pilot candidate**, not production-ready service. Never expose broad bearer tokens, approval tokens, secret signing keys or unrestricted provider API credentials to a model conversation.

## Caller-ID residual risk (opt-in caller-ID mode)

The owner's own AI voice agent may place a normal phone call that cannot send DTMF digits. For that case the pilot accepts `CALLER_PROOF_MODE=capped_caller_id` **only** with `CALLER_ID_TRUST_ACCEPTED=true` **and** `US_PILOT_ALLOW_CALLER_ID_PROOF=true`. Everything else still applies: signed SignalWire webhook, exact `TEST_CALLER_E164` match, an owner-reviewed and fingerprinted reservation (the fingerprint includes the trusted caller number, so changing it voids the approval), one allowlisted US destination, a one-time claim per reservation, per-call/day caps and both routing flags.

**Residual risk accepted by the owner:** caller ID can be spoofed. Anyone who knows the bridge number and the trusted caller number and calls with a forged caller ID **while an approved reservation is ready** can take that one capped leg to the single allowlisted destination. Exposure is bounded by: one reservation at a time, its short TTL, the 10-minute leg cap, at most 4 calls/day and $1/day estimated. Keep reservations short-lived, approve only right before a call, and prefer `dtmf_pin` whenever the caller can send digits.

## Any-caller mode (owner opt-in, no caller proof)

Some AI calling agents (including the owner's Grok Bot voice agent) present a **different caller ID on every call**, so neither DTMF nor caller-ID matching works. `CALLER_PROOF_MODE=any_caller` with `ANY_CALLER_RISK_ACCEPTED=true` accepts **any** calling number. Still enforced: signed SignalWire webhook, both routing flags, an owner-reviewed and fingerprinted reservation (the fingerprint records `trusted_caller: "ANY"`), one allowlisted US destination, single-use atomic claim, the reservation TTL (max 900 s), the 600 s leg cap and the daily call/spend caps. The actual From number is logged in `inbound_call_log`.

> **Warning — no caller authentication.** A valid SignalWire signature proves the request came from the carrier, **not** who is calling. In `any_caller` mode an approved reservation is effectively a bearer ticket for the bridge number.

**Residual risk accepted by the owner:** whoever calls the bridge number first while an approved reservation is ready gets that one capped leg to the single allowlisted destination (and the call is billed to the owner). Mitigations the owner must follow:

- Prefer `dtmf_pin` whenever the caller can send digits; use `any_caller` only for a caller that cannot (e.g. the Grok Bot voice agent).
- Approve a reservation only immediately before the call, keep `RESERVATION_TTL_SECONDS` short, and place the call right away.
- Turn both routing flags off (or cancel/release the reservation) right after the call.
- Review `inbound_call_log` afterwards; an unexpected From number on a `connect` outcome means the leg was taken by someone else.
- Exposure stays bounded by the single-use claim, the 600 s leg cap, the daily call/spend caps and the 60-second DTMF challenge window in `dtmf_pin` mode.

## Learning the caller ID

Every correctly signed inbound call to the bridge number (any caller, flags on or off) is written to `inbound_call_log` (migration 0004): caller and called number, handler, outcome, time. Read it with the owner token: `GET /v1/owner/inbound-calls?limit=20`, or `cd backend && npx wrangler d1 execute <db> --remote --command "SELECT * FROM inbound_call_log ORDER BY id DESC LIMIT 20"`. With the flags off such calls get a free hangup. Delete rows older than 30 days.
