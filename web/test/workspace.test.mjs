import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";

// A DOM integration check, not browser/layout QA. Exercise the same bundled
// React/Astryx application shipped in the portable review artifact.
const html = (
  await readFile(
    new URL("../.cache/AgentBridge-Working-Website.html", import.meta.url),
    "utf8",
  )
).replace(/<style>[\s\S]*?<\/style>/g, "");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await pause(10);
  }
  assert.ok(check(), "Expected UI state was not reached");
}
function setup(
  url = "file:///AgentBridge-Working-Website.html",
  offline = true,
  reducedMotion = false,
) {
  const errors = [],
    requests = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => {
    if (e.type !== "css-parsing") errors.push(e);
  });
  virtualConsole.on("error", (...args) =>
    errors.push(new Error(args.join(" "))),
  );
  const dom = new JSDOM(
    offline
      ? html
      : html.replace('data-offline="true"', 'data-offline="false"'),
    {
      url,
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        window.matchMedia = (query) => ({
          matches:
            reducedMotion && query === "(prefers-reduced-motion: reduce)",
          media: query,
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
        window.fetch = (...args) => {
          requests.push(args);
          throw new Error("Offline preview must not request an API");
        };
      },
    },
  );
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    errors,
    requests,
  };
}
function named(document, label, selector = "button") {
  const result = [...document.querySelectorAll(selector)].find(
    (el) => (el.getAttribute("aria-label") || el.textContent).trim() === label,
  );
  assert.ok(result, `Missing ${selector}: ${label}`);
  return result;
}
function change(window, input, value) {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
async function navigate(document, path) {
  const link = document.querySelector(`a[href="#${path}"]`);
  assert.ok(link, `Missing page link ${path}`);
  link.click();
  await pause(100);
}

test("working preview navigates real pages and keeps call state in the floating rail", async (t) => {
  const { dom, document, errors, requests } = setup();
  t.after(() => dom.window.close());
  await pause(150);
  await waitFor(() => document.querySelector('a[href="#/studio/demo/"]'));
  assert.match(
    document.querySelector("h1").textContent,
    /connect agents\s+worldwide/,
  );
  assert.equal(
    document.querySelector(".world-network-svg").dataset.loopSeconds,
    "40",
  );
  assert.equal(
    document.querySelectorAll(".world-moving-scene .world-country-circle")
      .length,
    16,
  );
  assert.equal(document.querySelectorAll("animateMotion").length, 0);
  for (const band of document.querySelectorAll(".world-band")) {
    assert.ok(Number(band.getAttribute("stroke-width")) >= 100);
    assert.ok(Number(band.dataset.turns) <= 1);
  }
  assert.equal(
    document.querySelectorAll(
      ".world-country-arrivals .world-country-flag[clip-path]",
    ).length,
    16,
  );
  named(document, "Pause connection animation").click();
  await pause(20);
  assert.equal(document.querySelector(".world-network").dataset.paused, "true");
  named(document, "Play connection animation").click();
  await pause(20);
  assert.equal(
    document.querySelector(".world-network").dataset.paused,
    "false",
  );
  await navigate(document, "/how-it-works/");
  named(document, "02 Review").click();
  await pause(20);
  assert.match(
    document.querySelector(".flow-detail").textContent,
    /considered pause/,
  );
  await navigate(document, "/studio/demo/");
  await waitFor(() => document.querySelector(".floating-rail"));
  named(document, "Mute simulated call").click();
  await pause(20);
  assert.equal(
    named(document, "Unmute simulated call").getAttribute("aria-pressed"),
    "true",
  );
  await navigate(document, "/studio/demo/routes/");
  assert.ok(named(document, "Unmute simulated call"));
  assert.equal(document.querySelectorAll("tbody tr").length, 3);
  named(document, "Collapse navigation").click();
  await pause(30);
  assert.ok(document.querySelector(".rail-collapsed"));
  named(document, "Expand navigation").click();
  await pause(30);
  named(document, "Return to simulated call").click();
  await pause(30);
  assert.match(
    document.querySelector("main h1").textContent,
    /One familiar voice/,
  );
  named(document, "End simulated call").click();
  await pause(30);
  assert.match(document.querySelector("main h1").textContent, /A little quiet/);
  await navigate(document, "/studio/demo/activity/");
  assert.match(
    document.querySelector("main").textContent,
    /Simulated call ended/,
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("draft dialog validates, saves, filters, archives and keeps guidance between pages", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/routes/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.querySelector("main .routes-table"));
  named(document, "New route draft").click();
  await pause(100);
  const dialog = document.querySelector(
    'dialog[open][aria-label="Create a route draft"]',
  );
  assert.ok(
    dialog,
    JSON.stringify({
      errors: errors.map((e) => e.message),
      dialogs: [...document.querySelectorAll("dialog")].map((d) =>
        d.outerHTML.slice(0, 260),
      ),
    }),
  );
  const [label, number] = dialog.querySelectorAll("input");
  change(window, label, "Amsterdam studio");
  change(window, number, "invalid");
  await pause(20);
  dialog
    .querySelector("form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  await pause(30);
  assert.match(dialog.textContent, /Use international format/);
  change(window, number, "+31 20 555 0123");
  await pause(20);
  dialog
    .querySelector("form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  await waitFor(() => document.querySelectorAll("tbody tr").length === 4);
  assert.equal(
    document.querySelector('dialog[open][aria-label="Create a route draft"]'),
    null,
  );
  const search = document.querySelector(
    'input[placeholder="Search destinations…"]',
  );
  change(window, search, "Amsterdam");
  await pause(30);
  assert.equal(document.querySelectorAll("tbody tr").length, 1);
  assert.match(document.querySelector("tbody").textContent, /\+31205550123/);
  named(document, "View Amsterdam studio details").click();
  await pause(30);
  named(document, "Archive draft").click();
  await pause(50);
  named(document, "Archived").click();
  await pause(30);
  assert.match(document.querySelector("tbody").textContent, /Amsterdam studio/);
  await navigate(document, "/studio/demo/settings/");
  const selected = document.querySelector(
    '.guidance-options [role="radio"][aria-checked="true"]',
  );
  selected.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  await pause(20);
  assert.match(
    document.querySelector(
      '.guidance-options [role="radio"][aria-checked="true"]',
    ).textContent,
    /Guided/,
  );
  named(document, "Save preference").click();
  await pause(30);
  named(document, "Light").click();
  await pause(30);
  assert.equal(document.querySelector(".foundation-app").dataset.mode, "light");
  await navigate(document, "/studio/demo/");
  assert.match(
    document.querySelector(".guidance-summary").textContent,
    /Guided feels right/,
  );
  await navigate(document, "/studio/demo/design/");
  assert.equal(
    document.querySelectorAll('main img[src^="data:image/png;base64,"]').length,
    3,
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("public navigation keeps a native top-level studio link across the CSP boundary", async (t) => {
  const { dom, document, window, errors, requests } = setup(
    "https://agentbridge.victor.ceo/",
    false,
  );
  t.after(() => dom.window.close());
  await pause(150);
  const studio = document.querySelector('a[href="/studio/demo/"]');
  assert.equal(studio.target, "_top");
  let prevented;
  const cancelDefault = (event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", cancelDefault);
  studio.click();
  assert.equal(
    prevented,
    false,
    "studio entry must retain a full document navigation",
  );
  assert.equal(window.location.pathname, "/");
  document.querySelector('a[href="/how-it-works/"]').click();
  assert.equal(
    prevented,
    true,
    "same-policy public links may use the client router",
  );
  assert.equal(window.location.pathname, "/how-it-works/");
  await waitFor(() => document.querySelector(".interactive-flow"));
  document.removeEventListener("click", cancelDefault);
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("reduced motion has a composed flag-circle still and an explicit play override", async (t) => {
  const { dom, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html",
    true,
    true,
  );
  t.after(() => dom.window.close());
  await waitFor(
    () => document.querySelector(".world-network")?.dataset.paused === "true",
  );
  assert.equal(
    document.querySelector(".world-network").dataset.motionConsent,
    "false",
  );
  assert.equal(
    document.querySelectorAll(".world-static-scene .world-country-circle")
      .length,
    3,
  );
  named(document, "Play connection animation").click();
  await pause(30);
  assert.equal(
    document.querySelector(".world-network").dataset.paused,
    "false",
  );
  assert.equal(
    document.querySelector(".world-network").dataset.motionConsent,
    "true",
  );
  named(document, "Pause connection animation").click();
  await pause(30);
  assert.equal(document.querySelector(".world-network").dataset.paused, "true");
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});
