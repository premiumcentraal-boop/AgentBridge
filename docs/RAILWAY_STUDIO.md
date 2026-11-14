# AgentBridge on agentbridge.victor.ceo

The Railway service hosts the public product pages and the Node account API.
Use the existing AgentBridge service if it already owns the domain; otherwise
create a separate service from `premiumcentraal-boop/AgentBridge`. Victor and
Meridian keep their current services. The checked-in `railway.json` builds the
Node 24 Docker image and checks `/health`.

## Public email signup

1. Connect the service to the reviewed `main` release of the GitHub repository,
   with the repository root as its root directory. Use the Dockerfile build.
   Keep **one replica** and a durable volume mounted at **`/data`**. Take a volume
   backup before upgrading an existing account database. New migrations run
   transactionally on startup and preserve account IDs, workspaces, sessions,
   provider credentials and routing records.
2. In [Resend](https://resend.com/domains), add a dedicated sending domain such as
   **`mail.agentbridge.victor.ceo`**. Add the exact DKIM/SPF records Resend shows
   at the authoritative DNS provider, then wait for verification. These are
   separate from the website's Railway CNAME. Disable click and open tracking
   for account emails. Receiving email/MX setup is not required for sending;
   preserve Victor's existing email records. Create a **sending-only API key**
   restricted to this domain.
3. Add these Railway **runtime variables** (never build arguments):

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `STUDIO_PUBLIC_ORIGIN` | `https://agentbridge.victor.ceo` |
   | `STUDIO_SIGNUP_MODE` | `public` |
   | `STUDIO_DATABASE_PATH` | `/data/studio.sqlite` |
   | `STUDIO_ACCOUNT_DATABASE_PATH` | `/data/accounts.sqlite` |
   | `RESEND_API_KEY` | Sending-only key; store as a secret |
   | `AUTH_EMAIL_FROM` | `AgentBridge <accounts@mail.agentbridge.victor.ceo>` |
   | `PROVIDER_CREDENTIALS_KEY` | Existing 64-character hex wrapping key, or generate once for a new database |
   | `STUDIO_TRUST_RAILWAY_PROXY` | `true` only under the edge conditions below |

   Railway supplies `PORT` and `RAILWAY_ENVIRONMENT_ID`. Keep
   `STUDIO_DEV_MODE` unset. `DEMO_TESTER_EMAIL`, `DEMO_SIGNUP_INVITE_SHA256` and
   the old operator access key are not needed in public mode.

   **Preserve an existing `PROVIDER_CREDENTIALS_KEY`.** Replacing it makes saved
   provider credentials unreadable. For a genuinely new database, generate a
   32-byte random hex key on your trusted machine, put it directly into Railway
   secrets, and retain it in your password manager. Do not paste it into chat,
   source, issue descriptions or URLs. Each customer enters their own SignalWire
   credentials in Studio Settings; a shared customer carrier key is not used.
4. In Railway **Settings → Networking**, confirm `agentbridge.victor.ceo` is
   attached to this service and its HTTPS certificate is active. For a new
   attachment, use the exact CNAME target Railway returns for `agentbridge`.
   Keep the existing domain if it is already attached to the correct service.
   `STUDIO_PUBLIC_ORIGIN` must match the origin visitors use. Writes from any
   other origin are rejected.
5. Deploy. Run the read-only probe from the repository:

   ```sh
   npm run launch:check -- https://agentbridge.victor.ceo
   ```

6. In a fresh browser, sign up with your own email, open the received link,
   choose a password and confirm the studio starts empty. Sign out and back in,
   complete a password reset, and verify a second account cannot see the first
   account's numbers, connections or settings. Restart the service and confirm
   saved data remains. The probe does not send email or make a real call.

## How signup works

- `/signup/` asks for a name, email and agent name. The server sends a verification
  link valid for one hour. It creates no account or session until that link is
  confirmed and its holder chooses a password.
- `/verify-email/` consumes the single-use token, hashes the password with scrypt,
  creates a separate account/workspace and signs the user in. Opening the email's
  link alone never consumes it, so email scanners cannot create an account.
- `/signin/` uses the email and password. Sessions last eight hours and survive
  service restarts. Cookies are Secure, HttpOnly and SameSite=Strict. Session and
  email token values are stored only as hashes.
- `/forgot-password/` sends a reset link valid for 30 minutes. Completing it at
  `/reset-password/` revokes all old sessions and outstanding links for that email.
  Responses do not disclose whether an email is already registered.
- Names and passwords are not encoded into email URLs. Tokens are in fragments,
  removed from browser history after the page loads, and submitted to the API in
  same-origin POST bodies. They never enter server URL logs or referrer headers.
- An existing unverified password tester must confirm an email link after moving
  to public mode. Verification keeps that account's ID and saved workspace.

Signup stays closed if the sending key, sender or HTTPS origin is missing or
invalid. Already-verified users can still sign in while email configuration is
unavailable. The owner-private ChatGPT Sites preview retains its existing verified
tester flow; enabling this Railway mode does not make the preview public.

## Client IP and rate limits

Auth and email limits are durable, with separate limits per client, per email and
globally. An email address can request at most three account emails per hour.
Client auth limits are ten attempts in 15 minutes; email delivery has an additional
global ceiling of 200 requests in 15 minutes, and password login 300.

By default, the Node server uses the socket peer and ignores forwarding headers.
Behind a proxy, this conservatively shares one client bucket. On Railway, set
`STUDIO_TRUST_RAILWAY_PROXY=true` **only when all untrusted traffic reaches this
listener through Railway's public HTTP edge**. The app then validates and uses
the edge's `X-Real-IP`, and requires Railway's injected environment ID as well.
Do not expose this listener through a TCP proxy or to untrusted private-network
callers in this mode. It never parses caller-supplied `X-Forwarded-For`.
See [Railway request headers](https://docs.railway.com/networking/public-networking/specs-and-limits).

## Product and carrier scope

Every new account starts in demo mode. Live actions require the customer to save
and verify their own SignalWire Space/Project/token and explicitly enable live
testing. Import, number search/purchase, pairing, forwarding, test callbacks, call
control and consented recording use the real provider API. See
[SignalWire setup and verification limits](SIGNALWIRE_LIVE_TESTING.md).

Signup does not start a paid service, buy a number, activate a route or place a
call. SignalWire bills each customer's own project. Live transcription, browser
listen-in and joining an existing call as a third participant still need a public
media/webhook service; those controls remain unavailable. The separate legacy
`backend/` Worker is not deployed by this Docker service.

The account API scopes records, encrypted credentials and provider operations to
the signed-in account. Public product pages allow framing by Victor; account,
studio and API pages reject framing, use no-store and are excluded from indexing.

## Operation and rollback

Keep one instance while using SQLite and enable Railway volume backups. Retain
the wrapping key separately from backups. Scale to a shared managed database
before adding application replicas. Backups and account exports contain private
destination numbers and must stay private.

Roll back the application image without deleting the volume or the new migration
history. Earlier single-tester code can still read the expanded account schema,
but it cannot serve public users; restoring an operator-only image is not a public
auth rollback. Do not reverse the migration by deleting customer accounts.

For an operator-only workspace, leave `STUDIO_SIGNUP_MODE` and `DEMO_TESTER_EMAIL`
unset and follow `npm run studio:key`. For the old single-tester invitation flow,
see [TESTER_ACCOUNT.md](TESTER_ACCOUNT.md).

## Local verification

```sh
npm run setup:web
npm run ci
```

The account and DOM tests use a captured email transport. They verify database
migration, isolated accounts, token reuse/races, password recovery and rendered
forms without delivering real emails or making paid carrier requests. Actual DNS,
Resend acceptance/inbox delivery and Railway rollout require the deployment's
credentials and an end-to-end test on the custom domain.
