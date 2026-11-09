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

## Backend: Cloudflare Worker + D1 + Twilio reference
The \`backend/\` directory is a deliberately bounded **test-only reference**:
- API key authorization via SHA-256 hashes stored in D1
- \`POST /v1/reservations\` to create a 90-second route, idempotently
- \`GET /v1/reservations/:id\` and \`POST /v1/reservations/:id/cancel\`
- \`POST /mcp\` with tools: \`prepare_international_call\`, \`get_call_status\`, \`cancel_international_call\`
- \`POST /telephony/twilio/incoming\` verifies Twilio signatures and atomically consumes a route
- \`POST /telephony/twilio/dial-complete\` records the high-level outcome
- 180-second hard \`<Dial>\` limit, one concurrent route per account, basic hourly preparation throttle
- **Only the exact \`TEST_DESTINATION_E164\` can be called**, until a full fraud/billing/consent system exists

### Private deployment checklist
1. Obtain carrier approval for your own test use case, country routing and selected US DID. Verify pricing and the relevant platform terms.
2. Create a Cloudflare D1 test database. Apply \`backend/schema.sql\`.
3. Copy \`backend/wrangler.example.jsonc\` to \`backend/wrangler.jsonc\`; insert D1 ID, public HTTPS base URL, real US DID and a consenting **single** E.164 test destination.
4. Add \`TWILIO_AUTH_TOKEN\` via \`wrangler secret put\`, never in source control. Configure the carrier to send signed form POSTs to \`/telephony/twilio/incoming\`.
5. Generate a scoped token and seed the account manually with \`node scripts/provision-test-account.mjs +1YOURDID\`; store the token privately. The script prints SQL; it does not execute it.
6. Start a private staging deployment. Test \`GET /health\`. Make a consenting phone call, verify audio and observed carrier costs.
7. Only after verification, test with Grok Bot's **native** calling feature and explicit user approval.

**Important:** This is not approved for public paid use. Shared phone numbers, fluctuating AI caller IDs, caller-ID based access, stuck connecting calls, missing callback retries, exact carrier billing, multiple providers, KYC, fraud protection and regulatory obligations remain unresolved. Time-limited DID access alone is **not sufficient anti-fraud protection** for a commercial relay.

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
