#!/usr/bin/env bash
# Idempotent rebuild of the AgentBridge local stdio MCP server on this box.
# - restores /workspace/AgentBridge (clone, or local-mcp bundle if provided)
# - installs a checksum-verified Node 22 into /workspace/.tools/node22
# - npm ci for local-mcp, runs the full test suite and a stdio smoke test
# Never prints credential values; never pushes, deploys, buys or calls.
set -euo pipefail
REPO_URL="${AGENTBRIDGE_REPO_URL:-https://github.com/premiumcentraal-boop/AgentBridge}"
REPO_DIR="${AGENTBRIDGE_DIR:-/workspace/AgentBridge}"
TOOLS="${AGENTBRIDGE_TOOLS:-/workspace/.tools}"
BUNDLE="${AGENTBRIDGE_BUNDLE:-}"   # optional git bundle containing branch local-mcp
BRANCH=local-mcp

log(){ printf '[setup-local-mcp] %s\n' "$*" >&2; }

# 1. Node 22 (repo engines >=22)
if ! "$TOOLS/node22/bin/node" -v 2>/dev/null | grep -q '^v22\.'; then
  log "installing Node 22 into $TOOLS"
  mkdir -p "$TOOLS"; cd "$TOOLS"
  base=https://nodejs.org/dist/latest-v22.x
  sums="$(curl -fsSL "$base/SHASUMS256.txt")"
  tarball="$(printf '%s\n' "$sums" | grep -o 'node-v22[0-9.]*-linux-x64.tar.xz' | head -1)"
  curl -fsSLO "$base/$tarball"
  printf '%s\n' "$sums" | grep " $tarball\$" | sha256sum -c - >&2
  tar xf "$tarball" && rm -f "$tarball"
  ln -sfn "$TOOLS/${tarball%.tar.xz}" "$TOOLS/node22"
fi
export PATH="$TOOLS/node22/bin:$PATH"
log "node $(node -v), npm $(npm -v)"

# 2. Repository
if [ ! -d "$REPO_DIR/.git" ]; then
  log "cloning $REPO_URL"
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
if ! git rev-parse --verify -q "$BRANCH" >/dev/null; then
  if [ -n "$BUNDLE" ] && [ -f "$BUNDLE" ]; then
    log "restoring branch $BRANCH from bundle"
    git fetch "$BUNDLE" "$BRANCH:$BRANCH"
  else
    log "branch $BRANCH not found locally and no AGENTBRIDGE_BUNDLE given"; exit 1
  fi
fi
if [ -n "$(git status --porcelain)" ]; then
  log "working tree has local changes; not switching branches"
else
  git checkout -q "$BRANCH"
fi
git fetch -q origin main || log "could not fetch origin/main (offline?)"
if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  log "local-mcp contains origin/main"
else
  log "NOTE: origin/main has new commits not in $BRANCH; review and rebase manually"
fi

# 3. Dependencies (lockfile-exact)
(cd local-mcp && npm ci --no-audit --no-fund >&2)

# 4. Full automated test suite: existing repo CI + local MCP tests
npm run ci >&2
(cd local-mcp && npm test >&2)

# 5. Real stdio smoke test (prints set/missing flags only)
(cd local-mcp && node scripts/smoke-client.mjs >&2)
log "OK. Register stdio MCP: command=$REPO_DIR/local-mcp/run.sh (cwd $REPO_DIR/local-mcp)"
