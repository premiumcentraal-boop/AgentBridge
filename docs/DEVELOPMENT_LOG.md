# AgentBridge development log
Append one dated entry for each substantial incremental development session. Link the PR and CI result. This is a history, not an aspirational checklist.

## 2026-11-08 — Foundation
- Initialized previously empty public repository.
- Committed canonical North Star, design system, six static website pages, interaction script, icon, and backend reference.
- Designed a D1-backed, short-lived reservation lifecycle with a single permitted test number and HMAC-signed Twilio webhook processing.
- Added test scaffolding, CI and hourly quality-check workflow.
- Known gaps: no deployed site, no provider credentials, no real account/customer billing, no Grok Bot end-to-end verification, no independent browser QA. Do not present preview as a live product.

## 2026-11-08 — Preview deployment and hourly development
- Added a GitHub Pages deployment workflow (preview deployment requires Pages configuration in repository settings); Cloudflare Pages build output is also documented.
- Created an hourly ChatGPT development automation to inspect the repo, implement a nonduplicate priority change and submit a reviewable PR; auto-merge/deployment is prohibited.
- Added the [P1 native Grok Bot international test call acceptance issue](https://github.com/premiumcentraal-boop/AgentBridge/issues/1).
- Verified through the GitHub connector that the source files, North Star, CI workflow and deployment workflow exist in main.
- Not verified: actual automated CI success, deployment URL accessibility, live telecom integration, and real native Grok Bot international call.

## 2026-11-09 — Private-test inbound caller hardening (PR pending)
- Identified a high-risk condition: any inbound caller could consume a ready DID reservation and trigger a paid international leg if they reached the assigned US number during its 90-second window.
- Added a fail-closed `TEST_CALLER_E164` origin gate before reservation lookup and consumption, plus strict Twilio CallSid shape validation.
- Added regression tests for permitted/unknown/malformed/missing callers and missing caller configuration.
- Updated private setup instructions and explicitly documented caller-ID spoofability. This is a **defense-in-depth private-test guard**, not cryptographic authentication; a carrier-verified origin or per-call challenge is still a release blocker.
- GitHub Actions validation pending; local repository clone unavailable due to runtime network DNS restrictions. No live calls placed.

## 2026-11-09 — Website structural integrity gate (PR #4)
- Integrated a dependency-free audit of six static pages, navigation, local assets, anchors, duplicate IDs, labels and essential landmarks, including GitHub Pages project paths.
- Added negative regression tests, quality gate and pre-deploy project-site audit, retaining the previous caller-authentication work.
- Original PR #4 GitHub quality gate succeeded: https://github.com/premiumcentraal-boop/AgentBridge/actions/runs/42550759009 . Browser accessibility/contrast and visual screenshots are not verified.

## 2026-11-09 — Strict MCP request-validation gate (PR #5)
- Integrated JSON-RPC 2.0 envelope, method and exact tool-argument validation ahead of MCP tool dispatch, preserving the merged approved-caller inbound gate.
- Rejected malformed or unexpected reservation and cancellation arguments before database side effects; added dedicated Node regression tests.
- Original PR #5 quality gate succeeded: https://github.com/premiumcentraal-boop/AgentBridge/actions/runs/42556200400 . Final post-reconciliation CI is required before merging.
- No calls, carrier credentials, payment processing or live backend deployment.

## 2026-11-09 — Privacy and browser-policy integration (PR #6)
- Removed external font CDN import; added offline system-font fallback and restrictive CSP/referrer metadata to the built preview, plus Cloudflare Pages `_headers`.
- Fixed original PR #6 failed quality gate: typography test required explicit `system-ui` fallback, which is now present in the CSS stack.
- Combined PR #4's separate `test:site` post-build audit with new static-security regression tests; protected execution order to prevent auditing before `dist/` exists.
- Security remains subject to hosting limits: GitHub Pages ignores `_headers`; inline styles still require `style-src 'unsafe-inline'`. No verified browser screenshots or telecom backend changes.

## 2026-11-09 — Require explicit approval before static-preview publication (PR pending)
- Removed automatic main-branch GitHub Pages publication triggers; deployment now requires manual workflow dispatch, while the independent CI quality gate remains automatic.
- Added a Node regression test guarding against reintroducing push, pull_request or schedule deployment triggers and asserting the manual entrypoint.
- Addresses the safe non-publication path in issue #7. Pages configuration and browser deployment remain unverified; no public deployment authorized or attempted.

## 2026-11-09 — SignalWire BYO project and SWML adapter (PR pending)
- Verified SignalWire's official Numbers inventory API and read-only Project ID + API Token authentication. Added an environment-only preflight that cannot purchase, reconfigure or dial any phone number.
- Added an independent signed SWML JSON webhook using the SignalWire project signing key, exact HTTPS webhook URL, HMAC-SHA256 on raw request data, matched project/DID/origin, strict input size limits and no D1 reservation side effects.
- Added an offline SWML `connect` serializer for future phone bridging, plus tests for malicious Space names, credential leakage, request tampering, cross-project and wrong-origin calls and no outbound connection.
- Actual outbound routing remains DISABLED: caller ID is spoofable, native Grok Bot dialing is unverified, per-call cryptographic authentication, verified rates, spending caps and callback reconciliation are not complete. No SignalWire credentials were used, no carrier calls or changes were made.
- Detailed operator instructions: [SignalWire integration](SIGNALWIRE.md). Await GitHub Actions test verification and PR review.

## 2026-11-09 — SignalWire webhook bounded-stream hardening (PR #10 follow-up)
- Found that the signed SignalWire handler used `await request.text()` before checking its 16 KiB limit; an attacker could send an arbitrarily large chunked body without Content-Length and cause avoidable Worker memory pressure.
- Replaced unbounded text buffering with byte-counted ReadableStream reads, early cancel on excess, and fatal UTF-8 decoding. The signature remains computed from the exact decoded body and all valid requests still receive hangup-only SWML.
- Added regression coverage for oversized chunked payloads, invalid UTF-8 and exact limit behavior. Updated the existing PR #10 rather than opening a competing PR. No live calls, secrets or carrier changes.
- GitHub Actions checks on updated PR head required before merge.

## 2026-11-09 — Reservation expiry and idempotent retry correctness (PR pending)
- Fixed expiry boundary so an inbound call at the expiry second cannot claim a reservation. Expiration cleanup uses <= rather than <.
- Existing idempotency keys cannot reopen consumed or expired reservations; clients must generate a new key. Existing active, unexpired retries still return the original route.
- REST/MCP reservation views mask the US access number and show effective expired status even if the persisted D1 row has not yet been cleaned up. Cancellation requires a still-live ready reservation.
- Added regression tests for expired and terminal retries, unexpired retries and stale GET behavior. CI and review pending. This does not authenticate inbound callers or authorize paid routing.

## 2026-11-09 — Bounded Twilio webhook streaming (PR pending)
- Replaced unbounded `request.text()` in Twilio incoming and dial-complete endpoints with a shared byte-limited streaming reader (16,000 bytes). Rejects malformed content lengths, invalid UTF-8 and chunked oversize bodies before signature verification or database access; cancels unread streams.
- Added Node regression tests for exact byte boundary, split UTF-8, early stream cancellation, invalid content lengths, signed inbound compatibility and oversize webhook denial. Added module syntax checking to CI.
- Existing Twilio HMAC signature validation and fail-closed private-test caller gate remain unchanged. No changes to live carrier resources, public deployment or charges. Caller ID spoofing and durable replay protection remain unresolved (issue #3).

## 2026-11-09 — Bound authenticated MCP and REST request bodies (PR #13 follow-up)
- Source review found that `parseJson()` used unbounded `request.text()` before checking its 4096-character limit; authenticated clients could stream oversized or multi-byte bodies into Worker memory.
- Reused PR #13's bounded byte-stream reader with a 4096-byte limit for REST reservations and MCP JSON-RPC. Malformed UTF-8, misleading content lengths and oversize requests fail before tool dispatch or reservation mutations; authentication remains first.
- Tightened the JSON content-type check to a media type boundary rather than substring matching. Added Node regression tests for chunked oversize, malformed UTF-8, misleading content types, valid split-chunk MCP ping, and unauthorized requests.
- No live calls, secrets, billing, deployments or carrier changes. Pending CI and review; replay-resistant per-call authorization remains blocked by issue #3.

## 2026-11-09 — Default-deny private outbound leg gate (PR #13 extension)
- Added a server-side `PRIVATE_TEST_OUTBOUND_ENABLED` exact-string opt-in before any Twilio reservation is consumed or a chargeable `<Dial>` is returned. Without explicit opt-in, signed inbound calls receive hangup and cannot consume the pending reservation.
- Added regression tests for missing/malformed/false flag values and the existing strictly allowlisted private-test path when explicitly enabled.
- This flag is **not** proof of Grok Bot identity. Caller ID can be spoofed; do not enable it on a public deployment. Cryptographic per-call authorization, replay protection, billing caps and carrier verification remain blockers. No live call or deployment performed.

## 2026-11-09 — Fail-closed Twilio completion state transitions (PR #13 extension)
- Audited signed dial-complete handling: any status other than `completed`, including missing and intermediate values, previously released a `connecting` reservation as `failed` even without proof of carrier termination.
- Added an explicit terminal-status allowlist, strict parent CallSid shape check and duplicate-sensitive-field rejection. Unknown/ambiguous callbacks now preserve the active lock for future reconciliation instead of prematurely permitting another chargeable leg.
- Added offline signed-webhook regression tests for malformed, missing, intermediate, duplicate and known terminal statuses. Durable event replay protection, provider-state reconciliation and cryptographic per-call origin proof remain P0 blockers (issue #3). No carrier calls or public deployment.

## 2026-11-09 — Reject ambiguous signed Twilio inbound identities (PR #13 extension)
- Hardened the inbound Twilio handler to require exactly one `To`, `From`, and `CallSid` form value after signature validation, before any reservation lookup. Even correctly signed duplicate fields cannot select an ambiguous identity and consume a routing reservation.
- Added offline signed-webhook tests for identical and conflicting duplicates, missing identity fields, and the legitimate single-value private-test route.
- This is defense in depth; Twilio signatures and caller ID do not establish cryptographic per-call authorization. Paid routing stays default-deny and issue #3 remains a production blocker. No live calls or deployment.

## 2026-11-09 — Isolated integration of PRs #8, #10, #12, and #13
- Preserved merged #8's manual-only preview deployment policy and combined pending #10 SignalWire read-only preflight / hangup-only SWML, #12 expiry/idempotency semantics and #13 bounded request parsing/default-deny Twilio webhook hardening.
- Imported all distinct regression suites and reconciled backend dispatch, reservation status, package scripts, roadmap and README. The shared integration must pass a fresh CI run and manual review before merging.
- No live calls, carrier purchases, secrets, deployment or billing operations occurred.


## 2026-11-09 — Chat-first read-only SignalWire number discovery (feature PR pending)
- Added three strictly validated MCP tools for setup status, account-scoped owned-DID inventory checks and five-result US area-code candidate search. Outputs contain structured JSON intended for optional native chat cards plus text fallback; Grok Bot card rendering and even MCP interoperability are not yet verified.
- Reused the private server's SignalWire Project config; all provider requests are pinned read-only GETs with bounded responses, constrained area codes and masked Project inventory (only the authenticated active account's configured US DID can be shown). No shared-project numbers or secrets are sent to the model.
- Preserved no-Twilio read-only MCP access while existing call/reservation MCP tools remain blocked without full private-test backend configuration.
- Added offline regression coverage for auth boundaries, no-D1-write behavior, host filtering, candidate normalization, upstream errors, malformed arguments, no purchase tool and JSON/text parity. Tests and code require PR quality-gate verification and review before merge.
- No phone-number purchase, provider mutation, credentials, live calls, paid routing, payment processing or deployment were performed. Next gates: per-user provider vault, authoritative quotes and backend-verified explicit purchase approval, then cryptographic call authorization and provider reconciliation.


## 2026-11-09 — Optional standards-based read-only MCP Apps cards (PR #16 extension)
- Added a self-contained no-network HTML card resource with declared MCP Apps MIME type, resource discovery and read methods, tool metadata linking the three read-only number tools, and standard iframe initialization/notification handling. The view renders untrusted phone-number strings using textContent instead of HTML injection and shows no purchase, payment or call buttons.
- Kept complete structured JSON and text fallbacks, plus authenticated resource access. Hides call/reservation tools from discovery until the full private-test carrier environment is configured, although no paid routing is enabled by this UI.
- Added offline resource and UI-handshake regression tests, basic DOM injection-safety tests and syntax checks. CI validation and real Grok Bot host rendering remain pending; no deployment, real phone calls, numbers purchased, carrier resources modified or secrets used.

## 2026-11-09 — Local read-only stdio MCP server (branch local-mcp, not pushed)
- Added `local-mcp/`: private single-operator stdio MCP server reusing backend number tools and the MCP Apps card; four read-only tools; allowlist guard; env-only credentials with redaction; `run.sh` with optional 0600 secrets file.
- Extracted `searchNumberCandidates` from `searchAvailableNumbers` (hosted guard unchanged).
- Added `scripts/setup-local-mcp.sh`, `docs/LOCAL_MCP.md`, stdio client tests with mocked SignalWire.

## 2026-11-09 — Routing controls (branch routing-fixes, local, not pushed or deployed)
- Git-ignored private Worker config. #9: fixed-clock SQLite boundary tests; expired same-key retries now return RESERVATION_EXPIRED with terminal state.
- #3: provider_events replay ledger (migration 0001); caller proof modes dtmf_pin and capped_caller_id (owner acceptance required), default none.
- Phase 2: owner allowlist + country/premium/NANP-non-US blocking, required caps, configurable TTL, owner-only two-step approval endpoint and scripts, SignalWire-only reservation API; Twilio route requires approval when owner approval is configured.
- Phase 5: gated SignalWire connect behind both owner flags; flags-off behaviour unchanged (hangup-only, no D1). Status callbacks TODO (signing undocumented). No live calls, deploy or provider writes.



## 2026-11-09 — US-only fail-closed carrier pilot hardening (draft PR #26, not deployed)
- Reviewed earlier security findings and open parallel draft PR #25. Drafted a larger US-pilot candidate on a separate branch instead of merging overlapping, incomplete work.
- Hard-disabled legacy Twilio inbound dialing (hangup-only), closing the shared flag cross-provider exposure. Bound each DTMF PIN callback to the original reservation captured in provider_events and added replacement-reservation regression coverage.
- Added mandatory owner-only proposal review with a SHA-256 fingerprint of immutable US destination, expiry, caller proof, both recorded per-minute rates/sources and time/cost caps. A second out-of-band owner request must supply the exact digest. Carrier routing revalidates it before connect; missing migration or stale policy fails closed.
- Added conservative one-US-destination gate, a 60-second maximum outgoing connect, at most one claimed call/day and a $1 maximum **estimated** spend/day. Cost estimate reserves outbound duration and four started minutes of inbound leg overhead. These values are not verified prices or hard carrier spending caps.
- Required signed incoming segment IDs and stored the inbound segment on claim. Manual mark-ended now asks read-only SignalWire Voice Logs for terminal inbound plus one matching terminal child, reconciles their recorded charges, and refuses to release when missing/inconsistent/over budget. Carrier schema and real-world behavior are NOT verified.
- Added tracked 0002 D1 approval/segment tables, read-only migration preflight (detects partially/manual applied 0001) and a fast-forward-only main sync in local MCP setup. Added regression tests and operator checklist docs/US_PRIVATE_PILOT.md.
- All coding, CI and documentation work uses fake fixture numbers; **no deploy, switch change, actual calls, number purchases, real provider keys, Cloudflare secrets or external billing**. Full final CI and independent review still required; phase is not authorized for live calls.


## 2026-11-09 — Eliminate spoofable caller-ID-only proof from US pilot (PR #26 continuation)
- Enforced CALLER_PROOF_MODE='dtmf_pin' in the US pilot policy before any ready reservation is created. The older capped_caller_id mode remains parseable for compatibility but is non-routable in this pilot, even with CALLER_ID_TRUST_ACCEPTED=true. This prevents signed carrier webhooks and spoofable caller IDs alone from authorizing domestic forwarding.
- Updated the routing integration suite to demonstrate caller-ID mode fails closed, while signed DTMF PIN still binds a call to its reviewed reservation and rejects replay, invalid settings and exhausted daily allowance. Updated default pilot fixtures, config template and owner checklist accordingly.
- Grok Bot native DTMF support remains unverified, and unavailability of DTMF is now an explicit stop condition, not permission to fall back to caller ID.

## 2026-11-09 — PR #26 follow-ups (owner's assistant)
- Owner-only `force-unlock` for reservations stuck in `connecting`: retries carrier reconciliation, then requires `force:true` + reason, audited in new `owner_actions` (migration 0003), still counts toward the daily cap. CLI: `owner-reservation.mjs force-unlock`.
- Voice Logs reconciliation aligned with SignalWire's published fields (`id`, `to`, `direction`, `status`, `charge`, `parent_id`, `links.next`); accepts documented terminal states (`completed`/`ended`, unanswered B-leg states) and `outbound-dial`; never throws; specific lock codes; float-safe cents.
- Owner approval stored atomically (D1 batch); a stale binding for an unapproved reservation is overwritten, an approved one never is.
- Wrangler pinned at 4.159.0 in `backend/package.json`; `docs/STAGING_DEPLOY.md` owner runbook; D1 preflight now prints a migration plan and baseline SQL (0001 never scheduled twice).
- README/SIGNALWIRE docs now point carriers at `/telephony/signalwire/swml`; Twilio route documented as hangup-only.
- No deploys, secrets, carrier changes, flag changes or calls.

## 2026-11-09 — US pilot: 10-minute legs, opt-in caller-ID proof, caller-ID discovery (owner's assistant)
- Hard ceilings: 600 s per onward leg (SWML `connect.max_duration`), 4 calls/day, $1 estimated per call and per day. Inbound estimate = B-leg minutes + 3.
- `capped_caller_id` is routable in the pilot only with `CALLER_ID_TRUST_ACCEPTED=true` and `US_PILOT_ALLOW_CALLER_ID_PROOF=true`; approval fingerprint binds the trusted caller. Residual spoofing risk documented.
- Migration 0004 `inbound_call_log` + owner-only `GET /v1/owner/inbound-calls`; the flags-off SWML handler now hangs up (200) on any signed call to the DID, even with blank `TEST_CALLER_E164`, and logs its caller ID.
- D1 preflight runs Wrangler from `backend/` (fixes EACCES on `/node_modules/.cache`).

## 2026-11-09 — any_caller mode and 15-minute reservations (owner's assistant)
- Owner: Grok Bot's outbound caller ID rotates per call. New `CALLER_PROOF_MODE=any_caller`, only with `ANY_CALLER_RISK_ACCEPTED=true`; all other guards unchanged; fingerprint records `trusted_caller: "ANY"`.
- `RESERVATION_TTL_SECONDS` maximum raised from 300 to 900.

## 2026-11-10 — Victor product page and private control studio (review branch)

- Added a distinct dark product page for `agentbridge.victor.ceo`, original local
  globe and social artwork, mobile navigation, product walkthrough, studio preview,
  FAQ and explicit development status. Existing public guides remain available.
- Added `/studio/` with a clearly labeled sample mode and an authenticated,
  single-operator backend: SQLite route drafts, search/archive UI, activity,
  Simple/Guided/Advanced studio preferences and private JSON export.
- Added constant-time access-key verification, secure HttpOnly session cookies,
  same-origin write checks, bounded JSON, login throttling, SQL parameter binding,
  server-only optional MCP account credentials and bounded read-only setup checks.
- Added Railway Docker configuration, `/health`, volume privilege setup, an access
  key generator and `docs/RAILWAY_STUDIO.md`. Companion Victor change adds the tab,
  product frame and top-level direct studio link.
- The standalone Node service never loads the telephony Worker. No live route,
  access number, approval, payment, provisioning, carrier mutation or call is
  available through the new studio. Pending security PRs were not merged.
- Validation: root `npm run ci` passed (131 backend/security tests and seven
  static-site tests); `/AgentBridge` BASE_PATH build and static audit passed.
  Companion Victor: 71 tests and production build passed. Browser QA is unverified:
  supported managed browser tooling is not available in this environment.
- Railway account connection and authoritative DNS changes are still needed for
  public deployment; source implementation does not establish deployment.

- Final Docker packaging uses an explicit context allowlist and fewer build layers;
  private Worker config, runtime data and credentials cannot enter the image.

## 2026-11-11 — three visual directions for product and studio

- Created original Signal, Material and Atlas design boards from the supplied
  Swiss Futura, Sanity, Dinamo and RETINAA references. Every board contains a
  public product page, studio interior, mobile layouts, type and colour system.
- Added a studio Design boards view and a standalone `/design/` review page,
  with full-size PNG links, downloads, readable rationale and source notes.
- Preserved current product styling and backend behavior while the directions
  are compared. The boards are explicitly concepts with illustrative UI data.
- Added source/attribution and implementation notes in `DESIGN_DIRECTIONS.md`.
- Validation: `npm run ci` passed (131 backend/security tests, seven structural
  tests auditing eight pages); root and `/AgentBridge` path builds passed. All
  three original PNGs are 1536×1024. The three-page PDF and PNG archive were
  checked for page count and archive integrity. The review UI was not exercised
  in a browser in this session.

## 2026-11-11 — floating navigation and call context

- Updated Signal, Material and Atlas concepts with the supplied floating-glass
  navigation reference: persistent simulated active-call card, six AgentBridge
  destinations, compact rail, expanded rail and mobile call pill.
- Added an isolated interactive navigation preview to both design-gallery views:
  direction/appearance switching, collapse/expand, selected menu state and local
  mute/end/restart/return-to-call states. No real microphone or carrier access.
- Reused one navigation item list for the prototype and actual studio menu.
- Public advertising navigation and operational backend behavior are unchanged.
- Validation: 131 backend/security tests and seven structural tests passed;
  root and project-path builds passed. Rendered-gallery semantics passed. A
  lightweight event harness exercised compact mode, mute, menu/theme changes,
  light mode and end/restart states with zero network requests. Browser layout
  and interaction QA was not performed in this session.

## 2026-11-11 — rendered Astryx product pages and studio foundation

- Replaced the built product/studio screens with React 19 and actual Meta Astryx
  components, pinned in a separate web lockfile. The HTTP runtime remains free
  of third-party server dependencies.
- Rendered 20 direct HTML pages: five public pages, private operator entry,
  sample workspace, compatibility app entry and six matching studio/demo
  sections. The original standalone design gallery remains as a 21st page.
- Built original SVG silver connection art, quiet material cards, responsive
  layouts, dark/light appearance and the floating rail in the actual studio
  shell. Its simulated call stays above six navigation items, supports compact
  mode and mute/return/end, and becomes a call strip plus modal drawer on mobile.
- Connected real Astryx forms/dialogs to the existing authenticated draft,
  archive, settings, activity, export and read-only backend-inspection API.
  Sample drafts and call state remain in memory and make no API requests.
- Added a self-contained working HTML artifact, including page components,
  styles and archived boards, that can open directly without a server. CI
  uploads it separately from the normal static build.
- Preserved full-document navigation between public and private pages for their
  different CSP/framing policies. Studio entry exits Victor's product iframe.
- Validation: 131 backend/security tests, seven structural tests covering 21
  pages and three bundled-React DOM interaction checks pass. Root and project
  path builds/audits pass. The Node 24 Docker build and fresh-volume smoke pass:
  rendered public/demo pages, local assets, secure login, draft/preference
  persistence after restart, HTTP process UID 1000, no dependency tree/carrier
  source in the runtime and routing still disabled.
- Browser layout, animation, touch and screen-reader QA remain pending: the
  managed session exposes no browser-control tool. These are actual component
  pages, not screenshots presented as implemented UI.
- Review: [PR #34](https://github.com/premiumcentraal-boop/AgentBridge/pull/34).
  CI result: [PR quality checks](https://github.com/premiumcentraal-boop/AgentBridge/pull/34/checks).
  The Railway service and `agentbridge.victor.ceo` DNS are prepared in the
  runbook, not deployed or attached by this change. No carrier calls placed.

## 2026-11-10 — Read-only chat-first difficulty selector (feature PR, NOT calling-ready)
- Added a shared stateless `previewChatCallFlow` presenter with `simple` (default), `guided`, and `advanced` output. Difficulty only affects explanations; identical security/permission checks, independent owner approval, one-use caller proof, native call confirmation and provider spend gates remain mandatory for every level.
- Registered the preview-only tool in authenticated HTTP MCP and the existing private local read-only MCP server. The response explicitly marks `ready_to_call=false`, `routing_enabled=false`, no verified carrier rates or Grok Bot compatibility, and `preference_saved=false`. No routing, account preference storage, owner authorization, provider mutation or payment capability was added.
- Added argument-envelope, mode-invariant and invalid-input tests; included the new module in syntax checks, documented the chat-first golden path, current platform restrictions and the missing account preference/independent in-chat approval milestones. International bridge use is NOT authorized by this preview or an MCP connector; platform and carrier calling terms remain a launch gate.
- Local clone cannot resolve GitHub DNS, so full local CI and actual Grok Bot host interoperability are not verified in this commit. Keep draft, no merge or deployment without CI and manual review.
## 2026-11-10 — SignalWire inventory response byte budget (PR pending, issue #31)
- Replaced unbounded upstream response.text() with a streaming 250,000-byte cap and early reader cancellation; strict UTF-8 decode and generic malformed-response errors.
- Added offline regression coverage for chunked oversize, false Content-Length, multibyte UTF-8, malformed UTF-8, exact boundary and pagination. No provider requests or routing changes. Pending exact-head CI and human review; not deployed.


## 2026-11-10 — PR #32 CI follow-up: numeric Content-Length guard
GitHub Actions Quality gate run 42895716997 failed (123/124 Node tests passed) at `backend/test/signalwire.test.mjs:221`: the oversized declared-length response reached JSON parsing instead of the early size guard. Inspection found the regex was accidentally written `/^\\d+$/` (matching a literal backslash and `d`) rather than `/^\d+$/` (decimal digits). Corrected the regex on the existing PR branch; streaming byte enforcement remains unchanged and still bounds dishonest or absent headers. Verification of the corrected head is pending GitHub Actions. No routing, carrier resources, credentials or deployments changed.
## 2026-11-10 — PR #29 review: hardening ported, owner opt-ins kept (owner's assistant)
- Ported from #29: server-side 60-second DTMF challenge deadline using the persisted `provider_events.swml_inbound.received_at` (invalid, future or >=60 s old challenges hang up before a PIN attempt is consumed), boundary/malformed-timestamp tests, a concurrent-PIN-callback single-connection test and a mode-drift test (an approved `dtmf_pin` reservation can never be claimed after switching to `capped_caller_id`/`any_caller`).
- Not ported: removal of `any_caller`/`capped_caller_id`. The owner explicitly requires `any_caller` because Grok Bot's voice agent rotates caller ID and cannot send DTMF; both modes remain explicit opt-ins behind their risk-accepted flags, `dtmf_pin` remains the default, and the residual-risk warnings in `docs/US_PRIVATE_PILOT.md` were strengthened.
- No deploys, secrets, carrier changes, flag changes or calls.
- Added a pinned, checksum-verified gitleaks secret-scan CI job (history + working tree) and `.gitleaks.toml`, which allowlists only synthetic lowercase test idempotency keys.

## 2026-11-10 — Inventory byte cap: #32 and #33 combined (owner's assistant)
- #32's `readInventoryResponse` helper kept (chunk type check, trimmed Content-Length); #33's declared-length tests folded in (oversize rejected with zero reads and upstream cancelled; a throwing cancel stays fail-closed). #33 closed as superseded.
- #30 merged after #35/#32; preview gate text now describes the configured caller proof (DTMF PIN default; owner opt-in caller-ID/any-caller modes with documented risk).

## 2026-11-10 — PR #34 merged for v1.0.0 (owner's assistant)
- Merged main (#35, #32, #30) into the product/studio branch; root `check` now includes `chat-experience.mjs` alongside the studio files; CI keeps the gitleaks job and the working-preview artifact.
- Mobile hero: the "01 / A single conversation" caption now has a backdrop so it stays legible over the cable art.
- Known limitation: studio login throttling is keyed on the socket address, so behind Railway's proxy all clients share one 10-attempts/15-minutes bucket (a lockout nuisance, not a bypass; keys are 256-bit).
- 2026-11-11: Dockerfile no longer uses a BuildKit secret mount (Railway rejects non-cache mounts); first Railway deploy at agentbridge.up.railway.app.

## 2026-11-11 — worldwide transit animation and mobile preview

- Changed the main tagline to “connect agents worldwide” and replaced the
  homepage tube artwork with a coded 40-second SVG transit network: eight
  routes, 16 flag stations, 16 flag travellers, both directions and overpasses.
- Used smooth cubic joins, arc-length-weighted travel, station pauses, staggered
  departures and subdued track colours to give simultaneous motion a rhythm.
- Added native pause/play, reduced-motion handling, off-screen/tab-hidden
  suspension and local MIT-licensed flag vectors with preserved notices.
- Validation: 147 backend/security tests, seven structural tests over 21 pages
  and six geometry/DOM checks pass. Geometry checks cover continuous tangents,
  map bounds, country coverage and arrival/dwell timing in both directions.
- Published a private static [Sites review](https://agentbridge-worldwide.premiumcentraal.chatgpt.site) for mobile viewing, separate
  from the Railway service and real studio API. Browser visual QA remains
  pending because this session exposes no supported browser-control tool.
- This follows the merged product/studio PR #34; the worldwide hero is a new
  focused change based on the current main branch, preserving the later Railway
  Docker fix and backend work. CI result: [worldwide hero quality checks](https://github.com/premiumcentraal-boop/AgentBridge/actions?query=branch%3Afeat%2Fworldwide-transit-hero).

## 2026-11-11 — approved bold paths with flags inside endpoint circles

- Applied the user's approved Humu/Travel Lines reference: four broad flat-colour
  bands, straight runs or one rounded 90-degree turn per leg, and country flags
  inside large white circles. Flags reveal on arrival; each outgoing leg begins
  at the prior circle before the incoming band clears. The loop stays 40 seconds.
- Replaced nested SVG images with locally scoped inline flag symbols. Preserved
  the flag-icons MIT notice. Added an immediate reduced-motion still, explicit
  play override and the existing off-screen/hidden-tab suspension.
- Validation: `npm run ci` passes: 147 backend/security tests, seven structural
  checks over 21 pages and seven geometry/DOM tests. Checks cover one-turn limits,
  all-country coverage, arrival timing and connected handoffs, large circle/flag
  structure, pause/play, reduced-motion behavior and existing studio workflows.
- Inspected standalone SVG artwork stills at several timeline positions. This
  verifies artwork composition, not browser layout or touch behavior; browser
  QA remains pending because the supported browser-control tool is unavailable.
- Updating the same owner-private mobile Site, separate from Railway and its
  operator API. [PR #39](https://github.com/premiumcentraal-boop/AgentBridge/pull/39)
  and [CI result](https://github.com/premiumcentraal-boop/AgentBridge/pull/39/checks).

## 2026-11-11 — moving flag baton and exact relay handoffs

- Replaced independent routes and stationary flag circles with one closed,
  60-second relay. Every leg ends exactly where the next starts, with continuous
  tangents through the rounded corners and a matching final-to-first join.
- A single flag circle travels at the advancing line end. It briefly holds at
  each shared endpoint, changes country and continues. Line growth, the connected
  trailing edge, flag exchange and circle movement use the same score.
- Preserved pause/play, off-screen/hidden-tab suspension and reduced-motion
  handling. The reduced-motion still is sampled from the same relay geometry.
- Validation covers all handoffs, a full minute sampled at 50 ms intervals,
  the moving flag's alignment with the line end, a single connected trail,
  flag continuity, loop closure and existing studio interactions. Root CI has
  147 backend/security tests, seven structural checks over 21 pages and eight
  geometry/DOM tests.
- Inspected standalone SVG artwork at several timeline positions. Browser
  layout, native animation rendering, touch and screen-reader QA remain pending
  because the supported browser-control tool is unavailable in this session.
- The same owner-private [mobile Site](https://agentbridge-worldwide.premiumcentraal.chatgpt.site)
  is the review target. Changes remain in [PR #39](https://github.com/premiumcentraal-boop/AgentBridge/pull/39),
  with [checks](https://github.com/premiumcentraal-boop/AgentBridge/pull/39/checks).

## 2026-11-11 — restore overlapping route composition

- Restored four distinct bold routes with separate moving flag circles, covering
  all 16 countries. GB, JP, NL and CH are shared transfer stations with matching
  coordinates across routes. Each leg remains straight or has one rounded turn.
- Each flag travels at its own line's advancing end and holds at the exact next
  departure point. Completed incoming connections stay drawn until the outgoing
  leg reaches its next destination, then fade as whole connections.
- Staggered the four journeys over a 60-second cycle. At least two flag circles
  remain inside the canvas throughout the minute. Entries, exits and repeat
  transitions occur beyond the frame. Reduced motion samples these same routes.
- Geometry/DOM checks cover route count, country coverage, the connected transfer
  graph, exact handoffs, no immediate doubling back, simultaneous travellers,
  native timing alignment, off-frame repeats and existing studio interactions.
- Validation uses the root CI suite (147 backend/security tests, seven structural
  checks over 21 pages and eight geometry/DOM tests) and standalone coded SVG
  artwork samples. Browser layout, native playback and touch QA remain pending
  because the supported browser-control tool is unavailable in this session.
- Reuses the same owner-private [mobile Site](https://agentbridge-worldwide.premiumcentraal.chatgpt.site)
  and [PR #39](https://github.com/premiumcentraal-boop/AgentBridge/pull/39).

## 2026-11-11 — opposite-edge country connections and call states

- Added twelve pairings that start at opposite edges and meet at one central
  point over a 60-second score. All 16 flags appear; approaches remain straight
  or make one rounded turn. Country circles ride the line heads and dissolve
  before they overlap in the middle.
- Country lines fade after meeting. Only after they have cleared does a green
  telephone, check mark and “Call connected” appear, hold and fade away.
- Grouped each pair's lines, flags and call icon into one paint layer. Newest
  pairs paint last. Previous-cycle copies and native visibility gates preserve
  that order at the minute seam without reordering or restarting animated nodes.
- Preserved reduced-motion stills, explicit play override, pause/play and
  off-screen/hidden-tab suspension. No browser animation rendering loop added.
- Validation covers opposite edges, exact simultaneous meetings, flag clearance,
  matching native drawing/motion timing, line-before-call sequencing, fading,
  newest-on-top layering through every launch and two full minutes of repeats.
  Root CI includes 147 backend/security tests, seven structural checks over
  21 pages and eight geometry/DOM tests.
- Inspected six coded SVG artwork samples, separate from browser playback/layout
  QA. Browser playback, layout, touch and screen-reader verification remain
  pending because the supported browser-control tool is unavailable here.
- Reuses the same owner-private [mobile Site](https://agentbridge-worldwide.premiumcentraal.chatgpt.site)
  and [PR #39](https://github.com/premiumcentraal-boop/AgentBridge/pull/39).

## 2026-11-11 — accelerate into contact and remove early call icons

- Kept the country pair geometry and 60-second loop. Changed the approach to a
  continuous glide followed by acceleration over the final quarter, ending in
  contact rather than slowing to a stop before the join.
- Contact now triggers a green expanding ring, a phone pop and a drawn check
  mark as the country lines fade. The confirmation clears before the next pair
  starts. The previous call can no longer sit in the middle of a new approach;
  initial playback and the reduced-motion still also have no early call icon.
- Validation covers final velocity increase, matching transition velocities,
  native motion/stroke timing, contact-only call/pulse/check activation and
  no previous call during any approach across two full loops. Root CI includes
  147 backend/security tests, seven structural checks and nine geometry/DOM tests.
- Coded SVG artwork samples verify the contact sequence separately from browser
  playback/layout QA, which remains unavailable through the supported browser
  tools in this session. The same owner-private mobile Site and PR #39 are reused.

## 2026-11-12 — calling extensions across product pages and studio

- Added Features, International Calling, optional Recording & Transcription and
  Let me join pages, with direct studio Calls and Call Memory routes. Home and
  navigation link to the new flows; the original hero motion remains intact.
- Added international call-plan preparation/review/archive and independent
  capture, language, retention and browser/phone join preferences. Private
  records persist through authenticated same-origin studio APIs and additive
  SQLite tables. Validation rejects activation fields; saving never contacts a
  provider or enables dialing, recording, transcription or joining.
- Added a complete sample call workspace: join muted, mute/unmute yourself,
  leave while the agent continues, separate end-call control, optional capture
  acknowledgement, recording pause/resume and sample transcript controls.
- Added an original fictional 34-second stereo sample, native playback,
  transcript/speaker search, audio timestamp navigation, downloads and a clearly
  labelled demonstration outcome. Audio is bundled locally; no microphone,
  carrier callback or external transcription service is used in the preview.
- Updated the product contract for optional capture/human participation while
  preserving the audio-free default and the original conversational agent.
  Documented the live calling/media/conference integrations still required.
- Validation: `npm run ci` passes 151 backend/server tests, seven structural
  checks across 29 pages and 12 geometry/DOM tests (170 total). `ffprobe` confirms 24 kHz stereo MP3. Browser
  layout, playback and touch QA remain pending without supported browser tools.
- Reuses the same owner-private mobile Site and draft PR #39.


## 2026-11-12 — Grokbot-inspired connection-first redesign

- Applied the owner's supplied reference: monochrome grouped surfaces, system typography, expressive original state avatars, rounded controls and a complete light appearance.
- Rebuilt the public hero/task sections while preserving the tagline and the existing country-line animation in a worldwide section.
- Replaced the studio overview with a focused call/transcript hub; simplified primary navigation and added searchable Connections routes.
- Added one-tap fictional sample listening with a persistent native player, muted entry and playback-aligned optional transcript. Leaving keeps the simulated agent call going; playback errors and pending-play cancellation are handled.
- Added routing review from calls/connections. It saves an in-tab proposal without transferring or changing a carrier route. Private mode is review-only.
- Added DOM journeys for connection creation/search, routing review, cross-page playback, transcript timing and playback failures/cancellation. Browser QA remains unverified because the supported Sites browser helper is unavailable.
- Validation: `npm run ci` passes 151 backend/security checks, seven structural checks across 31 pages and 15 geometry/DOM journeys (173 total).


## 2026-11-12 — Homepage live-review feedback

- Removed the hero kicker/working-preview notice; kept connect agents worldwide and the direct conversation copy.
- Promoted Sign me up in the hero/header and added a secondary Open studio link. Added a dedicated early-access signup design preview without network collection or account-creation claims.
- Added labelled agent/business/agent dialogue to the sample and animated its waveform with reduced-motion support. Verified real-call audio remains future work.
- Replaced vague section copy with Agentic calling / Made easy, Same agent / Bigger reach and Your agent / Connected to the world. Removed the quiet-connection/Victor-project sentence; kept Grok/xAI independence.
- Validation: 151 backend/security tests, seven structural checks over 32 pages and 16 geometry/DOM journeys pass (174 total).


## 2026-11-12 — Operational studio, mobile drawer and owned-number pairing

- Replaced the centered mobile menu with a full-height left drawer, compact navigation, backdrop/Escape dismissal, scroll lock and focus restoration. Removed mute/end from navigation and added a labelled Jump in action plus clickable call cards. Ending in the call view requires confirmation.
- Removed promotional/sample-workspace banners, made studio surfaces neutral gray, and moved example-data context into Settings. The active call precedes country/number controls.
- Added Numbers and a two-number connection editor with country/flag search, owned routing-number selection, editing/removal, and preservation of legacy destination drafts.
- Added authenticated persistence and server ownership/one-destination/loop checks. Number requests are idempotent and pending; they cannot charge or create owned inventory. An operator-only SignalWire inventory import verifies an already purchased voice number before registration.
- Corrected Docker context allowlisting to include shared schemas and the import tool. No carrier routing, provider purchasing, audience, DNS or Railway deployment was activated.
- Validation: 157 backend/security checks, seven structural checks across 34 pages and 16 geometry/DOM journeys pass (180 total). Native-media and drawer tests use DOM stubs; browser layout/playback/touch QA remains unverified.

## 2026-11-11 — Transactional SignalWire claim and carrier-leg write (PR pending)
- Corrected the two-step reservation claim: the reservation update and Voice Logs segment insertion now execute inside one D1 batch transaction, with a conditional segment insert tied to the claimed reservation and call ID.
- A failed carrier-leg insert rolls back the reservation state instead of leaving an unconnected call in `connecting` and blocking the account.
- Added an offline SQLite trigger fault-injection regression proving rollback, successful retry after removing the fault, and single-use behavior after a successful claim.
- No carrier calls, routing activation, paid resources or deployment. Local Node tests and GitHub Actions remain to be verified on the exact PR head. This change does not address caller authentication, pricing verification or callback reconciliation.

## 2026-11-11 — Guard silent carrier-leg INSERT suppression (PR #37 pending)
- Extended transactional claim to insert the carrier leg first, then condition the reservation transition on a matching persisted leg. This prevents a zero-row INSERT (e.g. SQLite RAISE(IGNORE)) from leaving a reservation in connecting.
- Added deterministic offline trigger regression for silent INSERT suppression, fail-closed hangup and subsequent retry. Existing ABORT-trigger rollback regression retained.
- Pending exact-head CI and independent review; no routing flags, calls, paid resources or deployment changed.

## 2026-11-11 — Silent reservation UPDATE cleanup (PR #37 pending)
- Added a third statement to the same D1 claim batch to delete a newly inserted carrier leg when the reservation transition does not persist (including a nonthrowing SQLite RAISE(IGNORE) trigger). This avoids orphan leg rows blocking retries.
- Added an offline fault-injection regression for ignored UPDATE, hangup, no orphan leg, successful retry and single-use after retry.
- This remains a reviewable private-test reliability patch, not authorization to route paid calls. Exact-head CI and independent review pending at commit time; no calls, provider purchases, secrets, flag changes, merges or deployments.

## 2026-11-11 — Concurrent signed-callback regression (PR #37 pending)
- Added an offline 12-way Promise.all signed inbound callback regression for the transactional SignalWire reservation claim. It asserts exactly one SWML connect, all losing callbacks hang up, one persisted carrier leg, and no subsequent reuse.
- This tests the existing SQLite-backed mock's concurrent scheduling, not real distributed D1 worker contention or provider delivery ordering. Exact-head GitHub CI and independent review required; no provider calls, paid routing, purchases, merges or deployments.

## 2026-11-11 — Reservation UPDATE ABORT rollback regression (PR #37 pending)
- Added a deterministic SQLite BEFORE UPDATE RAISE(ABORT) fault-injection test for the second statement of the D1 batch: verifies hangup, unchanged ready reservation, rollback of the earlier inserted carrier leg, successful authorized retry and single-use after retry.
- The previous PR head df6070bb passed GitHub Actions quality gate run 43003476766. This new commit needs its own exact-head CI; the test was not executed locally. Distributed D1 transaction semantics and carrier behavior remain unverified. No merge, deployment, calls or routing activation.

## 2026-11-11 — Atomic SignalWire provider-event connect outcome (PR #37 pending)
- Extended the existing D1 claim batch: carrier-leg INSERT, conditional reservation UPDATE, conditional provider-event connect UPDATE, reservation reset on silently ignored event UPDATE, and orphan-leg cleanup are executed transactionally. A connect response now requires exactly one leg, reservation transition, and event transition, and no compensating reset.
- Removed the separate post-claim connect outcome writes in initial and PIN callbacks. Added offline SQLite RAISE(ABORT) and RAISE(IGNORE) fault-injection regressions for provider-event connect persistence and retry behavior on the initial callback.
- Exact-head CI, PIN-path event fault coverage, and distributed D1 semantics require verification. No merges, deployments, paid calls, routing flags or provider resources changed.

## 2026-11-11 — PIN provider-event rollback regressions (draft PR #37; not merged/deployed)
- Added two offline signed DTMF PIN callback regressions to `backend/test/signalwire-routing.test.mjs`: SQLite `RAISE(ABORT)` and `RAISE(IGNORE)` on the final `provider_events` connect outcome. Both assert hangup, ready reservation, no carrier leg, no false connect event, and successful fresh PIN challenge/retry after removing the trigger.
- These tests complement the earlier initial-inbound event fault tests. No production routing flags, provider settings, paid calls or deployment changed. Exact-commit CI and independent Cloudflare D1 transaction review remain required before merge.

## 2026-11-11 — Compound silent-write rollback guard (draft PR #37; unmerged)
- Added a final conditional SQL constraint-failure guard inside the SignalWire claim D1 batch. If the provider-event outcome is not persisted while a claimed reservation or carrier leg remains, the guard intentionally violates the reservations NOT NULL constraint, forcing transaction rollback rather than relying on an ignored compensating UPDATE.
- Added a deterministic SQLite dual-trigger regression: suppress the event connect UPDATE and the reservation reset with RAISE(IGNORE); assert hangup, reservation ready, no orphan carrier leg, no false connect outcome, and successful authorized retry after triggers are removed.
- Local test execution blocked because this environment could not resolve github.com for git clone. Exact-head CI and independent Cloudflare D1 transaction semantics remain unverified; keep draft PR unmerged and all paid routing flags off. No calls, purchases, secrets, merges or deployments.

## 2026-11-11 — PIN compound silent-write rollback regression (draft PR #37)
- Added a PIN-authenticated callback fault-injection regression with simultaneous SQLite `RAISE(IGNORE)` triggers on provider-event `connect` persistence and reservation reset. The test requires a hangup, complete transaction rollback (ready reservation, zero carrier legs, no false connect event), and successful fresh signed PIN retry after removing both triggers.
- This complements the existing initial-inbound compound-failure regression and single-fault PIN tests; it does not prove distributed Cloudflare D1 behavior.
- Commit persisted via GitHub connector; local clone/tests blocked by `Could not resolve host: github.com`. Exact-head GitHub Actions result and independent review remain outstanding. No routing flags, calls, purchases, merges or deployments.

## 2026-11-11 — Isolated PR #37 integration with current main (unverified)
- Prepared a non-merged integration tree combining main's Railway Dockerfile and append-only deployment record with PR #37's transactional SignalWire source, regressions and all prior append-only entries. Both parents retained for review; this does not merge into main or enable routing.
- CI, Cloudflare D1 batch semantics and independent security review remain required. No calls, secrets, paid resources or deployment performed.

## 2026-11-11 — SignalWire denial telemetry outage hardening (draft PR #40)
- Made denial-only provider-event outcome writes best effort: a secondary database failure while recording a rejected inbound or PIN callback must not turn a safe hangup into a 500. The `pin_requested` authorization-binding event remains a required write; successful `connect` persistence still occurs atomically in `claim()`.
- Added offline SQLite ABORT-trigger regressions for initial inbound no-reservation denial and PIN claim failure combined with denial-outcome failure, including a fresh successful PIN retry after recovery.
- Committed on the isolated PR #40 branch only. Exact-head CI and independent Cloudflare D1 validation pending; no carrier calls, routing activation, purchases, payments, merges or deployments.

## 2026-11-11 — PIN challenge persistence fail-closed (draft PR #40)
- Require the initial SignalWire PIN challenge event to transition from `received` to `pin_requested` with exactly one durable database row update before emitting a prompt. Previously a thrown write could produce HTTP 500 and a silently ignored update could issue an unusable PIN prompt.
- A thrown or zero-row challenge update now emits safe SWML hangup; no reservation claim or paid route is attempted. Added offline SQLite ABORT and IGNORE trigger regression cases, verifying no prompt, unchanged ready reservation, no carrier leg, and successful fresh challenge after recovery.
- Existing claim transaction, connection event persistence, approval gates, provider flags and default-deny routing are unchanged. Exact-head CI and independent D1 validation pending at commit time; no calls, deployments or merges.

## 2026-11-11 — SignalWire callback DB outage boundary (draft PR #40)
- Added a carrier-facing fail-closed exception boundary around both signed SignalWire callback handlers. Unexpected D1 read/write exceptions now return hangup SWML rather than an unhandled HTTP 500; existing explicit signature/body rejection responses remain unchanged. A connect still requires successful authorization and atomic claim persistence.
- Added offline regression tests for a PIN attempt counter UPDATE ABORT and an inbound approved-reservation SELECT outage. Tests assert valid hangup, unchanged ready reservation, zero carrier legs and successful fresh challenge after recovery.
- Changes are on the unmerged integration branch only. Exact-head CI and independent Cloudflare D1 verification pending at commit time. No calls, paid routing, flags, provider resources, merges or deployments.

## 2026-11-12 — PR #40: monotonic SignalWire event outcome on ambiguous commit
- Restricted denial event updates to rows still marked `received`, so a post-commit missing-metadata result cannot rewrite a durable `connect` event as `CLAIM_LOST`.
- Added an offline fault-injection regression that executes the real batch, strips response metadata, asserts safe hangup, and checks the committed `connect` event remains intact. The reservation can still remain `connecting` after an ambiguous commit; reconciliation is a separate unresolved P0 gate.
- Changes remain on draft PR #40 only. No paid routing, deployment, calls, merges, or carrier changes. Exact-head CI pending.

## 2026-11-12 — SignalWire replay-event durability (draft PR #40)
- Changed the replay-event INSERT guard to require exactly one confirmed persisted row; a nonthrowing SQLite RAISE(IGNORE) or absent D1 write metadata now fails closed instead of treating a missing replay record as fresh.
- Added offline trigger fault-injection regressions for both initial inbound and PIN callbacks, checking hangup, no carrier leg, unchanged ready reservation and fresh retry after recovery.
- This does not resolve post-commit ambiguity or validate Cloudflare D1 production semantics. Changes remain unmerged; no paid routing, calls, provider purchases, secrets or deployment. Exact-head CI pending.

## 2026-11-12 — Post-commit transport-loss regression (draft PR #40)
- Added an offline SignalWire PIN fault-injection regression where the database batch commits and its transport response throws afterward. The callback must hang up, preserve the committed `connect` event and single carrier-leg row, and deny both replay of the same PIN event and a new attempt against the stranded `connecting` reservation.
- This test establishes conservative denial behavior, **not** automatic reconciliation or proof of carrier connection. The ambiguous reservation remains locked pending verified provider-state evidence and owner-authorized recovery. Real Cloudflare D1 execution and exact-head CI remain required; no routing flags, carrier resources, calls or deployments were changed.

## 2026-11-12 — PIN carrier identity binding (draft PR #40; pending review)
- Added migration 0005 with original challenge segment ID and SHA-256 caller digest columns on the SignalWire provider-event ledger. Existing NULL challenges fail closed; do not infer identity from untrusted callbacks. No plaintext caller number is added to the event ledger.
- The initial signed inbound callback persists both identity fields before issuing a PIN challenge. Signed PIN callbacks must match the original segment and caller digest before writing a PIN replay event or consuming a PIN attempt; mismatches hang up.
- Added offline signed cross-segment/caller-drift regression with successful original-identity continuation. Actual SignalWire segment-transition semantics and Cloudflare D1 migration/transaction behavior remain unverified; do not enable paid routing or merge before review and exact-head CI.
- No calls, purchases, secrets, deployments, routing flag changes or merges.

## 2026-11-12 — PIN identity regression CI follow-up (draft PR #40)
- Exact-head Actions run 43269796633 failed 1/168 tests: the original PIN flow fixture deliberately changed the inbound caller number but the helper-generated PIN callback used the default caller. New strict carrier-identity binding correctly rejected that callback, so the expected second PIN attempt did not occur (1 vs 2 at line 82).
- Corrected the ordinary successful-flow fixture to use the same caller on both signed callbacks. The dedicated identity-drift regression still asserts mismatched caller/segment hang up before consuming attempts or creating legs.
- This is a test-only correction; no routing flags, provider configuration, paid calls or deployment changes. Recheck exact-head CI; SignalWire segment semantics and real D1 behavior remain unverified.

## 2026-11-12 — SignalWire Voice Logs outbound identity verification (draft PR, unmerged)
- Review of `fetchCarrierReconciliation()` found that the reconciler accepted a terminal outbound child log with the expected parent/destination and charges even when the outbound `from` number was absent or different from the configured bridge DID, and accepted arbitrary nonempty child IDs. This could falsely treat unrelated or malformed provider evidence as sufficient to release a connecting reservation.
- Require the child Voice Log `from` to equal the configured US bridge DID and its segment `id` to be a UUID. Add offline negative regressions for wrong/missing origin and malformed segment ID while retaining documented successful carrier-log fixtures.
- This is a conservative fail-closed change: a provider using a different legitimate outbound caller ID will now remain locked pending manual review. Provider-specific real log semantics, Cloudflare D1 reconciliation, carrier approval and actual prices remain unverified. No routing flags, calls, purchases, payments, merges or deployments changed. Exact-head CI and independent review required.


## 2026-11-12 — PR #42 exact-head CI regression follow-up (unmerged)
- GitHub Actions Quality gate run 43300486040 on c9ecf435 failed 1 of 178 Node tests: `backend/test/owner-force-unlock.test.mjs` expected successful read-only carrier reconciliation (HTTP 200) but its synthetic outbound child Voice Log omitted `from`; the stricter identity guard correctly returned a locked 409. The secret-scan job passed.
- Updated only that successful owner-reconciliation test fixture to include `from:DID`, matching the same configured bridge number required by the reconciler. Existing negative cases for absent/mismatched outbound origin remain unchanged, preserving fail-closed behavior.
- Source routing logic, paid-routing flags and manual unlock policy are unchanged. Re-run exact-head CI before claiming success; real SignalWire Voice Logs semantics and D1 behavior remain unverified. No calls, purchases, payments, merges or deployments.

## 2026-11-12 — Fail-closed Voice Logs pagination completeness (draft PR #42)
- Identified that absent or malformed `links` metadata was treated as a complete list, permitting a truncated carrier response with one expected child to unlock despite unknown additional billable legs.
- Require documented nonempty `links.self` and `links.first` fields before trusting a Voice Logs list; continue denying any `links.next` pagination. Added offline missing/malformed metadata regressions and complete-link defaults for synthetic fixtures.
- Conservative availability tradeoff: undocumented provider response shapes stay locked for owner investigation. Exact-head CI and real SignalWire response validation required. No calls, routing activation, provider resources, merges or deployment.


## 2026-11-13 — Full-page Voice Logs truncation guard (draft PR #42, unmerged)
- A Voice Logs list containing exactly 1,000 entries (the requested `page_size`) could previously pass reconciliation if the provider omitted `links.next`, despite uncertainty whether the response had been truncated at the page boundary. This could hide additional billable child legs and falsely release a connecting reservation.
- The read-only reconciler now conservatively rejects `listing.data.length >= 1000` with `INCOMPLETE_CARRIER_PAGINATION`, even when the expected child is present and no continuation link exists. Added an offline boundary regression contrasting a 1,000-entry ambiguous page against a 999-entry complete page.
- This is a narrow fail-closed improvement, **not** proof that 999-entry responses are exhaustive or that SignalWire pagination is authoritative. Bounded exhaustive pagination, provider fixtures, real carrier contract verification and independent D1 review remain pending. Exact-head CI pending at commit time; local git clone blocked by DNS. No calls, purchases, routing flags, payments, merges or deployments.

## 2026-11-13 — Ambiguous Voice Logs ledger entries (draft PR #42, unmerged)
- Found that the reconciler silently ignored malformed non-object entries and did not reject repeated Voice Log IDs. A seemingly valid single child alongside such entries could be treated as complete provider evidence despite ambiguity about additional billable legs.
- Require every returned list entry to be an object with a nonempty unique ID before unlocking; reject malformed or duplicate records with `AMBIGUOUS_CARRIER_LOG_ENTRIES`. Added negative regression cases for null, scalar, missing ID and duplicate segment IDs, plus a distinct unrelated-entry success case.
- This is an offline fail-closed defense; real SignalWire pagination/identity semantics and D1 reconciliation remain unverified. Exact-head CI pending. No paid routing, calls, purchases, secrets, merges or deployments.

## 2026-11-13 — Reject malformed falsey Voice Logs continuation cursors (draft PR #42)
- Tightened fail-closed pagination validation: only absent or explicit null `links.next` is terminal; false, zero and object cursors no longer bypass the pagination guard.
- Added offline regression inputs for these malformed cursor shapes. A non-null cursor remains untrusted and never triggers a follow-up fetch or unlock.
- Previous exact-head `f432ae2` Quality gate #43359731037 passed before this change. New commits require exact-head CI. Real SignalWire response semantics and D1 validation remain manual release gates; no calls, routing activation, deployment or merges.

## 2026-11-13 — Reject contradictory inbound Voice Logs snapshots (draft, not merged)
- Reviewed the merged SignalWire reconciler after release v1.2.0. The detail endpoint and list endpoint are fetched independently; previously, when both returned the inbound segment with conflicting direction, destination, status or charge, reconciliation could still accept the detail and one outbound child, releasing the reservation on contradictory carrier evidence.
- Added fail-closed `CONFLICTING_INBOUND_CARRIER_LOGS` when the inbound segment is present in the list but disagrees with the detail response on those security/billing fields. Added offline negative cases for each mismatch and positive cases for consistent and omitted inbound list records.
- This is a conservative offline guard, not proof of SignalWire snapshot consistency or completeness. Legitimate concurrent status changes may remain locked for owner investigation. Real provider fixtures, D1 validation, pricing and cryptographic caller authorization remain pending. No calls, paid routing, provisioning, secrets, merges or deployment were authorized.

## 2026-11-13 — Require inbound coverage in carrier listing (draft PR #49)
- Follow-up security review found that the detail endpoint could report a terminal inbound segment while the list omitted that segment entirely; a child-only listing was still sufficient to unlock. This does not prove that the list covers the relevant call or all of its legs.
- Changed reconciliation to fail closed with `INBOUND_MISSING_FROM_CARRIER_LIST` unless the list explicitly contains the inbound segment, then compare detail/list status, direction, destination and charge. Updated fixtures to include the inbound segment by default and added a deliberate omission regression case.
- Conservative behavior can retain locks during provider indexing delays; provider contract and live D1 remain unverified. Routing stays default-deny. No carrier calls, paid resources, secrets, merges or deployment.


## 2026-11-13 — Owner force-unlock regression fixture follows inbound coverage requirement (draft PR #49)
- Investigated exact-head GitHub Actions Quality gate #43386133441 on `9ae09e2`: syntax checks passed, but 191/192 Node tests passed. `backend/test/owner-force-unlock.test.mjs` expected HTTP 200 and received 409 because its mocked Voice Logs listing contained only the outbound child, violating the new fail-closed inbound-presence requirement.
- Updated the positive owner reconciliation fixture to return both the inbound segment and the outbound child. This preserves the stricter production check and read-only GET behavior rather than weakening security for a test.
- The fix requires fresh exact-head CI; real SignalWire list completeness, D1 and owner authorization remain manual verification gates. No routing enablement, calls, purchases, secrets, merges or deployment.

## 2026-11-13 — Reject nested outbound segments in carrier reconciliation (draft PR #49)
- Security review found that a single terminal direct child of the inbound segment could pass while another Voice Logs entry had `parent_id` equal to that outbound child's ID. That nested leg's charge and state were not included in the two-leg total, potentially allowing an undercounted reservation release.
- Added fail-closed `UNVERIFIED_NESTED_OUTBOUND_LEGS` for any listed descendant directly parented by the expected B-leg. Added regression fixtures for completed, in-progress and unknown-charge nested legs, plus an unrelated-parent control. This only protects against nested legs present in the returned page; incomplete provider pagination and indexing remain blockers.
- Offline CI is required on the new exact SHA. Provider semantics, live D1 and paid routing remain unverified/default-deny. No calls, purchases, secrets, merges or deployments.

## 2026-11-13 — Exact decimal carrier cost ceiling (draft PR #49)
- Found that rounding the binary-float sum of provider charges to four decimal dollar places before applying the cent ceiling can undercount fractional-cent charges. For example, $0.01 + $0.000000001 is strictly above one cent, but the previous formula returned one cent, potentially bypassing a one-cent reservation cap.
- Replaced the rounding step with exact rational decimal arithmetic derived from each finite nonnegative provider number's shortest round-trippable decimal representation. Added six regression cases including exponent notation, zero, the 0.1+0.2 float trap, and cap rejection one cent below the exact ceiling.
- Standalone arithmetic verification: Node v22.16.0, six cases passed. Full repository CI and independent SignalWire billing semantics remain pending; draft PR unmerged, paid routing default-deny. No calls, carrier resources, payments, secrets, merges or deployments.
