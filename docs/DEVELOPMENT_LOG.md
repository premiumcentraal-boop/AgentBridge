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
