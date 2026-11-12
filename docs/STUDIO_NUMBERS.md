# Routing numbers and destinations

A connection has two numbers:

1. A dedicated routing number belonging to the workspace, currently SignalWire.
2. An outside destination, with an explicit country and international number.

Provider identity is stored on the routing number. Destination records reference
its ID, so additional providers do not require a new destination data model.
The current routing-number request path supports US numbers only. Destination
country selection does not claim provider inventory or live calling coverage.

## Studio workflow

Home starts with the active call card, then connections and country filters.
Numbers lists dedicated numbers and their assigned destinations. Add connection
searches countries/names/calling codes, collects the destination and selects an
owned routing number. When no number is free, obtaining another number comes
first. Editing changes the saved pairing; removing a pairing frees the number.
Legacy destination drafts remain under Unassigned destinations and can be
assigned or archived. Existing records are never automatically forwarded.

The mobile menu is a full-height left drawer. Its call card opens the call and
transcript, with a labelled Jump in action. Mute/end are absent from navigation.
Ending in the call view requires a confirmation. Settings identifies example
data in the static review; its changes stay in the current tab.

## Private persistence and API

The Node studio adds `studio_numbers`, `studio_connections` and
`studio_number_orders` to its existing SQLite database. The migration is additive.
Overview/export include `routing_numbers`, `connections` and `number_orders`.

| Endpoint | Behavior |
|---|---|
| `GET /api/studio/numbers` | Owned/disabled number records and purchase requests. |
| `POST /api/studio/number-orders` | Creates an idempotent pending request; returns 202, `charged:false`, `purchase_enabled:false`. |
| `GET /api/studio/connections` | Saved/archived pairings. |
| `POST /api/studio/connections` | Saves a name, owned number ID, destination and country. |
| `PATCH /api/studio/connections/:id` | Edits a saved pairing. |
| `DELETE /api/studio/connections/:id` | Archives the pairing and frees its routing number. |

All endpoints require the existing studio session; writes also require the
configured origin and bounded JSON. Shared server/client validation rejects
unknown activation/ownership fields. The server rejects unowned or disabled
routing numbers, a second current destination for the same routing number,
and any destination equal to an owned routing number. A partial unique index
and transaction protect the one-destination rule. Collections are capped at
100 numbers, 100 requests and 200 connections.

Number requests use a UUID request ID. Repeating the same request returns the
same order; changing its payload under that ID conflicts. Requests cannot mark
themselves paid, allocate a number or enable calling. Phone values are private
workspace data and are omitted from activity messages.

## Import an already purchased SignalWire number

For the current **single-operator workspace**, an operator can import a voice
number they already purchased in their own SignalWire project. This is not
commercial customer provisioning, billing or a substitute for those systems.

Configure `SIGNALWIRE_SPACE`, `SIGNALWIRE_PROJECT_ID` and `SIGNALWIRE_API_TOKEN`
in the private execution environment, never in chat, browser code or Git.
Run as the service’s `node` user (UID/GID 1000), using the same
`STUDIO_DATABASE_PATH` as the Node service, to preserve volume ownership. Replace the example
number below with your already purchased US voice number:

```sh
node scripts/import-studio-number.mjs \
  --number +12025550110 \
  --label "Main line" \
  --confirm-project-ownership
```

To fulfil an existing pending request, also pass `--order <order-id>`. Its
provider, country and area code must match. The import performs a bounded,
time-limited, redirect-free GET against the validated SignalWire project host.
It requires the exact number and a provider resource ID with voice capability,
then registers it through trusted store ingress. The browser has no equivalent
ownership-writing endpoint. Missing configuration or an unconfirmed number fails
closed. The tool never buys a number, changes a webhook or activates forwarding.
Its script, shared schemas and read-only adapter are included in the Docker
allowlist; private Worker configuration and credentials remain excluded.

## Integration boundary

Actual number purchasing, quotes, payment collection, commercial customer
allocation, release/reconciliation and carrier application of saved pairings
are not enabled. Requests stay `requested` until a trusted integration/import
fulfils them. A verified project number is not proof of a customer's payment.
There are no invented live prices. Example inventory is explicitly marked and
never contacts a provider. The telephony Worker and its existing private-pilot
authorization, caller-proof and spend guards are unchanged.

Before live use, the calling integration must resolve saved connections on the
server, recheck current ownership/provider state and apply the existing routing
policies. It must derive active calls and outcomes from authenticated events.

## Verification

Server tests cover authentication/origin checks, both-number persistence,
ownership forgery, loops, duplicate assignments, editing/archive, idempotent
pending orders, collection bounds, reopening SQLite and exact provider import.
DOM tests cover the drawer lifecycle and safe call actions, buy-before-pair,
country search, editing/removal, routing review, capture choices and playback.
Media and native dialogs are stubbed in JSDOM. Browser layout, audio, touch and
screen-reader verification remain unverified when the supported Sites browser
helper is unavailable.
