# AgentBridge local stdio MCP server (private, read-only)

A command-based MCP server for one operator's personal use inside a chat host
(e.g. Grok Bot). No Cloudflare Worker, D1, Twilio or public endpoint is needed
for read-only number management. The chat host stays the **only** AI; this
server contains no language model.

It reuses the backend code directly:
`backend/src/chat-number-tools.mjs` (`getBridgeSetup`, `listMyNumbers`,
`searchNumberCandidates`), `backend/src/signalwire.mjs`
(`inspectSignalWireNumbers`, `validateConnection`) and
`backend/src/chat-card.mjs` (MCP Apps number card). It never imports the hosted
Worker (`backend/src/index.mjs`), so reservations, Twilio/SWML routing and the
offline `signalWireConnectPlan` are unreachable.

## Tools (all `readOnlyHint: true`)

| Tool | Args | Provider calls |
| --- | --- | --- |
| `get_bridge_setup` | none | none: reports set/missing per variable, never values |
| `list_my_numbers` | none | 1 GET: is `US_BRIDGE_DID` a voice number in the Project? |
| `list_project_numbers` | none | 1 GET: voice-capable numbers in the Project (first 100) |
| `search_available_numbers` | `area_code` (3 digits) | 1 GET: up to 5 local voice candidates, no price |

Not exposed (guarded by an allowlist and tests): `prepare_international_call`,
`get_call_status`, `cancel_international_call`, and any purchase, call,
message, forwarding or webhook change.

Every result has a plain-text summary (`content[0]`), the JSON (`content[1]`)
and, on success, `structuredContent`. `get_bridge_setup`, `list_my_numbers`
and `search_available_numbers` carry `_meta.ui.resourceUri =
ui://agentbridge/number-card`; the server serves that MCP Apps resource
(`text/html;profile=mcp-app`). Hosts without MCP Apps support use the text.

## Configuration (environment only)

- `SIGNALWIRE_SPACE`: Space subdomain only (`example` for `example.signalwire.com`)
- `SIGNALWIRE_PROJECT_ID`: Project UUID
- `SIGNALWIRE_API_TOKEN`: Project API token, scoped to **Numbers**
- `US_BRIDGE_DID` (optional): your US number in E.164 form, for `list_my_numbers`

Supply them through the MCP host's secret/env settings, or put them in a
private `~/.config/agentbridge/signalwire.env` (`chmod 600`, `KEY=value` lines).
`run.sh` reads only these four keys from that file and refuses files that are
not owner-only. Never paste tokens into chat, commits or command-line arguments.

## Register

- command: `/workspace/AgentBridge/local-mcp/run.sh` (no args), cwd `/workspace/AgentBridge/local-mcp`
- or command: `/workspace/.tools/node22/bin/node`, args `["/workspace/AgentBridge/local-mcp/server.mjs"]` with the variables in `env`

## Rebuild / test

```bash
bash /workspace/AgentBridge/scripts/setup-local-mcp.sh    # idempotent: Node 22, npm ci, full tests, smoke
npm run test:local-mcp                                     # stdio client tests with mocked SignalWire
node local-mcp/scripts/smoke-client.mjs [--live]           # real stdio client; --live does one inventory GET
```

## Limits

Single-operator only (no per-user vault or auth). The provider inventory reads
only the first page. Search accepts only area codes. Results are not prices,
holds or ownership proof. Rendering of the MCP Apps card depends on the host.
