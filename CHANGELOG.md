# Changelog

## v1.1.0 — 2026-11-10

AgentBridge v1.1.0 adds the redesigned product site and the two-number calling studio, and hardens SignalWire callback handling. It is still a private, owner-operated US pilot. Routing and calling remain **off by default**, and no new path can place a call, buy a number, or charge anyone.

### Added
- **Product site and studio redesign (#39).** This adds:
  - A signup-led product site with International Calling, Recording & Transcription and Let me join pages.
  - A left-side mobile drawer, and a studio home with an informative call card.
  - Call controls that stay in the call view. Ending a call asks for confirmation, and joining starts muted.
- **Two-number studio (#39).** The studio now has:
  - A Numbers page with country filtering and search.
  - A connection editor that pairs an owned routing number with a country-validated outside destination.
  - Additive SQLite tables for routing numbers, connections, number requests, call plans and capture preferences.
  - Authenticated, origin-protected endpoints that reject unowned or disabled numbers, duplicate assignments, loops and forged activation fields.
- **Number requests (#39).** Requests are idempotent and stay pending. They never charge a provider. The operator-only `scripts/import-studio-number.mjs` can import a number you already bought, using a bounded, read-only SignalWire check.

### Security
- **Atomic SignalWire claims (#37, #40).** The reservation claim, the carrier-leg insert and the provider-event outcome are written in a single D1 batch, so a fault can't leave a half-written claim.
- **PIN challenge binding (#40).** PIN challenges are bound to the original SignalWire call segment and to a SHA-256 digest of the caller. This uses D1 migration `0005_pin_challenge_identity.sql`.
- **Fail-closed callbacks (#40).** Unexpected database errors now produce hangup SWML, and denial paths stay hangup-only when telemetry writes fail.
- **Replay and outcomes (#40).** A replay-event INSERT counts only if exactly one row was written. A committed `connect` outcome can't be overwritten.
- **Caller-proof modes are unchanged.** `dtmf_pin` is the default. `capped_caller_id` and `any_caller` remain owner opt-ins behind their risk-accepted flags.

### Upgrade notes
- Apply D1 migration `0005` before the next Worker deploy. Without it, the Worker fails closed and hangs up on signed callbacks.
- The Railway studio's SQLite tables are created additively at startup on the existing `/data` volume.

## v1.0.0 — 2026-11-10

AgentBridge v1.0.0 is the first stable release. It is a private, owner-operated US pilot bridge: a Cloudflare Worker + D1 backend behind a SignalWire number, a private read-only MCP connector, and the AgentBridge product website with a control studio. It is **not** a public calling service.

### What's included

**Telephony backend (Cloudflare Worker + D1)**
- US-only private pilot routing to one owner-allowlisted destination. It is off unless both `PRIVATE_TEST_OUTBOUND_ENABLED` and `SIGNALWIRE_CONNECT_ENABLED` are set (#23, #24, #26).
- Signed SignalWire SWML webhooks with exact canonical URLs and a replay ledger (#15, #22).
- Two-step owner approval (review, then approve with a fingerprint) that binds destination, caps, rates and caller-proof mode. An owner-only force-unlock is audited in `owner_actions` (#23, #26).
- Hard ceilings: a 600 s onward leg, 4 calls a day, and $1 estimated per call and per day. Reservations last up to 15 minutes and are claimed once, atomically (#26, #27, #28).
- Caller-proof modes:
  - `dtmf_pin` is the default. It uses a one-use PIN and, new in this release, a server-enforced 60-second challenge deadline (#35).
  - `capped_caller_id` is an owner opt-in that requires `CALLER_ID_TRUST_ACCEPTED=true` and `US_PILOT_ALLOW_CALLER_ID_PROOF=true` (#27).
  - `any_caller` is an owner opt-in that requires `ANY_CALLER_RISK_ACCEPTED=true`. It exists for callers that rotate their caller ID and can't send DTMF, such as the Grok Bot voice agent (#28).
- Inbound caller log and owner endpoint `GET /v1/owner/inbound-calls` (#27).
- Carrier reconciliation against SignalWire Voice logs (#26).
- SignalWire inventory reads are bounded by a streamed 250 KB byte budget with early cancellation (#32).

**Chat / MCP**
- Private read-only stdio MCP connector (`local-mcp`) with an allowlisted tool set and number cards (#16, #20).
- `preview_chat_call_flow` offers a Simple, Guided or Advanced call-experience preview. It changes presentation only, never authorization (#30).
- Strict JSON-RPC validation before any tool runs (#5).

**Website and studio (#34)**
- Astryx/React product pages and a floating control studio. The studio is a single-operator workspace with a hashed access key, HttpOnly SameSite cookies and an origin check. It is never framed or indexed.
- Strict CSP, local-only assets and no third-party font calls (#6, #4).
- Optional Dockerfile and `railway.json` for a separate studio service. That service never loads the telephony Worker and always reports `routing_enabled: false`.
- The mobile hero caption is now legible over the cable art.

**Quality**
- The CI quality gate runs on every PR and on main: backend, server, site and web tests, the site build and audit, the local-MCP tests, and a new pinned gitleaks secret scan of history and the working tree (#35).

### Known limitations

- **`SIGNALWIRE_VOICE_API_TOKEN` is not configured on staging.** Automatic carrier reconciliation can't settle calls, so a call that reached `connecting` stays locked until the owner runs `mark-ended` or `force-unlock`. Each unlock still counts toward the daily cap.
- **`any_caller` has no caller authentication.** A SignalWire signature proves the request came from the carrier, not who is calling. While an approved reservation is ready, whoever calls the bridge number first gets that one capped leg to the allowlisted destination, billed to the owner. Use it only right before a call and turn the flags off afterwards. See `docs/US_PRIVATE_PILOT.md`.
- **`capped_caller_id` relies on caller ID, which can be spoofed.** The risk is the same kind and is bounded by the same caps.
- Grok Bot's DTMF support is unverified, and its outbound caller ID rotates per call, so `dtmf_pin` and `capped_caller_id` don't work for it today.
- Carrier-side spend enforcement is unverified. Cost figures are estimates from published SignalWire rates.
- The studio's login throttle is keyed on the socket address. Behind Railway's proxy, every client shares one bucket, so lockout is a nuisance but there's no bypass.
- Out of scope: multi-tenant accounts, payments, number purchasing, international routes and public resale.

### Deployment state at release

The release made no changes to Cloudflare. The staging Worker is still paused with both routing flags off. No secrets, flags or carrier settings were changed.
