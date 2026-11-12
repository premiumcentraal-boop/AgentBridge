# AgentBridge: connection-first redesign

The owner supplied `GROKBOT_STYLE_GUIDE.md` and a visual contact sheet on
12 November 2026, requesting simpler connections, calls, transcripts, listening
and routing.

## Design

System typography, black/white grouped surfaces, circles, pills and nested
rounded panels follow the reference's visual grammar. Colour communicates bot
identity or state. Original CSS avatars have two capsule eyes, a state badge
and a subtle blink. Blue means working, red attention, green completion. Text
accompanies colour; reduced motion disables the blink. Light appearance is
supported. AgentBridge retains its name/connection mark; no Grok, xAI or Novra
artwork, videos or proprietary animation files are bundled.

The hero keeps **connect agents worldwide** beside an interactive sample-agent
widget. The existing country-line animation remains in its own worldwide
section, including its 60-second timing, contact-only confirmation, paint order,
pause/play and reduced-motion behavior. Historical boards remain available.

## Studio

Primary navigation: Home, Connections, Calls, Routing, Transcripts.
Management: Calling setup, Activity, Settings, Design boards.
The floating rail preserves the sample call above the menu. Mobile retains the
call strip/drawer and uses an accessible circular plus action for connections.

Home leads with a focused call beside its optional transcript, then agent
shortcuts and saved destinations. The call screen groups participants,
listen/join/routing controls and the transcript. Capture remains independent,
off by default, and requires acknowledgement in the sample.

New `/studio/connections/` and `/studio/demo/connections/` pages search existing
destination drafts. Adding a connection reuses authenticated validation and
SQLite persistence in private mode; sample changes stay in memory. Saving a
destination never activates a carrier route.

## Listening and routing boundaries

Listen in plays the existing local fictional MP3 and enters muted. A native
player stays mounted across studio routes. The enabled sample transcript
follows playback position. Leaving stops audio while the simulated agent call
continues; ending stops it too. Playback failure leaves the listener absent,
and ending a call cancels a pending playback attempt. No microphone or real
conference is accessed. Private mode has no simulated active call.

Route call and connection-row actions open a destination review. Sample mode
saves an in-tab proposal and reports that no transfer was made; the active
recipient stays unchanged. Private mode reviews the existing destination only.
The production carrier/media integration and microphone policy are unchanged.

## Validation

DOM journeys cover adding/searching connections, reviewing routing without a
transfer, muted sample listening, playback persistence across pages, transcript
alignment, leaving, playback rejection and ending while playback is pending.
JSDOM media methods are stubbed; these checks do not establish browser playback.
The complete build contains 30 React/Astryx pages plus the original gallery.
Existing authentication, carrier policy and animation checks remain in CI.

Browser layout, touch, audio and screen-reader QA are unverified because the
supported Sites browser helper is unavailable. The Sites workflow prohibits
substituting an improvised preview server or browser installation.
