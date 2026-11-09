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

## 2026-11-09 — MCP request validation hardening (review pending)
- Inspected North Star, roadmap, log, README, main backend/tests and open PRs #2 and #4 plus issues #1 and #3.
- Added a standalone strict JSON-RPC 2.0 envelope validator and integrated it before MCP tool dispatch.
- Malformed batches/scalars, missing or invalid IDs, incorrect protocol versions, unknown methods/tools, malformed tool arguments and unexpected arguments are now rejected before any call reservation or cancellation.
- Added dedicated Node regression tests for accepted and denied requests.
- Independent of open inbound caller security PR #2 and website quality PR #4; no telephony routing, pricing, carrier integration or public site changes.
- Verification limitation: attempted `git clone` and `npm run ci` locally, but DNS resolution of github.com failed before cloning; CI results must be checked before merge.
- No real calls, provider secrets, public deployment, payments or merges.
