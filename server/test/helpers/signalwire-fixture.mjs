import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
// Stateful contract fixture. It models documented provider resources rather
// than returning frontend snapshots, and cannot reach a real carrier.
export function signalWireFixture() {
  const project = randomUUID(),
    token = "test-only-" + randomUUID(),
    space = "agentbridge-test";
  const original = {
    call_handler: "laml_webhooks",
    call_request_url: "https://previous.example/voice",
    call_request_method: "POST",
    call_fallback_url: "https://previous.example/fallback",
    call_fallback_method: "POST",
  };
  const owned = {
    id: randomUUID(),
    number: "+12025551234",
    name: "Owned line",
    country_code: "US",
    capabilities: ["voice", "sms"],
    ...original,
  };
  const state = {
    project,
    token,
    space,
    numbers: [owned],
    calls: [],
    recordings: [],
    transcriptions: [],
    scripts: new Map(),
    requests: [],
    failPurchase: false,
    failCall: false,
  };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fetcher = async (input, options = {}) => {
    const url = new URL(input),
      method = options.method || "GET";
    assert.equal(url.origin, `https://${space}.signalwire.com`);
    assert.equal(options.redirect, "error");
    if (
      options.headers.Authorization !==
      "Basic " + btoa(project + ":" + state.token)
    )
      return json({ message: "Unauthorized" }, 401);
    const body = options.body
      ? options.headers["Content-Type"] === "application/json"
        ? JSON.parse(options.body)
        : Object.fromEntries(new URLSearchParams(options.body))
      : {};
    const prefix = "/api/laml/2010-04-01/Accounts/" + project;
    state.requests.push({
      path: url.pathname,
      method,
      body,
      query: Object.fromEntries(url.searchParams),
    });
    if (url.pathname === "/api/relay/rest/phone_numbers/search")
      return json({
        data: [
          {
            e164: "+12025554321",
            country_code: "US",
            region: "DC",
            capabilities: ["voice"],
          },
          {
            e164: "+12025554322",
            country_code: "US",
            region: "DC",
            capabilities: ["sms"],
          },
        ],
        links: {},
      });
    if (url.pathname === "/api/relay/rest/phone_numbers") {
      if (method === "GET")
        return json({ data: state.numbers, links: { next: null } });
      if (method === "POST") {
        assert.deepEqual(Object.keys(body), ["number"]);
        const number = {
          ...owned,
          id: randomUUID(),
          number: body.number,
          name: "Purchased line",
        };
        state.numbers.push(number);
        if (state.failPurchase)
          throw new Error("Simulated lost response after provider purchase");
        return json(number, 201);
      }
    }
    if (url.pathname.startsWith("/api/relay/rest/phone_numbers/")) {
      const id = url.pathname.split("/").at(-1),
        number = state.numbers.find((n) => n.id === id);
      if (!number) return json({}, 404);
      if (method === "PUT") Object.assign(number, body);
      return json(number);
    }
    if (!url.pathname.startsWith(prefix))
      return json({ message: "Unexpected path" }, 404);
    const path = url.pathname.slice(prefix.length);
    if (path === "/LamlBins" && method === "POST") {
      assert.deepEqual(Object.keys(body).sort(), ["Contents", "Name"]);
      const sid = randomUUID();
      const item = {
        sid,
        account_sid: project,
        name: body.Name,
        contents: body.Contents,
        request_url: `https://${space}.signalwire.com/laml-bins/${sid}`,
      };
      state.scripts.set(sid, item);
      return json(item, 201);
    }
    if (path.startsWith("/LamlBins/")) {
      const id = path.split("/").at(-1);
      if (method === "DELETE") {
        state.scripts.delete(id);
        return new Response(null, { status: 204 });
      }
      return state.scripts.has(id)
        ? json(state.scripts.get(id))
        : json({}, 404);
    }
    if (path === "/Calls") {
      if (method === "GET")
        return json({ calls: state.calls, next_page_uri: null });
      if (method === "POST") {
        const call = {
          sid: randomUUID(),
          account_sid: project,
          phone_number_sid: state.numbers.find((n) => n.number === body.From)
            ?.id,
          from: body.From,
          to: body.To,
          status: "queued",
          direction: "outbound-api",
          duration: 0,
          parent_call_sid: null,
          start_time: null,
          date_created: new Date().toISOString(),
        };
        state.calls.unshift(call);
        if (state.failCall) throw new Error("Simulated call response loss");
        return json(call, 201);
      }
    }
    const callAction = path.match(
      /^\/Calls\/([a-f0-9-]{36})(?:\/Recordings(?:\/([a-f0-9-]{36}))?)?$/,
    );
    if (callAction) {
      const call = state.calls.find((c) => c.sid === callAction[1]);
      if (!call) return json({}, 404);
      if (path.includes("/Recordings")) {
        if (callAction[2]) {
          const r = state.recordings.find((r) => r.sid === callAction[2]);
          if (!r) return json({}, 404);
          r.status = body.Status === "stopped" ? "completed" : body.Status;
          return json(r);
        }
        const recording = {
          sid: randomUUID(),
          account_sid: project,
          call_sid: call.sid,
          status: "in-progress",
          channels: "2",
          duration: 0,
          date_created: new Date().toISOString(),
        };
        state.recordings.push(recording);
        return json(recording);
      }
      if (method === "POST") {
        if (body.Status) call.status = body.Status;
        if (body.Url) call.last_url = body.Url;
      }
      return json(call);
    }
    if (path === "/Recordings")
      return json({
        recordings: state.recordings.filter(
          (r) =>
            !url.searchParams.get("CallSid") ||
            r.call_sid === url.searchParams.get("CallSid"),
        ),
      });
    const recordingPath = path.match(
      /^\/Recordings\/([a-f0-9-]{36})(?:\.(json|mp3))?$/,
    );
    if (recordingPath) {
      const r = state.recordings.find((r) => r.sid === recordingPath[1]);
      if (!r) return json({}, 404);
      if (method === "DELETE") {
        state.recordings = state.recordings.filter((x) => x.sid !== r.sid);
        return new Response(null, { status: 204 });
      }
      if (recordingPath[2] === "mp3")
        return new Response(new Uint8Array([73, 68, 51, 0, 1]), {
          headers: { "Content-Type": "audio/mpeg" },
        });
      return json(r);
    }
    if (path === "/Transcriptions")
      return json({ transcriptions: state.transcriptions });
    return json({ message: "Unexpected provider endpoint" }, 404);
  };
  return {
    state,
    fetcher,
    owned,
    original,
    config: () => ({ space, project_id: project, api_token: state.token }),
    posts: () => state.requests.filter((r) => r.method !== "GET"),
  };
}
