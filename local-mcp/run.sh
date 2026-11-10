#!/usr/bin/env bash
# Launcher for the AgentBridge local stdio MCP server.
# Optionally loads ONLY the four allowed variables from a private 0600 file
# (default ~/.config/agentbridge/signalwire.env). Values already present in the
# environment win. Nothing is echoed; stdout is reserved for MCP JSON-RPC.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="${AGENTBRIDGE_NODE:-/workspace/.tools/node22/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node)"
SECRETS="${AGENTBRIDGE_SECRETS_FILE:-$HOME/.config/agentbridge/signalwire.env}"
if [ -f "$SECRETS" ]; then
  perms="$(stat -c '%a' "$SECRETS")"; owner="$(stat -c '%u' "$SECRETS")"
  if [ "$owner" != "$(id -u)" ] || { [ "$perms" != "600" ] && [ "$perms" != "400" ]; }; then
    echo "agentbridge-local: refusing secrets file with unsafe owner/permissions (need 600)" >&2
    exit 1
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue;; esac
    key="${line%%=*}"; val="${line#*=}"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    case "$key" in
      SIGNALWIRE_SPACE|SIGNALWIRE_PROJECT_ID|SIGNALWIRE_API_TOKEN|US_BRIDGE_DID)
        if [ -z "${!key:-}" ]; then export "$key=$val"; fi;;
    esac
  done < "$SECRETS"
fi
exec "$NODE" "$HERE/server.mjs"
