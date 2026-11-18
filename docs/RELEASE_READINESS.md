# AgentBridge release readiness

Release candidate `1.3.0-rc.3` includes opt-in Node call rooms and a fix for the Studio reload loop after authentication. Public launch still needs the production checks below.

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
| Onboarding/studio | Chromium exercised signup, verification, credentials, number import, destination pairing, callback and password recovery at a 390 px viewport | Real handset accessibility and inbox delivery |
| Account lifecycle | Private export, current-password/verified-identity deletion, carrier-disconnect guard, cascading private data, reset revokes app grants | Confirm production export/deletion and restore retention policy |
| Operations | Consistent private SQLite backups with restore test; health/readiness/build-drift probe; runbook | Railway access, volume backup policy and actual staging restore/restart evidence |
| Browser human join / takeover | Node cXML bidirectional stream relay, ephemeral browser tickets, participant controls, invitations and answer-before-transfer | Verify actual mobile and desktop microphones, audio quality, hold/mute, reconnection and independent leave with consenting phones |
| Live captions | Opt-in xAI streaming recognition over mixed room audio | Verify live results, latency, consent and usage in the actual account |
| Catalog distribution | Custom connector setup and skill ready | Actual Grok compatibility and any catalog submission/approval process; do not claim an official listing |
| Billing | Customer-owned SignalWire/xAI projects pay their own provider charges | No managed resale billing or subscription checkout is shipped or advertised as working |

## Public host checked on 2026-11-18

Before this candidate rollout, the domain served `1.3.0-rc.1` at `61df03b`. Accounts, encrypted storage and MCP/OAuth were configured. The service reported tester signup, an existing account, email disabled and HTTP 503 at `/readyz`. Run the exact-commit release check again after Railway deploys.

## Automated evidence

The official MCP client exercises real HTTP/JSON-RPC over the Node adapter, registration/PKCE, scopes, confidential clients, token rotation/replay, owner consent, contact recognition/outcome recall, cross-account isolation, demo exclusion and an approved durable callback using a carrier contract fixture. New transcript tests verify explicit permission, actual owned-audio handling, fixed xAI contract, encrypted keys, successful-result reuse, no automatic uncertain replay and local data deletion. Backup tests restore encrypted data from a verified private SQLite snapshot. UI journeys exercise consent, new-user email return, contacts/revocation and transcription/removal through the rendered app.

Automated fixtures do not prove a real call, carrier audio, email inbox delivery, Grok compatibility or speech-recognition quality. Record final test counts and GitHub checks in the merged PR. See [operations and required smoke test](RELEASE_OPERATIONS.md).

## Media and acceptance

The Node relay authenticates both phone streams and per-call browser tickets. Media and live captions use bounded memory. Direct cXML calls and the private preview remain available for phone-to-phone callbacks. Test the optional room on the candidate with actual SignalWire and xAI credentials. [First outbound call and room acceptance](SIGNALWIRE_LIVE_TESTING.md)

Chromium 156 exercised the production Node adapter over local HTTPS with an isolated database, a captured verification/reset email and two simulated carrier sockets. Starting from the marketing signup button, the mobile viewport verified an account, connected its provider, imported a voice number, saved a destination and started a callback. The room showed both phones and the owner. Listen-only join made zero microphone requests. After opt-in, a synthetic microphone sent audio through the real AudioWorklet and relay to a phone socket. The desktop browser signed in separately and rejoined after the mobile browser left. Resetting the password revoked the earlier desktop session. Physical phones, real inbox delivery and Grok still require production acceptance.

## Historical evidence for rc.1

[PR #60](https://github.com/premiumcentraal-boop/AgentBridge/pull/60) merged as `ff22b2033b08c16b0c6cb7661ef0b575b24088a5` after exact-commit [Quality gate #43939246239](https://github.com/premiumcentraal-boop/AgentBridge/actions/runs/43939246239) succeeded. Local checks: 226 backend/security, 7 structural site audits, 35 rendered UI journeys, 3 actual Worker artifact checks and 13 local-MCP checks (284 total). Pinned Gitleaks found no source leaks; the runtime npm audit reported no vulnerabilities.

The Docker image compiled successfully using the managed environment's public network CA mounted only during validation. Starting the image was blocked by the workspace disk limit, so container-startup verification is incomplete. The Node runtime HTTP and Worker artifact suites passed. No real carrier, inbox or Grok test was performed. See the [open-issues audit](OPEN_ISSUES_AUDIT.md) for all nine open issues and the three deliberately unmerged legacy security drafts.
