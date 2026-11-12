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
  assert.ok(link, `Missing page link ${path}`);
  link.click();
  await pause(100);
}
async function endFixtureCall(document) {
  named(document.querySelector("main"), "End call").click();
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
  named(document.querySelector("main"), "End call").click();
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
  await waitFor(() => document.title.includes("connect agents worldwide"));
  await waitFor(() =>
    document.querySelector('.gb-hero-actions a[href="#/studio/"]'),
  );
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
  named(document.querySelector("main"), "Mute call").click();
  await waitFor(() =>
    document.querySelector('main button[aria-pressed="true"]'),
  );
  await navigate(document, "/studio/demo/numbers/");
  assert.equal(document.querySelectorAll(".owned-number-card").length, 3);
  named(document, "Collapse navigation").click();
  await waitFor(() => document.querySelector(".rail-collapsed"));
  named(document, "Expand navigation").click();
  named(nav, "Open call and transcript").click();
  await waitFor(() => document.querySelector(".gb-call-layout"));
  assert.equal(
    named(document.querySelector("main"), "Unmute call").getAttribute(
      "aria-pressed",
    ),
    "true",
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
      .querySelector(".hub-routing-summary")
      ?.textContent.includes("New York office"),
  );
  assert.match(
    document.querySelector("main .active-call-card").textContent,
    /\+442079460123/,
  );
  await endFixtureCall(document);
  await waitFor(() => document.querySelector(".nav-call-empty"));
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
  named(document, "Add connection").click();
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
  assert.match(card.textContent, /\+12025550130/);
  assert.match(card.textContent, /\+31201234567/);
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
  const studio = document.querySelector('.gb-hero-actions a[href="/studio/"]');
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

test("homepage leads to a separate signup page while its form preview keeps personal details off the network", async (t) => {
  const { dom, window, document, errors, requests } = setup(
    "https://agentbridge-preview.test/",
  );
  t.after(() => dom.window.close());
  await waitFor(() => document.title.includes("connect agents worldwide"));
  const primary = document.querySelector(
    '.gb-hero-actions a[href="#/signup/"]',
  );
  assert.ok(primary, "Primary action must open signup");
  assert.match(primary.textContent, /Sign me up/);
  assert.ok(document.querySelector('.gb-hero-actions a[href="#/studio/"]'));
  assert.equal(document.querySelectorAll(".landing-conversation li").length, 3);
  assert.match(
    document.querySelector(".landing-conversation").textContent,
    /Your agent.*London studio.*Your agent/s,
  );
  primary.click();
  await waitFor(() => document.querySelector(".signup-card form"));
  const form = document.querySelector(".signup-card form");
  const name = form.querySelector('input[name="name"]');
  const email = form.querySelector('input[name="email"]');
  assert.equal(form.checkValidity(), false);
  change(window, name, "Review user");
  change(window, email, "review@example.test");
  await waitFor(() => form.checkValidity());
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await waitFor(() => document.querySelector(".signup-confirmation"));
  assert.match(
    document.querySelector(".signup-confirmation").textContent,
    /No request has been sent and no account has been created/,
  );
  named(document, "Edit signup details").click();
  await waitFor(() =>
    document.querySelector('.signup-card input[name="email"]'),
  );
  assert.equal(
    document.querySelector('.signup-card input[name="email"]').value,
    "review@example.test",
  );
  assert.equal(window.location.hash, "#/signup/");
  assert.equal(window.localStorage.length, 0);
  assert.deepEqual(requests, []);
  assert.deepEqual(
    errors.map((error) => error.message),
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
    "Routing",
    "Transcripts",
    "Calling setup",
    "Activity",
    "Settings",
    "Design boards",
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
  assert.ok(named(drawer, "Jump in"));
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
  assert.ok(named(document.querySelector("main"), "Mute call"));
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
  named(drawer, "Jump in").click();
  await waitFor(() => !drawer.open);
  await waitFor(() =>
    document.querySelector('dialog[open][aria-label="Join call"]'),
  );
  assert.equal(labelled(document, "Join muted").checked, true);
  named(document, "Join call").click();
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

test("one-tap sample listening stays across pages and timed transcript follows playback while capture stays optional", async (t) => {
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
  named(document.querySelector("main"), "Listen in").click();
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
      ?.textContent.includes("Muted on entry"),
  );
  assert.match(
    document.querySelector(".call-inline-transcript").textContent,
    /Transcription off/,
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
  named(document, "Mute call").click();
  await waitFor(() => audio.muted === true);
  named(document, "Leave listening").click();
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
  named(document.querySelector("main"), "Listen in").click();
  await waitFor(() =>
    document
      .querySelector(".toast-message")
      .textContent.includes("Playback could not start"),
  );
  assert.equal(document.querySelector(".sample-listen-dock").hidden, true);
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
  named(document.querySelector("main"), "Listen in").click();
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
  await waitFor(() => document.querySelector('input[role="switch"]'));
  assert.equal(labelled(document, "Record the call").checked, false);
  assert.equal(labelled(document, "Create a transcript").checked, false);
  labelled(document, "Create a transcript").click();
  fieldValue(window, labelled(document, "Transcript language"), "nl");
  named(document, "Save call plan").click();
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
  named(document, "Jump in").click();
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
  named(document, "Join call").click();
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
  named(document, "Jump in").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  named(document, "Join call").click();
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
  named(document, "Leave call").click();
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
  await waitFor(() =>
    document
      .querySelector(".capture-control-heading")
      ?.textContent.includes("Recording"),
  );
  named(document, "Pause recording").click();
  await waitFor(() =>
    document
      .querySelector(".capture-control-heading")
      ?.textContent.includes("Paused"),
  );
  named(document, "Resume recording").click();
  named(document, "Start transcription").click();
  await waitFor(() => document.querySelector("dialog[open]"));
  assert.equal(named(document, "Enable transcription").disabled, true);
  labelled(document, "Permission confirmed").click();
  named(document, "Enable transcription").click();
  await waitFor(() =>
    [...document.querySelectorAll(".live-transcript button")].some(
      (button) => button.textContent.trim() === "Show full transcript",
    ),
  );
  named(document, "Show full transcript").click();
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
