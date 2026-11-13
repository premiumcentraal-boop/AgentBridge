import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { JSDOM, VirtualConsole } from "jsdom";
import { openAccountDatabase } from "../../server/accounts/node-database.mjs";
import { createAccountService } from "../../server/accounts/service.mjs";
import { nodePasswords } from "../../server/accounts/passwords.mjs";
const origin = "https://demo.agentbridge.test",
  email = "tester@example.com",
  invite = "test-invitation-for-customer-flow";
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
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  for (let index = 0; index < 250; index++) {
    if (check()) return;
    await pause(10);
  }
  assert.ok(check(), "Expected account UI state was not reached");
}
const named = (root, name, tag = "button") => {
  const element = [...root.querySelectorAll(tag)].find(
    (node) =>
      (node.getAttribute("aria-label") || node.textContent).trim() === name,
  );
  assert.ok(element, "Missing " + tag + ": " + name);
  return element;
};
const field = (root, name) => {
  const label = [...root.querySelectorAll("label[for]")].find((label) =>
    label.textContent.trim().startsWith(name),
  );
  assert.ok(label, "Missing field " + name);
  return (root.ownerDocument || root).getElementById(label.htmlFor);
};
function setField(window, element, value) {
  const proto =
    element.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(
    new window.Event(element.tagName === "SELECT" ? "change" : "input", {
      bubbles: true,
    }),
  );
}
function backend(t, platform) {
  const database = openAccountDatabase(":memory:");
  t.after(() => database.close());
  const service = createAccountService({
    database,
    testerEmail: email,
    publicOrigin: origin,
    platformIdentity: platform,
    passwords: nodePasswords,
    signupInviteHash: createHash("sha256").update(invite).digest("hex"),
  });
  let cookie = "",
    verified = true;
  const requests = [];
  const fetcher = async (path, options = {}) => {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    const headers = new Headers(options.headers);
    headers.set("origin", origin);
    if (platform && verified) {
      headers.set("oai-authenticated-user-id", "verified-platform-tester");
      headers.set("oai-authenticated-user-email", email);
    }
    if (cookie) headers.set("cookie", cookie);
    requests.push({ path: url.pathname, method: options.method || "GET" });
    const response = await service.fetch(
      new Request(url, { ...options, headers }),
      { clientAddress: "dom-test-browser" },
    );
    assert.ok(response, "Unexpected API path");
    const setCookie = response.headers.get("set-cookie");
    if (setCookie)
      cookie = setCookie.includes("Max-Age=0") ? "" : setCookie.split(";")[0];
    return response;
  };
  return {
    database,
    requests,
    fetcher,
    session: () => cookie,
    verified: (value) => {
      verified = value;
    },
    snapshot: async () => {
      const response = await fetcher("/api/studio/overview");
      return response.json();
    },
  };
}
function browser(t, backend, path) {
  const errors = [],
    virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    if (
      error.type === "css-parsing" ||
      (error.type === "not-implemented" && /navigation/i.test(error.message))
    )
      return;
    errors.push(error);
  });
  virtualConsole.on("error", (...args) =>
    errors.push(new Error(args.join(" "))),
  );
  const dom = new JSDOM(html, {
    url: origin + path,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      });
      window.CSS = {
        escape: (value) =>
          String(value).replace(
            /[^a-zA-Z0-9_-]/g,
            (character) => "\\" + character,
          ),
        supports: () => false,
      };
      window.scrollTo = () => {};
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
      window.HTMLMediaElement.prototype.play = function () {
        this.dispatchEvent(new window.Event("play"));
        return Promise.resolve();
      };
      window.HTMLMediaElement.prototype.pause = function () {
        this.dispatchEvent(new window.Event("pause"));
      };
      window.fetch = backend.fetcher;
    },
  });
  t.after(() => dom.window.close());
  return { dom, window: dom.window, document: dom.window.document, errors };
}
test("the hosted tester creates a real account, pairs an API-owned number, calls in demo mode and returns to saved data in a fresh session", async (t) => {
  const api = backend(t, true),
    first = browser(t, api, "/signup/");
  let { document, window } = first;
  await until(() => document.querySelector('input[autocomplete="name"]'));
  assert.equal(field(document, "Email address").value, email);
  assert.equal(field(document, "Email address").readOnly, true);
  assert.equal(document.querySelector('input[type="password"]'), null);
  setField(window, field(document, "Your name"), "Demo tester");
  setField(window, field(document, "Agent name"), "Concierge");
  named(document, "Create account").click();
  await until(() => document.querySelector(".workspace-shell"));
  assert.equal(document.querySelectorAll(".number-connection-card").length, 0);
  assert.equal((await api.snapshot()).routing_numbers.length, 0);
  named(document.querySelector("main"), "Buy a number").click();
  await until(() =>
    document.querySelector('dialog[open][aria-label="Add routing number"]'),
  );
  let dialog = document.querySelector(
    'dialog[open][aria-label="Add routing number"]',
  );
  named(dialog, "Add example number").click();
  await until(() =>
    document.querySelector('dialog[open][aria-label="Add connection"]'),
  );
  dialog = document.querySelector('dialog[open][aria-label="Add connection"]');
  setField(window, field(dialog, "Name"), "London office");
  setField(window, field(dialog, "Destination number"), "+442079460123");
  named(dialog, "Save connection").click();
  await until(
    () => document.querySelectorAll(".number-connection-card").length === 1,
  );
  let snapshot = await api.snapshot();
  assert.equal(snapshot.routing_numbers[0].ownership_source, "demo");
  assert.equal(snapshot.connections[0].label, "London office");
  assert.equal(snapshot.account.agent_name, "Concierge");
  named(document.querySelector("main"), "Start demo call").click();
  await until(() => document.querySelector(".gb-call-layout"));
  named(document.querySelector("main"), "Start transcription").click();
  await until(() =>
    document.querySelector(
      'dialog[open][aria-label="Optional capture permission"]',
    ),
  );
  dialog = document.querySelector(
    'dialog[open][aria-label="Optional capture permission"]',
  );
  field(dialog, "Permission confirmed").click();
  named(dialog, "Enable transcription").click();
  for (let index = 0; index < 150; index++) {
    snapshot = await api.snapshot();
    if (snapshot.demo_call.transcription) break;
    await pause(10);
  }
  assert.equal(snapshot.demo_call.active, true);
  assert.equal(snapshot.demo_call.transcription, true);
  assert.equal(snapshot.calling_enabled, false);
  const settings = document.querySelector(
    '.floating-rail a[aria-label="Settings"]',
  );
  settings.click();
  await until(() => document.querySelector(".account-profile-card"));
  const profile = document.querySelector(".account-profile-card");
  setField(window, field(profile, "Your name"), "Updated tester");
  setField(window, field(profile, "Agent name"), "Office agent");
  named(profile, "Save account").click();
  for (let index = 0; index < 150; index++) {
    snapshot = await api.snapshot();
    if (snapshot.account.agent_name === "Office agent") break;
    await pause(10);
  }
  assert.equal(snapshot.account.name, "Updated tester");
  assert.equal(snapshot.account.agent_name, "Office agent");
  first.dom.window.close();
  const second = browser(t, api, "/studio/");
  document = second.document;
  await until(() => document.querySelector(".workspace-shell"));
  await until(
    () => document.querySelectorAll(".number-connection-card").length === 1,
  );
  assert.match(
    document.querySelector(".number-connection-card").textContent,
    /London office/,
  );
  named(document.querySelector("main"), "Expand live call").click();
  await until(
    () => !document.querySelector("main .active-call-details").hidden,
  );
  assert.match(
    document.querySelector("main .active-call-transcript").textContent,
    /Following/,
  );
  assert.equal(
    (await api.database.first("SELECT COUNT(*) AS n FROM ab_accounts")).n,
    1,
  );
  assert.equal(
    (await api.database.first("SELECT COUNT(*) AS n FROM ab_workspaces")).n,
    1,
  );
  api.verified(false);
  assert.equal((await api.fetcher("/api/studio/overview")).status, 401);
  api.verified(true);
  assert.ok(
    api.requests.some((request) => request.path === "/api/auth/register"),
  );
  assert.ok(
    api.requests.some(
      (request) => request.path === "/api/studio/number-orders",
    ),
  );
  assert.ok(
    api.requests.some((request) => request.path === "/api/studio/demo-call"),
  );
  assert.deepEqual(
    first.errors.map((error) => error.message),
    [],
  );
  assert.deepEqual(
    second.errors.map((error) => error.message),
    [],
  );
});
test("email/password customer signup and sign-in use server sessions and return to the same workspace", async (t) => {
  const api = backend(t, false),
    first = browser(t, api, "/signup/#invite=" + encodeURIComponent(invite));
  const { document, window } = first;
  await until(() =>
    document.querySelector('input[autocomplete="new-password"]'),
  );
  setField(window, field(document, "Your name"), "Customer tester");
  setField(window, field(document, "Agent name"), "Customer agent");
  setField(window, field(document, "Email address"), email);
  setField(window, field(document, "Password"), "customer-demo-password-123");
  named(document, "Create account").click();
  await until(() => document.querySelector(".workspace-shell"));
  assert.ok(api.session());
  const original = (await api.snapshot()).account.id;
  named(document.querySelector(".floating-rail"), "Settings", "a").click();
  await until(() => document.querySelector(".account-profile-card"));
  named(document.querySelector("main"), "Sign out").click();
  await until(() => !api.session());
  first.dom.window.close();
  const second = browser(t, api, "/signin/");
  await until(() =>
    second.document.querySelector('input[autocomplete="current-password"]'),
  );
  setField(second.window, field(second.document, "Email address"), email);
  setField(
    second.window,
    field(second.document, "Password"),
    "customer-demo-password-123",
  );
  named(second.document, "Sign in").click();
  await until(() => second.document.querySelector(".workspace-shell"));
  assert.equal((await api.snapshot()).account.id, original);
  assert.equal((await api.snapshot()).account.agent_name, "Customer agent");
  assert.deepEqual(
    first.errors.map((error) => error.message),
    [],
  );
  assert.deepEqual(
    second.errors.map((error) => error.message),
    [],
  );
});
