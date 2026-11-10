# AgentBridge on agentbridge.victor.ceo

A **new, independent Railway service** hosts the public product page and private
control studio. Victor's `/agentbridge` route frames only the public product,
following Meridian's integration. The studio opens at the top level and cannot
be framed. Deploy AgentBridge first, then release the Victor tab.

This service is a workspace for **drafts and read-only backend inspection**.
It does not load the telephony Worker, expose its webhooks, issue a live access
number, approve a call, provision a number, take payment, or enable routing.
The existing `backend/` Worker and its pending security PRs remain separate.

## 1. Create the Railway service

1. In the Railway project that holds Victor, choose **New service → GitHub repo**
   and select `premiumcentraal-boop/AgentBridge`.
2. For a review deployment, select `feat/victor-product-studio`. For an accepted
   release, select the reviewed/merged commit. The root `railway.json` uses the
   multi-stage Dockerfile, Node 24, no third-party runtime packages, and `/health`.
3. Add **one persistent volume mounted at `/data`**. Use one replica. SQLite
   data must not live on the ephemeral application filesystem. The entrypoint
   prepares the dedicated mounted directory and drops to UID/GID 1000 before
   accepting requests.
4. Set these variables:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` (Docker default) |
   | `STUDIO_PUBLIC_ORIGIN` | `https://agentbridge.victor.ceo` |
   | `STUDIO_DATABASE_PATH` | `/data/studio.sqlite` (Docker default) |
   | `STUDIO_ACCESS_KEY_SHA256` | The hash generated in the next section |

   Railway supplies `PORT`. Never set `STUDIO_DEV_MODE=true` on Railway. Even
   if mistakenly set, production mode ignores that development login.
5. Deploy the service. `/health` must return `routing_enabled: false`.

## 2. Set up your private studio access

On your own trusted machine, with Node 22.13+ or Node 24:

```sh
npm run studio:key
```

Save the **original access key** in your password manager. Add only its SHA-256
hash as `STUDIO_ACCESS_KEY_SHA256` in Railway, then redeploy. Open `/studio/`
and sign in with the original key. Do not paste access keys into chat, source,
URLs or the browser console. Without a configured hash, the private studio
stays locked; the public page and `/studio/?demo=1` still work.

This is a single-operator workspace, not customer registration or multi-tenant
SaaS. Login attempts are limited; sessions last eight hours, use secure HttpOnly
SameSite cookies, and are invalidated by restart or redeployment. Persistent
workspace data survives redeployment through the volume. Losing the key requires
replacing its hash and redeploying; there is no password recovery endpoint.

## 3. Attach the subdomain

1. Railway → service → Settings → Networking → **Custom domain**:
   `agentbridge.victor.ceo`. Use the listening target port shown by the service.
2. At the authoritative DNS provider for `victor.ceo`, add the **exact CNAME
   target Railway returns** for `agentbridge`. Add any verification records
   Railway requests. Do not invent or reuse Meridian's Railway target.
3. Wait for domain verification and TLS issuance. Confirm the product page,
   `/studio/?demo=1`, `/studio/`, and `/health` on the custom domain.
4. If using a generated Railway domain temporarily, set `STUDIO_PUBLIC_ORIGIN`
   to that exact HTTPS origin and redeploy before testing sign-in there. Restore
   the custom origin for release; only one origin is accepted for writes.
5. Release the matching `victor-ceo` change, then confirm the new tab,
   `/agentbridge`, and the direct Control studio link on desktop and mobile.

Public pages allow framing only by this service and `https://victor.ceo` /
`https://www.victor.ceo`. Studio and API responses reject all framing, are
uncached, and are excluded from indexing. Authentication must be top-level.

## 4. Optional: inspect an existing private backend

The studio can inspect setup and assigned-number inventory from the existing
private Worker. First review `STAGING_DEPLOY.md` and the unmerged security
changes. Deploying this web studio does **not** deploy that Worker.

Add only these optional Railway variables:

- `AGENTBRIDGE_BACKEND_URL`: HTTPS origin of the private Worker, no path,
  embedded credentials, query or fragment.
- `AGENTBRIDGE_ACCOUNT_TOKEN`: a private scoped **account** bearer token for that
  Worker. Never use a carrier API token or an owner approval token here.

Redeploy and use **Connection → Check connection**. The server calls only
`get_bridge_setup` and `list_my_numbers`, with redirects disabled, timeouts and
bounded responses. Credentials never reach client code. A connected status means
those two tools responded; it is not proof of a working call or provider approval.
No number is purchased and no carrier settings change.

## 5. Verify the release

- Public page loads; Victor can frame the product.
- Studio refuses framing and shows sign-in; demo shows a persistent demo banner.
- Unauthenticated `GET /api/studio/overview` returns 401.
- Create a draft, change guidance, export, sign out and sign back in.
- Restart/redeploy: the session ends and the data remains on the volume.
- Cross-origin API writes return 403. `/telephony/*`, `/mcp` and `/v1/*` are not
  telephony endpoints on this service.
- `/health` reports prototype mode and `routing_enabled: false`.

## Data and operations

Route drafts contain destination phone numbers. Only the signed-in operator can
read or write them. Current limits: 200 total drafts, latest 100 activity events
in API responses. Export contains full destination numbers. Treat volume backups
and exports as private. The service stores no audio, transcripts or provider
credentials in SQLite. Studio preference changes affect its own presentation;
they do not persist preferences in Grok Bot or change carrier policy.

Use Railway volume backups appropriate to your account before relying on stored
records. Never scale this SQLite service to multiple replicas. For multi-user
commercial use, add an identity provider, authorization by tenant, a managed
shared database, account recovery, retention controls and operational review.

## Rollback

Redeploy the last known-good AgentBridge image and the prior Victor release.
Do not delete the volume. The studio creates only its own three `studio_*`
tables; it never opens or migrates the carrier D1 database. The custom domain
can stay attached to the service during rollback.

## Local development

```sh
npm run ci
npm run dev
```

The development server binds only to `127.0.0.1:3000`; an explicit development
mode enables the key `local-development`. Persistent local records live in the
git-ignored `data/` directory. This development key is never accepted in
production. Open `/studio/?demo=1` for a browser-only sample workspace.
