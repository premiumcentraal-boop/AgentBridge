# AgentBridge
**Your agent. Every number. One conversation.**

A premium website and developer-first international telecom bridge for AI agents with their own US outbound calling capability. The intended experience is a natural extension of Grok Bot: prepare a route, call a US access number, and let the carrier connect it to an approved international recipient while **Grok Bot stays the only speaking AI**.

> **Current status: development preview, NOT a live calling service.** No consumer account creation, payments, number provisioning, or verified Grok Bot end-to-end dialing are provided. AgentBridge is independent of Grok/xAI, Cursor and Apple. A US calling feature must already be enabled and its use must be allowed under the relevant terms.

## Website
Responsive, dependency-free public pages, designed for Cloudflare Pages or static hosting:
- \`/\` — Home, visual value proposition
- \`/how-it-works/\` — Three-step explanation
- \`/pricing/\` — Proposed plans and interactive illustrative calculator
- \`/connect/\` — Grok Bot connection and copyable future MCP instructions
- \`/docs/\` — Developer reference
- \`/app/\` — Honest, **non-calling** interactive console preview

### Run locally
Requires Node.js 22+.
\`\`\`bash
npm run ci
npm run build:site
npm run test:site
npx serve dist  # optional; or use any static HTTP server
\`\`\`
The static audit checks links, semantic landmarks, form labels and assets; it does not replace real browser accessibility testing. For GitHub Pages, use \`BASE_PATH=/AgentBridge npm run build:site\` and \`BASE_PATH=/AgentBridge npm run test:site\`.

No \`npm install\` is required to run checks or build the public site. \`dist/\` is the deployable static website; do **not** host the repository root as a public document directory.

## Backend: Cloudflare Worker + D1 + SignalWire US private-test preview
The \`backend/\` directory is a deliberately bounded **test-only reference**:
- API key authorization via SHA-256 hashes stored in D1
- \`POST /v1/reservations\` to create a 90-second route, idempotently
- \`GET /v1/reservations/:id\` and \`POST /v1/reservations/:id/cancel\`
- \`POST /mcp\` with tools: \`prepare_international_call\`, \`get_call_status\`, \`cancel_international_call\`
- \`POST /telephony/twilio/incoming\` verifies Twilio signatures and atomically consumes a route
- \`POST /telephony/twilio/dial-complete\` records the high-level outcome
- 180-second hard \`<Dial>\` limit, one concurrent route per account, basic hourly preparation throttle
- **Only the exact \`TEST_DESTINATION_E164\` can be called, and only inbound calls matching \`TEST_CALLER_E164\` are considered**, until a full fraud/billing/consent system exists

### Private deployment checklist (historical; see current US pilot gates below)
1. Obtain carrier approval for your own test use case, country routing and selected US DID. Verify pricing and the relevant platform terms.
2. Create a Cloudflare D1 test database. Apply \`backend/schema.sql\`.
3. Copy \`backend/wrangler.example.jsonc\` to \`backend/wrangler.jsonc\`; insert D1 ID, public HTTPS base URL, real US DID, a consenting **single** E.164 test destination, and the E.164 caller ID of your preapproved test origin in \`TEST_CALLER_E164\`.
4. Add \`TWILIO_AUTH_TOKEN\` via \`wrangler secret put\`, never in source control. Configure the carrier to send signed form POSTs to \`/telephony/twilio/incoming\`.
5. Generate a scoped token and seed the account manually with \`node scripts/provision-test-account.mjs +1YOURDID\`; store the token privately. The script prints SQL; it does not execute it.
6. Start a private staging deployment. Test \`GET /health\`. Make a consenting phone call, verify audio and observed carrier costs.
7. Only after verification, test with Grok Bot's **native** calling feature and explicit user approval.

**Important:** This is not approved for public paid use. Shared phone numbers, fluctuating AI caller IDs, caller-ID based access, stuck connecting calls, missing callback retries, exact carrier billing, multiple providers, KYC, fraud protection and regulatory obligations remain unresolved. Time-limited DID access alone is **not sufficient anti-fraud protection** for a commercial relay. **Caller ID can be spoofed**, so \`TEST_CALLER_E164\` is only a conservative additional private-test guard, not proof of identity or an authorization mechanism suitable for public service. Carrier-verified origin or a cryptographic per-call challenge remains required before expansion.

### Security rules
Never put real carrier credentials into public site code or the Git repo. No authorization fallback or arbitrary forwarding. Never turn off webhook validation to make a test pass. No premium/emergency/short-code destinations. Avoid recording or transcribing calls. Do not present made-up telecom prices as live quotations.

## Continuous development
- \`.github/workflows/ci.yml\`: quality gate on push and pull requests.
- \`.github/workflows/hourly-quality.yml\`: hourly CI test and build pulse (GitHub Actions scheduled runs can be delayed).
- [docs/ROADMAP.md](docs/ROADMAP.md): sequenced priorities.
- [docs/NORTH_STAR.md](docs/NORTH_STAR.md): canonical product, design, security and engineering contract.
- [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md): append-only record of changes.
- Separate ChatGPT hourly development automation is intended to make small reviewable PRs; it **does not** auto-merge or deploy changes.

## Product line
AgentBridge is a **telephone routing layer**, not a new voice agent, and not a method to evade a service's calling restrictions.

### Website privacy and security posture
The site uses local system fonts instead of third-party font downloads. Built HTML includes CSP and a no-referrer meta policy. On Cloudflare Pages, `_headers` additionally denies framing, sniffing and device permission APIs. GitHub Pages ignores `_headers`, so `frame-ancestors` and other header-only controls cannot be assumed on GitHub Pages. Current inline styles still require `style-src 'unsafe-inline'`. These policies secure the public static preview, **not** the telecom backend, which remains private-test-only.

## Combined integration status (review branch)
The code now combines SignalWire's read-only BYO Project/DID preflight, hangup-only signed SWML endpoint, bounded Twilio and authenticated JSON body readers, strict one-use reservation expiration, and a private-test outbound default-deny switch. No number purchasing, public self-service key linking, live international call, or payment pathway has been enabled. For the SignalWire operator's setup, see [docs/SIGNALWIRE.md](docs/SIGNALWIRE.md); `npm run signalwire:check` only performs read-only inventory with credentials supplied privately in the environment.

**Safety:** `PRIVATE_TEST_OUTBOUND_ENABLED` must remain unset (or any value other than the exact string `true`) on public servers. Even with this flag, caller ID alone is spoofable; production requires per-call cryptographic proof, durable callback replay protection, carrier-state reconciliation, spending caps, confirmed quotes, and platform permission checks. Expired or consumed reservations never supply a callable US access number through REST/MCP. Unknown Twilio completion statuses do not release active locks. SignalWire currently returns hangup-only SWML, not a chargeable connection. Grok Bot's native dialing is unverified.


## Chat-first number discovery (feature under review)

The private MCP prototype now has three **read-only** tools for conversational number setup:

- **get_bridge_setup** — reports the authenticated account's assigned US DID and safe next setup step.
- **list_my_numbers** — checks whether **only that assigned DID** appears as voice-enabled in a privately configured SignalWire Project. It does not list other customer numbers or prove per-user carrier ownership.
- **search_available_numbers** — searches up to five voice-capable US local number candidates by three-digit area code. Results have **no verified price and cannot be purchased**.

These tools return structured JSON for future host-native cards and equivalent text for ordinary MCP hosts. Read [docs/CHAT_FIRST_MCP.md](docs/CHAT_FIRST_MCP.md) for private operator setup and the security architecture. A private D1-backed bearer-authenticated MCP endpoint can use these **read-only** number tools without configuring Twilio call forwarding; a customer credential vault, live Grok Bot connector interoperability, number purchasing, payments and chargeable routing are still **unimplemented and unverified**. A self-contained standards-based **MCP Apps read-only card** is included, but actual Grok Bot rendering and compatibility have not been tested. Never paste provider credentials into a model conversation. Only the server's secret manager can hold the SignalWire Project token.

## Routing controls (local branch `routing-fixes`, OFF by default)
Gated SignalWire routing, owner approval, destination/country/spend caps, DTMF PIN caller proof and a replay ledger are implemented and tested offline. Nothing routes unless the owner sets **both** `PRIVATE_TEST_OUTBOUND_ENABLED=true` and `SIGNALWIRE_CONNECT_ENABLED=true` and fills every placeholder. See [docs/ROUTING_PLAN.md](docs/ROUTING_PLAN.md). Not deployed; no live call verified.



## US-only private pilot security fixes — feature PR #26, review required

For the current tested branch, start with [docs/US_PRIVATE_PILOT.md](docs/US_PRIVATE_PILOT.md), not the older Twilio-specific setup above. The new branch **retires Twilio inbound dialing**, requires one-use DTMF proof (not spoofable caller-ID fallback), binds PIN callbacks to original reservations, requires an owner-reviewed immutable policy fingerprint, constrains routes to one manually verified US number, budgets both call legs, and adds a fail-closed Voice Logs reconciliation before unlocking a connecting reservation. **None of these features are deployed or approved for a real call.** Keep PRIVATE_TEST_OUTBOUND_ENABLED and SIGNALWIRE_CONNECT_ENABLED unset.

Run `npm run ci`, `npm --prefix local-mcp test` and the **read-only** `npm run d1:preflight -- --remote agentbridge-prototype` only after the private D1 config is reviewed. A separate operator approval is needed to modify remote D1 or deploy any endpoint. Carrier prices, Grok Bot DTMF, and actual SignalWire Voice Logs still require independent live validation.
