# Contacts, capture and call history

## Studio behavior

- **Home** opens on the live call, shortcuts and recent connections. Expanding the
  sample call exposes recording and transcript switches without leaving Home.
- **Connections** manages contacts and their destination/routing-number pairs.
  Contact memory saves names, preferences and follow-up notes against the normalized
  destination phone number. Reusing a connection for a new destination does not
  inherit another person's memory.
- **Calls** combines live calls, recent history, recordings, transcripts and manual
  notes/highlights. Search contacts, numbers or notes; filter by captured content.
  Saved call briefs and capture defaults are below history in expandable sections.
  Existing `/studio/memory/` links open this same page with the recordings filter.
- **Numbers** displays owned routing numbers and their assigned destinations.
  Existing `/studio/routes/` links open Connections.

Contact context includes saved notes and up to eight previous conversations with
duration, status, manual highlights and any stored permitted transcript excerpts.
It is available through the authenticated account API and **Copy call context**.
External agents must consume that context explicitly; there is no automatic memory
synchronization with a third-party bot. Quoted conversation content is data, not
instructions to an agent.

## Recording and recovery

Do not record in the background to offer hypothetical recovery. Capture is off by
default, and enabling it requires confirmation of participant permission. Stopping
recording stops capture but retains material already captured. Audio and transcript
can be removed independently in the sample; deleting audio does not delete notes or
call metadata. Deleting both leaves no content from which to restore a transcript.

The public sample uses bundled, fictional audio/transcript data; its restore action
replays that fixture rather than performing speech recognition. No real microphone
audio is stored in browser storage. Account demo controls and history persist in
the account database; public sample edits remain in React state until reload.

For real calls, audio stays with SignalWire and plays through an authenticated
AgentBridge proxy after ownership checks. Explicit recording controls require
participant consent and use the existing provider operation/idempotency flow.
Owned provider transcripts can be loaded for a selected historical call, including
calls outside the latest ten. Results beyond the provider's first page are reported
as incomplete rather than proving that no transcript exists. Generating a new
transcript from saved real audio, live transcription, human joining and muting an
external agent require the separate media service; sample illustrations do not
implement those live capabilities.

Recent-call synchronization retains up to 200 terminal real call records, even
after they leave the provider's most recent response; account demo history keeps
100. This is bounded recent history, not an archival backup of a provider project.
Provider media deletion/retention remains governed by SignalWire. AgentBridge does
not add an automatic recording retention job in this change.

## Account API

Use the current same-origin authenticated session. Add `live/` after
`/api/studio/` for the customer's opted-in SignalWire workspace.

| Method and path | Behavior |
| --- | --- |
| `GET contacts/:connectionId/context` | Own contact notes and previous call context |
| `PATCH contacts/:connectionId/memory` | Save `{notes}` (2,000 characters maximum) |
| `POST calls/:callId/notes` | Add `{text, at_seconds?}` (1,000 characters, 20 notes per call) |
| `DELETE calls/:callId/notes/:noteId` | Delete one owned note with an empty JSON body |
| `POST calls/:callId/sample-transcript` | Restore a fictional transcript only when its sample recording remains |
| `DELETE calls/:callId/capture` | Remove a sample `recording` or `transcript` |
| `GET live/calls/:callId/transcripts` | Load provider transcripts after verifying call/recording ownership |

The sample restoration/deletion endpoints are sandbox-only. Contact notes and call
notes do not require any paid carrier operation. Account and live workspaces stay
isolated, and data is scoped to the signed-in account before a record is resolved.
The JSON document extension needs no new SQL migration; earlier demo history is
normalized on read/update without removing existing contact notes or records.

## Validation

Backend tests cover server restart persistence, contact changes, stopping capture
before call completion, metadata-only calls, separate capture deletion, sample
restoration rules, cross-account isolation and provider-sync retention. DOM journeys
exercise quick controls, history filters, contact memory, highlights, transcript
search and seeking, plus real authenticated account and provider API fixtures.
They do not verify carrier audio, speech recognition or browser visual layout.
