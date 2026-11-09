# Local read-only MCP on an operator-controlled computer

**Status:** private developer preview. This is a command-launched **stdio MCP server**, not a public endpoint or a verified Grok Bot connector. It reuses AgentBridge's existing read-only SignalWire number tools; it never calls a routing, provisioning, purchasing, billing or telephony endpoint.

## Requirements

- Node.js 22+; clone this repository on a computer you control.
- A compatible MCP host that supports command-launched stdio servers. **Whether Grok Bot's cloud computer supports registration, persistence and MCP Apps rendering is unverified.** Do not claim it works until tested in that actual host.
- For a meaningful operator preview, assign an actual US DID as `US_BRIDGE_DID`. Without it, number inventory is denied and setup reports unassigned.
- To query SignalWire inventory, privately set `SIGNALWIRE_SPACE`, `SIGNALWIRE_PROJECT_ID` and `SIGNALWIRE_API_TOKEN` with read-only Numbers permission. **Never put these values in ordinary AI chat, command arguments, connector JSON, a Git commit, or screenshots.** Use the host's private environment/secret manager. The server reads environment variables only.

## Launch

From the repository root:

```sh
npm run ci
npm run mcp:local
```

The server reads one JSON-RPC message per line on stdin and writes JSON-RPC responses to stdout; the MCP host must spawn and manage the process. It exposes only `get_bridge_setup`, `list_my_numbers`, and `search_available_numbers`. The first is entirely offline. The latter two make at most one scoped read-only SignalWire GET when credentials are configured.

For host configuration, set **command** to the absolute path to your Node.js executable, and **arguments** to the absolute path to `scripts/local-number-mcp.mjs`. Set working directory to the repository root if your host supports it. Store environment secrets in its private secret store rather than embedding them in a JSON connector configuration. An ordinary terminal run will wait for JSON-RPC input and is not an interactive chat UI.

Example user requests in a *verified compatible host*: “Show my bridge setup”, “Check my assigned US number”, “Find five available numbers in area code 618.” No prices are verified, and candidate numbers are neither owned nor reserved.

## Security boundaries and limitations

This is **single-operator only**. The local process trusts its own environment and synthesizes one fixed local account scoped to the configured `US_BRIDGE_DID`; it does not implement user login, customer isolation, D1 storage or credential rotation. It must never be exposed as an HTTP endpoint or run in a shared untrusted host. Multiple Bots sharing one cloud computer also share its process-level secrets and are **not isolated tenants**. The SignalWire project may contain other numbers, but the inventory tool filters to the assigned DID. Never enable outbound calling based on this adapter.

No webhook receiver is provided: real carrier callbacks require an independently secured, externally reachable backend. No native Grok Bot integration, local connector registration or visual card support has been verified. Use the hosted authenticated backend for future approved routing only after cryptographic authorization, replay protection, verified quotes, spending limits and carrier sign-off.
