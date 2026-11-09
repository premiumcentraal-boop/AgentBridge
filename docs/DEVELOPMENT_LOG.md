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

## 2026-11-09 — Bounded Twilio webhook streaming (PR pending)
- Replaced unbounded `request.text()` in Twilio incoming and dial-complete endpoints with a shared byte-limited streaming reader (16,000 bytes). Rejects malformed content lengths, invalid UTF-8 and chunked oversize bodies before signature verification or database access; cancels unread streams.
- Added Node regression tests for exact byte boundary, split UTF-8, early stream cancellation, invalid content lengths, signed inbound compatibility and oversize webhook denial. Added module syntax checking to CI.
- Existing Twilio HMAC signature validation and fail-closed private-test caller gate remain unchanged. No changes to live carrier resources, public deployment or charges. Caller ID spoofing and durable replay protection remain unresolved (issue #3).

## 2026-11-09 — Bound authenticated MCP and REST request bodies (PR #13 follow-up)
- Source review found that `parseJson()` used unbounded `request.text()` before checking its 4096-character limit; authenticated clients could stream oversized or multi-byte bodies into Worker memory.
- Reused PR #13's bounded byte-stream reader with a 4096-byte limit for REST reservations and MCP JSON-RPC. Malformed UTF-8, misleading content lengths and oversize requests fail before tool dispatch or reservation mutations; authentication remains first.
- Tightened the JSON content-type check to a media type boundary rather than substring matching. Added Node regression tests for chunked oversize, malformed UTF-8, misleading content types, valid split-chunk MCP ping, and unauthorized requests.
- No live calls, secrets, billing, deployments or carrier changes. Pending CI and review; replay-resistant per-call authorization remains blocked by issue #3.
