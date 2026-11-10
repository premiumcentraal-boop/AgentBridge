# SignalWire bring-your-own-project connection (developer preview)

**Status: read-only inventory plus default-off authenticated SWML webhook. The new US-only private pilot implementation is in draft PR #26 and [US_PRIVATE_PILOT.md](US_PRIVATE_PILOT.md); only the flags-OFF handler is always hangup-only. The flags-ON route can generate a paid US connect after extra owner, DTMF, policy and D1 gates. Do not enable the flags or deploy based on this document. International routing is NOT authorized.** This is an independent AgentBridge integration concept, not an officially supported Grok/xAI feature. Grok Bot remains the sole speaking AI; no SignalWire AI, recording, transcription, or background voice agent is used.

## How the two SignalWire interfaces fit

- **Project API**: Read-only `GET /api/relay/rest/phone_numbers` confirms that a Project ID and API Token can list owned voice-capable numbers. This does not buy numbers, update phone settings or validate rates.
- **Signed SWML webhook (flags OFF)**: `POST /telephony/signalwire/swml` accepts SignalWire's raw JSON Calling SWML request, checks `X-Signalwire-SHA256-Signature` using the **separate project signing key**, matches the project/DID/inbound origin, and responds with a valid **hangup-only** SWML document. It never issues an onward call or consumes D1 reservations.
- **Gated US pilot (draft)**: With both flags explicitly ON, the routed handler invokes `signalWireConnectPlan()` only after signed-call checks, original PIN binding, owner-reviewed digest, exact US-only destination, conservative software cap and atomic claim. Without both flags, the older handler continues to hang up. It has NOT been deployed or carrier-verified; software spend estimates do not constitute provider budget enforcement.

The supplied `goto`, `execute`, and `transfer` guide is about SWML **control flow**. The correct method for bridging an inbound US call to an international phone number is `connect`. `transfer` does not automatically authorize or dial a phone number. Do **not** add a SignalWire conversational AI method: Grok Bot itself must remain the speaking party.

## Read-only connection preflight

1. In your **own** SignalWire Space, choose a Project, and create a Project API token restricted to the **Numbers** permission for this diagnostic step. Keep it in a secure local/server-side secret manager.
2. Provide the following **server-side** environment values to the process:
   - `SIGNALWIRE_SPACE`: the subdomain portion of `https://your-space.signalwire.com`, not a URL.
   - `SIGNALWIRE_PROJECT_ID`: Project UUID.
   - `SIGNALWIRE_API_TOKEN`: your opaque token (never paste into GitHub issues, public frontend, AI chat, or command-line arguments).
3. Run `npm run signalwire:check`. It makes one authenticated read-only GET. It prints only voice-capable E.164 DIDs, IDs, and a pagination flag; no token contents. If the inventory is paginated, this first-page preflight cannot confirm the full set.

This is a developer command, not a multi-user credential-collection website. An actual consumer connection flow still needs secure server-side credential storage/encryption, scoped accounts, permissions, token rotation/revocation and provider association.

## Configure the inbound **safe** SWML webhook (private staging only)

1. Deploy the approved Worker in **private staging** after security review; do not deploy publicly from this PR. No carrier resource will be purchased or modified by the source code.
2. Set `SIGNALWIRE_PROJECT_ID` (plain env), `SIGNALWIRE_SWML_WEBHOOK_URL` (exact public HTTPS URL ending in `/telephony/signalwire/swml`), `US_BRIDGE_DID`, `TEST_CALLER_E164`, and `TEST_DESTINATION_E164` in the *private Worker configuration*. Preserve all existing Twilio environment settings if you also use the existing Twilio reference routes.
3. Add `SIGNALWIRE_SIGNING_KEY` as a **secret** via the hosting platform's secret manager. **Do not use the REST API Token as the webhook signing key**.
4. After you own a carrier-approved US DID, an operator may **manually** configure that number's inbound **Calling SWML external webhook** to the exact HTTPS URL. This repository does not perform this operation.
5. The webhook verifies raw-body HMAC-SHA256 hex over `configured URL + raw body`, enforces a 16 KiB streamed body cap before buffering, rejects malformed UTF-8, requires valid calling metadata, and returns only `{"version":"1.0.0","sections":{"main":[{"hangup":{}}]}}` for any correctly signed call to the DID (logged in `inbound_call_log`); forged requests or a wrong project/DID return 403. **Do not place a real call solely to test this adapter without explicit permission.**

The read-only API checker and signed SWML webhook use different credentials. Their presence alone does **not** make routing ready, assign a DID, authenticate a Grok Bot session, verify a rate, or charge a call.

## Before routing can be enabled

- Verify native Grok Bot can legally place an ordinary US outbound call to the assigned number; native DTMF, per-call identifiers or private unique DID handling remain unproven.
- Close [security issue #3](https://github.com/premiumcentraal-boop/AgentBridge/issues/3): spoofable caller ID is insufficient. Add cryptographic reservation binding, durable callback replay ledger and reconciliation of missing completions.
- Close [reservation issue #9](https://github.com/premiumcentraal-boop/AgentBridge/issues/9): expired idempotent retries must not imply usable routes.
- Add user ownership of SignalWire projects and DIDs, verified live rates, strict spend/time/country caps, proper charge reconciliation and human approval for carrier activity.
- Obtain carrier permissions, confirm calling policy and test with one consenting international contact, documenting actual results. Never expose an open toll-fraud relay.

## Sources

- [SignalWire Project API credential model](https://signalwire.com/docs/platform/your-signalwire-api-space)
- [Read-only list phone numbers API](https://signalwire.com/docs/apis/rest/phone-numbers/list-phone-numbers)
- [Signed SWML request security](https://signalwire.com/docs/swml/guides/webhook-security)
- [Calling SWML JSON payload](https://signalwire.com/docs/swml/reference/calling)
- [SWML connect to phone](https://signalwire.com/docs/swml/reference/calling/connect)

## Gated routing (merged; off by default)

`index.mjs` sends `/telephony/signalwire/swml` to `handleSignalWireRouting()` **only** when `PRIVATE_TEST_OUTBOUND_ENABLED` and `SIGNALWIRE_CONNECT_ENABLED` are both exactly `true`. Otherwise the hangup-only handler above runs unchanged. The legacy Twilio route (`/telephony/twilio/incoming`) always hangs up and is not part of this flow.

The router returns `connect` only after all of these pass:
- a valid `X-Signalwire-SHA256-Signature` over the exact configured URL + raw body;
- project, DID, inbound direction, phone type, `call_id` and `segment_id` match;
- the call ID is not already in the `provider_events` ledger;
- `CALLER_PROOF_MODE=dtmf_pin`: an 8-digit, one-use PIN for **the reservation selected by this call's first webhook**; or, only with both owner opt-ins (`CALLER_ID_TRUST_ACCEPTED`, `US_PILOT_ALLOW_CALLER_ID_PROOF`), an exact `TEST_CALLER_E164` match (spoofable; see US_PRIVATE_PILOT.md);
- the US pilot policy: exactly `US_PILOT_TEST_DESTINATION`, attested, US only, at most 600 s, 4 calls/day and $1 estimated per call and per day (both legs);
- an owner approval whose stored fingerprint matches the current destination, rates, caps, caller proof and expiry (`GET .../review`, then `POST .../approve` with `proposal_digest`);
- the atomic claim succeeds and the SWML `segment_id` is stored before `connect` is returned.

In DTMF mode, the second fetch goes to `/telephony/signalwire/swml/pin`. SignalWire signs `transfer` fetches to external URLs, per its webhook-security guide, and the Worker verifies that path's exact URL.

The emitted SWML uses only `answer`, `prompt` (with `silence:1`, no TTS), `transfer`, `connect` (with `max_duration`) and `hangup`. There is no AI, recording, transcription or streaming.

### Ending a call and releasing the lock

- `POST /v1/owner/reservations/:id/mark-ended` reads SignalWire **Voice Logs** (read-only, `SIGNALWIRE_VOICE_API_TOKEN`): `GET /api/voice/logs/{segment_id}` and `GET /api/voice/logs?created_after=...&page_size=1000`. It uses the documented fields `id`, `to`, `direction`, `status`, `charge` (dollars) and `parent_id`, and `links.next` for pagination. It unlocks only for a terminal inbound log (`completed`/`ended`) plus exactly one terminal child (`outbound`, `outbound-dial` or `outbound-api`) to the reserved destination, with charges within the reserved estimate. Anything missing or unexpected keeps the lock and returns a specific code.
- `POST /v1/owner/reservations/:id/force-unlock` is the owner-only escape hatch. It retries reconciliation first; otherwise it needs `{"force":true,"reason":"..."}`, writes an `owner_actions` audit row, marks the reservation `failed` and still counts it toward the daily cap.

Status callbacks are not used yet: their signing is undocumented.

### Migrations

Apply after `schema.sql`, using the read-only preflight first (`node scripts/d1-migration-preflight.mjs --remote <db>`):
- `0001_routing_controls.sql`: reservation columns + `provider_events` ledger (`ALTER TABLE`; **not** re-runnable, the preflight never schedules it twice);
- `0002_approval_bindings.sql`: approval fingerprints and carrier segment IDs;
- `0003_owner_actions.sql`: force-unlock audit log;
- `0004_inbound_call_log.sql`: owner-readable log of signed inbound calls (caller ID discovery; `GET /v1/owner/inbound-calls`).

The full owner runbook (deploy, secrets, webhook URL, Test A hangup-only, Test B capped forward) is [STAGING_DEPLOY.md](STAGING_DEPLOY.md).
