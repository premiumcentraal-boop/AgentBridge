# Routing plan: from read-only to one approved call (US first, then international)

Written 2026-11-09 against branch `local-mcp` (based on `main` 84fc990). Read with
[NORTH_STAR.md](NORTH_STAR.md), [SIGNALWIRE.md](SIGNALWIRE.md),
[CHAT_FIRST_MCP.md](CHAT_FIRST_MCP.md), [ROADMAP.md](ROADMAP.md) and issues
[#3](https://github.com/premiumcentraal-boop/AgentBridge/issues/3) and
[#9](https://github.com/premiumcentraal-boop/AgentBridge/issues/9).

**Where things stand today**
- The SignalWire Project credentials work. The owner's US DID is in the Project and is set as `US_BRIDGE_DID`. Read-only tools work through the local stdio MCP server (`local-mcp/`).
- **Routing is off.** The Worker's SignalWire endpoint (`handleSignalWireSwml` in `backend/src/signalwire.mjs`) has three limits:
  - it only ever returns **hangup** SWML;
  - it never reads D1 reservations;
  - it cannot connect a call.
- `signalWireConnectPlan()` builds a `connect` document, but nothing in the live code calls it.
- The Twilio path (`incoming()` in `backend/src/index.mjs`) can `<Dial>` once all of these are true:
  - `PRIVATE_TEST_OUTBOUND_ENABLED=true`;
  - the caller matches `TEST_CALLER_E164`;
  - a ready reservation exists for `TEST_DESTINATION_E164`.

  The owner's number is on SignalWire, not Twilio, so this plan uses the **SignalWire** path.
- `requireEnv()` in `index.mjs` requires `TWILIO_AUTH_TOKEN`. While it does, the reservation REST API and `prepare_international_call` cannot run on a SignalWire-only deployment.
- Nothing has been deployed. The Cloudflare Worker + D1 backend does not exist anywhere yet.

**Rules that never change**
- Grok Bot is the only speaking AI. Never use SignalWire AI, `record`, `transcribe`, `stream` or another voice agent.
- Never commit secrets or paste them into chat.
- Routing stays off by default, behind an explicit flag.
- No number purchases.
- Nothing is deployed publicly without the owner's explicit approval.
- Changes go in as small reviewable PRs, and `npm run ci` plus `npm run test:local-mcp` must pass.

**Unknowns. Treat these as unknown until they are tested:**
1. Can Grok Bot's native calling dial a US number at all for this account? What caller ID does it present? Can it send DTMF digits after the call connects?
2. Does SignalWire's inbound Calling SWML payload include any carrier attestation (STIR/SHAKEN) the Worker could use? The repo only validates `call.from_number`, `to_number`, `project_id`, `direction`, `type` and `call_id`.
3. Does SignalWire offer a per-project spending cap or a per-country outbound permission setting? Which dashboard page holds it?
4. Are SignalWire status callbacks (`call_state_url` / `status_url`) signed the same way as SWML fetches? The webhook-security guide lists SWML fetches as signed but does not list status callbacks. Assume they are unsigned until shown otherwise.
5. Which SignalWire REST endpoint returns a call's final state, for reconciliation?
6. What does SignalWire charge per minute for the chosen US and international destinations? The repo has no rate source; `price_verified` is always `false`.

---

## Phase 0: Prerequisites and feasibility (no code deployed, no money spent)

**You do**
1. Confirm in writing (for yourself) that you want this for **personal use only**: one account, one bridge DID, and one test destination at a time.
2. Read SignalWire's terms and acceptable-use rules on call forwarding and international calling. Also confirm that forwarding your own calls is allowed in your country and the destination country. If anything is unclear, ask SignalWire support.
3. Ask SignalWire support, or look in your Space, for the answers to unknowns **3**, **5** and **6**: spending limits, country permissions, the call-status API, and per-minute rates for one US destination and one international destination. Write the answers down without any credentials.
4. Pick two consenting test contacts: one US number and one international number. Both people must agree to receive test calls.
5. Check Grok Bot's calling feature (unknown 1). Can it call a US number you specify, on your plan and under its terms? Do not call the bridge DID yet; that happens in Phase 4.
6. Make sure your SignalWire account has a small prepaid balance only. Do not set up auto-recharge for testing.

**Coding agent does**
- Nothing in production code yet.
- Add a "Phase 0 findings" section to `docs/ROUTING_PLAN.md` from your notes, with no secrets. Append a `docs/DEVELOPMENT_LOG.md` entry.

**Done when**
- [ ] Personal-use scope and terms check written down
- [ ] Rates for both test destinations recorded, with a source and a date
- [ ] Whether a SignalWire spend cap or country restriction exists is known
- [ ] Two consenting test contacts chosen
- [ ] Grok Bot's ability to dial a US number is confirmed, or it is recorded that it can't (if it can't, stop: AgentBridge cannot work as designed)

---

## Phase 1: Security fixes (#9, then #3)

### #9: stale reservations
The current `main` appears to already contain most of the fix:
- `prepareReservation()` expires rows with `expires_at <= ?` and returns `409 RESERVATION_EXPIRED` for expired same-key retries.
- `reservationView()` reports `expired` when `expires_at <= now`.
- `incoming()` only consumes rows where `expires_at > now`.
- `backend/test/reservation-expiry.test.mjs` covers the expired retry, terminal retry, unexpired retry and stale GET cases.

**Not verified:** an exact `now == expires_at` test using a fixed clock, and an MCP `get_call_status` expiry test.

### #3: proving the call really comes from your approved Grok Bot session
Caller ID can be spoofed. A valid carrier signature proves SignalWire sent the request, not who is calling. Issue #3 offers three possible fixes:

| Option | Works if | Cost/risk |
| --- | --- | --- |
| A. DTMF challenge: the reservation returns a short one-time code, Grok Bot dials the DID and types the digits, and SWML `prompt` collects them before `connect` | Grok Bot can send DTMF (unknown 1) | No extra numbers. Best option if supported. |
| B. A unique DID per reservation | Numbers can be bought | **Requires buying numbers: out of scope** unless you approve it later |
| C. Personal-use residual risk: caller-ID allowlist plus a 90 s window, one destination, hard per-call and per-day caps | You accept in writing that a spoofer who knows your DID, your caller ID and the timing could cause at most one capped call | No public use, ever. This must be your documented decision, not a default. |

**You do**
1. Review and merge (or close) the agent's #9 PR. Close #9 when its checklist passes.
2. After Phase 4 shows what Grok Bot can do, choose **A** or **C** for #3 and write the choice in the issue. B is excluded.
3. Review and merge each #3 PR. Do not merge anything that turns routing on.

**Coding agent does** (separate PRs, all offline with fake D1 and fake fetch, no live calls)
1. **#9 PR (small):**
   - Add `now == expires_at` and `now == expires_at - 1` tests with a fixed clock for `prepareReservation`, `GET /v1/reservations/:id`, MCP `get_call_status` and `incoming()`.
   - Document the idempotency contract in the README.
2. **Provider event ledger PR:**
   - Add a `provider_events` table to `backend/schema.sql` with columns `provider`, `provider_call_id`, `event_type`, `received_at`, `reservation_id`, `outcome`, plus a unique key on `(provider, provider_call_id, event_type)` and a retention note.
   - Add a migration file. **Do not reject on a repeated signature**: SignalWire retries with the same signature. De-duplicate on the call ID instead.
3. **SignalWire reservation consumption PR (still hangup-only):**
   - Add a provider column, or a separate `provider_call_id`, to `reservations`. The current `call_sid` check `^CA[a-f0-9]{32}$` is Twilio-only; SignalWire `call.call_id` is a UUID.
   - In `handleSignalWireSwml`, after the existing signature and field checks, atomically claim the matching ready reservation (`UPDATE … WHERE status='ready' AND expires_at>?`) and log the event.
   - **Keep returning `signalWireHangup()`.**
   - Tests: concurrent claims (at most one), replayed body, expired reservation, wrong project, DID or caller, missing signature.
4. **Challenge PR (only if option A is chosen):**
   - Generate a 6–8 digit one-time code per reservation and store only its SHA-256 hash, bound to account and reservation.
   - Return the code in the reservation or MCP response, never in URLs or logs.
   - SWML first `prompt`s for the digits; the Worker checks them on a signed second request (`execute` to the same signed endpoint with a distinct path) and only then would return `connect`. A failed check ends with `hangup`.
   - Tests: wrong, expired and reused codes, and a code from another reservation.
5. **Stuck-call PR:**
   - Do not release a `connecting` row just because time passed.
   - Add a reconciliation function that asks SignalWire for the call state (endpoint: unknown 5) and puts unresolved rows into a new `quarantined` status.
   - Add `quarantined` to the schema `CHECK`, and keep `one_active_reservation_per_account` correct.
6. Update the README security limits, the ROADMAP and the DEVELOPMENT_LOG in each PR.

**Done when**
- [ ] #9 closed with fixed-clock boundary tests
- [ ] SignalWire inbound requests atomically consume at most one reservation (tests prove it); responses are still hangup-only
- [ ] Event ledger with de-duplication by call ID, and a retention note
- [ ] #3 option chosen and recorded; if A, challenge implemented and tested
- [ ] Stuck `connecting` rows reconciled or quarantined, never silently released
- [ ] `npm run ci` and `npm run test:local-mcp` green

---

## Phase 2: Caps, rates, destination rules and human approval

**You do**
1. Choose the limits. Suggested starting values:
   - 180 s per call (matches `MAX_CALL_SECONDS`);
   - 3 calls per day;
   - a maximum spend per call and per day in cents;
   - the countries allowed (start with US only, then one country).
2. Give the agent the per-minute rate for each allowed destination from Phase 0, with its source and date. These numbers are not secrets.
3. Turn on whatever spend limit or country restriction SignalWire offers (Phase 0, item 3). If none exists, record that the backend caps are the only protection.

**Coding agent does**
1. Destination policy module (new `backend/src/destination-policy.mjs`):
   - An allowlist of exact E.164 destinations, each with country, rate (cents/min) and rate source/date, held in non-secret config.
   - Block emergency and short codes (`911`, N11), US premium numbers (`+1900`, `+1976`), the bridge DID itself, and any destination not on the allowlist.
   - **US domestic is simpler:** no international permission, no country premium-range tables, lower cost. Still use the allowlist.
2. Spend ledger:
   - Before claiming a reservation, compute `max_cost = rate × ceil(max_seconds/60)`.
   - Atomically reserve it against the per-day cap in D1, and refuse if it would exceed the per-call or per-day cap.
   - Settle against the actual duration once the call is reconciled.
3. Generalize `prepareReservation()`:
   - Replace the single `TEST_DESTINATION_E164` equality check with the policy module. While testing, keep exactly one allowed destination.
   - Return `price_estimate`, `max_cost`, `rate_source` and `requires_user_approval: true`.
4. Backend-enforced approval:
   - A reservation starts as `pending_approval`.
   - A separate `POST /v1/reservations/:id/approve` (and an MCP tool) moves it to `ready` only within its TTL. Cost estimates are not shown to the AI as verified prices unless their source is recorded.
   - Grok Bot must ask you in chat before calling approve.
   - Tests: approve twice, approve after expiry, approve another account's reservation.
5. Decouple the provider:
   - Change `requireEnv()` so a SignalWire-only deployment (`TELEPHONY_PROVIDER=signalwire`) does not need `TWILIO_AUTH_TOKEN` or `TEST_CALLER_E164`, unless option C is chosen.
   - Keep the Twilio path fail-closed.
6. Extend `signalWireConnectPlan()`:
   - Add `max_duration` (≤ the cap), `timeout`, and `from` set to `US_BRIDGE_DID` (your owned number: never pass the inbound caller's ID through), plus `status_url` / `call_state_url` pointing at a new status endpoint.
   - No `record`, `transcribe` or `stream`. Update `backend/test/signalwire.test.mjs`.
7. Status endpoint `/telephony/signalwire/status`:
   - Treat it as unsigned (unknown 4). Protect it with a long random secret: either basic-auth credentials in the URL (SignalWire documents this for `call_state_url`) or a dedicated path secret.
   - Use the same bounded body reader, de-duplicate events into `provider_events`, and treat events as advisory (SignalWire says callbacks may never arrive). Reconcile instead of trusting them.
8. Add a read-only `get_routing_readiness` tool to `local-mcp/`. It reports which gates pass (flags only, never values) and must not toggle anything.

**Done when**
- [ ] Policy, caps and spend ledger enforced before any `connect` is generated (tests)
- [ ] Two-step approval enforced by the backend (tests)
- [ ] SignalWire-only configuration works without any Twilio settings
- [ ] Connect document has `max_duration`, `timeout`, `from` = your DID, and a status URL; no recording or AI
- [ ] Your SignalWire spend and country settings applied, or their absence recorded

---

## Phase 3: Private staging deploy (Worker + D1 + secrets)

The webhook must be reachable by SignalWire over HTTPS, so "private" means unadvertised, single-account and fail-closed, not unreachable. **This is a public deploy and needs your explicit approval.** The coding agent must not do it without that approval.

**You do**
1. Create or sign in to a Cloudflare account. On your own machine, run `npx wrangler login`. The repo has no pinned Wrangler version; the agent should add one.
2. Pick the hostname: a subdomain on a zone you control (the example config sets `"workers_dev": false`), or decide to allow `workers.dev`.
3. Create D1 and apply the schema:
   ```
   npx wrangler d1 create agentbridge-prototype
   npx wrangler d1 execute agentbridge-prototype --remote --file backend/schema.sql
   ```
   Apply the agent's migrations too.
4. Copy `backend/wrangler.example.jsonc` to `backend/wrangler.jsonc` (git-ignored; confirm this). Fill in:
   - `database_id`;
   - `PUBLIC_BASE_URL`;
   - `US_BRIDGE_DID`;
   - `SIGNALWIRE_PROJECT_ID`;
   - `SIGNALWIRE_SWML_WEBHOOK_URL` (the exact `https://…/telephony/signalwire/swml`);
   - the test destination and caller values.
5. Store the secrets with `npx wrangler secret put <NAME>`. You type the values; never paste them into chat:
   - `SIGNALWIRE_SIGNING_KEY`: from SignalWire Dashboard → **API Credentials** → **Signing Key** → **Show** (per SignalWire's webhook-security guide). It is **not** the API token.
   - `SIGNALWIRE_API_TOKEN` and `SIGNALWIRE_SPACE`, only if the Worker needs reconciliation or inventory.
   - The status-callback secret from Phase 2.
6. Create your account row:
   - Run `node scripts/provision-test-account.mjs <your DID>`. It prints SQL and a token and does not execute anything.
   - Apply the SQL with `wrangler d1 execute --remote`.
   - Store the token in a password manager. It belongs only in a private MCP connector setting.
7. Deploy with routing flags **unset**. Approve this deploy explicitly.

**Coding agent does**
1. Add `backend/package.json` (or root devDependency) with a pinned `wrangler`.
2. Add `backend/migrations/` and a `scripts/staging-preflight.mjs`. The preflight:
   - checks `GET /health` and that `/v1/*` is `401` without a token;
   - checks that an unsigned `POST /telephony/signalwire/swml` returns `403`;
   - checks that routing flags are off;
   - prints no secrets.
3. Confirm `.gitignore` covers `backend/wrangler.jsonc`, and add it if not. It currently covers `.dev.vars` and `.env*`, but not `wrangler.jsonc`.
4. Write `docs/STAGING_DEPLOY.md` with the exact commands above. **Do not run `wrangler deploy` yourself.**

**Done when**
- [ ] Worker reachable at your HTTPS hostname; `/health` OK
- [ ] Unsigned and forged SWML requests get 403; unauthenticated API requests get 401
- [ ] Secrets only in Cloudflare secrets; `git status` clean of config containing secrets
- [ ] Routing flags confirmed unset

---

## Phase 4: Point the DID's inbound calls at the Worker

**You do**
1. In the SignalWire Dashboard, set your DID's inbound **voice/calling** handler to an **external SWML URL**: exactly the value of `SIGNALWIRE_SWML_WEBHOOK_URL`. The repo's SIGNALWIRE.md calls this the "Calling SWML external webhook". The exact click path is **not documented in this repo**; follow SignalWire's "Handle incoming calls from code" guide.
2. Check that the endpoint rejects forgeries, as SignalWire's guide recommends: an unsigned `curl -X POST` must get 403.
3. **Hangup-only feasibility call:** have Grok Bot's native calling dial your DID once. With routing off, the call should end immediately. In the SignalWire call logs, note:
   - the caller ID that arrived;
   - whether the Worker accepted the signature;
   - whether a DTMF test is possible (unknowns 1 and 2).

   This costs one short inbound call.
4. Use the result to choose option A or C in #3 (Phase 1).

**Coding agent does**
- Add safe, minimal structured logging to the SWML handler: outcome codes only, with no numbers beyond the last 2 digits and no signatures or bodies. This lets the owner see why a call was refused.
- Add a test that logs never contain secrets or full numbers.

**Done when**
- [ ] The DID's inbound handler points to the exact signed URL
- [ ] A real Grok Bot call reaches the Worker, passes the signature check and gets hangup
- [ ] Observed caller ID and DTMF feasibility recorded in #3

---

## Phase 5: Turn on `connect` for one approved destination behind a flag

**You do**
1. Set the flags in Cloudflare yourself: `PRIVATE_TEST_OUTBOUND_ENABLED=true`, plus a new SignalWire-specific flag such as `SIGNALWIRE_CONNECT_ENABLED=true`. Both must be set.
2. Set the allowlist to **one US test destination** first.
3. Know how to turn routing off fast: unset either flag and redeploy, or point the DID back to hangup.

**Coding agent does**
1. In `handleSignalWireSwml`, return `signalWireConnectPlan(...)` **only** when every condition holds:
   - both flags are exactly `'true'`;
   - signature valid;
   - project, DID and direction match;
   - the reservation was atomically claimed, approved and unexpired;
   - the #3 check passes (challenge, or caller-ID with option C documented);
   - destination policy, caps and the spend reserve all pass.

   Otherwise return hangup.
2. Tests: every condition false on its own yields hangup; all conditions true yields exactly one `connect` to the allowlisted number with the caps; a second request for the same call yields hangup.
3. The kill switch defaults to off in the example config and the docs.

**Done when**
- [ ] Gate tests cover each failure on its own
- [ ] Default config yields hangup
- [ ] Owner, not agent, flipped the flags

---

## Phase 6: One consenting test call: US first, then international

**You do (US)**
1. Tell the US contact when to expect the call.
2. Ask Grok Bot to call your test destination. Approve the reservation in chat, let Grok Bot dial the DID, and enter the challenge if you chose option A.
3. Check: audio both ways; Grok Bot is the only AI on the line; the call ends at or before `max_duration`; the SignalWire charge matches the estimate.
4. Turn routing off again and record the result in #3 and the DEVELOPMENT_LOG.

**You do (international)**, only after the US call worked:
1. Check that the country is allowed in SignalWire (unknown 3) and that the destination's rate is recorded.
2. Change the allowlist to the one international contact, with the same caps.
3. Repeat the call steps. International calls cost more and have stricter rules, and caller-ID display abroad can differ.
4. Turn routing off and record the results.

**Coding agent does**
- Add a `docs/TEST_CALL_RECORD.md` template: date, destination country (not the full number), duration, observed cost, result and issues. Add reconciliation output.
- Fix anything the test reveals in a new small PR.

**Done when**
- [ ] One US call: connected, capped, cost reconciled, recorded
- [ ] One international call: same
- [ ] Routing back off; any decision to leave it on is a separate written choice

**Still out of scope after Phase 6:** multi-user accounts, number purchases, payments/KYC, public signup, more than one destination at a time. See NORTH_STAR "Not yet production ready".

---

## Copy-paste prompt for the coding agent

```text
You are working on https://github.com/premiumcentraal-boop/AgentBridge (Node 22, Cloudflare Worker + D1 backend in backend/, offline Node tests). Read README.md, docs/NORTH_STAR.md, docs/ROADMAP.md, docs/SIGNALWIRE.md, docs/CHAT_FIRST_MCP.md, docs/ROUTING_PLAN.md, docs/DEVELOPMENT_LOG.md, backend/src/*.mjs, backend/test/*.mjs and issues #3 and #9 before changing anything.

Goal: implement docs/ROUTING_PLAN.md phases 1, 2, 3 (code and docs only), 4 (logging) and 5 (gated connect), in order, as SMALL reviewable PRs (one concern each: #9 boundary tests; provider_events ledger; SignalWire reservation consumption still hangup-only; challenge (only if the owner chose option A in #3); stuck-call reconciliation/quarantine; destination policy + caps + spend ledger; two-step approval; provider decoupling of requireEnv(); signalWireConnectPlan max_duration/timeout/from/status URL; status endpoint; local-mcp get_routing_readiness (read-only); staging preflight + pinned wrangler + migrations + docs/STAGING_DEPLOY.md; gated connect).

Hard constraints:
- Grok Bot is the ONLY conversational AI. Never add SignalWire AI, record, transcribe, stream or any voice agent to SWML.
- Never commit, log, print or return secrets (SignalWire API token, signing key, bearer tokens, status-callback secret). Secrets come from environment / wrangler secrets only. Redact in errors.
- Routing stays OFF by default. A connect document may be returned only when PRIVATE_TEST_OUTBOUND_ENABLED and SIGNALWIRE_CONNECT_ENABLED are both exactly 'true' AND every gate in ROUTING_PLAN Phase 5 passes; otherwise return signalWireHangup().
- Caller ID is not authentication. Use the per-call challenge if the owner chose option A in #3; option C (caller-ID + caps) only if the owner's written acceptance is recorded in #3.
- De-duplicate provider events by call ID, not by signature (SignalWire retries with the same signature). Treat status callbacks as advisory and possibly unsigned; reconcile, never release a connecting route on timeout alone.
- connect must set from = US_BRIDGE_DID, max_duration <= cap, timeout, and a status URL; only allowlisted E.164 destinations; block 911/N11/short codes/+1900/+1976/the bridge DID.
- No number purchases, no carrier/number configuration changes via API, no live calls, no `wrangler deploy` or any public deploy without the owner's explicit approval. Use fake D1/fake fetch in tests.
- Only reference functions/files that exist; mark unknowns (Grok Bot DTMF, SignalWire status-callback signing, call-state REST endpoint, spend caps, rates) as unknown.
- Each PR: add tests, update README security limits / ROADMAP / append-only DEVELOPMENT_LOG, run `npm run ci` AND `npm --prefix local-mcp test` (after `npm --prefix local-mcp ci`) and paste real results. Never auto-merge. Do not open overlapping PRs; wait for review.
```
