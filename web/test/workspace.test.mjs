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
  // The portable file already contains rendered HTML. Wait for the React
  // mount effect before interacting, rather than clicking the inert SSR copy.
  await waitFor(() => document.title.includes("connect agents worldwide"));
  await waitFor(() => document.querySelector('a[href="#/studio/demo/"]'));
  assert.match(
    document.querySelector("h1").textContent,
    /connect agents\s+worldwide/,
  );
  assert.equal(
    document.querySelector(".world-network-svg").dataset.loopSeconds,
    "60",
  );
  const svg = document.querySelector(".world-network-svg");
  assert.equal(svg.dataset.sequence, "edge-to-call");
  assert.equal(svg.dataset.pairCount, "12");
  const layers = document.querySelectorAll(
    ".world-moving-scene > .world-pair-layer",
  );
  assert.equal(layers.length, 12);
  assert.equal(
    document.querySelectorAll(
      '.world-moving-scene > .world-pair-layer[data-copy="current"]',
    ).length,
    12,
  );
  assert.equal(document.querySelectorAll(".world-approach-path").length, 24);
  let currentLayer = false,
    previousStart = -1;
  for (const layer of layers) {
    const gate = layer.querySelector(".world-layer-gate");
    assert.equal(gate.getAttribute("calcMode"), "discrete");
    assert.equal(gate.getAttribute("dur"), "60s");
    assert.ok(
      layer.querySelector(".world-country-lines") &&
        layer.querySelector(".world-call-connection"),
    );
    assert.match(
      layer.querySelector(".world-call-label").textContent,
      /Call connected/,
    );
    if (layer.dataset.copy === "current") {
      currentLayer = true;
      assert.ok(Number(layer.dataset.startAt) > previousStart);
      previousStart = Number(layer.dataset.startAt);
    } else
      assert.equal(
        currentLayer,
        false,
        "previous-cycle layers must paint behind current lines",
      );
    assert.ok(layer.querySelector(".world-contact-pulse animate"));
    assert.ok(
      layer.querySelector(
        '.world-call-check animate[attributeName="stroke-dashoffset"]',
      ),
    );
    const travellers = layer.querySelectorAll(".world-country-traveller");
    assert.equal(travellers.length, 2);
    for (const traveller of travellers) {
      const motion = traveller.querySelector("animateMotion");
      const path = document.querySelector(
        motion.querySelector("mpath").getAttribute("href"),
      );
      assert.ok(path.classList.contains("world-approach-path"));
      const band = layer.querySelector(
        `.world-band[data-arm="${traveller.dataset.arm}"]`,
      );
      assert.equal(path.getAttribute("d"), band.getAttribute("d"));
      const drawing = band.querySelector("animate");
      for (const attribute of ["begin", "dur", "keyTimes", "keySplines"])
        assert.equal(
          motion.getAttribute(attribute),
          drawing.getAttribute(attribute),
        );
      assert.ok(traveller.querySelector(".world-country-flag[clip-path] use"));
    }
  }
  assert.equal(
    document.querySelectorAll(
      '.world-band animate[attributeName="stroke-dashoffset"]',
    ).length,
    0,
  );
  for (const band of document.querySelectorAll(".world-band")) {
    assert.ok(Number(band.getAttribute("stroke-width")) >= 100);
    assert.ok(Number(band.dataset.turns) <= 1);
  }
  named(document, "Pause connection animation").click();
  await waitFor(
    () => document.querySelector(".world-network").dataset.paused === "true",
  );
  assert.equal(document.querySelector(".world-network").dataset.paused, "true");
  named(document, "Play connection animation").click();
  await waitFor(
    () => document.querySelector(".world-network").dataset.paused === "false",
  );
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
    /Your agent. And a place for you/,
  );
  named(document, "End simulated call").click();
  await pause(30);
  assert.match(
    document.querySelector("main h1").textContent,
    /Ready when your connection is/,
  );
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

test("reduced motion starts with approaching flags and no early call, with an explicit play override", async (t) => {
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
  const still = document.querySelector(".world-static-scene");
  assert.equal(still.querySelectorAll(".world-pair-static").length, 1);
  assert.equal(
    still.querySelectorAll("animate, animateMotion, animateTransform").length,
    0,
  );
  assert.equal(
    still.querySelectorAll('.world-call-connection[opacity="1"]').length,
    0,
  );
  assert.ok(still.querySelector('.world-call-connection[opacity="0"]'));
  assert.ok(still.querySelector('.world-country-lines[opacity="1"]'));
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

function labelled(document, label) {
  const node = [...document.querySelectorAll("label[for]")].find((el) =>
    el.textContent.trim().startsWith(label),
  );
  assert.ok(node, "Missing field: " + label);
  const input = document.getElementById(node.htmlFor);
  assert.ok(input, "Missing labelled control: " + label);
  return input;
}
function fieldValue(window, element, value) {
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
test("international call planning saves optional capture choices and join defaults across studio pages", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/calls/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Calls | AgentBridge");
  named(document, "Plan an international call").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  fieldValue(window, labelled(document, "Call name"), "Amsterdam viewing test");
  fieldValue(
    window,
    labelled(document, "International phone number"),
    "+31 20 123 4567",
  );
  fieldValue(
    window,
    labelled(document, "What should your agent find out?"),
    "Ask about a viewing and return the reference.",
  );
  named(document, "Continue to options").click();
  await waitFor(() => document.querySelector('input[role="switch"]'));
  assert.equal(labelled(document, "Record the call").checked, false);
  assert.equal(labelled(document, "Create a transcript").checked, false);
  labelled(document, "Create a transcript").click();
  fieldValue(window, labelled(document, "Transcript language"), "nl");
  named(document, "Save sample call plan").click();
  await waitFor(() =>
    document
      .querySelector(".call-plan-list")
      ?.textContent.includes("Amsterdam viewing test"),
  );
  const row = [...document.querySelectorAll(".call-plan-row")].find((r) =>
    r.textContent.includes("Amsterdam viewing test"),
  );
  assert.match(row.textContent, /Recording off/);
  assert.match(row.textContent, /Transcript requested/);
  [...row.querySelectorAll("button")]
    .find((b) => b.textContent.includes("Review plan"))
    .click();
  await waitFor(() => document.querySelector(".plan-review"));
  assert.match(
    document.querySelector(".plan-review").textContent,
    /Ask before capture/,
  );
  named(document, "Explore the sample call", "a").click();
  await waitFor(() => document.querySelector(".tools-live-card"));
  await navigate(document, "/studio/demo/memory/");
  fieldValue(window, labelled(document, "When I join a call"), "phone");
  await waitFor(() =>
    [...document.querySelectorAll("label")].some((el) =>
      el.textContent.startsWith("My international phone number"),
    ),
  );
  fieldValue(
    window,
    labelled(document, "My international phone number"),
    "+31 6 1234 5678",
  );
  labelled(document, "Create a transcript").click();
  fieldValue(window, labelled(document, "Transcript language"), "nl");
  fieldValue(window, labelled(document, "Keep captured content"), "7");
  named(document, "Save capture and join preferences").click();
  await waitFor(() => document.querySelector(".tools-success"));
  await navigate(document, "/studio/demo/call/");
  named(document, "Let me join").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  assert.equal(
    labelled(document, "Number where I’ll join").value,
    "+31612345678",
  );
  named(document, "Join sample call").click();
  await waitFor(() =>
    document
      .querySelector(".call-participants")
      ?.textContent.includes("You’re in"),
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});
test("sample call joins and leaves without ending, requires capture permission and supports transcript search and audio seeking", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/call/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Call | AgentBridge");
  named(document, "Let me join").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  named(document, "Join sample call").click();
  await waitFor(() =>
    document
      .querySelector(".call-participants")
      ?.textContent.includes("You’re in"),
  );
  named(document, "Unmute yourself in sample call").click();
  await waitFor(() =>
    document
      .querySelector(".call-participants")
      .textContent.includes("Speaking in preview"),
  );
  named(document, "Leave sample call").click();
  await waitFor(
    () =>
      !document
        .querySelector(".call-participants")
        .textContent.includes("You’re in"),
  );
  assert.match(
    document.querySelector(".live-card-top").textContent,
    /connected/,
  );
  named(document, "Record sample call").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  assert.equal(named(document, "Enable sample recording").disabled, true);
  labelled(document, "Permission is confirmed in this sample").click();
  named(document, "Enable sample recording").click();
  await waitFor(() =>
    document
      .querySelector(".capture-control-heading")
      ?.textContent.includes("Sample capture on"),
  );
  named(document, "Pause sample recording").click();
  await waitFor(() =>
    document
      .querySelector(".capture-control-heading")
      ?.textContent.includes("Paused"),
  );
  named(document, "Resume sample recording").click();
  named(document, "Transcribe sample call").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  assert.equal(named(document, "Enable sample transcription").disabled, true);
  labelled(document, "Permission is confirmed in this sample").click();
  named(document, "Enable sample transcription").click();
  await waitFor(() => document.querySelector(".live-transcript"));
  named(document, "Show full sample transcript").click();
  await waitFor(
    () => document.querySelectorAll(".live-transcript-line").length === 6,
  );
  await navigate(document, "/studio/demo/memory/");
  const audio = document.querySelector("audio");
  assert.match(audio.getAttribute("src"), /^data:audio\/(?:mpeg|mp3);base64,/);
  named(document, "Transcript").click();
  await waitFor(() =>
    document.querySelector('input[aria-label="Search sample transcript"]'),
  );
  fieldValue(
    window,
    document.querySelector('input[aria-label="Search sample transcript"]'),
    "reference",
  );
  fieldValue(window, labelled(document, "Speaker"), "Recipient");
  await waitFor(
    () => document.querySelectorAll(".transcript-lines article").length === 1,
  );
  assert.match(
    document.querySelector(".transcript-lines").textContent,
    /two zero four/,
  );
  named(document, "Jump to 00:16").click();
  assert.equal(audio.currentTime, 16.07);
  fieldValue(
    window,
    document.querySelector('input[aria-label="Search sample transcript"]'),
    "does-not-exist",
  );
  await waitFor(() => document.querySelector(".tools-empty"));
  assert.match(
    document.querySelector(".tools-empty").textContent,
    /No matching transcript/,
  );
  named(document, "Outcome").click();
  await waitFor(() => document.querySelector(".memory-outcome"));
  assert.match(
    document.querySelector(".memory-outcome").textContent,
    /DEMO 204/,
  );
  assert.match(
    document.querySelector(".memory-outcome").textContent,
    /not a real confirmation/,
  );
  await navigate(document, "/studio/demo/call/");
  assert.ok(named(document, "Pause sample recording"));
  assert.ok(named(document, "Stop sample transcription"));
  named(document, "End sample call").click();
  await waitFor(() =>
    document.querySelector(".live-card-top").textContent.includes("ended"),
  );
  named(document, "Restart sample call").click();
  await waitFor(() =>
    document.querySelector(".live-card-top").textContent.includes("connected"),
  );
  assert.ok(named(document, "Record sample call"));
  assert.ok(named(document, "Transcribe sample call"));
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});
test("feature pages link into international planning, call memory and joining through real routes", async (t) => {
  const { dom, document, errors, requests } = setup();
  t.after(() => dom.window.close());
  await waitFor(() => document.title.includes("connect agents worldwide"));
  await navigate(document, "/features/");
  assert.match(
    document.querySelector("main h1").textContent,
    /More possibilities/,
  );
  await navigate(document, "/international-calling/");
  assert.match(
    document.querySelector("main h1").textContent,
    /further destination/,
  );
  assert.ok(document.querySelector('a[href="#/studio/demo/calls/"]'));
  await navigate(document, "/call-memory/");
  assert.ok(document.querySelector("audio"));
  assert.match(
    document.querySelector("main").textContent,
    /synthetic demonstration voices/i,
  );
  await navigate(document, "/join-call/");
  named(document, "Let me join").click();
  await waitFor(() =>
    document.querySelector(".feature-people").textContent.includes("You’re in"),
  );
  named(document, "Leave illustration").click();
  await waitFor(
    () =>
      !document
        .querySelector(".feature-people")
        .textContent.includes("You’re in"),
  );
  assert.ok(document.querySelector('a[href="#/studio/demo/call/"]'));
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});
