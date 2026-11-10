# AgentBridge development roadmap
Last revised: 2026-11-09. Read [NORTH_STAR.md](NORTH_STAR.md) first.

## P0 — Design and safe technical foundation
- [x] Public home page with truthful positioning and independent-brand disclosure
- [x] How it works, Pricing, Connect, Docs and Console preview pages
- [x] Responsive design foundation, keyboard navigation and reduced-motion styles
- [x] Interactive destination validator and cost-estimate preview without real calls
- [x] D1 reservation schema and fail-closed API / MCP prototype
- [x] Twilio webhook signature check and one-time reservation consumption
- [x] Node tests for validation, signing and destination restrictions
- [x] Hourly CI quality pulse and development protocol
- [x] GitHub Actions full combined quality gate verified on PR #15 (2026-11-09)
- [x] Gate GitHub Pages preview deployment behind manual workflow dispatch (merged PR #8; enabling Pages remains separate)
- [x] Automated static link, label, landmark and project-path audit (GitHub PR #4 quality gate passed)
- [ ] Browser accessibility audit across mobile and desktop; resolve contrast/keyboard issues
- [x] Offline-first system fonts, six-page CSP, Cloudflare headers and static policy regression tests (PR #6)
- [ ] Real browser screenshots and visual quality checks
- [x] Strict MCP JSON-RPC envelope and tool argument validation (PR #5; branch CI passed before merge)
- [x] SignalWire BYO read-only number inventory, signed SWML fail-closed webhook with streaming byte cap and strict UTF-8 validation, offline phone bridge serializer and regression tests (proposed; **paid routing disabled**)
- [x] MCP read-only chat-number cards: truthful setup, scoped SignalWire DID check, five-candidate lookup and optional MCP Apps resource (PR under review; host compatibility unverified, not deployed, no purchases)
- [ ] Provider-linked multi-user onboarding, exact number quotes, signed one-use chat purchase approvals and carrier purchase reconciliation
- [ ] Secure multi-user SignalWire project credentials, DID ownership, cryptographic call authorization, verified quotes/billing and reliable carrier callbacks
- [x] Strict reservation expiry boundaries and terminal idempotent retries; no stale access number after expiry (PR pending)
- [x] Bound both Twilio webhook bodies to 16,000 bytes before signature verification, with strict UTF-8 and streamed oversize rejection (PR pending)
- [x] Byte-bound authenticated MCP/REST JSON request parsing (4 KiB) with early stream cancellation, strict UTF-8 and no reservation writes on malformed bodies (PR #13)
- [x] Default-deny Twilio international leg unless an explicit server-side private-test opt-in is present (PR #13 extension; test-only, not production authentication)
- [x] Fail closed on malformed, unknown, nonterminal or ambiguous Twilio Dial completion statuses; preserve connecting lock (PR #13, pending review)
- [x] Reject signed Twilio inbound requests with duplicate or missing `To`, `From`, or `CallSid` before reservation lookup (PR #13, pending review)
- [ ] Structured errors, trace IDs and webhook idempotent event ledger (ledger + SignalWire replay guard done on branch routing-fixes; trace IDs pending)
- [ ] Carrier-verified caller authentication or per-call challenge before any public routing (caller ID alone is spoofable) — DTMF PIN challenge implemented offline on routing-fixes; Grok Bot DTMF support unverified

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


## US-only first private pilot — draft PR #26 (not merged or deployed)
- [x] *Implemented on draft branch, awaiting review*: retire Twilio carrier dialing; original-reservation-bound PIN; immutable owner-review digest; US-only 60-second/one-per-day caps; both-leg estimate; carrier-log-constrained completion; read-only D1 migration preflight.
- [ ] Confirm final CI on exact feature branch head and independent code/security review before merging.
- [ ] Manually verify real US carrier rate for both legs and obtain satisfactory hard financial exposure controls before any chargeable call.
- [ ] Apply D1 schema/migrations manually after backup, baseline tracking checks, and explicit owner approval.
- [ ] Confirm Trial Mode calling eligibility, current SignalWire Voice Logs segment/parent fields, and Grok Bot native DTMF support.
- [ ] Owner-authorized **routing-OFF** staged Worker configuration, secure token scopes, and signed hangup-only tests.
- [ ] Explicit separate owner authorization for one consenting US-to-US call, then reconcile real provider charges and disable routing again.
