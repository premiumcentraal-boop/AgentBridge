# Chat-first AgentBridge number discovery (private developer preview)

**Goal:** A user asks an existing chat agent to show setup, verify their assigned number, or look for a US number by area code. AgentBridge returns one small, truthful result that a compatible host may present as a card. The same JSON is available as text for clients without structured-card support. **This is not purchasing, billing, call-routing or a verified native Grok Bot integration.**

## Three read-only tools exposed via authenticated POST /mcp

| Tool | Input | Observable result | Side effects |
| --- | --- | --- | --- |
| **get_bridge_setup** | Empty object or omitted arguments | Assigned DID, unverified provider configuration, next step | No provider request, no D1 writes |
| **list_my_numbers** | Empty object or omitted arguments | One matching voice-capable DID from SignalWire Project inventory, or explicit unconfirmed/partial state | At most one read-only provider GET |
| **search_available_numbers** | An object containing area_code (three US digits) | Up to five current local voice-number candidates; no prices | At most one read-only provider GET |

All three are non-purchasing and non-routing. MCP tool metadata marks them read-only. Every successful tool result includes the same JSON in both **result.structuredContent** and **result.content[0].text**. The card_type values are **bridge_setup**, **owned_number**, **number_choices** or **number_error**. AgentBridge also serves a self-contained **MCP Apps** resource at ui://agentbridge/number-card, with the standard text/html;profile=mcp-app MIME type and tool linkage through _meta.ui.resourceUri. The iframe uses the ui/initialize handshake, renders with safe text-only DOM operations and makes no network requests. **Whether Grok Bot supports and displays this MCP Apps UI remains unverified.**

## Example user interactions

**User:** “Show me my AgentBridge setup.”

**Agent:** Calls **get_bridge_setup** with empty arguments. The response shows only the DID assigned to this authenticated account if it matches the configured private bridge, and distinguishes credentials configured from number ownership verified.

**User:** “Check the US number I already have.”

**Agent:** Calls **list_my_numbers** with empty arguments. The provider inventory lookup is filtered using the **server-side account DID**, never a number provided by the model. A matching voice-capable number is a **Project inventory match**, not proof of a personal/customer provider relationship. An incomplete paginated result is explicitly unconfirmed.

**User:** “Find US numbers in the 618 area code.”

**Agent:** Calls **search_available_numbers** with area_code set to 618. Results are current local voice-number candidates, not owned or reserved. Price is null; purchase and routing remain disabled. No purchase is offered without an approved provider quote and authorization flow.

## Private operator setup

- Store an AgentBridge bearer-token hash and account-to-DID assignment in the D1 accounts table, per README. A customer token belongs in a private MCP client connection, not ordinary chat text.
- Set US_BRIDGE_DID to the assigned US number and bind D1. Read-only MCP number tools do **not** require a Twilio auth token or paid routing configuration.
- For provider inventory, privately configure SIGNALWIRE_SPACE, SIGNALWIRE_PROJECT_ID, and SIGNALWIRE_API_TOKEN. Use a **Numbers**-scoped SignalWire Project token in the host secret manager. Never expose it to the chat model, UI card, source code, or public website.
- The provider read guard requires an **active** authenticated account whose D1 DID exactly matches US_BRIDGE_DID. Other Project numbers are never exposed by list_my_numbers. This is a **single-operator-Project** prototype. Multi-tenant user-owned provider credentials and a per-customer vault do not exist yet.
- Provider reads use pinned HTTPS SignalWire hosts, GET only, redirect rejection, strict area-code validation, and capped response bodies. Provider errors are sanitized. These tools cannot call any carrier purchase, DID update, SWML connect, or payment endpoint.

## Proposed minimal card contracts

**Setup:** card_type, mode, provider_connection, bridge_number, number_ownership, next_step, purchasing/routing/Grok-verification flags.

**Owned number:** state, numbers (at most the account-assigned DID), next_step, purchase/routing flags.

**Number candidates:** area_code, numbers (at most five, each with price null), price_verified false, purchase_enabled false, next_step.

An MCP Apps-compatible host may display the read-only card using resources/list and resources/read; other hosts receive the identical plain JSON text. The UI has no purchase, payment or call buttons. Do not treat displayed card information as an authorization or provider quote.

## Mandatory future gates before chat-based buying or forwarding

1. Per-user SignalWire Project association, protected server-side credential vault, scoped customer authentication, rotation and revocation. Never collect provider tokens in ordinary AI chat.
2. Authoritative carrier price quotation, recurring cost and applicable taxes, regulatory and emergency-service checks, and a short-lived server-signed proposal bound to the exact account, number and maximum amount.
3. Explicit human approval independently enforced by AgentBridge's backend. Reject replay, duplicate clicks, concurrent orders and stale quotes; reconcile final carrier purchase state.
4. Cryptographic per-call authorization, verified destination rate, spending and duration ceilings, replay-resistant callbacks and provider-state reconciliation before enabling forwarding. **Caller ID is not proof of caller identity.**
5. Real interoperability testing of Grok Bot's custom MCP connector and its actual card capabilities. The examples here are API-level design goals, not Grok Bot integration evidence.

## Verification

Run **npm run ci** with Node 22+. The chat-number-tools and chat-card regression suites exercise scoped inventory filtering, pinned GET endpoints, rejected malformed inputs, lack of purchase tools, no Twilio prerequisite for read-only MCP, sanitized errors, structured content, resource discovery, the MCP Apps handshake and injection-safe text rendering. The existing default-deny Twilio and hangup-only SignalWire tests remain active.

References: SignalWire owned-number listing at https://signalwire.com/docs/apis/rest/phone-numbers/list-phone-numbers ; SignalWire available-number search at https://signalwire.com/docs/apis/rest/phone-numbers/search-available-phone-numbers ; Grok custom connectors at https://docs.x.ai/grok/connectors ; MCP tools at https://modelcontextprotocol.io/specification/2025-06-18/server/tools .
