# Calling extensions: website and studio

The owner selected International Calling, optional Recording & Transcription,
and **Let me join** on 12 November 2026. This extends the original product
contract's audio-free-only scope with optional capture and human participation.
The original agent remains the conversational AI; a human can join alongside it.
The audio-free bridge remains the default.

## Implemented website experience

| Area | Public pages | Studio behavior |
|---|---|---|
| International Calling | `/features/`, `/international-calling/` | `/studio/calls/`: country/number validation, call brief, capture choices, permission preference, review and archive. |
| Recording & Transcription | `/call-memory/` | `/studio/memory/`: optional defaults, language/retention and join preferences. Demo adds a real local sample player, downloads, transcript search, speaker filters and timestamp seeking. |
| Let me join | `/join-call/` | Demo `/studio/demo/call/`: choose browser/phone, join muted, mute/unmute yourself, leave while the agent continues and end the whole sample call separately. |
| Active call | Feature illustration and studio entry points | Existing floating navigation retains the sample call across pages and adds a join shortcut. Optional recording/transcription need a sample permission acknowledgement; pause/resume and separate transcript controls update shared call state. |

The four new public pages and four direct studio/demo pages are rendered HTML,
not images. The complete build is 30 React/Astryx pages plus the existing design
gallery. Public links cross the studio's CSP boundary as ordinary top-level
links. Offline/Sites review uses the portable hash router and in-memory samples.

## Persistence and validation

The authenticated Node studio adds:

- `POST /api/studio/call-plans`: validates a destination, country-code match,
  bounded name/brief, capture and join preferences, and `ask`/`confirmed` capture
  permission preference. The returned plan is always `draft`.
- `POST /api/studio/call-plans/:id/archive`: archives a saved plan.
- `PATCH /api/studio/capture-preferences`: saves independent recording and
  transcription switches, a language preference, 7/30/90-day content retention
  preference, and a browser/phone join preference.
- Overview/export include `call_plans` and `capture_preferences`.

Schema validation lives in `shared/call-plans.mjs` and runs independently on the
server. Client activation/status/media-URL fields are rejected. Existing login,
origin checks, body bounds, session handling and private/no-store headers apply.
Each collection is bounded to 200 plans, distinct from the existing 200 route
drafts. Activity records are capped by the existing store policy. The additive
studio SQLite tables do not touch the carrier Worker/D1 database.

Plans and preferences are preparation only. Responses explicitly report that
calling, recording, transcription and joining are not enabled. No provider call,
paid reservation, recording command, callback or media session is created by
saving or editing them. An operator marking permission `confirmed` is an
attestation in the saved plan, not provider-observed consent or route approval.

## Sample audio and privacy

`web/src/samples/sample-call.mp3` is an original 34-second fictional conversation
with locally generated stock synthetic voices. Agent and recipient occupy
separate channels, with transcript timing in `sample-call.json`. It is not a
Grok voice clone, real recording or actual booking. Its outcome is explicitly a
demonstration. Browser playback uses a bundled data URL and no external host.
The browser never accesses a microphone or places a phone callback in this demo.

A saved retention preference describes future captured-content policy; it does
not start a deletion job or delete call-plan metadata. A saved transcript-only
preference does not imply that an integrated speech processor stores no audio.
Pausing audio recording also does not automatically pause an independent live
transcription/observer service; a real integration must coordinate both when a
sensitive span is to be excluded.

## Live integration still required

The current `server/integration.mjs` adapter remains read-only setup and number
discovery. These website flows do not implement a production carrier/media
backend. The existing bounded private-pilot telephony code is unchanged.

A real rollout requires concrete implementation and validation of:

1. Authorized call preparation/control tied to the operator, session, carrier
   call IDs and inbound/outbound legs, supported country/number routes, actual
   quotes and existing caller-proof/approval/spend policies.
2. Capture commands bound to the right active call, confirmed permission,
   explicit status callbacks/reconciliation, private audio storage and expiry.
3. A chosen supported multilingual transcription path, safe media ingestion,
   audio/utterance alignment, content permissions and deletion of derived copies.
4. A conference-capable media topology for original agent, recipient and human,
   participant authorization, verified callbacks or authenticated browser media,
   mute/leave/end semantics and failure cleanup.
5. A deliberately scoped microphone/CSP policy for genuine browser joining.
   The current `Permissions-Policy` continues to deny microphones, which matches
   the sample's behavior. This is not enabled by adding an API key alone.

The studio must derive actual call/capture/join states from that integration.
A number-discovery connection or saved preference must never be presented as a
working live call, recording, transcript service or conference.

## Validation

Server tests verify authenticated/origin-protected preparation, persistent
preferences/plans, bounded storage, rejected activation fields, country mismatch,
invalid capture options and no provider calls. DOM integration tests cover the
plan/review flow, defaults retained across pages, join-muted/mute/leave without
ending, capture acknowledgement, recording pause/resume, separate transcription,
search/speaker filters, audio seeking, sample outcomes and real page links.
Static checks cover 31 pages, including all new routes. `ffprobe` verifies a
34.104-second MP3 with 24 kHz stereo audio. Browser layout/playback/touch QA
remains pending when the supported browser-control tool is unavailable.

## Focused studio redesign

The home screen now leads with a focused call and optional transcript. The new
`/studio/connections/` and `/studio/demo/connections/` pages search saved destination
drafts. Listen in plays the existing local fictional sample without microphone
access. Playback stays mounted across studio routes and drives the enabled sample
transcript clock. Leaving or ending stops playback; a failed or cancelled play
attempt never creates a listening participant. Routing review keeps an in-tab
proposed destination and never changes the active recipient. See
[Grokbot-inspired redesign](GROKBOT_REDESIGN.md).
