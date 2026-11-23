import React, { useEffect, useState } from "react";
import { A, useRoute } from "./context.jsx";
import { ProductHome } from "./product-home.jsx";
import { ConnectorAddress } from "./connector-address.jsx";
import { IconBtn, Icon, Mark } from "./ui.jsx";

const publicNav = [
  ["/#call-tour", "Call tour"],
  ["/#how-it-works", "How it works"],
  ["/#pricing", "Pricing"],
  ["/#developers", "Developers"],
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
    <div className={path === "/" ? "public-site public-home" : "public-site"}>
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
          onClick={(event) => {
            if (event.target.closest("a")) setMenu(false);
          }}
        >
          {publicNav.map(([to, label]) => (
            <A key={to} to={to}>
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
          {publicNav.map(([to, label]) => (
            <A key={to} to={to}>
              {label}
            </A>
          ))}
          <A to="/docs/">Connector reference</A>
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
