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
