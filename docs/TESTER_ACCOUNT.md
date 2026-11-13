# Real single-tester demo

The tester can also opt into [SignalWire development testing](SIGNALWIRE_LIVE_TESTING.md)
with an encrypted, customer-supplied provider token. The demo behavior described
below stays separate and remains the default. Real provider actions only occur
through the explicitly enabled live-testing workspace and confirmed actions.

AgentBridge now has a server-backed account mode. Signup creates exactly one
account and a private workspace. Numbers, connections, saved call plans, capture
and join preferences, profile changes, activity and simulated call state are API
records. They survive reloads, sign-out and a server restart.

Demo mode is a server constraint. It cannot provision a real number, charge a
provider, place a real call, start microphone capture or activate a carrier
reservation. Owned demo numbers use reserved fictional +1 NPA 555-01xx inventory.
A destination is always paired with one of the signed-in account's own numbers.
The operator's existing SQLite workspace and carrier configuration remain separate.

## Hosted private demo

The existing owner-private Sites project runs the same account API as a Worker
with a D1 binding named `DB`. It keeps dispatch-owned ChatGPT sign-in. The API
checks the verified subject and invited email, then uses its own account ID to
own the workspace. An email typed into a form is not an identity assertion.
Registration closes after one account; a database uniqueness constraint also
prevents concurrent signups from creating multiple accounts.

Set `DEMO_TESTER_EMAIL` and `STUDIO_PUBLIC_ORIGIN` through Sites runtime settings.
The source manifest uses `"d1": "DB"` and no static directory. Schema-only Drizzle
migrations are under `drizzle/` in the deploy artifact; applied migrations and
journal entries must remain immutable. The build copies the application migrations
from `server/accounts/migrations/`. Append later migrations instead of changing
`0000_demo_accounts.sql` or its journal entry.

The hosted demo uses `/signup/`, `/signin/` and `/studio/`. Previous hash/sample
routes go to the account studio, not a browser-local workspace. Use the offline
HTML only for isolated visual review; it deliberately cannot create accounts.

## Railway customer login

The Node adapter uses email/password authentication and a separate durable account
database. Configure privately:

- `DEMO_TESTER_EMAIL`: the single invited email.
- `STUDIO_ACCOUNT_DATABASE_PATH=/data/accounts.sqlite` on the persistent volume.
- `STUDIO_PUBLIC_ORIGIN`: the exact HTTPS origin.
- `DEMO_SIGNUP_INVITE_SHA256`: the hash from `npm run demo:invite`.

The invite script prints a private signup URL with its token in the fragment.
Keep that URL and hash private. Registration without that invitation stays closed;
no public visitor can claim the reserved email first. Do not put passwords or
invitation values in Git, chat, logs or the hosting manifest. The password is chosen
in the signup form and stored only as a salted scrypt hash. Session cookies are
Secure, HttpOnly and SameSite=Strict; only token hashes and expirations are stored
in SQLite. Logout revokes the session. Origin/body/schema checks and persistent
rate limits apply to account writes.

Leaving `DEMO_TESTER_EMAIL` unset retains the original operator-key deployment.
Never treat the operator access key as a customer login or attach paid carrier
inventory to a demo account. The current tester feature is not public multi-user
onboarding, billing, email verification/recovery or live telephony.

## Account API

- `GET /api/auth/session`: current account and available sign-in method.
- `POST /api/auth/register`: creates the invited account and its workspace once.
- `POST /api/auth/login`: Railway password login; hosted sign-in uses the normal
  top-level `/signin-with-chatgpt` route instead.
- `POST /api/auth/logout` or `DELETE /api/studio/session`: sign out.
- `PATCH /api/auth/account`: updates the name and agent name.
- `/api/studio/overview`, `/numbers`, `/number-orders`, `/connections`,
  `/call-plans`, `/capture-preferences`, `/settings`, `/export`: account-owned demo
  state using the existing studio workflow.
- `POST /api/studio/demo-call/start`: starts a simulated call from an owned pairing.
- `PATCH /api/studio/demo-call`: saves simulated controls, confirmed optional
  capture choices, route proposals and ending. It never contacts a carrier.

Workspace updates use a revision check and retry to prevent concurrent tabs from
silently overwriting one another. No client-supplied account ID is accepted.

## Verification and release boundary

Backend tests exercise real sessions, restart persistence, denied second signups,
invitation/origin/schema checks, demo inventory, pairing and capture consent.
DOM integration tests run the rendered UI against the real API service and reload
into a fresh session. Worker tests exercise the actual compiled deployment module
through the D1 adapter. These are not browser layout, touch or audio verification.

The account demo is a real product-testing milestone. Public customer launch still
requires the final hosting rollout, production identity/recovery decisions, billing
and the live carrier/media integrations. This feature leaves those disabled.
