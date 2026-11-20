import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import { PAINT_LAYERS, STILL_CONNECTIONS } from "../src/network-data.js";

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
        // JSDOM does not decode media. UI events are checked against a stub;
        // actual browser playback remains a separate verification step.
        window.HTMLMediaElement.prototype.play = function () {
          this.dispatchEvent(new window.Event("play"));
          return Promise.resolve();
        };
        window.HTMLMediaElement.prototype.pause = function () {
          this.dispatchEvent(new window.Event("pause"));
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
  if (!link && path === "/studio/demo/call/") {
    named(document, "Call overview").click();
    await pause(100);
    return;
  }
  assert.ok(link, `Missing page link ${path}`);
  link.click();
  await pause(100);
}
async function beginJoin(document, microphoneOn = false) {
  named(document.querySelector("main"), "Join call").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  const dialog = document.querySelector('dialog[open][aria-label="Join call"]');
  if (microphoneOn) labelled(dialog, "Microphone on").click();
  named(dialog, "Join call").click();
  return dialog;
}
async function joinFixtureCall(document, microphoneOn = false) {
  await beginJoin(document, microphoneOn);
  await waitFor(() => document.querySelector(".call-room.is-joined"));
}
async function endFixtureCall(document) {
  named(document.querySelector("main"), "End call for everyone").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="End call confirmation"]'),
  );
  named(
    document.querySelector('dialog[open][aria-label="End call confirmation"]'),
    "Cancel",
  ).click();
  await waitFor(
    () =>
      !document.querySelector(
        'dialog[open][aria-label="End call confirmation"]',
      ),
  );
  assert.ok(
    document.querySelector("main .active-call-card"),
    "Cancelling end must keep the call active",
  );
  named(document.querySelector("main"), "End call for everyone").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="End call confirmation"]'),
  );
  named(
    document.querySelector('dialog[open][aria-label="End call confirmation"]'),
    "End call",
  ).click();
}

test("working preview navigates real pages and keeps call state in the floating rail", async (t) => {
  const { dom, document, errors, requests } = setup();
  t.after(() => dom.window.close());
  // The portable file already contains rendered HTML. Wait for the React
  // mount effect before interacting, rather than clicking the inert SSR copy.
  await waitFor(() => document.title.includes("Connect agents worldwide"));
  await waitFor(() =>
    document.querySelector('.public-header a[href="#/studio/"]'),
  );
  assert.match(
    document.querySelector("h1").textContent,
    /Connect agents\s+worldwide/,
  );
  assert.equal(
    document.querySelector(".world-network-svg").dataset.loopSeconds,
    "60",
  );
  const svg = document.querySelector(".world-network-svg");
  assert.equal(svg.dataset.sequence, "composed-edge-to-call");
  assert.equal(svg.dataset.pairCount, "12");
  const layers = document.querySelectorAll(
    ".world-moving-scene > .world-pair-layer",
  );
  assert.equal(layers.length, PAINT_LAYERS.length);
  assert.equal(
    document.querySelectorAll(
      '.world-moving-scene > .world-pair-layer[data-copy="current"]',
    ).length,
    12,
  );
  assert.equal(document.querySelectorAll(".world-approach-path").length, 26);
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
      /(?:Call|3-way call) connected/,
    );
    assert.equal(
      layer.querySelector(".world-call-connection").getAttribute("transform"),
      `translate(${layer.dataset.meeting})`,
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
    assert.equal(travellers.length, Number(layer.dataset.participantCount));
    if (travellers.length === 3)
      assert.ok(layer.querySelector(".world-group-call"));
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
      const drawing = band.parentElement.querySelector("animate");
      assert.equal(
        band.parentElement
          .querySelector(".world-crossing-clearance")
          .getAttribute("d"),
        path.getAttribute("d"),
      );
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
    assert.ok(Number(band.getAttribute("stroke-width")) >= 70);
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
  named(document, "Callback").click();
  await pause(20);
  assert.match(
    document.querySelector(".flow-detail").textContent,
    /SignalWire dials the second phone/,
  );
  await navigate(document, "/studio/demo/");
  await waitFor(() => document.querySelector(".floating-rail"));
  assert.equal(document.querySelectorAll(".number-connection-card").length, 3);
  const nav = document.querySelector(".floating-rail nav");
  assert.equal(
    [...nav.querySelectorAll("button")].some((button) =>
      /Mute|End call/.test(
        button.getAttribute("aria-label") || button.textContent,
      ),
    ),
    false,
  );
  named(nav, "Open call and transcript").click();
  await waitFor(() => document.querySelector(".gb-call-layout"));
  await joinFixtureCall(document);
  named(document.querySelector("main"), "Mute speakers").click();
  await waitFor(() =>
    document.querySelector('main button[aria-label="Unmute speakers"][aria-pressed="false"]'),
  );
  await navigate(document, "/studio/demo/numbers/");
  assert.equal(document.querySelectorAll(".owned-number-card").length, 3);
  named(document, "Collapse navigation").click();
  await waitFor(() => document.querySelector(".rail-collapsed"));
  assert.equal(
    document.querySelector(".compact-call-card .direction-arrow"),
    null,
  );
  named(document, "Expand navigation").click();
  named(nav, "Open call and transcript").click();
  await waitFor(() => document.querySelector(".gb-call-layout"));
  assert.equal(
    named(document.querySelector("main"), "Unmute speakers").getAttribute(
      "aria-pressed",
    ),
    "false",
  );
  named(document.querySelector("main"), "Route call").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Review call routing"]'),
  );
  const review = document.querySelector(
    'dialog[open][aria-label="Review call routing"]',
  );
  const connection = review.querySelector("select");
  connection.value = "connection-demo-new-york";
  connection.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await waitFor(() =>
    review
      .querySelector(".routing-review-pair")
      .textContent.includes("+12025550111"),
  );
  assert.match(review.textContent, /\+12125550124/);
  named(review, "Save routing choice").click();
  await waitFor(() =>
    document
      .querySelector(".call-room-route")
      ?.textContent.includes("New York office"),
  );
  assert.match(
    document.querySelector("main .active-call-card").textContent,
    /\+442079460123/,
  );
  await endFixtureCall(document);
  await waitFor(() => document.querySelector(".nav-call-empty"));
  await navigate(document, "/studio/demo/settings/");
  await navigate(document, "/studio/demo/activity/");
  assert.match(document.querySelector("main").textContent, /Call ended/);
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("numbers are obtained before a new connection is paired; country search, edit, removal and settings persist across views", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/connections/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Connections | AgentBridge");
  named(document, "Connect a destination").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Add routing number"]'),
  );
  assert.equal(
    document.querySelector('dialog[open][aria-label="Add connection"]'),
    null,
    "All existing numbers are assigned, so obtaining a new number comes first",
  );
  named(document, "Add example number").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Add connection"]'),
  );
  const editor = document.querySelector(
    'dialog[open][aria-label="Add connection"]',
  );
  fieldValue(window, labelled(document, "Name"), "Amsterdam office");
  fieldValue(window, labelled(document, "Destination country"), "nether");
  await waitFor(
    () =>
      editor.querySelectorAll(".destination-country-picker button").length ===
      1,
  );
  editor.querySelector(".destination-country-picker button").click();
  fieldValue(window, labelled(document, "Destination number"), "invalid");
  editor
    .querySelector("form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  await waitFor(() => editor.querySelector('[role="alert"]'));
  assert.match(editor.textContent, /matching the selected country/);
  fieldValue(
    window,
    labelled(document, "Destination number"),
    "+31 20 123 4567",
  );
  named(editor, "Save connection").click();
  await waitFor(
    () => document.querySelectorAll(".number-connection-card").length === 4,
  );
  const card = [...document.querySelectorAll(".number-connection-card")].find(
    (item) => item.textContent.includes("Amsterdam office"),
  );
  assert.match(card.textContent, /\+1 202 555 0130/);
  assert.match(card.textContent, /\+31 20 123 4567/);
  const searchBox = document.querySelector('input[aria-label="Search connections"]');
  fieldValue(window, searchBox, "+31 20 123 4567");
  await waitFor(() => document.querySelectorAll(".number-connection-card").length === 1);
  assert.match(document.querySelector(".number-connection-card").textContent, /Amsterdam office/);
  fieldValue(
    window,
    document.querySelector('input[aria-label="Search connections"]'),
    "amsterdam",
  );
  await waitFor(
    () => document.querySelectorAll(".number-connection-card").length === 1,
  );
  named(document, "Edit Amsterdam office").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Edit connection"]'),
  );
  fieldValue(window, labelled(document, "Name"), "Amsterdam team");
  named(
    document.querySelector('dialog[open][aria-label="Edit connection"]'),
    "Save connection",
  ).click();
  await waitFor(() =>
    document
      .querySelector(".number-connection-card")
      ?.textContent.includes("Amsterdam team"),
  );
  named(document.querySelector(".number-connection-card"), "Remove").click();
  await waitFor(
    () => document.querySelectorAll(".number-connection-card").length === 0,
  );
  await navigate(document, "/studio/demo/numbers/");
  assert.equal(document.querySelectorAll(".owned-number-card").length, 4);
  assert.ok(named(document, "Connect destination"));
  await navigate(document, "/studio/demo/settings/");
  await waitFor(() =>
    document.querySelector(
      '.guidance-options [role="radio"][aria-checked="true"]',
    ),
  );
  const selected = document.querySelector(
    '.guidance-options [role="radio"][aria-checked="true"]',
  );
  selected.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  await waitFor(() =>
    document
      .querySelector('.guidance-options [role="radio"][aria-checked="true"]')
      .textContent.includes("Guided"),
  );
  named(document, "Save preference").click();
  await navigate(document, "/studio/demo/");
  await navigate(document, "/studio/demo/settings/");
  assert.match(
    document.querySelector(
      '.guidance-options [role="radio"][aria-checked="true"]',
    ).textContent,
    /Guided/,
  );
  await navigate(document, "/studio/demo/design/");
  assert.equal(document.querySelectorAll("main img").length, 3);
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
  const studio = document.querySelector('.public-header a[href="/studio/"]');
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

test("the portable signup route opens the offline workspace and makes no account request", async (t) => {
  const { dom, document, errors, requests } = setup();
  t.after(() => dom.window.close());
  await waitFor(() => document.title.includes("Connect agents worldwide"));
  dom.window.location.hash = "/signup/";
  await waitFor(() => document.querySelector(".account-offline"));
  assert.equal(document.querySelector(".signup-card form"), null);
  assert.match(
    document.querySelector(".account-offline").textContent,
    /hosted site/,
  );
  named(document, "Open the sample studio", "a").click();
  await waitFor(() => document.querySelector(".workspace-shell"));
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
});

test("reduced motion shows the same composed crossings and only completed calls, with a play override", async (t) => {
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
  assert.equal(
    still.querySelectorAll(".world-pair-static").length,
    STILL_CONNECTIONS.length,
  );
  assert.equal(
    still.querySelectorAll("animate, animateMotion, animateTransform").length,
    0,
  );
  for (const layer of still.querySelectorAll(".world-pair-static")) {
    const state = STILL_CONNECTIONS.find(
      (state) => state.pair.id === layer.dataset.pair,
    );
    assert.equal(
      Number(
        layer.querySelector(".world-call-connection").getAttribute("opacity"),
      ),
      state.callOpacity,
    );
    if (state.progress < 1) assert.equal(state.callOpacity, 0);
  }
  assert.ok(
    still.querySelectorAll('.world-country-lines[opacity="1"]').length >= 2,
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

function labelled(document, label) {
  const node = [...document.querySelectorAll("label[for]")].find((el) =>
    el.textContent.trim().startsWith(label),
  );
  assert.ok(node, "Missing field: " + label);
  const input = (document.ownerDocument || document).getElementById(
    node.htmlFor,
  );
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

test("mobile navigation is a dismissible left drawer with all destinations and a safe clickable call card", async (t) => {
  const { dom, document, window, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Your workspace | AgentBridge");
  assert.equal(document.querySelector(".workspace-demo-note"), null);
  assert.equal(document.querySelector(".mobile-call-bar"), null);
  const trigger = named(document, "Open navigation");
  trigger.focus();
  trigger.click();
  await waitFor(() =>
    document.querySelector('.studio-drawer[open][data-entered="true"]'),
  );
  const drawer = document.querySelector(".studio-drawer");
  assert.equal(document.body.style.overflow, "hidden");
  for (const label of [
    "Home",
    "Numbers",
    "Connections",
    "Calls",
    "Calling setup",
    "Agents",
    "Settings",
  ])
    assert.ok(named(drawer, label, "a"));
  assert.equal(
    [...drawer.querySelectorAll("button")].some((button) =>
      /Mute|End call/.test(
        button.getAttribute("aria-label") || button.textContent,
      ),
    ),
    false,
  );
  assert.ok(drawer.querySelector(".active-call-numbers"));
  assert.ok(named(drawer, "Call overview"));
  drawer.dispatchEvent(new window.Event("cancel", { cancelable: true }));
  await waitFor(() => !drawer.open);
  assert.equal(document.body.style.overflow, "");
  assert.equal(document.activeElement, trigger);
  trigger.click();
  await waitFor(() => drawer.open);
  named(drawer, "Open call and transcript").click();
  await waitFor(() => !drawer.open);
  await waitFor(() => document.querySelector(".gb-call-layout"));
  assert.match(document.querySelector("main").textContent, /Routing number/);
  assert.ok(named(document.querySelector("main"), "Join call"));
  trigger.click();
  await waitFor(() => drawer.open);
  drawer.getBoundingClientRect = () => ({
    left: 0,
    right: 320,
    top: 0,
    bottom: 800,
  });
  drawer.dispatchEvent(
    new window.MouseEvent("click", {
      clientX: 370,
      clientY: 110,
      bubbles: true,
    }),
  );
  await waitFor(() => !drawer.open);
  trigger.click();
  await waitFor(() => drawer.open);
  named(drawer, "Call overview").click();
  await waitFor(() => !drawer.open);
  assert.equal(
    document.querySelector('dialog[open][aria-label="Join call"]'),
    null,
    "Navigation opens the overview without joining",
  );
  named(document.querySelector("main"), "Join call").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  assert.equal(labelled(document, "Microphone off").checked, true);
  named(
    document.querySelector('dialog[open][aria-label="Join call"]'),
    "Join call",
  ).click();
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

test("joining with the microphone off keeps sample audio across pages and live captions stay separate from saved capture", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/",
  );
  t.after(() => dom.window.close());
  // JSDOM has no decoder. Stub only media playback, then check the actual
  // application events/state; this does not establish real-browser audio QA.
  let plays = 0,
    pauses = 0;
  window.HTMLMediaElement.prototype.play = function () {
    plays++;
    this.dispatchEvent(new window.Event("play"));
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function () {
    pauses++;
    this.dispatchEvent(new window.Event("pause"));
  };
  await waitFor(() => document.title === "Your workspace | AgentBridge");
  named(
    document.querySelector(".floating-rail"),
    "Open call and transcript",
  ).click();
  await waitFor(() => document.querySelector(".call-view-entry-actions"));
  await beginJoin(document);
  await waitFor(
    () => document.querySelector(".sample-listen-dock")?.hidden === false,
  );
  assert.equal(plays, 1);
  const audio = document.querySelector(".sample-listen-dock audio");
  assert.match(audio.getAttribute("src"), /^data:audio\/(?:mpeg|mp3);base64,/);
  await navigate(document, "/studio/demo/connections/");
  assert.equal(document.querySelector(".sample-listen-dock audio"), audio);
  assert.equal(document.querySelector(".sample-listen-dock").hidden, false);
  named(document, "Open call and transcript").click();
  await waitFor(() =>
    document
      .querySelector(".call-participants")
      ?.textContent.includes("Microphone off"),
  );
  assert.match(
    document.querySelector(".call-inline-transcript").textContent,
    /Live captions · Not saved/,
  );
  assert.ok(named(document, "Start recording"));
  named(document, "Start transcription").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  labelled(document, "Permission confirmed").click();
  named(document, "Enable transcription").click();
  await waitFor(
    () => document.querySelectorAll(".live-transcript-line").length === 1,
  );
  audio.currentTime = 17;
  audio.dispatchEvent(new window.Event("timeupdate"));
  await waitFor(
    () => document.querySelectorAll(".live-transcript-line").length === 4,
  );
  assert.match(
    document.querySelector(".live-transcript").textContent,
    /D E M O two zero four/,
  );
  named(document, "Mute speakers").click();
  await waitFor(() => audio.muted === true);
  named(document, "Leave call audio").click();
  await waitFor(
    () => document.querySelector(".sample-listen-dock").hidden === true,
  );
  assert.ok(pauses >= 1);
  assert.match(
    document.querySelector(".live-card-top").textContent,
    /Connected/,
  );
  assert.ok(named(document, "Start recording"));
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("blocked playback does not join and ending a call cancels a pending sample listen", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/",
  );
  t.after(() => dom.window.close());
  let pauses = 0;
  window.HTMLMediaElement.prototype.pause = function () {
    pauses++;
  };
  window.HTMLMediaElement.prototype.play = () =>
    Promise.reject(new Error("Playback blocked"));
  await waitFor(() => document.title === "Your workspace | AgentBridge");
  named(
    document.querySelector(".floating-rail"),
    "Open call and transcript",
  ).click();
  await waitFor(() => document.querySelector(".call-view-entry-actions"));
  await beginJoin(document);
  await waitFor(() =>
    document
      .querySelector(".toast-message")
      .textContent.includes("Playback could not start"),
  );
  assert.equal(document.querySelector(".sample-listen-dock").hidden, true);
  named(
    document.querySelector('dialog[open][aria-label="Join call"]'),
    "Cancel",
  ).click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  let finishPlay;
  window.HTMLMediaElement.prototype.play = () =>
    new Promise((resolve) => {
      finishPlay = resolve;
    });
  named(
    document.querySelector(".floating-rail"),
    "Open call and transcript",
  ).click();
  await waitFor(() => document.querySelector(".call-view-entry-actions"));
  await beginJoin(document);
  named(
    document.querySelector('dialog[open][aria-label="Join call"]'),
    "Cancel",
  ).click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  await endFixtureCall(document);
  finishPlay();
  await waitFor(() => pauses >= 1);
  await waitFor(() => document.querySelector(".nav-call-empty"));
  assert.equal(document.querySelector(".sample-listen-dock").hidden, true);
  assert.ok(named(document, "Restart call"));
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("international call planning saves optional capture choices and join defaults across studio pages", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/calls/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Calls | AgentBridge");
  named(document, "New call").click();
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
  await waitFor(() =>
    document.querySelector('dialog[open] input[role="switch"]'),
  );
  assert.equal(
    labelled(document.querySelector("dialog[open]"), "Record the call").checked,
    false,
  );
  assert.equal(
    labelled(document.querySelector("dialog[open]"), "Create a transcript")
      .checked,
    false,
  );
  labelled(
    document.querySelector("dialog[open]"),
    "Create a transcript",
  ).click();
  fieldValue(
    window,
    labelled(document.querySelector("dialog[open]"), "Transcript language"),
    "nl",
  );
  named(document, "Save call plan").click();
  await waitFor(() =>
    document
      .querySelector(".call-plan-list")
      ?.textContent.includes("Amsterdam viewing test"),
  );
  named(document, "Open Amsterdam viewing test").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Edit call plan"]'),
  );
  const editor = document.querySelector(
    'dialog[open][aria-label="Edit call plan"]',
  );
  await waitFor(
    () => labelled(editor, "Call name").value === "Amsterdam viewing test",
  );
  assert.equal(labelled(editor, "Record the call").checked, false);
  assert.equal(labelled(editor, "Create a transcript").checked, true);
  assert.equal(
    labelled(editor, "Recording and transcription permission").value,
    "ask",
  );
  named(editor, "Close").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Edit call plan"]'),
  );
  await navigate(document, "/studio/demo/calls/");
  document.querySelector(".call-defaults").open = true;
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
  named(document.querySelector("main"), "Join call").click();
  // Opening the dialog and applying saved preferences happen in separate
  // renders. Wait for the actual phone field before asserting its value.
  await waitFor(() =>
    [...document.querySelectorAll("dialog[open] label[for]")].some((el) =>
      el.textContent.trim().startsWith("Number where I’ll join"),
    ),
  );
  assert.equal(
    labelled(document, "Number where I’ll join").value,
    "+31612345678",
  );
  named(
    document.querySelector('dialog[open][aria-label="Join call"]'),
    "Join call",
  ).click();
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
  named(document.querySelector("main"), "Join call").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  named(
    document.querySelector('dialog[open][aria-label="Join call"]'),
    "Join call",
  ).click();
  await waitFor(() =>
    document
      .querySelector(".call-participants")
      ?.textContent.includes("You’re in"),
  );
  named(document, "Unmute microphone").click();
  await waitFor(() =>
    document
      .querySelector(".call-participants")
      .textContent.includes("Unmuted"),
  );
  named(document, "Leave room").click();
  await waitFor(
    () =>
      !document
        .querySelector(".call-participants")
        .textContent.includes("You’re in"),
  );
  assert.match(
    document.querySelector(".live-card-top").textContent,
    /Connected/,
  );
  named(document, "Start recording").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  assert.equal(named(document, "Enable recording").disabled, true);
  labelled(document, "Permission confirmed").click();
  named(document, "Enable recording").click();
  await waitFor(
    () =>
      document
        .querySelector('button[aria-label="Stop recording"]')
        ?.getAttribute("aria-pressed") === "true",
  );
  named(document, "Pause recording").click();
  await waitFor(() =>
    named(document, "Stop recording").textContent.includes("Recording paused"),
  );
  named(document, "Resume recording").click();
  named(document, "Start transcription").click();
  assert.equal(
    document.querySelector("dialog[open]"),
    null,
    "Capture permission is already confirmed for this sample call",
  );
  await waitFor(() =>
    [...document.querySelectorAll(".live-transcript button")].some(
      (button) => button.textContent.trim() === "Show full transcript",
    ),
  );
  named(document, "Show full transcript").click();
  await waitFor(
    () => document.querySelectorAll(".live-transcript-line").length === 6,
  );
  await navigate(document, "/studio/demo/calls/");
  named(document, "Open recent call with London studio").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Recent call details"]'),
  );
  const details = document.querySelector(
    'dialog[open][aria-label="Recent call details"]',
  );
  const audio = details.querySelector("audio");
  assert.match(audio.getAttribute("src"), /^data:audio\/(?:mpeg|mp3);base64,/);
  fieldValue(
    window,
    details.querySelector('input[aria-label="Search call transcript"]'),
    "reference",
  );
  fieldValue(window, labelled(details, "Speaker"), "Recipient");
  await waitFor(
    () =>
      details.querySelectorAll(".conversation-transcript article").length === 1,
  );
  assert.match(
    details.querySelector(".conversation-transcript").textContent,
    /two zero four/,
  );
  named(details, "Jump to 00:16").click();
  assert.equal(audio.currentTime, 16.07);
  fieldValue(
    window,
    details.querySelector('input[aria-label="Search call transcript"]'),
    "does-not-exist",
  );
  await waitFor(() => details.querySelector(".tools-empty"));
  assert.match(
    details.querySelector(".tools-empty").textContent,
    /No matching transcript/,
  );
  assert.match(
    details.querySelector(".conversation-notes").textContent,
    /access to reception/,
  );
  named(details, "Close").click();
  await navigate(document, "/studio/demo/call/");
  assert.ok(named(document, "Pause recording"));
  assert.ok(named(document, "Stop transcription"));
  await endFixtureCall(document);
  await waitFor(() => document.querySelector("main .nav-call-empty"));
  named(document, "Restart call").click();
  await waitFor(() =>
    document.querySelector(".live-card-top").textContent.includes("Connected"),
  );
  assert.ok(named(document, "Start recording"));
  assert.ok(named(document, "Start transcription"));
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});
test("feature pages link into international planning, call memory and joining through real routes", async (t) => {
  const { dom, document, errors, requests } = setup();
  t.after(() => dom.window.close());
  await waitFor(() => document.title.includes("Connect agents worldwide"));
  await navigate(document, "/features/");
  assert.match(
    document.querySelector("main h1").textContent,
    /Calling tools/,
  );
  await navigate(document, "/international-calling/");
  assert.match(
    document.querySelector("main h1").textContent,
    /Call across borders/,
  );
  assert.ok(document.querySelector('main a[href="#/connect/"]'));
  await navigate(document, "/call-memory/");
  assert.ok(document.querySelector("audio"));
  assert.match(
    document.querySelector("main").textContent,
    /synthetic demonstration voices/i,
  );
  await navigate(document, "/join-call/");
  named(document, "Join sample room").click();
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
  assert.ok(document.querySelector('main a[href="#/how-it-works/"]'));
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("studio search groups live calls, connections, numbers, countries and settings, then opens the selected part", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Your workspace | AgentBridge");
  assert.equal(document.querySelector(".workspace-top .owner-dot"), null);
  const input = document.querySelector('input[aria-label="Search studio"]');
  input.focus();
  fieldValue(window, input, "london");
  await waitFor(() =>
    document.querySelector(
      '.studio-search [role="group"][aria-label="Connections"]',
    ),
  );
  assert.ok(
    document.querySelector('.studio-search [role="group"][aria-label="Calls"]'),
  );
  document
    .querySelector(
      '.studio-search [role="group"][aria-label="Connections"] [role="option"]',
    )
    .click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Edit connection"]'),
  );
  let dialog = document.querySelector(
    'dialog[open][aria-label="Edit connection"]',
  );
  assert.equal(labelled(dialog, "Name").value, "London studio");
  named(dialog, "Close").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Edit connection"]'),
  );
  input.focus();
  fieldValue(window, input, "+1 (202) 555-0111");
  await waitFor(() =>
    document.querySelector(
      '.studio-search [role="group"][aria-label="Numbers"]',
    ),
  );
  document
    .querySelector(
      '.studio-search [role="group"][aria-label="Numbers"] [role="option"]',
    )
    .click();
  await waitFor(() => document.title === "Numbers | AgentBridge");
  await waitFor(
    () => document.querySelectorAll(".owned-number-card").length === 1,
  );
  assert.match(
    document.querySelector(".owned-number-card").textContent,
    /\+1 202 555 0111/,
  );
  input.focus();
  fieldValue(window, input, "Netherlands");
  await waitFor(() =>
    document.querySelector(
      '.studio-search [role="group"][aria-label="Countries"]',
    ),
  );
  document
    .querySelector(
      '.studio-search [role="group"][aria-label="Countries"] [role="option"]',
    )
    .click();
  await waitFor(() => document.title === "Connections | AgentBridge");
  assert.equal(
    document.querySelector('select[aria-label="Filter by country"]').value,
    "NL",
  );
  assert.equal(document.querySelector(".connection-filters").hidden, false);
  input.focus();
  fieldValue(window, input, "no-such-entry-284");
  await waitFor(() => document.querySelector(".studio-search-empty"));
  input.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await waitFor(() => input.getAttribute("aria-expanded") === "false");
  document.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  await waitFor(() => input.getAttribute("aria-expanded") === "true");
  fieldValue(window, input, "dark");
  await waitFor(() =>
    document.querySelector('.studio-search [role="group"][aria-label="Pages"]'),
  );
  input.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  await waitFor(() => input.getAttribute("aria-activedescendant"));
  input.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await waitFor(() => document.title === "Settings | AgentBridge");
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
});

test("home connections default to a recent horizontal row, expand for search, and remember opened connections", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Your workspace | AgentBridge");
  const main = document.querySelector("main");
  assert.ok(named(main, "Buy a number"));
  assert.ok(named(main, "Connect a destination"));
  assert.equal(document.querySelector(".number-country-rail"), null);
  assert.ok(document.querySelector(".number-connection-list.is-horizontal"));
  assert.equal(
    main.querySelector('input[aria-label="Search connections"]'),
    null,
  );
  assert.match(
    main.querySelector(".number-connection-card h3").textContent,
    /London/,
  );
  named(main, "Expand connections").click();
  await waitFor(() =>
    document.querySelector(".number-connection-list.is-expanded"),
  );
  const search = main.querySelector('input[aria-label="Search connections"]');
  fieldValue(window, search, "San Francisco");
  await waitFor(
    () => main.querySelectorAll(".number-connection-card").length === 1,
  );
  named(main, "Edit San Francisco team").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Edit connection"]'),
  );
  named(
    document.querySelector('dialog[open][aria-label="Edit connection"]'),
    "Close",
  ).click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Edit connection"]'),
  );
  named(main, "Collapse connections").click();
  await waitFor(
    () => main.querySelectorAll(".number-connection-card").length === 3,
  );
  assert.equal(
    main.querySelector('input[aria-label="Search connections"]'),
    null,
  );
  assert.match(
    main.querySelector(".number-connection-card h3").textContent,
    /San Francisco/,
  );
  named(main, "Expand connections").click();
  await waitFor(() =>
    main.querySelector('input[aria-label="Search connections"]'),
  );
  named(main, "Filter connections").click();
  await waitFor(() => !main.querySelector(".connection-filters").hidden);
  fieldValue(
    window,
    main.querySelector('select[aria-label="Filter by country"]'),
    "GB",
  );
  await waitFor(
    () => main.querySelectorAll(".number-connection-card").length === 1,
  );
  assert.match(
    main.querySelector(".number-connection-card").textContent,
    /London studio/,
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
});

test("home live call expands and minimizes in place while its action opens the full overview without listening or joining", async (t) => {
  const { dom, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Your workspace | AgentBridge");
  const card = document.querySelector("main .active-call-card");
  assert.equal(card.querySelector(".active-call-details").hidden, true);
  named(card, "Expand live call").click();
  await waitFor(() => !card.querySelector(".active-call-details").hidden);
  assert.match(card.textContent, /Routing number/);
  assert.match(card.textContent, /Turn on the transcript here/);
  named(card, "Minimize live call").click();
  await waitFor(() => card.querySelector(".active-call-details").hidden);
  assert.equal(document.title, "Your workspace | AgentBridge");
  named(card, "Call overview").click();
  await waitFor(() => document.querySelector(".gb-call-layout"));
  assert.equal(
    document.querySelector('dialog[open][aria-label="Join call"]'),
    null,
  );
  assert.equal(document.querySelector(".sample-listen-dock").hidden, true);
  const main = document.querySelector("main");
  assert.equal(
    document.querySelectorAll(".call-view-entry-actions button").length,
    1,
  );
  assert.ok(named(main, "Join call"));
  named(main, "Join call").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  let dialog = document.querySelector('dialog[open][aria-label="Join call"]');
  assert.ok(dialog.querySelector(".tools-dialog-actions"));
  named(dialog, "Cancel").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  named(main, "Join call").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  dialog = document.querySelector('dialog[open][aria-label="Join call"]');
  named(dialog, "Close").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  assert.doesNotMatch(
    document.querySelector(".call-participants").textContent,
    /You’re in/,
  );
  named(main, "Route call").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Review call routing"]'),
  );
  named(
    document.querySelector('dialog[open][aria-label="Review call routing"]'),
    "Close",
  ).click();
  await waitFor(
    () =>
      !document.querySelector('dialog[open][aria-label="Review call routing"]'),
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
});

test("number acquisition has a visible exit, handles missing inventory, and continues offering unowned numbers after the first three", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/numbers/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Numbers | AgentBridge");
  named(document.querySelector("main"), "Buy a number").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Add routing number"]'),
  );
  named(
    document.querySelector('dialog[open][aria-label="Add routing number"]'),
    "Close",
  ).click();
  await waitFor(
    () =>
      !document.querySelector('dialog[open][aria-label="Add routing number"]'),
  );
  named(document.querySelector("main"), "Buy a number").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Add routing number"]'),
  );
  let buyer = document.querySelector(
    'dialog[open][aria-label="Add routing number"]',
  );
  fieldValue(window, labelled(buyer, "Area code"), "000");
  await waitFor(() => buyer.querySelector(".number-inventory-empty"));
  assert.equal(buyer.querySelector(".number-candidates"), null);
  assert.equal(named(buyer, "Add example number").disabled, true);
  buyer
    .querySelector("form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  await waitFor(() => buyer.querySelector('[role="alert"]'));
  assert.match(buyer.textContent, /Choose an available number/);
  named(buyer, "Try another area code").click();
  await waitFor(() => buyer.querySelector(".number-candidates input:checked"));
  assert.match(
    buyer.querySelector(".number-candidates input:checked").value,
    /^\+1415/,
  );
  named(buyer, "Cancel").click();
  await waitFor(
    () =>
      !document.querySelector('dialog[open][aria-label="Add routing number"]'),
  );
  const added = new Set();
  for (let index = 0; index < 4; index++) {
    named(document.querySelector("main"), "Buy a number").click();
    await waitFor(() =>
      document.querySelector('dialog[open][aria-label="Add routing number"]'),
    );
    buyer = document.querySelector(
      'dialog[open][aria-label="Add routing number"]',
    );
    const selected = buyer.querySelector(
      ".number-candidates input:checked",
    ).value;
    assert.equal(added.has(selected), false);
    added.add(selected);
    named(buyer, "Add example number").click();
    await waitFor(() =>
      document.querySelector('dialog[open][aria-label="Add connection"]'),
    );
    const editor = document.querySelector(
      'dialog[open][aria-label="Add connection"]',
    );
    const routing = labelled(editor, "Your routing number");
    assert.equal(routing.selectedOptions[0].disabled, false);
    assert.ok(routing.value);
    named(editor, "Close").click();
    await waitFor(
      () =>
        !document.querySelector('dialog[open][aria-label="Add connection"]'),
    );
  }
  assert.equal(document.querySelectorAll(".owned-number-card").length, 7);
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
});

test("studio shortcuts form one five-item rail and the single circle arrow expands connections into search and filters", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Your workspace | AgentBridge");
  const rail = document.querySelector('nav[aria-label="Studio shortcuts"]');
  assert.equal(rail.children.length, 5);
  assert.ok(named(rail, "Buy a number"));
  assert.ok(named(rail, "Connect a destination"));
  for (const [label, route] of [
    ["Calls", "calls"],
    ["Transcripts", "memory"],
    ["Your numbers", "numbers"],
  ])
    assert.equal(
      named(rail, label, "a").getAttribute("href"),
      `#/studio/demo/${route}/${route === "memory" ? "?filter=transcript" : ""}`,
    );
  for (const item of rail.children)
    assert.equal(item.querySelectorAll(".direction-arrow").length, 1);
  assert.equal(document.querySelector(".number-country-rail"), null);
  const toggle = named(document, "Expand connections");
  assert.equal(toggle.querySelectorAll("svg").length, 1);
  assert.equal(
    toggle.querySelector(".direction-arrow").dataset.expanded,
    "false",
  );
  toggle.click();
  await waitFor(() => toggle.getAttribute("aria-expanded") === "true");
  assert.equal(
    toggle.querySelector(".direction-arrow").dataset.expanded,
    "true",
  );
  named(document.querySelector("main"), "Filter connections").click();
  await waitFor(() => !document.querySelector(".connection-filters").hidden);
  fieldValue(
    window,
    document.querySelector('select[aria-label="Filter by country"]'),
    "GB",
  );
  await waitFor(
    () => document.querySelectorAll(".number-connection-card").length === 1,
  );
  fieldValue(
    window,
    document.querySelector('select[aria-label="Filter by routing number"]'),
    "example-number-2",
  );
  await waitFor(
    () => document.querySelectorAll(".number-connection-card").length === 0,
  );
  named(document.querySelector("main"), "Clear filters").click();
  await waitFor(
    () => document.querySelectorAll(".number-connection-card").length === 3,
  );
  named(document, "Collapse connections").click();
  await waitFor(() =>
    document.querySelector(".number-connection-list.is-horizontal"),
  );
  assert.equal(document.querySelector(".connection-filters").hidden, true);
  named(rail, "Calls", "a").click();
  await waitFor(() => document.title === "Calls | AgentBridge");
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
});

test("Calls shows live and idle saved cards, searches them, and edits call details and capture choices in place", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/calls/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Calls | AgentBridge");
  assert.ok(
    document.querySelector(
      'section[aria-label="Live calls"] .active-call-card',
    ),
  );
  assert.equal(document.querySelector(".hub-transcript-card"), null);
  assert.doesNotMatch(
    document.querySelector("main").textContent,
    /YOUR PREPARATION|Transcript off/i,
  );
  assert.equal(document.querySelectorAll(".saved-call-card").length, 3);
  for (const card of document.querySelectorAll(".saved-call-card"))
    assert.equal(card.querySelector(".bot-face").dataset.state, "idle");
  const search = document.querySelector(
    'input[aria-label="Search saved calls"]',
  );
  fieldValue(window, search, "San Francisco");
  await waitFor(
    () => document.querySelectorAll(".saved-call-card").length === 1,
  );
  fieldValue(window, search, "no matching saved call");
  await waitFor(() =>
    document.querySelector(".saved-calls-section .conversation-help"),
  );
  fieldValue(window, search, "");
  await waitFor(
    () => document.querySelectorAll(".saved-call-card").length === 3,
  );
  named(document, "Open London studio viewing").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Edit call plan"]'),
  );
  let editor = document.querySelector(
    'dialog[open][aria-label="Edit call plan"]',
  );
  await waitFor(
    () => labelled(editor, "Call name").value === "London studio viewing",
  );
  fieldValue(window, labelled(editor, "Call name"), "London follow-up");
  fieldValue(
    window,
    labelled(editor, "What should your agent find out?"),
    "Ask for an afternoon appointment.",
  );
  labelled(editor, "Create a transcript").click();
  fieldValue(window, labelled(editor, "Transcript language"), "en");
  named(editor, "Save changes").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Edit call plan"]'),
  );
  assert.equal(
    document.querySelectorAll(".saved-call-card").length,
    3,
    "Editing must not duplicate a saved call",
  );
  named(document, "Open London follow-up").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Edit call plan"]'),
  );
  editor = document.querySelector('dialog[open][aria-label="Edit call plan"]');
  await waitFor(
    () => labelled(editor, "Call name").value === "London follow-up",
  );
  assert.equal(labelled(editor, "Create a transcript").checked, true);
  assert.equal(labelled(editor, "Record the call").checked, false);
  assert.equal(
    labelled(editor, "What should your agent find out?").value,
    "Ask for an afternoon appointment.",
  );
  fieldValue(window, labelled(editor, "International phone number"), "invalid");
  editor
    .querySelector("form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  await waitFor(() => editor.querySelector('[role="alert"]'));
  named(editor, "Cancel").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Edit call plan"]'),
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
});

test("an idle connection opens a prefilled call and saving it converts that card into an editable saved call", async (t) => {
  const { dom, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/calls/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Calls | AgentBridge");
  named(document, "Open New York office").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="New call"]'),
  );
  let editor = document.querySelector('dialog[open][aria-label="New call"]');
  await waitFor(
    () => labelled(editor, "Call name").value === "New York office",
  );
  assert.equal(
    labelled(editor, "International phone number").value,
    "+12125550124",
  );
  named(editor, "Continue to options").click();
  await waitFor(() => editor.querySelector('input[role="switch"]'));
  labelled(editor, "Record the call").click();
  named(editor, "Save call plan").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="New call"]'),
  );
  assert.equal(document.querySelectorAll(".saved-call-card").length, 3);
  named(document, "Open New York office").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Edit call plan"]'),
  );
  editor = document.querySelector('dialog[open][aria-label="Edit call plan"]');
  await waitFor(() => labelled(editor, "Record the call").checked);
  assert.equal(labelled(editor, "Create a transcript").checked, false);
  named(editor, "Archive call plan").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Edit call plan"]'),
  );
  assert.equal(
    document.querySelectorAll(".saved-call-card").length,
    3,
    "The saved connection remains available after its call plan is archived",
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
});

test("quick capture switches, contact memory and highlights remain usable in the unified Calls history", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Your workspace | AgentBridge");
  named(document.querySelector("main"), "Expand live call").click();
  await waitFor(
    () => !document.querySelector("main .active-call-details").hidden,
  );
  const home = document.querySelector("main");
  named(home, "Start transcription").click();
  await waitFor(() =>
    document.querySelector(
      'dialog[open][aria-label="Optional capture permission"]',
    ),
  );
  const permission = document.querySelector(
    'dialog[open][aria-label="Optional capture permission"]',
  );
  labelled(permission, "Permission confirmed").click();
  named(permission, "Enable transcription").click();
  await waitFor(() =>
    document.querySelector("main .capture-action.is-transcribing"),
  );
  named(home, "Start recording").click();
  await waitFor(() =>
    document.querySelector("main .capture-action.is-recording"),
  );
  assert.equal(
    document.title,
    "Your workspace | AgentBridge",
    "Quick controls must keep the user in the call card",
  );
  named(home, "Stop recording").click();
  await waitFor(
    () => !document.querySelector("main .capture-action.is-recording"),
  );
  named(document, "Memory for London studio").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Contact memory"]'),
  );
  let memory = document.querySelector(
    'dialog[open][aria-label="Contact memory"]',
  );
  fieldValue(
    window,
    labelled(memory, "Notes for the next conversation"),
    "Ask Alex about afternoon appointments.",
  );
  named(memory, "Save contact memory").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Contact memory"]'),
  );
  await navigate(document, "/studio/demo/call/");
  const notes = document.querySelector(".conversation-notes");
  fieldValue(
    window,
    labelled(notes, "Add a note"),
    "Confirm reception access next time.",
  );
  named(notes, "Save highlight").click();
  await waitFor(() => notes.querySelector("article"));
  assert.ok(
    notes.querySelector("article time"),
    "A live note keeps its call timestamp",
  );
  await endFixtureCall(document);
  await navigate(document, "/studio/demo/calls/");
  assert.equal(
    document.querySelectorAll(".conversation-history-row").length,
    3,
  );
  named(document, "With notes").click();
  await waitFor(
    () => document.querySelectorAll(".conversation-history-row").length === 2,
  );
  document.querySelector(".conversation-history-row").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Recent call details"]'),
  );
  let detail = document.querySelector(
    'dialog[open][aria-label="Recent call details"]',
  );
  assert.ok(
    detail.querySelector("audio"),
    "A recording captured before Stop remains available",
  );
  assert.match(
    detail.querySelector(".conversation-notes").textContent,
    /Confirm reception access/,
  );
  named(detail, "Remove transcript").click();
  await waitFor(() => !detail.querySelector(".conversation-transcript"));
  await waitFor(() => !named(detail, "Restore sample transcript").disabled);
  named(detail, "Restore sample transcript").click();
  await waitFor(() => detail.querySelector(".conversation-transcript"));
  named(detail, "Open contact memory").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Contact memory"]'),
  );
  memory = document.querySelector('dialog[open][aria-label="Contact memory"]');
  assert.equal(
    labelled(memory, "Notes for the next conversation").value,
    "Ask Alex about afternoon appointments.",
  );
  assert.match(
    memory.querySelector(".contact-previous-calls").textContent,
    /Confirm reception access/,
  );
  named(memory, "Cancel").click();
  await waitFor(() => !document.querySelector("dialog[open]"));
  named(document, "All calls").click();
  await waitFor(
    () => document.querySelectorAll(".conversation-history-row").length === 3,
  );
  named(document, "Open recent call with New York office").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Recent call details"]'),
  );
  detail = document.querySelector(
    'dialog[open][aria-label="Recent call details"]',
  );
  assert.equal(
    detail.querySelector("audio"),
    null,
    "An uncaptured call must not expose fictional recovered audio",
  );
  assert.match(detail.textContent, /01:12/);
  assert.ok(
    ![...detail.querySelectorAll("button")].some((b) =>
      b.textContent.includes("Restore sample transcript"),
    ),
  );
  named(detail, "Close").click();
  await navigate(document, "/studio/demo/numbers/");
  assert.equal(
    document.querySelector('nav[aria-label="Studio shortcuts"]'),
    null,
    "Numbers has its own inventory page",
  );
  assert.equal(document.querySelector("main .active-call-card"), null);
  assert.ok(document.querySelector(".owned-number-card"));
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("one Join call entry opens a participant room with independent agent, microphone and speaker controls", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/call/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Call | AgentBridge");
  const entry = document.querySelector(".call-view-entry-actions");
  assert.equal(entry.querySelectorAll("button").length, 1);
  assert.equal(entry.textContent.trim(), "Join call");
  assert.ok(
    ![...entry.querySelectorAll("button")].some((button) =>
      /Listen in|Jump in/.test(button.textContent),
    ),
  );
  named(entry, "Join call").click();
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  const prejoin = document.querySelector(
    'dialog[open][aria-label="Join call"]',
  );
  assert.equal(labelled(prejoin, "Microphone off").checked, true);
  labelled(prejoin, "Microphone on").click();
  named(prejoin, "Join call").click();
  await waitFor(() => document.querySelector(".call-room.is-joined"));
  const room = document.querySelector(".call-room");
  assert.equal(room.querySelectorAll(".call-person").length, 3);
  assert.match(room.querySelector(".self-person").textContent, /Unmuted/);
  assert.match(
    document.querySelector(".call-inline-transcript").textContent,
    /Live captions · Not saved/,
  );
  assert.equal(
    named(room, "Start transcription").getAttribute("aria-pressed"),
    "false",
  );
  const audio = document.querySelector(".sample-listen-dock audio");
  audio.currentTime = 1;
  audio.dispatchEvent(new window.Event("timeupdate"));
  named(room, "Mute agent").click();
  await waitFor(() => audio.muted);
  assert.match(room.querySelector(".agent-person").textContent, /Agent muted/);
  assert.match(
    room.querySelector(".self-person").textContent,
    /Unmuted/,
    "Agent mute must not change the microphone",
  );
  audio.currentTime = 8;
  audio.dispatchEvent(new window.Event("timeupdate"));
  await waitFor(() => !audio.muted);
  assert.equal(
    named(room, "Unmute agent").getAttribute("aria-pressed"),
    "true",
    "Muting the agent must leave the recipient audible",
  );
  named(room, "Mute microphone").click();
  await waitFor(() =>
    room.querySelector(".self-person").textContent.includes("Microphone off"),
  );
  assert.equal(
    audio.muted,
    false,
    "Microphone mute must not mute incoming audio",
  );
  named(room, "Mute speakers").click();
  await waitFor(() => audio.muted);
  named(room, "Unmute speakers").click();
  await waitFor(() => !audio.muted);
  named(room, "Unmute agent").click();
  named(room, "Add connection").click();
  await waitFor(() =>
    document.querySelector(
      'dialog[open][aria-label="Add connection to demo call"]',
    ),
  );
  const add = document.querySelector(
    'dialog[open][aria-label="Add connection to demo call"]',
  );
  named(add, "Add to call").click();
  await waitFor(() => room.querySelectorAll(".call-person").length === 4);
  assert.match(room.textContent, /New York office/);
  await navigate(document, "/studio/demo/connections/");
  named(document, "Open call and transcript").click();
  await waitFor(() => document.querySelector(".call-room.is-joined"));
  assert.equal(
    document.querySelectorAll(".call-person").length,
    4,
    "Participant cards survive studio navigation",
  );
  named(document, "Remove New York office from demo call").click();
  await waitFor(() => document.querySelectorAll(".call-person").length === 3);
  audio.dispatchEvent(new window.Event("ended"));
  await waitFor(
    () =>
      document.querySelector(".sample-listen-title strong").textContent ===
      "Demo audio finished",
  );
  assert.ok(
    document.querySelector(".call-room.is-joined"),
    "The demo audio ending must keep the joined room and transcript open",
  );
  named(document, "Leave room").click();
  await waitFor(() => !document.querySelector(".call-room.is-joined"));
  assert.equal(document.querySelector(".sample-listen-dock").hidden, true);
  assert.ok(named(document.querySelector("main"), "Join call"));
  assert.match(
    document.querySelector(".live-card-top").textContent,
    /Connected/,
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});

test("canceling a pending join cannot interrupt a later successful join or create a phantom participant", async (t) => {
  const { dom, window, document, errors } = setup(
    "file:///AgentBridge-Working-Website.html#/studio/demo/call/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title === "Call | AgentBridge");
  let resolveOld;
  window.HTMLMediaElement.prototype.play = () =>
    new Promise((resolve) => {
      resolveOld = resolve;
    });
  await beginJoin(document);
  const dialog = document.querySelector('dialog[open][aria-label="Join call"]');
  named(dialog, "Cancel").click();
  await waitFor(
    () => !document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  assert.equal(document.querySelectorAll(".self-person").length, 0);
  let pauses = 0;
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {
    pauses++;
  };
  await joinFixtureCall(document);
  resolveOld();
  await pause(50);
  assert.equal(pauses, 0, "An old play promise must not pause a newer session");
  assert.equal(document.querySelectorAll(".self-person").length, 1);
  assert.equal(document.querySelector(".sample-listen-dock").hidden, false);
  assert.deepEqual(
    errors.map((e) => e.message),
    [],
  );
});
