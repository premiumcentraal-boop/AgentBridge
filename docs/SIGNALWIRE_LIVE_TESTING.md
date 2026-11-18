# Set up SignalWire outbound calling

1. In your SignalWire dashboard, open **API credentials** for the project that owns your number. Create a token with **Voice** and **Numbers** permissions. Copy the **Space URL**, **Project ID** and **API token**. [SignalWire first-call guide](https://signalwire.com/docs/platform/voice/make-and-receive-calls)
2. Sign in to AgentBridge. Open **Calling setup → SignalWire**, enter the three values, choose **Save and verify**, then **Use my SignalWire project**. If the host still runs `1.3.0-rc.1`, new accounts can reach the same form under **Settings → SignalWire**. Verification reads your project inventory and calls. Store the token in Studio’s encrypted form. [Calling setup](https://agentbridge.victor.ceo/studio/connection/) · [Studio settings](https://agentbridge.victor.ceo/studio/settings/)
3. In **Numbers**, choose **Get a number**. Pick an existing voice-capable number and **Use this number**, or select and confirm a purchase. The studio can search US local inventory. SignalWire bills the number rental and usage.
4. In **Connections**, save the outside destination in international format, including the leading plus and country code. Pair it with your imported routing number.
5. Choose **Test callback** on the connection. Enter a separate outside phone you can answer. Confirm the numbers and provider charges. SignalWire rings that phone first. Answer and it dials the destination using your owned number as caller ID. Watch **Calls** and compare the two legs with the call log in your SignalWire project. Both legs count toward usage. The connection is capped at five minutes.
6. For calls that **arrive** on your routing number, choose **Activate forwarding** and confirm. While active, anyone dialing that number can reach the destination. Deactivate the connection to restore its previous handler.

**Trial accounts** can call purchased or verified numbers. Verify both outside phones in **Phone Numbers → Verified** for a domestic callback. International testing needs an upgraded Space, international service approval and the destination country enabled in **Space Settings → Geographic Permissions**. The deployment country list for agent-requested callbacks is a separate setting. [Trial restrictions](https://signalwire.com/docs/platform/trial-mode) · [International dialing](https://signalwire.com/docs/platform/how-to-enable-international-services)

## Join a call in Studio

On the public Node service, select **Enable Studio call room** when starting the callback, approving an MCP callback, or activating forwarding. This choice routes those phones’ audio through AgentBridge. For an already active forwarding route, deliberately deactivate it before changing its mode. The private Sites preview supports direct callbacks and forwarding.

Open the active card in **Calls**, choose your microphone setting and select **Join call**. You can mute yourself or a specific caller, silence your speaker, invite a saved destination with charge confirmation, or transfer after the new destination answers. **Leave room** leaves the phones connected. Closing a room’s main phone leg ends the room. Rejoin after a browser disconnect while the phones are still connected.

**Live captions** require agreement from everyone and an xAI key in Calling setup. One mixed audio stream is sent to xAI. Lines stay in memory during the browser session. Saved recordings and post-call transcripts have separate controls. [xAI streaming speech-to-text](https://docs.x.ai/developers/model-capabilities/audio/speech-to-text)

## Verify the release

The Railway service must pass WebSocket upgrades at `/api/media/carrier` and `/api/media/studio` on its existing HTTPS hostname. The app authenticates SignalWire’s bearer on upgrade and validates the project and call ID from its start message. The browser needs a logged-in session and a single-use room ticket. Credentials stay out of URLs. The five-minute room timeout, phone limit and one active room per account bound resource usage. With one replica, restarting the service ends its active bridged rooms. Schedule upgrades between calls. [SignalWire bidirectional media protocol](https://signalwire.com/docs/compatibility-api/cxml/reference/voice/stream)

Verify on two consenting phones and an actual mobile browser. Record whether each phone hears the other, captions follow speech, muting stops the correct source, a reconnect succeeds and leaving the browser preserves the call. Inspect the carrier’s final statuses, durations and charges. A fixture or health response cannot establish those results.

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
- Explicit saved-audio transcription using a separately encrypted xAI key; see [Saved transcription](SAVED_TRANSCRIPTION.md).

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
key, project balance/permissions and two consenting phones. Chromium tested the
mobile layout, real browser audio pipeline and desktop rejoin with synthetic
audio. Verify handset playback, latency and two-way speech on the deployed service.

Contract references: SignalWire's official
[Numbers REST schema](https://github.com/signalwire/docs/blob/main/fern/apis/signalwire-rest/openapi.yaml),
[Compatibility API schema](https://github.com/signalwire/docs/blob/main/fern/apis/compatibility/openapi.yaml),
and [live transcription method](https://github.com/signalwire/docs/blob/main/fern/products/swml/pages/reference/methods/calling/live_transcribe/index.mdx).
