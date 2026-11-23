import React, { useEffect, useState } from "react";
import { A } from "./context.jsx";
import { ConnectorAddress } from "./connector-address.jsx";
import { Icon, Mark } from "./ui.jsx";
import { CALL_COUNTRIES } from "../../shared/call-plans.mjs";

export function SignupLink() {
  return (
    <A to="/signup/" className="product-button free-signup">
      Create a free account
    </A>
  );
}

const setupSteps = [
  [
    "numbers",
    "Connect your number",
    "Link SignalWire in Studio. Import a voice number you own or choose an available one and review its rental price.",
  ],
  [
    "connections",
    "Choose who picks up",
    "Save the person or business, their international number and a note for your agent.",
  ],
  [
    "calls",
    "Make the connection",
    "For a test callback, your phone rings first. When you answer, SignalWire dials your contact. Turn on forwarding separately for incoming calls.",
  ],
];

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

function Coverage() {
  const [country, setCountry] = useState("GB");
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    const list =
      document.getElementById("foundation-root")?.dataset.callbackCountries;
    if (list !== undefined) setEnabled(list.split(",").filter(Boolean));
  }, []);
  const countries = [
    ...new Set([
      ...CALL_COUNTRIES.map(({ code }) => code),
      "CA",
      ...(enabled || []),
    ]),
  ]
    .map((code) => [code, countryNames.of(code)])
    .sort((a, b) => a[1].localeCompare(b[1], "en"));
  return (
    <section
      id="coverage"
      className="coverage-panel"
      tabIndex={-1}
      aria-labelledby="coverage-title"
    >
      <div className="coverage-glyph">
        <Icon name="globe" size={27} />
      </div>
      <h3 id="coverage-title">Same agent, bigger reach.</h3>
      <p>
        Check where your agent can request a callback. Your SignalWire project
        must also permit the destination.
      </p>
      <label htmlFor="coverage-country">Destination country</label>
      <div className="coverage-select">
        <select
          id="coverage-country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
        >
          {countries.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <Icon name="chevron" size={16} />
      </div>
      <p role="status" className="coverage-result">
        {enabled === null
          ? "For " +
            countryNames.of(country) +
            ", check callback availability in Studio under Agents."
          : enabled.includes(country)
            ? "Enabled for agent-requested callbacks on this site."
            : "You can save this contact. Agent-requested callbacks to this country are currently unavailable."}
      </p>
    </section>
  );
}

export function ProductDetails() {
  return (
    <>
      <aside
        className="tour-invitation frame"
        aria-labelledby="first-contact-title"
      >
        <div className="invitation-icon">
          <Icon name="connections" size={25} />
        </div>
        <div>
          <h2 id="first-contact-title">Save your first contact.</h2>
          <p>Start with the person or business your agent calls most.</p>
        </div>
        <SignupLink />
      </aside>

      <section
        id="how-it-works"
        tabIndex={-1}
        className="product-setup frame"
        aria-labelledby="setup-title"
      >
        <div className="setup-copy">
          <h2 id="setup-title">Set up your first call.</h2>
          <ol className="setup-steps">
            {setupSteps.map(([icon, title, body]) => (
              <li key={icon}>
                <span>
                  <Icon name={icon} size={20} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <Coverage />
      </section>

      <section
        id="pricing"
        tabIndex={-1}
        className="product-pricing frame"
        aria-labelledby="pricing-title"
      >
        <div>
          <h2 id="pricing-title">What does it cost?</h2>
          <p className="section-intro">
            Your AgentBridge account is free. Numbers, calls and optional
            capture are billed through your provider accounts.
          </p>
        </div>
        <dl className="price-list">
          <div>
            <dt>Phone numbers</dt>
            <dd>
              Bring an existing SignalWire number or rent a new one. You see the
              rental price before you confirm.
            </dd>
          </div>
          <div>
            <dt>Call minutes</dt>
            <dd>
              SignalWire bills by destination and duration. Callbacks and
              forwarding can use two phone legs.{" "}
              <a href="https://signalwire.com/pricing/voice">
                SignalWire voice rates
              </a>
            </dd>
          </div>
          <div>
            <dt>Recordings &amp; transcripts</dt>
            <dd>
              Capture is optional. SignalWire bills for recording and storage.
              Your xAI account covers transcription when you enable it.{" "}
              <a href="https://docs.x.ai/developers/models">xAI pricing</a>
            </dd>
          </div>
        </dl>
      </section>

      <section
        id="developers"
        tabIndex={-1}
        className="product-developers frame"
        aria-labelledby="developers-title"
      >
        <div>
          <h2 id="developers-title">Connect your agent.</h2>
          <p className="section-intro">
            Add the MCP connector to an agent that supports remote connectors.
            It can find a contact by name, recall previous calls, and prepare a
            callback for your approval.
          </p>
          <A to="/docs/" className="product-text-action">
            Read the connector reference
          </A>
        </div>
        <div className="connector-panel">
          <span>Remote MCP connector</span>
          <ConnectorAddress />
        </div>
      </section>

      <section
        className="account-invitation frame"
        aria-labelledby="account-invitation-title"
      >
        <Mark />
        <div>
          <h2 id="account-invitation-title">Give your agent a phone number.</h2>
          <p>
            Create your workspace, then connect your provider when you’re ready
            to call.
          </p>
        </div>
        <div className="invitation-actions">
          <SignupLink />
          <A to="/signin/" className="returning-link">
            Sign in
          </A>
        </div>
      </section>
    </>
  );
}
