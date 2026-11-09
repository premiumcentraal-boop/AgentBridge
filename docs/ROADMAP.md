# AgentBridge development roadmap
Last revised: 2026-11-08. Read [NORTH_STAR.md](NORTH_STAR.md) first.

## P0 — Design and safe technical foundation
- [x] Public home page with truthful positioning and independent-brand disclosure
- [x] How it works, Pricing, Connect, Docs and Console preview pages
- [x] Responsive design foundation, keyboard navigation and reduced-motion styles
- [x] Interactive destination validator and cost-estimate preview without real calls
- [x] D1 reservation schema and fail-closed API / MCP prototype
- [x] Twilio webhook signature check and one-time reservation consumption
- [x] Node tests for validation, signing and destination restrictions
- [x] Hourly CI quality pulse and development protocol
- [ ] Run actual GitHub Actions and validate all checks
- [x] Automated static link, label, landmark and project-path audit (GitHub PR #4 quality gate passed)
- [ ] Browser accessibility audit across mobile and desktop; resolve contrast/keyboard issues
- [x] Offline-first system fonts, six-page CSP, Cloudflare headers and static policy regression tests (PR #6)
- [ ] Real browser screenshots and visual quality checks
- [x] Strict MCP JSON-RPC envelope and tool argument validation (PR #5; branch CI passed before merge)
- [ ] Structured errors, trace IDs and webhook idempotent event ledger
- [ ] Carrier-verified caller authentication or per-call challenge before any public routing (caller ID alone is spoofable)

## P1 — Real authorized call, still private
- [ ] Create and verify a personal test telecom account
- [ ] Provision one US DID and one preapproved consenting international test destination
- [ ] Confirm actual dial-out cost and allowed routing/caller-ID configuration
- [ ] Validate Grok Bot can dial this US number under its applicable rules
- [ ] Test end-to-end audio with explicit approval, document real outcome
- [ ] Set hard per-call cost ceiling in carrier account
- [ ] Detect hanging/missing callbacks and reconcile with provider records

## P2 — Private pilot and account system
- [ ] Review telecom reseller permissions, call consent, privacy, geographic restrictions
- [ ] True customer authentication with scoped/rotatable MCP tokens
- [ ] Provision and assign DIDs with provider event reconciliation
- [ ] Store exact provider quotes; do not use guessed pricing
- [ ] Prepaid ledger, atomic budget reservations and post-call settlement
- [ ] Country-specific premium-rate denial and destination risk scoring
- [ ] Multi-tenant observability and 24/7 fraud alerts
- [ ] Human support and incident response; deletion/retention controls

## P3 — Public beta
- [ ] Self-service account creation, KYC if required, secure payments, refunds and invoices
- [ ] Per-region verified live destination list and route status
- [ ] Mobile onboarding test with five new users
- [ ] Operational SLAs, synthetic monitor and meaningful uptime reporting
- [ ] A11y and performance budgets with continuous checks

## Prioritization rules
Safety > correctness > connection reliability > onboarding clarity > performance > visual polish > growth features.
Never auto-merge production-risk changes. Do not falsely mark a task complete without proof.
