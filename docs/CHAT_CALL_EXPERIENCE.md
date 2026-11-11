# Chat-first calling experience (preview)
> Design/implementation increment · 2026-11-10 · NOT live calling

## Desired product outcome
The user starts in their **own Grok Bot conversation**:
> "Call +44 ... with AgentBridge. Keep it simple."

Grok Bot should check account eligibility, recipient consent, carrier permission, verified rate and caps, then request any owner approval and the configured caller proof (a one-use DTMF PIN by default; the caller-ID and any-caller modes are owner opt-ins with documented residual risk, see `docs/US_PRIVATE_PILOT.md`). It should return a truthful ready/not-ready state. If the platform permits the call, **Grok Bot itself**, not AgentBridge, asks the user to approve its native call card and remains the only conversational voice. AgentBridge is an independently branded telecom relay, not an official xAI service.

**Important current restriction:** the current Grok Bot calling guide describes calls to US businesses or consenting US people, with acceptance of calling terms and a native confirmation before each call. A US access-number bridge must NOT be marketed or operated as a way to evade the platform's geographic or consent rules. No international call is authorized until applicable platform/provider terms and actual host compatibility are confirmed. Source: https://docs.x.ai/grok-bot/chat-and-collaboration

## One-time choice in chat: how much guidance?
| Difficulty | User sees | Still mandatory |
|---|---|---|
| **Simple** (default) | One short readiness summary, cost ceiling, next required approval | All security/consent/price/policy checks, owner proof, and native call confirmation |
| **Guided** | The same checks explained step by step | Exactly the same checks |
| **Advanced** | Full route decision, rates and proof evidence, cap/TTL state, troubleshooting | Exactly the same checks |

A conversational command like "Make it simpler" selects `simple` for the next preview; "Explain everything" selects `advanced`. The current implementation is **stateless**: the Grok Bot host may pass `difficulty` on each request, but AgentBridge does **not** save it, and cannot promise it will persist across chats.

## Implemented in this increment (non-calling)
The authenticated HTTP MCP prototype and the private local read-only MCP adapter now expose:
- `preview_chat_call_flow({difficulty?: "simple" | "guided" | "advanced"})`.
- The shared pure presenter returns a structured, explicit **preview-only** plan and an example prompt. Text fallback works in hosts without structured-card rendering.
- The result always declares `ready_to_call:false`, `routing_enabled:false`, `preference_saved:false` and that carrier rates, international compatibility, and authorization have **not** been verified.
- Every difficulty has the same mandatory safeguards. No amount of "simple", "automatic" or model tool calling substitutes for authenticated owner approval, secure caller proof, a real quote, or a native user decision.
- The local MCP tool does not write accounts, reserve a number, access billing or place a call. It remains read-only.

This feature is **not** a working chat-based phone call and does **not** change PR #29 or the separate SignalWire routing flags. No additional AI voice, credentials in chat, payment action, or carrier forwarding.

## Target natural chat flow (future; requires explicit approvals)
1. **User:** "Call this business in London. Use Simple mode."
2. **Grok Bot:** Checks platform terms, bridge availability, consent and destination. If disallowed, explains why and stops.
3. **AgentBridge authenticated service:** Checks verified carrier rate, DID ownership, budgets, fraud policy, duration and country restrictions; prepares a short-lived reservation only after the safety gates are satisfied.
4. **Grok Bot:** "This is the exact destination. Maximum charge: [verified ceiling]. Approve?" No invented quotes or balance.
5. **Owner approval:** Separate authenticated, phishing-resistant owner action bound to reservation ID, amount and destination. It may be visually presented inside Grok Bot **only if** that host can guarantee an independent user-authenticated confirmation. The agent's MCP token and chat reply cannot self-approve.
6. **Caller authentication:** Carrier-verified origin or an approved, short-lived challenge for the *actual inbound call*. **Native Grok Bot DTMF support is unverified**; if unavailable, do not bypass proof.
7. **Grok Bot:** User approves Grok Bot's native **Call** card; only then may Grok Bot initiate the permitted US access-number call. AgentBridge relays telecom audio without another conversational AI.
8. **Status/receipt:** Only report carrier-verified outcome and spend; uncertainty must say "pending reconciliation" and preserve the reservation lock.

## Engineering milestones still blocked
1. Verify Grok Bot terms and actual call/DTMF behavior with the platform owner before promising an international bridge; do not use an access number to work around restrictions.
2. Add authenticated, owner-scoped durable `call_experience_difficulty` preference to a proper account service with `GET/PUT` permissions. This is a *presentation preference only*, never a security setting. Chat can modify it after account authentication; default `simple`.
3. Provide a narrowly scoped remote MCP workflow to check account and permitted destination, a provider-verified quote, and a user-approved reservation, with idempotency and fail-closed error states.
4. Integrate owner approval with an independently authenticated challenge. If the host can't furnish secure in-chat approval, link to a one-tap owner approval page instead.
5. Prove independent inbound call authentication (not spoofable caller ID) and hard provider-side cost ceilings before testing a consenting permitted call.
6. Only after all gates: test legitimate native Grok Bot call-card invocation and provider reconciliation; avoid silent dialing.

## Acceptance criteria for full user experience
- New eligible user can request a call in one natural-language message; no editing forwarding rules, carrier keys or raw E.164 fields.
- A single glance shows destination, **verified** max price and one next action; Simple never hides material consent/cost information.
- Changing chat difficulty never alters auth, provider permissions, budget or approval decisions. It may only change the amount of explanation.
- Blocking states are concise and actionable: account not connected, platform disallowed, price unverified, owner approval missing, PIN unsupported, rate cap exceeded, bridge busy or carrier outcome unresolved.
- Credentials, owner tokens and PIN secrets are never put in a public URL or echoed by a model tool; owner decision must be independent of agent credentials.
- All claims are based on measured interoperability and provider/carrier records, not product assumptions.

## External evidence
- Grok Bot chat and native call controls: https://docs.x.ai/grok-bot/chat-and-collaboration
- Grok Bot custom tool overview: https://docs.x.ai/grok-bot/overview
- Grok remote MCP tooling (different surface from Grok Bot; do not assume equivalent support): https://docs.x.ai/developers/tools/remote-mcp
