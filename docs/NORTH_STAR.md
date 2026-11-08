# AgentBridge — North Star
> Version 1.0 · 8 November 2026 · Canonical product and engineering contract

## The promise
**Your agent. Every number. One natural conversation.**

AgentBridge is the invisible international telephone bridge for AI agents that already have a US outbound-calling feature. When a user asks Grok Bot to call a permitted international number, AgentBridge prepares a temporary route to that number and returns a US access number. **Grok Bot remains the sole speaking agent.** AgentBridge never substitutes a voice agent, transcribes conversations, impersonates users or pretends to be an official Grok/xAI product.

## The product in one sentence
"Ask Grok Bot to call abroad; AgentBridge quietly connects the line."

## Product truths (non-negotiable)
1. **Never another AI on the call.** The telecom carrier forwards audio; no new conversational agent is introduced.
2. **Fastest understandable path.** Connect once, approve each call, and let Grok Bot use a single `prepare_international_call` tool. The user never edits forwarding rules or dials PIN menus.
3. **Apple-like craftsmanship, not imitation.** Editorial whitespace, confident type, gentle depth, precise copy, restrained animation, superb mobile layouts, and small one-idea screens. No false official affiliation with Apple, Grok Bot, Cursor or xAI.
4. **Trustworthy claims.** Distinguish demo, configured, and live. Do not fake balance, successful calls, prices, coverage, uptime or integration status.
5. **Security by design.** All telecom secrets server-side. Server-authenticated account ownership; request validation; per-account spend, country and duration limits; one active reservation per assigned DID; atomic reservation consumption; provider webhook verification; abuse monitoring; no open forwarding.
6. **Privacy by default.** No conversation audio or transcription passes through the AgentBridge app. Store minimum necessary call metadata, separate from conversation content. Explain carrier metadata, billing, retention, and lawful processing.
7. **Real compatibility validation.** US outbound availability on a Grok Bot subscription, bridge access-number reachability, and permissibility under platform/carrier terms must be confirmed before claiming integration works end-to-end.
8. **Graceful failure.** Failed carrier setups never show "ready". Expired reservations cannot connect. Users receive actionable retry states without exposing keys.
9. **Explain money before dialing.** Destination quote and maximum possible amount before a chargeable call; no misleading unlimited plans.
10. **Accessible and international.** WCAG 2.2 AA target; keyboard-first, reduced-motion support, screen-reader labels, responsive layouts, E.164 destination normalization and internationalization-ready copy.

## Experience blueprint
### Public website
- **Home:** clear 6-word proposition, visual flow "Grok Bot → US bridge → International number," focused primary CTA, trust explanation and short FAQs.
- **How it works:** three tiny steps: connect, request, talk. Honest compatibility requirements.
- **Pricing:** monthly access-number cost + transparent pay-as-you-go international termination, with an illustrative estimator explicitly marked estimates.
- **Integrations:** Grok Bot-first MCP instructions; generic agents later. No unsupported one-click linking claims.
- **Docs:** 5-minute quick start, REST/MCP method contracts, error handling, provider limits, security notes.
- **Console:** beautiful onboarding, bridge status, destination preparation, pending/expired/connected call states, call history, spending caps. Never pretend a simulation is a live route.

### Golden path
1. User creates an account and passes any necessary carrier/payment verification.
2. An available US access number is assigned to the account and activated by an authorized provider.
3. User connects AgentBridge as a remote MCP server using a narrowly scoped token.
4. User asks Grok Bot to call an international number.
5. AgentBridge validates destination/country permissions, balance or spending limit, concurrent reservation state, and carrier capabilities.
6. AgentBridge creates an expiring one-time routing reservation and returns US DID, masked destination, expiration, price estimate and safety confirmation.
7. User explicitly approves Grok Bot's native outbound call.
8. Carrier webhook verifies authenticity and atomically claims the reservation. The telecom provider connects the two legs; the **same Grok Bot conversation** continues.
9. Call completes or times out. AgentBridge records accurate provider outcome and cost. Any over/under-estimates are reconciled against carrier records.

## Design language
- Palette: luminous porcelain, charcoal ink, electric cobalt, glacial sky, subtle mint success. Premium light surface with generous spacing.
- Typography: system sans, large responsive headings, carefully tuned tracking. Accessible contrast; microcopy in straightforward English.
- Patterns: pill buttons; rounded 18–28px cards; 1px borders; focused content width; clean steps and segmented panels; micro-animations under 250ms (respect reduced motion).
- Information architecture: one primary decision per section, progressive disclosure. Never bury limitations in footnotes.
- Visual voice: calm competence, not crypto dashboard noise.
- Every screen answers: "Where am I? What can I do? What happens next? Is this real or a preview?"

## Engineering architecture
- Frontend: fast, responsive pages; semantic HTML; robust loading, error, empty and success states.
- Control plane: authenticated account API; remote MCP interface; rate-quote service; bridge reservations; audited transitions; deterministic idempotency keys.
- Data: durable relational store for accounts, DID assignments, reservations, provider events and usage ledger. Database-enforced uniqueness, indexes and retention.
- Telephony: modular provider adapter. First implementation can use Twilio inbound TwiML forwarding as proof of concept; compare Telnyx, SignalWire and VoIP.ms for live pricing, international destination approval and lawful resale.
- Security: provider signature + replay controls; least-privilege tokens; secrets management; webhooks idempotency; strict allowlists; no dialling premium/short/emergency destinations via the bridge.
- Reliability: explicit state machine, retries with exponential backoff for safe operations, dead-letter alerts, request IDs, metrics and an incident runbook. Telephony tests must use consenting test contacts.
- Deployment: CI with lint/test/typecheck/build; controlled staging; production gated on security and regulatory sign-off.

## Status vocabulary
- **Preview:** UI or example calculation with no actual call placed.
- **Configured:** required secrets, provider settings and DID assignment exist; not a verified successful call.
- **Verified:** a consent-based end-to-end international call succeeded under current policy.
Never label a service "live" merely because UI renders.

## Initial release boundaries
**In scope:** premium responsive website, Grok-first integration information, read-only preview console, API/MCP contract, hardened reservation prototype, signed carrier webhook handling, CI and reproducible deployment instructions.

**Not yet production ready:** open consumer signup, payment vault, KYC, automated DID purchasing, public carrier activation, regulatory review, dynamic rate quotes, user-authentication UX, full usage reconciliation, real Grok Bot compatibility test, 24/7 operations. Do not collect payment or advertise worldwide live coverage until these are implemented and verified.

## Acceptance criteria
- Desktop and mobile fit without horizontal overflow; keyboard and reduced-motion accessibility.
- New visitor understands product in under 10 seconds.
- Site has visible functional navigation and interactive preview; preview never initiates a real call.
- Tests cover phone validation, session expiry, replay rejection, XML escaping, and authorization boundaries.
- No open proxy/forwarder, hardcoded keys, or unauthenticated expensive endpoints.
- Every production transition requires explicit evidence: carrier approval, verified call, rates, and legal compliance.

## Release roadmap
**P0 · Foundation (now):** site identity, product pages, North Star, developer docs, secure backend contract, tests, CI.
**P1 · Verified one-call test:** provider account + assigned US DID, native Grok Bot live call, Dutch/UK destination, quote and caller-id testing; record findings.
**P2 · Private pilot:** auth, customer onboarding, persisted DID ownership, billing ledger, rate engine, customer caps, abuse monitoring.
**P3 · Public beta:** self-serve signup, payments, verified international routes, support and incident tooling.
**P4 · Expansion:** multiple carriers, intelligent routing and fallback, advanced multi-agent connectors, accessibility localization.

## Hourly development protocol
Every hour, improve **one** smallest valuable, testable item from this North Star or `docs/ROADMAP.md`. Read repository state before changing anything. Prefer fixes to onboarding truthfulness, security, call-routing reliability, accessibility and automated testing before cosmetic changes. Work on a dedicated branch and raise a PR; never auto-merge, deploy or charge real money. Run tests and document what was verified. If blocked, create a precise issue with reproduction and acceptance criteria. Maintain an append-only progress log in `docs/DEVELOPMENT_LOG.md`. No two consecutive hours may duplicate work.

## Decision register
- D-001: AgentBridge is telecom routing, **not** AI voice.
- D-002: Grok-first UX; model-agnostic MCP contract.
- D-003: Verify outbound policy and terms rather than promise bypass of regional restrictions.
- D-004: Default deny all expensive routes until verified.
- D-005: Preview UI allowed publicly; real calls require authorized server-side deployment.
