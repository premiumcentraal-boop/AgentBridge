# AgentBridge release readiness

Release candidate `1.3.0-rc.1`, audited 2026-11-16 from main `6f14ab4`. This is **not yet a full-product launch approval**. Implemented code, automated contracts, a private preview publication and actual production acceptance are separate evidence.

| Area | Current state | Remaining launch gate |
| --- | --- | --- |
| Public deployment | Docker/Railway configuration, persistent SQLite, version/build probes prepared | Deploy reviewed commit on the actual Railway service; current public site is older |
| Email accounts | Public signup, verification and recovery implemented and tested | Verified Resend sender/key, DNS and real inbox checks on the public domain |
| MCP connector | Official SDK Streamable HTTP, 7 account-linked tools, SDK client interoperability | Actual Grok custom-connector sign-in and tool invocation |
| Agent authorization | S256 PKCE, exact callbacks/resource, scoped consent, hashed rotating tokens, encrypted confidential client secrets, immediate revoke | Production origin/proxy setup and actual host-client test |
| Contacts/history | Canonical phone/name lookup, ambiguity handling, indexed contacts, notes/history, preparation brief, labelled outcome writeback | Confirm actual Grok call outcome/recall; agent reports are not carrier evidence |
| Provider calling | Existing SignalWire BYOK inventory, search/purchase, pairing, activate/deactivate/reconcile, callback/end/transfer; 300-second caps | Real consenting provider test including charges, route restoration, duration caps and lost-response recovery |
| Agent callback approval | Exact destination/callback and charges approved separately in Studio; durable once-only dispatch; fresh provider status | Production callback test; this calls the approved phone and is not Grok voice transport |
| Saved capture | Consent-required recording controls/audio; existing provider transcripts; explicit xAI saved-recording transcription; reuse/recovery/deletion | Real recording playback and xAI recognition/charge/privacy acceptance |
| Onboarding/studio | Setup checklist, agent setup/contacts/grants, consent and callback approval, transcript controls, reported outcomes in Calls | Real mobile browser visual/accessibility review; no browser-control environment was available in this run |
| Account lifecycle | Private export, current-password/verified-identity deletion, carrier-disconnect guard, cascading private data, reset revokes app grants | Confirm production export/deletion and restore retention policy |
| Operations | Consistent private SQLite backups with restore test; health/readiness/build-drift probe; runbook | Railway access, volume backup policy and actual staging restore/restart evidence |
| Browser human join / takeover | **Demo only; production media transport is not implemented** | Add a supported conference/participant architecture, scoped browser media credentials, speaker/agent/user controls, participant state and actual microphone/audio test |
| Live captions | **Not implemented on real call audio** | Provider audio stream, authenticated event delivery, real-time ASR and real latency/consent test |
| Catalog distribution | Custom connector setup and skill ready | Actual Grok compatibility and any catalog submission/approval process; do not claim an official listing |
| Billing | Customer-owned SignalWire/xAI projects pay their own provider charges | No managed resale billing or subscription checkout is shipped or advertised as working |

## Public host observed on 2026-11-16

`agentbridge.victor.ceo` is reachable and protects anonymous workspace access. Its session endpoint reports accounts unconfigured, tester-only mode and registration unavailable. `/mcp` and OAuth discovery are absent. The public version has not picked up the existing GitHub changes. Hosting access is unavailable in this run; the Railway connection request remains pending. A source merge or private Sites publication does not resolve these production gates.

## Automated evidence

The official MCP client exercises real HTTP/JSON-RPC over the Node adapter, registration/PKCE, scopes, confidential clients, token rotation/replay, owner consent, contact recognition/outcome recall, cross-account isolation, demo exclusion and an approved durable callback using a carrier contract fixture. New transcript tests verify explicit permission, actual owned-audio handling, fixed xAI contract, encrypted keys, successful-result reuse, no automatic uncertain replay and local data deletion. Backup tests restore encrypted data from a verified private SQLite snapshot. UI journeys exercise consent, new-user email return, contacts/revocation and transcription/removal through the rendered app.

Automated fixtures do not prove a real call, carrier audio, email inbox delivery, Grok compatibility or speech-recognition quality. Record final test counts and GitHub checks in the merged PR. See [operations and required smoke test](RELEASE_OPERATIONS.md).

## Media architecture decision still required in code

The current real path is a cXML two-leg forward/callback, with provider-hosted static scripts so it can also work from the private preview. The Zoom-like room is a fictional demo. SignalWire's modern Browser SDK uses Call Fabric subscriber tokens, while the current route is Compatibility/cXML; these are distinct call paths, not interchangeable UI switches. See [SignalWire voice approaches](https://signalwire.com/docs/platform/voice/make-and-receive-calls) and [Browser SDK authentication](https://signalwire.com/docs/browser-sdk/guides/authentication).

Do not redirect live customer legs into an untested conference or expose a project token in the browser. Implement and verify a supported bridge/conference path on a public media-capable service, including signed callbacks, account/room isolation, scoped short-lived browser access, reconnection, mute/takeover, safe ending and optional live ASR. That work remains necessary for the complete product originally requested.
