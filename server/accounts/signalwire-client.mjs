import { deny } from "./model.mjs";
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const E164 = /^\+[1-9]\d{7,14}$/;
export class ProviderError extends Error {
  constructor(status, ambiguous = false) {
    super("SignalWire could not complete the request.");
    this.status = status;
    this.ambiguous = ambiguous;
  }
}
export function signalWireConfig(input) {
  let space =
    typeof input.space === "string" ? input.space.trim().toLowerCase() : "";
  if (space.startsWith("https://")) {
    try {
      const u = new URL(space);
      if (
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/" ||
        !u.hostname.endsWith(".signalwire.com")
      )
        throw new Error();
      space = u.hostname.slice(0, -15);
    } catch {
      deny(
        422,
        "INVALID_PROVIDER",
        "Enter your SignalWire Space name or HTTPS Space URL.",
      );
    }
  } else if (space.endsWith(".signalwire.com")) space = space.slice(0, -15);
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(space) ||
    typeof input.project_id !== "string" ||
    !UUID.test(input.project_id) ||
    typeof input.api_token !== "string" ||
    input.api_token.length < 10 ||
    input.api_token.length > 512 ||
    /[^\x21-\x7e]|:/.test(input.api_token)
  )
    deny(
      422,
      "INVALID_PROVIDER",
      "Enter a valid SignalWire Space, Project ID and API token.",
    );
  return {
    space,
    project_id: input.project_id.toLowerCase(),
    api_token: input.api_token,
  };
}
export async function boundedProviderBytes(response, max = 512_000) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        throw new ProviderError(502, false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export function signalWireClient(config, fetcher = fetch) {
  const origin = `https://${config.space}.signalwire.com`;
  const compatBase = `/api/laml/2010-04-01/Accounts/${config.project_id}`;
  let attempted = 0,
    confirmed = 0;
  async function request(
    path,
    { method = "GET", data, form = false, binary = false } = {},
  ) {
    const url = new URL(path, origin);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      !url.pathname.startsWith("/api/")
    )
      throw new ProviderError(502);
    let response;
    if (method !== "GET") attempted++;
    try {
      response = await fetcher(url.href, {
        method,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(binary ? 30_000 : 12_000),
        headers: {
          Authorization:
            "Basic " + btoa(config.project_id + ":" + config.api_token),
          Accept: binary ? "audio/mpeg" : "application/json",
          ...(data
            ? {
                "Content-Type": form
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
              }
            : {}),
        },
        ...(data
          ? {
              body: form
                ? new URLSearchParams(
                    Object.entries(data).map(([k, v]) => [k, String(v)]),
                  ).toString()
                : JSON.stringify(data),
            }
          : {}),
      });
    } catch {
      throw new ProviderError(503, method !== "GET");
    }
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {}
      const error = new ProviderError(
        response.status,
        method !== "GET" && response.status >= 500,
      );
      error.rejectedWrite = method !== "GET" && response.status < 500;
      throw error;
    }
    if (method !== "GET") confirmed++;
    if (response.status === 204) return {};
    try {
      const bytes = await boundedProviderBytes(
        response,
        binary ? 32_000_000 : 512_000,
      );
      return binary
        ? bytes
        : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new ProviderError(502, method !== "GET");
    }
  }
  const rest = (path, method = "GET", data) =>
    request("/api/relay/rest" + path, { method, data });
  const compat = (path, method = "GET", data) =>
    request(compatBase + path, { method, data, form: true });
  const ownNumber = async (id) => {
    if (!UUID.test(id))
      deny(422, "INVALID_NUMBER", "Choose a SignalWire number.");
    const p = await rest("/phone_numbers/" + id);
    const n = p.data && !Array.isArray(p.data) ? p.data : p;
    if (
      n.id !== id ||
      !E164.test(n.number || "") ||
      !n.capabilities?.includes("voice")
    )
      deny(
        409,
        "NUMBER_NOT_OWNED",
        "SignalWire could not verify this voice number in your project.",
      );
    return n;
  };
  const listNumbers = async () => {
    let path = "/api/relay/rest/phone_numbers?page_size=100";
    const numbers = [];
    const visited = new Set();
    for (let page = 0; path && page < 10; page++) {
      const next = new URL(path, origin + "/api/relay/rest/phone_numbers");
      if (
        next.origin !== origin ||
        next.pathname !== "/api/relay/rest/phone_numbers" ||
        visited.has(next.href)
      )
        throw new ProviderError(502);
      visited.add(next.href);
      const payload = await request(next.href);
      if (!Array.isArray(payload.data)) throw new ProviderError(502);
      numbers.push(
        ...payload.data.filter(
          (n) =>
            n &&
            UUID.test(n.id || "") &&
            E164.test(n.number || "") &&
            n.capabilities?.includes("voice"),
        ),
      );
      const link = payload.links?.next;
      if (
        link !== undefined &&
        link !== null &&
        (typeof link !== "string" || !link.trim() || link.length > 4096)
      )
        throw new ProviderError(502);
      path = link || null;
    }
    return { numbers, has_more: Boolean(path) };
  };
  const createScript = async (name, contents) => {
    const p = await compat("/LamlBins", "POST", {
      Name: name,
      Contents: contents,
    });
    let url;
    try {
      url = new URL(p.request_url);
    } catch {
      throw new ProviderError(502, true);
    }
    if (
      !UUID.test(p.sid || "") ||
      (p.account_sid && p.account_sid !== config.project_id) ||
      url.origin !== origin ||
      url.pathname !== "/laml-bins/" + p.sid ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new ProviderError(502, true);
    return { id: p.sid, url: url.href };
  };
  return {
    origin,
    projectId: config.project_id,
    mutations: () => ({ attempted, confirmed }),
    compat,
    rest,
    ownNumber,
    listNumbers,
    createScript,
    audio: (id) =>
      request(compatBase + "/Recordings/" + id + ".mp3", { binary: true }),
  };
}
export const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");
export function forwardXml(destination, from) {
  if (!E164.test(destination) || !E164.test(from) || destination === from)
    deny(422, "INVALID_DESTINATION", "Choose an outside destination.");
  return `<Response><Dial answerOnBridge="true" callerId="${escapeXml(from)}" timeout="20" timeLimit="300"><Number>${escapeXml(destination)}</Number></Dial><Hangup/></Response>`;
}
