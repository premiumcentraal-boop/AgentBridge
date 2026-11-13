# SignalWire development testing

The single tester can now bring a SignalWire project to the account studio.
Demo and live data remain separate. Saving a token only verifies it with
read-only Numbers and Calls requests. Nothing is purchased or dialed by
credential verification, loading the studio, or refreshing provider status.

## Use the studio

1. Sign in to the private tester account, open **Settings**, and enter the
   SignalWire Space name/URL, Project ID, and a token with **Numbers** and
   **Voice** permissions. Never send that token through chat or GitHub.
2. Choose **Save and verify**, then **Use my SignalWire project**.
3. In **Numbers**, use an existing voice number or search US inventory by area
   code. Buying requires selecting the number and confirming SignalWire charges.
   The search API does not quote rental prices: review the project's rates in
   SignalWire. Purchased numbers may be subject to the carrier's release hold.
4. Save a connection with an imported routing number and an outside destination.
   Saving is inert. Choose **Activate forwarding** and confirm the destination
   and charges to update the actual number's call handler.
5. Have the calling agent dial that routing number. SignalWire forwards the
   audio to the destination, without inserting another voice agent. Forwarding
   remains active while the studio is closed; each connection is capped at
   five minutes. Deactivate it to restore the previous call handler.
6. For a human development test, choose **Test callback**. SignalWire calls your
   separate phone first, then connects it to the saved destination. Both legs
   use the project's billing. The interface reports queued/ringing/in-progress
   and completed states returned by SignalWire; it does not claim connection
   before the provider does.

The existing one-tester registration restriction remains. This is private
development testing, not open customer onboarding or a resale billing service.

## Implemented provider paths

- Owned inventory, pagination, US local voice search, explicit number purchase,
  and ownership-verified import. Up to 20 live routing numbers per tester.
- Saved destinations, explicit forwarding activation, ownership checks before
  writes, prior-handler backup/restoration, external-change detection, and
  provider-state reconciliation. Call Fabric handlers that cannot be restored
  by the Numbers API are rejected before they are changed.
- Recent call status/history with ten-second polling, explicit test callbacks,
  ending calls, and transfer to another saved destination.
- Consent-required recording, pause/resume/stop, authenticated audio retrieval,
  and deletion. Recordings stay in the customer's SignalWire project. No
  automatic retention/deletion schedule is claimed.
- Retrieval of existing provider-generated transcripts for managed recordings.

**Live utterance transcription, browser listen-in, and adding a third human to
an existing call are not enabled.** SignalWire live transcription uses SWML
and a webhook receiver; browser audio needs a media/WebSocket relay. The current
Site is owner-private and dispatch blocks carrier callbacks before app code.
The cXML call type used here cannot silently acquire those features. The live
studio shows these limits and never substitutes synthetic demo audio or text.

## Hosting and credentials

The account API runs on the private Sites Worker/D1 deployment and the Node/
Railway adapter. Configure the server-only secret **PROVIDER_CREDENTIALS_KEY**
as 32 random bytes encoded into 64 hexadecimal characters. Sites runtime secrets
hold this value separately from the database. The same key must survive every
deployment and restart; rotating it without re-encrypting saved credentials
makes them unreadable. Do not put a value in source, the hosting manifest,
client code, environment examples, PRs, logs, or downloadable workspace data.

Customer API tokens and prior handler configurations use AES-256-GCM with a
fresh nonce and account/purpose binding. The browser receives only provider
metadata and a masked token hint. Credential replacement stays in the same
project; switching projects requires deactivating routes, ending calls, resolving
uncertain requests, and disconnecting the old project first. Disconnecting does
not release carrier numbers or delete provider recordings.

The migration `server/accounts/migrations/0001_provider_testing.sql` appends the
provider vault metadata, live workspace, operation ledger, locks and route
backups. Preserve the existing project and `DB` binding and all applied SQL and
journal entries. No real provider credentials or customer records are seeded.

## Request reliability

Chargeable writes require authenticated ownership, the exact Origin, explicit
charge confirmation and a request UUID. A durable operation ledger and per-account
lease serialize provider changes. Successful requests replay their saved result;
ambiguous writes are not sent again automatically, even with another request ID.
Provider inventory can reconcile a purchase whose response was lost. Routing
reconciliation reads the carrier's current configuration and never overwrites
external edits. A customer can review other uncertain operations in SignalWire
before explicitly permitting a new request.

Number forwarding uses provider-hosted cXML scripts, avoiding private-Site webhook
access problems. Provider fetches use a fixed validated SignalWire Space origin,
timeouts, bounded bodies, no redirects and no raw upstream errors in responses.
All inventory, call, recording and transcript operations remain account scoped.

## Verification

Backend contract tests run the actual account API and SQLite store against a
stateful SignalWire fixture. They cover encryption and restart persistence,
authorization and origin checks, no auto-spend, purchase replay/uncertain results,
forwarding and restoration, externally changed routes, callback status, call
ownership, recording consent/control, protected media and transcript filtering.
A rendered DOM journey submits credentials, changes mode, imports a provider
number, saves/activates a connection, and requests a callback through that API.

These checks do not establish that a funded customer project or a native Grok
Bot call has succeeded. The final provider verification requires the tester's
key, project balance/permissions, and a consenting real destination. Browser
layout, audio playback and carrier media remain unverified in this environment.

Contract references: SignalWire's official
[Numbers REST schema](https://github.com/signalwire/docs/blob/main/fern/apis/signalwire-rest/openapi.yaml),
[Compatibility API schema](https://github.com/signalwire/docs/blob/main/fern/apis/compatibility/openapi.yaml),
and [live transcription method](https://github.com/signalwire/docs/blob/main/fern/products/swml/pages/reference/methods/calling/live_transcribe/index.mdx).
