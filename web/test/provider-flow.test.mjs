import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { JSDOM, VirtualConsole } from "jsdom";
import { openAccountDatabase } from "../../server/accounts/node-database.mjs";
import { createAccountService } from "../../server/accounts/service.mjs";
import { signalWireFixture } from "../../server/test/helpers/signalwire-fixture.mjs";
const origin = "https://provider.agentbridge.test",
  email = "tester@example.com";
const html = (
  await readFile(
    new URL("../.cache/AgentBridge-Working-Website.html", import.meta.url),
    "utf8",
  )
)
  .replace(/<style>[\s\S]*?<\/style>/g, "")
  .replace(
    'data-offline="true"',
    'data-offline="false" data-account-demo="true"',
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await pause(10);
  }
  assert.ok(await check(), "Expected live provider UI state was not reached");
}
function named(root, name, tag = "button") {
  const el = [...root.querySelectorAll(tag)].find(
    (n) => (n.getAttribute("aria-label") || n.textContent).trim() === name,
  );
  assert.ok(el, "Missing " + tag + ": " + name);
  return el;
}
function field(root, name) {
  const label = [...root.querySelectorAll("label[for]")].find((n) =>
    n.textContent.trim().startsWith(name),
  );
  assert.ok(label, "Missing field: " + name);
  return (root.ownerDocument || root).getElementById(label.htmlFor);
}
function set(window, input, value) {
  const proto =
    input.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
  input.dispatchEvent(
    new window.Event(input.tagName === "SELECT" ? "change" : "input", {
      bubbles: true,
    }),
  );
}
function browser(t, fetcher, path) {
  const errors = [],
    console = new VirtualConsole();
  console.on("jsdomError", (e) => {
    if (
      e.type !== "css-parsing" &&
      !(e.type === "not-implemented" && /navigation/i.test(e.message))
    )
      errors.push(e);
  });
  console.on("error", (...args) => errors.push(new Error(args.join(" "))));
  const dom = new JSDOM(html, {
    url: origin + path,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: console,
    beforeParse(window) {
      window.fetch = fetcher;
      window.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      });
      window.scrollTo = () => {};
      window.CSS = {
        escape: (value) =>
          String(value).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c),
        supports: () => false,
      };
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      window.HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
      window.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
        this.dispatchEvent(new window.Event("close"));
      };
      window.HTMLMediaElement.prototype.play = () => Promise.resolve();
      window.HTMLMediaElement.prototype.pause = () => {};
      if (!window.crypto.randomUUID) window.crypto.randomUUID = randomUUID;
    },
  });
  t.after(() => dom.window.close());
  return { dom, window: dom.window, document: dom.window.document, errors };
}
test("the rendered studio securely connects SignalWire, imports inventory, activates a destination and starts a real API callback request", async (t) => {
  const database = openAccountDatabase(":memory:");
  t.after(() => database.close());
  const provider = signalWireFixture();
  const service = createAccountService({
    database,
    testerEmail: email,
    publicOrigin: origin,
    platformIdentity: true,
    vaultKey: randomBytes(32).toString("hex"),
    fetcher: provider.fetcher,
  });
  const fetcher = async (path, options = {}) => {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    const headers = new Headers(options.headers);
    headers.set("Origin", origin);
    headers.set("oai-authenticated-user-id", "verified-tester");
    headers.set("oai-authenticated-user-email", email);
    return service.fetch(new Request(url, { ...options, headers }));
  };
  let response = await fetcher("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: "Tester", agent_name: "Agent" }),
  });
  assert.equal(response.status, 201);
  const first = browser(t, fetcher, "/studio/settings/");
  let { window, document } = first;
  await until(
    () =>
      document.querySelector('.provider-settings input[type="password"]') &&
      !document.querySelector('.provider-settings input[type="password"]')
        .disabled,
  );
  set(window, field(document, "Space name"), provider.state.space);
  set(window, field(document, "Project ID"), provider.state.project);
  set(window, field(document, "API token"), provider.state.token);
  named(document, "Save and verify").click();
  await until(() => document.querySelector(".provider-mode"));
  assert.equal(field(document, "New API token").value, "");
  assert.ok(!document.documentElement.outerHTML.includes(provider.state.token));
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
  assert.equal(provider.posts().length, 0);
  named(document, "Use my SignalWire project").click();
  await until(async () =>
    Boolean(
      (await database.first("SELECT live_enabled FROM ab_provider_connections"))
        ?.live_enabled,
    ),
  );
  first.dom.window.close();
  const second = browser(t, fetcher, "/studio/");
  ({ window, document } = second);
  await until(() => document.querySelector(".live-workspace"));
  assert.equal(
    document.querySelector(".account-demo-badge").textContent,
    "Live testing",
  );
  assert.equal(document.querySelector(".number-connection-card"), null);
  named(document, "Numbers", "a").click();
  await until(
    () =>
      document.querySelector(".live-page-heading h1")?.textContent ===
      "Your numbers",
  );
  named(document.querySelector("main"), "Get a number").click();
  await until(() =>
    document.querySelector(
      'dialog[open] .provider-number-list input[type="radio"]',
    ),
  );
  let dialog = document.querySelector("dialog[open]");
  dialog.querySelector('input[type="radio"]').click();
  set(window, field(dialog, "Number name"), "My SignalWire line");
  named(dialog, "Use this number").click();
  await until(() => !document.querySelector("dialog[open]"));
  assert.match(
    document.querySelector(".live-workspace").textContent,
    /\+12025551234/,
  );
  assert.equal(provider.posts().length, 0);
  named(document, "Connections", "a").click();
  await until(() =>
    document.querySelector('input[aria-label="Search live connections"]'),
  );
  named(document.querySelector("main"), "Connect destination").click();
  await until(() =>
    document.querySelector('dialog[open][aria-label="Add connection"]'),
  );
  dialog = document.querySelector("dialog[open]");
  set(window, field(dialog, "Name"), "London office");
  set(window, field(dialog, "Destination number"), "+442079460123");
  named(dialog, "Save connection").click();
  await until(
    () =>
      document.querySelector(".live-connection-card h2")?.textContent ===
      "London office",
  );
  assert.equal(provider.posts().length, 0);
  named(document, "Activate forwarding").click();
  await until(() => document.querySelector("dialog[open] .provider-consent"));
  dialog = document.querySelector("dialog[open]");
  assert.equal(named(dialog, "Activate forwarding").disabled, true);
  dialog.querySelector('input[type="checkbox"]').click();
  named(dialog, "Activate forwarding").click();
  await until(() => !document.querySelector("dialog[open]"));
  assert.match(
    document.querySelector(".live-connection-card").textContent,
    /Forwarding on/,
  );
  assert.ok(provider.owned.call_request_url.includes("/laml-bins/"));
  named(document, "Test callback").click();
  await until(() => document.querySelector('dialog[open] input[type="tel"]'));
  dialog = document.querySelector("dialog[open]");
  set(window, field(dialog, "Your callback phone"), "+12125551234");
  dialog.querySelector('input[type="checkbox"]').click();
  named(dialog, "Start a test call").click();
  await until(() => provider.state.calls.length === 1);
  await until(() => !document.querySelector("dialog[open]"));
  assert.equal(provider.state.calls[0].status, "queued");
  named(document, "Calls", "a").click();
  await until(() => document.querySelector(".live-call-card"));
  assert.match(document.querySelector(".live-call-card").textContent, /queued/);
  assert.equal(document.querySelector(".sample-listen-dock"), null);
  assert.deepEqual(
    first.errors.map((e) => e.message),
    [],
  );
  assert.deepEqual(
    second.errors.map((e) => e.message),
    [],
  );
  second.dom.window.close();
});
