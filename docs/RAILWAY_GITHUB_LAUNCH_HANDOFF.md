# AgentBridge launch handoff — Railway + GitHub

**For one agent responsible for both implementation and deployment.**

Updated 2026-11-18. Owner/test email: `premiumcentraal@gmail.com`.

Public signup is authorized: **open email registration**, not a single-email allowlist.

## 1. Your assignment

Finish the existing AgentBridge product and release it at **https://agentbridge.victor.ceo**. Own the GitHub work, Railway configuration, email setup, missing calling features and production verification together. Preserve the existing design and customer data.

The repository already contains the marketing site, studio, account API, SignalWire integration and an account-linked MCP connector. Start from those. The Node candidate includes opt-in live call rooms and streamed captions. Deploy the reviewed commit and verify actual provider and device behavior in phase D.

Work through the phases below. Continue routine implementation and deployment within this scope. If access is missing, complete independent work, then identify the exact account, credential or human step needed. Never request passwords or API keys in ordinary chat.

## 2. Start here

| Reference | Location / status |
| --- | --- |
| Authoritative repository | https://github.com/premiumcentraal-boop/AgentBridge |
| Branch to start from | Latest reviewed `main`; fetch before working |
| Handoff baseline before the media candidate | `a4073659e2dc555802e459e07f0433c535e26dff` |
| Main feature implementation | [PR #60](https://github.com/premiumcentraal-boop/AgentBridge/pull/60), merged as `ff22b2033b08c16b0c6cb7661ef0b575b24088a5` |
| Release/open-issue audit | [PR #61](https://github.com/premiumcentraal-boop/AgentBridge/pull/61), merged as `61df03b7d190b60ed42fc74801f9a59a1b0a2070` |
| Application release candidate | `1.3.0-rc.2`, declared in `shared/release.mjs` |
| Public production target | https://agentbridge.victor.ceo |
| Separate owner-private preview | https://agentbridge-worldwide.premiumcentraal.chatgpt.site |

**Public check on 2026-11-18 before the media candidate rollout.** The service reported `61df03b`, tester signup, an existing account, encrypted storage and MCP. Email was disabled and `/readyz` returned 503. Use the current public probe after deployment.

The private preview was updated successfully, with its audience, database and existing secret preserved. Its success is not evidence that Railway is deployed. It does not expose the public MCP connector.

### What already works in code

- Email signup, verification, password login/recovery and persistent isolated accounts.
- Encrypted customer-owned SignalWire credentials; number inventory/search/purchase/import; saved destinations; explicit forwarding activation/deactivation/reconciliation; callbacks, end/transfer and recording controls.
- Seven account-linked MCP tools, OAuth/S256 PKCE, permission consent, token refresh/replay protection and immediate app revocation.
- Contact recognition by normalized phone/name, previous-call context, saved notes and source-labelled agent outcomes. Real context excludes demo data.
- Explicit xAI transcription of completed owned recordings, saved text/history, duplicate-request protection, uncertain-job review and transcript removal.
- Account export/deletion, setup guidance, consistent SQLite backups and deployment/version probes.

- Opt-in Studio call rooms on Node with real audio transport, extra phones, independent mute and xAI live captions. See phase D for acceptance.

### Outstanding acceptance

- Production Railway/email configuration and actual inbox, carrier, xAI and Grok acceptance tests.
- Real mobile/desktop audio and captions with consenting phones, the customer’s keys, and provider billing evidence.
- Legacy reservation-service security/provider verification described in section 9.

Historical evidence: **284 checks passed**: 226 backend/security, 7 site audits, 35 rendered UI journeys, 3 Worker-artifact checks and 13 local-MCP checks. Exact-commit GitHub CI and source secret scanning passed; runtime dependency audit reported zero vulnerabilities at that time. Docker compilation passed using the managed environment's network CA only during validation. Container startup was not verified because the workspace ran out of disk. Re-run appropriate checks for your final code; fixtures are not real-call evidence.

## 3. Know which service you are deploying

| Component | Role | Action |
| --- | --- | --- |
| Repository-root `Dockerfile`, `railway.json`, `server/` and `web/` | Public marketing site, studio, customer account API and hosted MCP | Deploy this to the AgentBridge Railway service |
| Private ChatGPT Sites Worker | Separate tester preview with its own identity/database | Preserve its access and secrets; do not replace it with public signup |
| `backend/` legacy Cloudflare Worker | Separate reservation/proof/billing-recovery implementation | Do not deploy or enable it just to make the studio work |
| `local-mcp/` | Separate local/operator read-only MCP | Not the customer-account hosted connector |
| Victor and Meridian services | Existing unrelated products | Preserve their services, domains and email records |

The public account database uses **`ab_*` tables**. The legacy Worker uses different tables and migrations. Do not apply its bootstrap/preflight commands to the account database.

## 4. Phase A — inspect access, protect data, establish the release

1. Read any applicable `AGENTS.md`, then the linked runbooks at the end of this document. Fetch `main`, inspect current PRs and use an isolated feature branch for code changes.
2. In Railway, locate the service that currently owns `agentbridge.victor.ceo`. Record its project/service/environment, GitHub source branch, root directory, last deployed commit, volume and relevant variable **names/configured status**. Do not print secret values.
3. Use that existing AgentBridge service if it is the right target. If no AgentBridge service exists, prepare a dedicated service from this repository. Do not create a competing service/domain attachment or modify Victor/Meridian.
4. Back up an existing volume and account database before upgrading. Preserve the existing `PROVIDER_CREDENTIALS_KEY` and retain it separately from backups. **Never generate a replacement key for an existing encrypted database.**
5. Choose and record the full GitHub commit to deploy after required checks pass. Fix any drift between Railway's source configuration and the intended branch. A merge is not proof of deployment.

For a consistent existing-database backup, run on the correct service:

```sh
node scripts/backup-accounts.mjs /data/accounts.sqlite /private-backups/accounts-before-release.sqlite
```

Use a real private mounted backup location with sufficient space. The script refuses to overwrite an existing file. An account export omits credentials and cannot substitute for this backup. If the database does not exist yet, record that fact rather than manufacturing a backup.

## 5. Phase B — configure Railway, domain and email

### Railway service

- Source: this repository; deployment branch: reviewed `main`; root: repository root.
- Build using the checked-in **Dockerfile**, Node 24. Retain its command: `node server/entrypoint.mjs`.
- One replica while using SQLite. Mount a durable volume at **`/data`**.
- Keep the checked-in Railway health check at **`/health`**. Separately require `/readyz` and the launch probe before declaring configuration ready.
- Railway supplies `PORT`. Confirm the service listens on it and HTTPS reaches the correct container.
- Verify or attach `agentbridge.victor.ceo`; use Railway's actual returned DNS target. Do not invent a CNAME or alter the apex domain's unrelated records.
- Confirm build metadata receives the selected source SHA through `RAILWAY_GIT_COMMIT_SHA`. The Dockerfile uses it to stamp the build.

### Runtime variables

| Variable | Required value / handling |
| --- | --- |
| `NODE_ENV` | `production` |
| `STUDIO_PUBLIC_ORIGIN` | `https://agentbridge.victor.ceo` exactly |
| `STUDIO_SIGNUP_MODE` | `public` |
| `STUDIO_DATABASE_PATH` | `/data/studio.sqlite` |
| `STUDIO_ACCOUNT_DATABASE_PATH` | `/data/accounts.sqlite` |
| `PROVIDER_CREDENTIALS_KEY` | Existing server wrapping key; 64 hexadecimal characters. For a genuinely new database only, generate once securely and retain it |
| `RESEND_API_KEY` | Sending-only secret restricted to the verified sending domain |
| `AUTH_EMAIL_FROM` | Example after verification: `AgentBridge <accounts@mail.agentbridge.victor.ceo>` |
| `AGENTBRIDGE_CALLING_COUNTRIES` | Start with `US`; expand provider callbacks only after supported-country review/testing. This does not expand native Grok permissions |
| `STUDIO_TRUST_RAILWAY_PROXY` | `true` only if all untrusted traffic reaches the listener through Railway's public HTTP edge and its injected environment ID is present; otherwise leave unset |

Keep `STUDIO_DEV_MODE` unset. Public mode does not require `DEMO_TESTER_EMAIL`, `DEMO_SIGNUP_INVITE_SHA256` or an operator access key. Do not restore tester-only signup accidentally. Do not enable legacy carrier routing flags on this service.

Store runtime secrets in Railway's secret configuration, never GitHub files, build arguments, screenshots, issue bodies or logs. Customer SignalWire and optional xAI keys belong in the authenticated Studio setup forms and encrypted account vault. Do not install one shared customer carrier key across accounts.

### Email and DNS

1. Inspect existing Resend setup before creating another sender/domain.
2. Verify a dedicated sending domain, such as `mail.agentbridge.victor.ceo`, using the exact DNS records Resend provides. Preserve Victor's existing mail records.
3. Disable email click/open tracking for verification/recovery links. Use a domain-restricted sending key.
4. Set the sender/key in Railway and redeploy. Confirm the sender domain is actually verified; syntactically valid variables alone do not prove delivery.
5. Complete signup, verification and password recovery in a real inbox. The owner/test email is `premiumcentraal@gmail.com`; leave public signup open to other users.

### Migrations and first rollout

Node applies account SQL migrations transactionally at startup. Current account migrations are **0000 through 0005**. Migration 0005 adds hashed route tokens and a durable inbound-call replay guard. Existing routes stay direct until the owner activates the room option. Preserve old SQL bytes and migration history. Do not reset the volume, recreate accounts or manually repair migration tracking to get a green deploy.

Deploy the reviewed commit, inspect startup/build logs without exposing secrets, and verify existing records remain. If existing tester accounts are unverified after enabling public signup, use the email verification flow; do not bypass verification in the database.

## 6. Phase C — prove the deployed baseline

Run from the checked-out, tested release:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix web ci --ignore-scripts --no-audit --no-fund
npm --prefix local-mcp ci --ignore-scripts --no-audit --no-fund
npm run ci
npm run test:local-mcp

# Set this to the actual reviewed commit deployed on Railway.
AGENTBRIDGE_RELEASE_SHA="<full-deployed-GitHub-commit>"
npm run launch:check -- https://agentbridge.victor.ceo "$AGENTBRIDGE_RELEASE_SHA"
```

The probe is read-only. It does not send email, buy a number or place a call. In a managed shell, an explicit environment-proxy setting may be needed for network access; that is not a reason to disable TLS verification in the application.

| Check | Required observation |
| --- | --- |
| `/health` | `mode: public-accounts`, accounts/email/signup/vault/MCP configured; application version matches the static build |
| `/readyz` | HTTP 200 with configuration ready; this does not prove external acceptance |
| `/build.json` and `/health` build metadata | Exact selected release commit, not an older branch/build |
| `/api/auth/session`, anonymous | Public signup, registration/verification/recovery available; no authenticated account |
| `/api/studio/overview`, anonymous | HTTP 401 |
| `/mcp`, anonymous | HTTP 401 with protected-resource discovery challenge |
| `/.well-known/oauth-authorization-server` | Correct public issuer/endpoints, S256 support |
| `/.well-known/oauth-protected-resource/mcp` | Resource is exactly `https://agentbridge.victor.ceo/mcp` |
| Account/studio pages | No-store, protected from framing, same-origin writes |
| Restart/redeploy | Existing accounts, contacts, history and encrypted credentials survive |

Use the app's release/build metadata for this comparison; the package-manager banner can retain a different package version. A root page that loads or a green Railway heartbeat is insufficient.

Then complete real workflows:

1. **Accounts:** signup → inbox verification → password → empty studio → sign out/in → recovery. Confirm old sessions and connected-app grants are revoked after reset. Verify account isolation with a second test account.
2. **MCP/Grok:** connect the actual Grok custom connector over OAuth; check consent, scopes and callback origin. Save a real test contact, prepare by name and differently formatted phone, save a factual outcome after a real call, and confirm recall next time. Revoke access and verify subsequent calls fail. Test the new-user signup return to consent. Record actual client/version and failures.
3. **SignalWire:** connect the customer's project through Studio, enable live mode, import an owned number, save a destination and explicitly activate forwarding. Verify real routing and restoration of the previous handler when deactivated. Test callback, end and transfer with consenting phones and inspect provider status/duration/charges.
4. **Capture:** with participant permission, start/pause/resume/stop recording, play authenticated audio, transcribe a completed recording with a real xAI key, verify saved context/history, remove local text and delete provider audio separately. Check that uncertain writes are not automatically retried.
5. **Data/recovery:** export data, exercise deletion on a disposable account, test a private backup restore on staging and verify preserved keys decrypt. Restoring old data may restore old tokens; revoke before exposing a restored service.

Use explicitly approved real test numbers and charges. Do not dial the repository's fictional `555` fixtures, buy unspecified numbers or treat entering an API key as approval for arbitrary paid actions.

## 7. Phase D — verify the live call room and captions

Deploy one replica of the Node service with its existing volume and wrapping key. Allow WebSocket upgrades to `/api/media/carrier` and `/api/media/studio` on the same public hostname. The carrier uses cXML bidirectional streams authenticated by bearer token, project and call ID. Studio issues a session-bound, one-use ticket. These endpoints share the Node service and need no separate media server or webhook signing variable.

1. Under **Calling setup**, verify the owner’s SignalWire Space, Project ID and token with Voice and Numbers permissions. Choose **Use my SignalWire project**. Import an owned number and save an outside destination. For domestic trial tests, verify both outside phones.
2. On the saved connection, choose **Test callback**, enter a different consenting phone and select **Enable Studio call room**. Confirm charges. Answer the callback, then answer the destination. Verify caller ID, both voice directions and the five-minute cap.
3. Open the active call and **Join call** on mobile and desktop. Test microphone-off entry, denied microphone access, mic-on entry, speaker mute, independent remote mute and reconnection. Invite another saved contact. Transfer and verify the original destination remains until the replacement answers. Leave the browser and verify the original phone conversation continues.
4. With everyone’s permission and the customer’s xAI key, enable live captions. Verify actual text, timestamps and charges. Stop, leave and rejoin to check that live captions are transient. Use separate controls for saved recording and post-call transcription.
5. On a test routing number, explicitly activate forwarding with the room option. Place an inbound call and repeat the join test. Deactivate forwarding and confirm the previous SignalWire handler was restored. Idle code deployment never upgrades an existing forwarding route.
6. Connect Grok through the hosted MCP. Have the owner approve the callback phones, charges and optional Studio room. Verify one provider callback, then save and retrieve the actual outcome. The MCP supplies contact context and callback actions. Grok retains its own voice and native calling confirmation.

Schedule redeploys between live room calls. A Node restart closes its active room streams. For rollback, finish the calls and deactivate room-enabled forwarding while the candidate service still runs. Restore the older image with the existing volume and server wrapping key. Re-enable direct forwarding with the owner’s confirmation if appropriate.

[AgentBridge outbound steps](SIGNALWIRE_LIVE_TESTING.md) · [SignalWire stream protocol](https://signalwire.com/docs/compatibility-api/cxml/reference/voice/stream) · [xAI streaming speech-to-text](https://docs.x.ai/developers/model-capabilities/audio/speech-to-text)

## 8. Code map for the same agent

| Area | Repository paths |
| --- | --- |
| Public HTTP adapter and startup | `server/app.mjs`, `server/entrypoint.mjs` |
| Email/auth/account lifecycle | `server/accounts/service.mjs`, `email-auth.mjs`, `email.mjs`, `lifecycle.mjs` |
| Vault, SignalWire and routing | `server/accounts/credential-vault.mjs`, `provider-control.mjs`, `signalwire-client.mjs`, `live-routing.mjs`, `live-calls.mjs`, `live-workspace.mjs` |
| Hosted MCP/OAuth/contact context | `server/agents/http.mjs`, `oauth-provider.mjs`, `access.mjs`, `api.mjs`, `contacts.mjs`, `tools.mjs` |
| Saved transcription | `server/accounts/transcription.mjs` |
| Account schema/backup | `server/accounts/migrations/`, `node-database.mjs`, `scripts/backup-accounts.mjs` |
| Studio/account/provider/agent UI | `web/src/studio.jsx`, `account-auth.jsx`, `provider-live.jsx`, `agents.jsx`, `launch-settings.jsx` |
| Live phone and browser media | `server/media/`, `web/src/live-room.jsx`, `assets/media/room-audio.js`, `server/test/call-media.test.mjs` |
| Existing demo call-room UI | `web/src/call-tools.jsx`, `call-room.css`, `studio-navigation.jsx` |
| Phone normalization and return path | `shared/phone.mjs`, `shared/return-path.mjs` |
| Release/build/hosting | `shared/release.mjs`, `scripts/build-site.mjs`, `scripts/check-public-launch.mjs`, `Dockerfile`, `.dockerignore`, `railway.json` |
| Relevant tests | `server/test/agent-mcp.test.mjs`, `public-accounts.test.mjs`, `provider-live.test.mjs`, `transcription-lifecycle.test.mjs`, `backup.test.mjs`; `web/test/account-flow.test.mjs`, `provider-flow.test.mjs`, `workspace.test.mjs` |

Hosted MCP tools: `get_agentbridge_setup`, `prepare_call`, `get_contact_history`, `save_contact`, `save_call_outcome`, `get_call_status`, `start_call`. `prepare_call` never dials. Agent callbacks require a separate owner-approved Studio action. Downloadable workflow: `https://agentbridge.victor.ceo/agentbridge-skill.md` once the Node service is live. This is a custom connector; no official catalog listing/approval has been established.

## 9. Existing GitHub work and product boundaries

Review [OPEN_ISSUES_AUDIT.md](https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/OPEN_ISSUES_AUDIT.md), then refresh live issue/PR states. At the last review, open issues were **#1, #3, #7, #9, #11, #14, #50, #57 and #59**.

- #7/#9/#14 have source fixes/integration coverage on main and may need evidence-based triage, not another overlapping implementation.
- #1/#3/#11 retain native/provider/security or broader billing acceptance work. Do not infer those requirements are all met by the newer Studio BYOK path.
- Drafts **#49, #56 and #58** remain deliberately unmerged. Provider Voice Logs completeness/finality, force-unlock/audit atomicity and migration-tracker/actual Wrangler D1 verification are still relevant to that legacy service. Inspect their latest commits and gates before any integration; do not mass-merge them because CI is green.

The default launch model is **bring your own provider keys**: customers pay SignalWire/xAI directly. No managed resale billing/subscription checkout is shipped. Do not invent pricing guarantees, verified cost settlement or per-agent spending caps.

Static forwarding is a customer-activated public telephone route: anyone knowing the number can call while it is active, and the customer's provider project pays. It is not the legacy cryptographic per-call reservation flow. Preserve explicit activation and duration limits, configure appropriate provider spending limits and do not claim caller authentication that is absent.

Existing callback/forwarding caps are 300 seconds. Saved transcription is explicit and limited to completed owned recordings of 30 minutes/16 MB and 20 requests/account/hour. Audio that was never recorded cannot be recovered. Removing AgentBridge data does not release carrier numbers, cancel carrier billing or erase SignalWire recordings.

## 10. Finish criteria and hand-back

Do not describe the full product as released until all applicable rows have actual evidence:

- [ ] Reviewed GitHub changes merged with passing checks for their exact commits.
- [ ] Correct Railway service/domain, durable volume, preserved key and migrations; actual deployed SHA matches the release.
- [ ] Public signup, inbox verification, login/recovery and isolated accounts work on the custom domain.
- [ ] Actual Grok OAuth connection, contact lookup/history recall, scope enforcement and revocation work.
- [ ] Consenting real carrier calls, forwarding restoration, callbacks/control and provider evidence pass.
- [ ] Recording/playback/xAI transcription/removal and paid-operation recovery pass.
- [ ] Browser join, real participants, microphone/speaker/agent controls, leaving/takeover and live captions are implemented and tested on real audio/mobile devices.
- [ ] Restart persistence, private backup/restore and disposable-account export/deletion pass.
- [ ] Remaining legacy/security gates and unsupported platform features are accurately documented; no unsupported launch claims.

Deliver one final report with: public URL, selected GitHub SHA and PRs, Railway service/environment/deployment ID, variable **names/configuration status**, backup/restore evidence, automated and real acceptance results, remaining blockers and rollback procedure. Keep sensitive phone numbers, provider IDs, audio and transcripts in private operational records; use redacted references in shared reports. Include no secret values.

If only deployment/account setup is complete, call that milestone complete and list media/other work still open. Do not equate a running website with the fully functional product.

### Supporting runbooks

- [Release readiness](https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/RELEASE_READINESS.md)
- [Railway and email setup](https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/RAILWAY_STUDIO.md)
- [Operations, backups and rollback](https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/RELEASE_OPERATIONS.md)
- [Grok/MCP connector](https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/GROK_CONNECTOR.md)
- [Saved transcription](https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/SAVED_TRANSCRIPTION.md)
- [SignalWire live testing](https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/SIGNALWIRE_LIVE_TESTING.md)
- [Open-issue audit](https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/OPEN_ISSUES_AUDIT.md)
