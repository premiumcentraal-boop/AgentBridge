import React, { useEffect, useState } from "react";
import { A, useRoute } from "./context.jsx";
import { ProductHome, PublicEntry } from "./product-home.jsx";
import {
  SegmentedControl,
  SegmentedControlItem,
  IconBtn,
  Icon,
  Mark,
} from "./ui.jsx";

const publicNav = [
  ["/how-it-works/", "How it works"],
  ["/pricing/", "Pricing"],
  ["/docs/", "Developers"],
];
export function PublicShell({ children, mode, setMode }) {
  const [menu, setMenu] = useState(false);
  const { path, offline } = useRoute();
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    if (!menu) return;
    const close = (event) => {
      if (event.key !== "Escape") return;
      setMenu(false);
      document.querySelector(".mobile-nav-toggle")?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  return (
    <div className="public-site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <A to="/" className="wordmark">
          <Mark />
          <span>AgentBridge</span>
        </A>
        <nav
          id="product-navigation"
          className={"public-nav " + (menu ? "is-open" : "")}
          aria-label="Main navigation"
        >
          {publicNav.map(([to, label]) => (
            <A key={to} to={to} aria-current={path === to ? "page" : undefined}>
              {label}
            </A>
          ))}
          <button
            className="nav-theme"
            type="button"
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          >
            <Icon name={mode === "dark" ? "sun" : "moon"} />
            {mode === "dark" ? "Light theme" : "Dark theme"}
          </button>
        </nav>
        <div className="public-header-actions">
          <IconBtn
            label={
              mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            name={mode === "dark" ? "sun" : "moon"}
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          />
          <A to="/studio/" className="header-studio-link">
            <Icon name="overview" size={16} /> Open Studio
          </A>
          <IconBtn
            className="mobile-nav-toggle"
            label={menu ? "Close menu" : "Open menu"}
            name={menu ? "close" : "menu"}
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-controls="product-navigation"
          />
        </div>
      </header>
      {children}
      <footer className="public-footer frame">
        <div>
          <A to="/" className="wordmark">
            <Mark />
            <span>AgentBridge</span>
          </A>
        </div>
        <nav aria-label="Footer navigation">
          <A to="/features/">Features</A>
          <A to="/how-it-works/">How it works</A>
          <A to="/connect/">Get connected</A>
          <A to="/pricing/">Pricing</A>
          <A to="/docs/">Developers</A>
          <a
            href="https://github.com/premiumcentraal-boop/AgentBridge"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          {offline && <A to="/studio/demo/">Sample Studio</A>}
        </nav>
        <div className="footer-line">
          <span>© 2026 AgentBridge</span>
          <span>Independent of Grok / xAI.</span>
          <a href="https://victor.ceo" target="_top">
            Victor.ceo
          </a>
        </div>
      </footer>
    </div>
  );
}

export function Home() {
  return <ProductHome />;
}

function Intro({ title, children }) {
  return (
    <header className="guide-intro frame">
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}

const steps = [
  [
    "number",
    "Your number",
    "Choose your routing number",
    "Connect your SignalWire project in Studio. Import a voice number you already own, or search for a new one and confirm the purchase.",
  ],
  [
    "destination",
    "Destination",
    "Save the destination",
    "Save the person or business, their international phone number and a note. You can use the same contact again.",
  ],
  [
    "callback",
    "Callback",
    "Answer your phone first",
    "Choose Test callback. Review your callback phone and the destination. When you answer, SignalWire dials the second phone. Both legs use your project.",
  ],
];

export function HowItWorks() {
  const [stage, setStage] = useState("number");
  const selected = steps.find((step) => step[0] === stage);
  return (
    <main id="main" tabIndex={-1} className="public-guide">
      <Intro title="How an AgentBridge call works">
        Pair your routing number with a contact, then decide how the call
        reaches them.
      </Intro>
      <section className="frame interactive-flow guide-flow exchange-guide-flow">
        <SegmentedControl
          label="Explore the connection flow"
          value={stage}
          onChange={setStage}
          className="ab-segments"
        >
          {steps.map(([value, label]) => (
            <SegmentedControlItem key={value} value={value} label={label} />
          ))}
        </SegmentedControl>
        <div className="route-diagram" aria-label="Parts of a call connection">
          {[
            ["number", "numbers", "Studio line"],
            ["destination", "connection", "London studio"],
            ["callback", "calls", "Callback phone"],
          ].map(([id, icon, label]) => (
            <div key={id} data-current={stage === id}>
              <Icon name={icon} size={27} />
              <strong>{label}</strong>
            </div>
          ))}
        </div>
        <div className="flow-detail">
          <h2>{selected[2]}</h2>
          <p>{selected[3]}</p>
        </div>
      </section>
      <section className="product-close frame">
        <div>
          <h2>Expecting incoming calls?</h2>
          <p>
            Activate forwarding on a saved connection. Calls to that routing
            number will reach the destination until you turn forwarding off.
          </p>
        </div>
        <A to="/connect/" className="product-button quiet">
          Set up a connection
        </A>
      </section>
    </main>
  );
}

function GuideRows({ items }) {
  return (
    <div className="guide-rows">
      {items.map(([title, body]) => (
        <section key={title}>
          <h2>{title}</h2>
          <div>{body}</div>
        </section>
      ))}
    </div>
  );
}

export function Connect() {
  const briefs = {
    Concierge: "Ask reception to arrange the Tuesday viewing.",
    Travel: "Confirm the address and arrival time for the visitor.",
    Reception: "Check who will meet the visitor at the front desk.",
  };
  const [role, setRole] = useState("Concierge");
  return (
    <main id="main" tabIndex={-1} className="public-guide">
      <Intro title="Connect a phone number">
        Give your agent a contact it can find again. You choose which number
        routes the call and which phone receives it.
      </Intro>
      <section className="frame guide-columns">
        <div className="guide-example">
          <Icon name="connection" size={30} />
          <h2>London studio</h2>
          <dl>
            <dt>Your routing number</dt>
            <dd>Studio line</dd>
            <dt>Destination</dt>
            <dd>London reception</dd>
            <dt>Saved note</dt>
            <dd>Ask for reception about the viewing.</dd>
          </dl>
          <label className="example-agent" htmlFor="example-agent-role">
            Example agent
            <select
              id="example-agent-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {Object.keys(briefs).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <p aria-live="polite">{briefs[role]}</p>
        </div>
        <GuideRows
          items={[
            [
              "Add a routing number",
              <p>
                In Calling setup, connect your SignalWire project. In Numbers,
                choose an owned voice number or buy an available number. You’ll
                review any charge before confirming.
              </p>,
            ],
            [
              "Save a destination",
              <p>
                Choose Connect a destination. Select the routing number, enter a
                name and phone number, and save. You can add contact notes for
                future conversations.
              </p>,
            ],
            [
              "Choose how to call",
              <p>
                Test callback rings your phone first. Activate forwarding sends
                future incoming calls on your routing number to the saved
                destination. Each action has a separate confirmation.
              </p>,
            ],
          ]}
        />
      </section>
      <section className="product-close frame">
        <div>
          <h2>Set up your first connection</h2>
          <p>Already have an account? Open Connections in Studio.</p>
        </div>
        <div className="product-actions">
          <PublicEntry />
          <A to="/studio/connections/" className="product-text-action">
            Open Connections
          </A>
        </div>
      </section>
    </main>
  );
}
export function Pricing() {
  return (
    <main id="main" tabIndex={-1} className="public-guide billing-guide">
      <Intro title="How calling is billed">
        Bring your own provider account. Your costs depend on the numbers you
        own, the destinations you call and the capture options you choose.
      </Intro>
      <div className="frame guide-columns">
        <div className="guide-example billing-example">
          <Icon name="calls" size={30} />
          <h2>A test callback</h2>
          <dl>
            <dt>First phone leg</dt>
            <dd>Your callback phone rings.</dd>
            <dt>Second phone leg</dt>
            <dd>The destination rings after you answer.</dd>
          </dl>
          <p>SignalWire bills both legs at your project’s rates.</p>
        </div>
        <GuideRows
          items={[
            [
              "Phone numbers",
              <p>
                SignalWire bills rental for purchased numbers. Import a number
                already on your project or review the provider’s terms before
                buying another.{" "}
                <a href="https://signalwire.com/pricing/voice">
                  SignalWire voice pricing ↗
                </a>
              </p>,
            ],
            [
              "Calls and forwarding",
              <p>
                Usage varies by destination and duration. Forwarding can incur
                incoming and outgoing charges while active. Check your project’s
                destination permissions and rates before enabling a route.
              </p>,
            ],
            [
              "Recording and transcription",
              <p>
                Recording and storage can incur SignalWire charges. If you
                enable live captions or transcribe a completed recording with
                xAI, your xAI project pays for the transcription.{" "}
                <a href="https://docs.x.ai/developers/models">xAI pricing ↗</a>
              </p>,
            ],
          ]}
        />
      </div>
      <section className="product-close frame">
        <h2>See which phone rings first</h2>
        <A to="/how-it-works/" className="product-button quiet">
          How it works
        </A>
      </section>
    </main>
  );
}
function ConnectorAddress() {
  const endpoint = "https://agentbridge.victor.ceo/mcp";
  const address = React.useRef(null);
  const [state, setState] = useState("");
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setState("Copied");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(address.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setState("Address selected. Use your device’s copy command.");
    }
  }
  return (
    <>
      <code ref={address}>{endpoint}</code>
      <button type="button" className="copy-endpoint" onClick={copyAddress}>
        <Icon name="copy" size={16} />
        Copy address
      </button>
      <span className="copy-status" role="status">
        {state}
      </span>
    </>
  );
}

export function Docs() {
  return (
    <main id="main" tabIndex={-1} className="public-guide">
      <Intro title="Connect your agent">
        Use the AgentBridge MCP connector to find a saved contact, recall
        earlier conversations and prepare a callback.
      </Intro>
      <div className="frame guide-columns">
        <div className="guide-example">
          <Icon name="agents" size={30} />
          <h2>Remote MCP</h2>
          <dl>
            <dt>Connector URL</dt>
            <dd>
              <ConnectorAddress />
            </dd>
            <dt>Authentication</dt>
            <dd>OAuth with your Studio account</dd>
          </dl>
          <A to="/studio/agents/" className="product-text-action">
            Open Agents
          </A>
        </div>
        <GuideRows
          items={[
            [
              "Authorize the connector",
              <p>
                Add a custom remote HTTPS connector in your agent client, paste
                the MCP URL and sign in to AgentBridge. Review the permissions.
                Manage or revoke access in Studio → Agents.
              </p>,
            ],
            [
              "Look up a contact",
              <>
                <p>
                  Try “Call London studio about Tuesday’s viewing. Check what we
                  agreed last time.”
                </p>
                <p>
                  <code>prepare_call</code> recognizes the contact and returns
                  its saved context. <code>get_contact_history</code> retrieves
                  previous conversations. You choose which contact to use when
                  names match.
                </p>
              </>,
            ],
            [
              "Approve the call",
              <p>
                Review the phones and charges in Studio. After approval,{" "}
                <code>start_call</code> requests the callback. The connector
                handles contact memory and call control. Your calling app
                supplies the agent’s voice.
              </p>,
            ],
            [
              "Integration reference",
              <p>
                <a href="https://github.com/premiumcentraal-boop/AgentBridge/blob/main/docs/GROK_CONNECTOR.md">
                  Connector setup and tool reference ↗
                </a>
              </p>,
            ],
          ]}
        />
      </div>
    </main>
  );
}
