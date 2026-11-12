# AgentBridge
**connect agents worldwide**

## Victor product page & control studio

The new product experience is prepared for **agentbridge.victor.ceo**, with a dedicated
AgentBridge tab in the `victor-ceo` repository, following Meridian’s integration.

- `/` — real React/Astryx product page, animated country-to-call connections, product walkthrough and rendered studio preview.
- `/studio/demo/` — interactive sample workspace; changes reset when the tab reloads. The old `/studio/?demo=1` link still works.
- `/design/` — three original design boards (Signal, Material, Atlas) with floating call navigation and an interactive component preview; also under **Design boards** in the studio. See [design rationale and references](docs/DESIGN_DIRECTIONS.md).
- `/studio/` — private operator sign-in; server-backed route drafts, search, archive, activity,
  call plans, capture/join preferences, export and optional read-only private backend discovery.
- `npm start` — standalone Node service; persistent SQLite storage, no runtime dependencies.

**Mobile preview:** [Open the working pages](https://agentbridge-worldwide.premiumcentraal.chatgpt.site).
The preview is private to your ChatGPT account. Tap **Open studio** for the sample
workspace. [Preview setup and limitations](docs/MOBILE_PREVIEW.md).

**Railway deployment:** [new service, volume, access key and custom domain setup](docs/RAILWAY_STUDIO.md).
The Docker service does not load or expose the telephony Worker. New studio drafts
are separate from carrier reservations and cannot activate calls. Existing private
backend credentials are optional and stay on the server.

Local setup: Node 22.13+ (Node 24 recommended), `npm run setup:web`, `npm run ci`, then `npm run dev`.
Open `/studio/` with the local development key `local-development`, or explore the demo.
The known development key is ignored in production. A missing production access-key
hash keeps the private workspace locked.


A premium website and developer-first international telecom bridge for AI agents with their own US outbound calling capability. The intended experience is a natural extension of Grok Bot: prepare a route, call a US access number, and let the carrier connect it to an approved international recipient while **Grok Bot stays the only speaking AI**.

> **Current status: development preview, NOT a live calling service.** No consumer account creation, payments, number provisioning, or verified Grok Bot end-to-end dialing are provided. AgentBridge is independent of Grok/xAI, Cursor and Apple. A US calling feature must already be enabled and its use must be allowed under the relevant terms.

## Website

The public site and control studio share an Astryx/React 19 foundation. The
interface uses actual Astryx navigation, buttons, cards, segmented controls,
dialogs and inputs, with monochrome surfaces, original status avatars and SVG connection art.
Build output contains 31 rendered HTML pages, so direct links and public content
work before JavaScript starts. The original `/design/` gallery remains available.

- `/` — Product overview
- `/signup/` — Early-access signup design preview; details stay in the tab and no account/request is created
- `/features/` — Calling extensions overview
- `/international-calling/` — International call planning walkthrough
- `/call-memory/` — Optional recording/transcription and playable sample
- `/join-call/` — Let me join walkthrough and interactive participant illustration
- `/how-it-works/` — Interactive three-step walkthrough
- `/pricing/` — Preview and self-hosting options
- `/connect/` — Studio access and private backend setup
- `/docs/` — Developer and deployment notes
- `/studio/` — Protected operator workspace
- `/studio/demo/` — Sample workspace with persistent in-tab floating call preview
- `/studio/{connections,routes,calls,memory,connection,activity,settings,call,design}/` — Direct studio pages
- `/studio/demo/{connections,routes,calls,memory,connection,activity,settings,call,design}/` — Matching demo pages
- `/app/` — Compatibility link to the sample studio

The main hero says **connect agents worldwide**, with a signup-first action, secondary studio entry and an interactive sample-agent widget showing a three-message agent/business exchange. The sample waveform animates with reduced-motion support. A separate worldwide section preserves pairs of bold coloured country
lines enter from opposite edges, glide, then accelerate into the exact centre.
Their flags travel with the advancing line heads, then dissolve before the
circles overlap. Contact triggers a green pulse, a phone that pops into place
and a check mark that draws on as the country lines fade. The brief **Call
connected** confirmation clears before the next pair starts. Twelve pairings cover
all 16 flags over a 60-second cycle, with straight or single-turn approaches.
Every new pair paints above the older lines, flags and call icons, including at
the loop seam. The scene respects reduced motion, offers pause/play, and stops
when off screen or the tab is hidden. Reduced motion samples the same scene as a
still, including before JavaScript starts, with no call icon before contact.
Flags are local SVG symbols from the
MIT-licensed flag-icons project.

The rail has an expanded/compact state, a simulated active call at the top,
mute/return/join/end controls, five primary destinations, four management destinations and a dark/light switch. On small
screens it becomes a modal drawer with a persistent call strip.

### Grokbot-inspired redesign

The owner-provided style guide informs the system typography, black/white grouped
surfaces, rounded controls and original state avatars. Colour communicates state
or agent identity. AgentBridge keeps its own name and connection mark; no Grok,
xAI or Novra artwork is included. [Design and interaction details](docs/GROKBOT_REDESIGN.md).

The studio opens on a focused call beside its optional transcript. **Connections**
adds searchable saved destinations; **Routing** keeps destination drafts and review.
**Listen in** plays the local fictional sample, enters muted and follows the user
across studio pages. Its transcript follows the playback clock when enabled.
Leaving listening keeps the simulated call going. Routing review saves an in-tab
choice, with no transfer or carrier request. Production calling is unchanged.

### Calling extensions

International Calling, optional Recording & Transcription, and **Let me join**
now have rendered product pages and complete sample studio flows. The studio
can save validated international call plans, independent capture preferences,
transcript language/retention preferences and browser/phone join preferences.
Private plans and preferences persist in SQLite; demo changes stay in memory.

The sample call supports joining muted, muting your participant, leaving while
its agent continues, optional recording permission, pause/resume and optional
transcription. Call Memory includes an original fictional stereo recording,
transcript search/speaker filters, timestamp-to-audio navigation, downloads and
a clearly labelled sample outcome. The MP3 is bundled locally and uses synthetic
stock demonstration voices; it is not a real Grok call or a real booking.

**Live capability boundary:** these website flows do not add a chargeable
carrier route, media pipeline, recording service or live conference integration.
The current backend connection remains read-only discovery. Live international
calling, recording/transcription and joining require their separately implemented
and authorized integrations. Saving a plan or preference never enables them.
See [calling extensions and integration requirements](docs/CALLING_EXTENSIONS.md).

### Run locally

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm run setup:web
npm run ci
npm run dev
```

Open `http://127.0.0.1:3000/`. The local private studio accepts the development
key described above. `dist/` is the deployable static site; the authenticated
API needs the Node service. Public and studio navigation crosses a full document
boundary so the public CSP and Victor iframe permissions cannot carry into the
private workspace. Native links and direct page loads remain supported.

A build also writes `web/.cache/AgentBridge-Working-Website.html`: one portable
HTML file containing all page components, styles, original boards and in-memory
demo interactions. Open it directly in a modern browser. It never requests the
private API, and route drafts reset when reloaded. This is an actual working UI,
not a screenshot or replacement for a production deployment.

`npm run test:web` exercises real bundled React interactions in a DOM harness;
`npm run test:site` checks all 32 pages for landmarks, labels, links and assets.
These checks do not replace browser layout and accessibility testing. For a
project site, build and audit with `BASE_PATH=/AgentBridge`.

Dependencies are pinned in `web/package-lock.json`. Client assets and system
fonts are served locally. React and Astryx are bundled at build time; the Node
HTTP service has no third-party runtime packages. License notices ship with the
build. Do **not** host the repository root as a public document directory.

## Backend: Cloudflare Worker + D1 + SignalWire US private-test preview
The \`backend/\` directory is a deliberately bounded **test-only reference**:
- API key authorization via SHA-256 hashes stored in D1
- \`POST /v1/reservations\` to create a 90-second route, idempotently
- \`GET /v1/reservations/:id\` and \`POST /v1/reservations/:id/cancel\`
- \`POST /mcp\` with tools: \`prepare_international_call\`, \`get_call_status\`, \`cancel_international_call\`
- \`POST /telephony/signalwire/swml\` (+ \`/swml/pin\`): signed SignalWire SWML webhook; hangup-only unless both owner flags are on, then a 60-second, PIN-gated, owner-approved US pilot connect
- \`/v1/owner/reservations/:id/review|approve|mark-ended|force-unlock\`: owner-token-only controls
- \`POST /telephony/twilio/incoming\`: legacy Twilio reference route; verifies signatures and **always hangs up** (it can no longer forward calls)
- one concurrent route per account, basic hourly preparation throttle
- **Only the exact \`TEST_DESTINATION_E164\` can be called, and only inbound calls matching \`TEST_CALLER_E164\` are considered**, until a full fraud/billing/consent system exists

### Private deployment checklist
Follow **[docs/STAGING_DEPLOY.md](docs/STAGING_DEPLOY.md)** (owner runbook) and [docs/US_PRIVATE_PILOT.md](docs/US_PRIVATE_PILOT.md). In short:
1. Obtain carrier approval for your own test use case and US DID; verify pricing and platform terms.
2. Install the pinned Wrangler (\`npm --prefix backend ci\`), create a Cloudflare D1 test database, apply \`backend/schema.sql\`, run the read-only migration preflight, then migrations 0001-0003.
3. Copy \`backend/wrangler.example.jsonc\` to the git-ignored \`backend/wrangler.jsonc\` and fill it in; keep both routing flags empty.
4. Put \`SIGNALWIRE_SIGNING_KEY\`, \`OWNER_APPROVAL_TOKEN_SHA256\` and \`SIGNALWIRE_VOICE_API_TOKEN\` in \`wrangler secret put\`, never in source control.
5. Seed the account with \`node scripts/provision-test-account.mjs +1YOURDID\` (prints SQL; does not execute it).
6. Deploy private staging, test \`GET /health\`, and point the number's inbound **SWML webhook** at \`/telephony/signalwire/swml\` (not the Twilio URL).
7. Test A (hangup only, flags off), then, with a separate explicit owner decision, Test B (one PIN-gated 60-second US forward), then turn the flags off again.

**Important:** This is not approved for public paid use. Shared phone numbers, fluctuating AI caller IDs, caller-ID based access, stuck connecting calls, missing callback retries, exact carrier billing, multiple providers, KYC, fraud protection and regulatory obligations remain unresolved. Time-limited DID access alone is **not sufficient anti-fraud protection** for a commercial relay. **Caller ID can be spoofed**, so \`TEST_CALLER_E164\` is only a conservative additional private-test guard, not proof of identity or an authorization mechanism suitable for public service. Carrier-verified origin or a cryptographic per-call challenge remains required before expansion.

### Security rules
Never put real carrier credentials into public site code or the Git repo. No authorization fallback or arbitrary forwarding. Never turn off webhook validation to make a test pass. No premium/emergency/short-code destinations. The private-pilot Worker still has no audio capture. Optional live capture requires its own authorized integration and permission policy. Do not present made-up telecom prices as live quotations.

## Continuous development
- \`.github/workflows/ci.yml\`: quality gate on push and pull requests.
- \`.github/workflows/hourly-quality.yml\`: hourly CI test and build pulse (GitHub Actions scheduled runs can be delayed).
- [docs/ROADMAP.md](docs/ROADMAP.md): sequenced priorities.
- [docs/NORTH_STAR.md](docs/NORTH_STAR.md): canonical product, design, security and engineering contract.
- [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md): append-only record of changes.
- Separate ChatGPT hourly development automation is intended to make small reviewable PRs; it **does not** auto-merge or deploy changes.

## Chat-first call guidance (read-only preview)
Use the authenticated HTTP MCP tool `preview_chat_call_flow` or the private local MCP adapter to choose a **Simple**, **Guided** or **Advanced** explanation directly in an agent conversation. Simple is the default. This is a **stateless** choice per tool invocation, not an account preference; a host must pass the selection again to use it in another chat. The tool never reserves a call, confirms compatibility, approves a route, pays, or dials. Every level keeps exactly the same mandatory owner approval, one-use caller proof, native call confirmation and cost/policy checks. For the desired future call experience and current platform restrictions, see [docs/CHAT_CALL_EXPERIENCE.md](docs/CHAT_CALL_EXPERIENCE.md).

## Product line
AgentBridge is a **telephone routing layer**, not a new voice agent, and not a method to evade a service's calling restrictions.

### Website privacy and security posture
The site uses local system fonts instead of third-party font downloads. Built HTML includes CSP and a no-referrer meta policy. On Railway, the Node server permits public product framing only by Victor and blocks all studio framing. On Cloudflare Pages, `_headers` supplies corresponding framing, sniffing and device-permission rules. GitHub Pages ignores `_headers`, so `frame-ancestors` and other header-only controls cannot be assumed on GitHub Pages. Current inline styles still require `style-src 'unsafe-inline'`. These policies secure the public static preview, **not** the telecom backend, which remains private-test-only.

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
