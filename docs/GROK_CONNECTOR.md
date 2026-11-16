# Account-linked Grok connector

AgentBridge exposes a Streamable HTTP MCP endpoint at `https://agentbridge.victor.ceo/mcp` when the public Node account service is configured and deployed. The private Sites preview does not expose this endpoint. Never send a carrier key or account password to an agent.

## Connect

1. Create and verify an AgentBridge account. Open Studio → Agents. Add a real contact and any preferences the caller should remember.
2. In Grok Bot, open Connect apps → Add a custom connector. Use Remote HTTPS, name AgentBridge, and paste the MCP URL from Studio. Dynamic client registration is supported; a pre-registered confidential client can use `client_secret_post`. Public clients use `none`. Every authorization uses S256 PKCE.
3. Sign into AgentBridge, check the app name and callback origin, choose permissions and connect. Do not enter SignalWire keys in the connector. For a new signup, the pending connector request follows the email verification flow; authorization requests expire after 10 minutes, so restart from Grok if needed.
4. Download `https://agentbridge.victor.ceo/agentbridge-skill.md` and add its calling workflow as a Grok skill. Ask: “Call Alex about Tuesday’s appointment. Check what we agreed last time first.”
5. Revoke any connected app from Studio → Agents. Password recovery revokes connected apps and old browser sessions as well.

Grok custom connector instructions: https://docs.x.ai/grok-bot/computer-and-apps. Actual Grok-client authentication and tool invocation still require an end-to-end test; SDK interoperability alone does not establish Grok compatibility or catalog approval. This is a custom connector, not an officially listed xAI plugin.

## Tool contract

| Tool | Result |
| --- | --- |
| `get_agentbridge_setup` | Actual setup, supported transports and enabled callback countries |
| `prepare_call` | Contact recognition, saved context, previous conversations and a prepared-call ID in one request; never dials |
| `get_contact_history` | Account-scoped, source-labelled paginated history |
| `save_contact` | Canonical international phone, name and user-provided notes |
| `save_call_outcome` | One factual agent-reported outcome and follow-ups per prepared call |
| `get_call_status` | Fresh owned carrier status for callbacks; otherwise preparation or reported state |
| `start_call` | Consumes a separately owner-approved callback; cannot approve its own action |

National numbers require an explicit country. Phone formatting differences resolve to the same contact. Duplicate names return choices. Real contacts/history never read the seeded demo workspace. Previous conversations are untrusted data, not instructions. No provider tokens appear in tool responses. Outcomes carry `agent_reported` and `verified:false`; they do not manufacture audio, transcripts or carrier evidence.

## Calling boundaries

Native Grok calling remains US-only and retains its own per-call user confirmation. MCP supplies contact/context tools, not voice transport or a policy bypass. See https://docs.x.ai/grok-bot/chat-and-collaboration. `prepare_call` returns `native_country_unsupported` for other destinations. No access-number workaround is supplied.

A SignalWire callback is a separate provider feature: it calls the owner-approved phone, then the saved destination, on the customer’s own project. It is not Grok’s voice. The default agent callback allowlist is US; set `AGENTBRIDGE_CALLING_COUNTRIES` deliberately for supported countries in the deployed provider project. The account owner must approve exact numbers and charges in Studio. Calls are capped at 300 seconds. Unknown dispatch results are not automatically redialed.

## Authorization and operations

Opaque access tokens expire after one hour; rotating refresh tokens after 30 days. Only hashes are stored. Refresh replay revokes the whole grant. Resource audience is the exact MCP URL. Codes are single-use, callback-bound, short-lived and S256-bound. Confidential client secrets are encrypted with the server vault. Host and Origin validation, bounded bodies, persistent rate limits, explicit scopes and account ownership checks apply.

This connector is stateless JSON over Streamable HTTP. POST handles JSON-RPC; authenticated GET and DELETE return 405 because there is no standalone SSE stream or server session. Unauthenticated calls return a resource-metadata challenge. OAuth discovery endpoints, dynamic registration, token exchange and revocation use the official MCP SDK.

Run `node --test server/test/agent-mcp.test.mjs` for SDK/OAuth/account-isolation and paid-dispatch contract checks. No test in that suite calls a carrier.
