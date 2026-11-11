import React, { useEffect, useState } from "react";
import { A, useRoute } from "./context.jsx";
import {
  Button,
  Card,
  SegmentedControl,
  SegmentedControlItem,
  Btn,
  IconBtn,
  Icon,
  Mark,
  Pill,
  Wave,
  Loop,
} from "./ui.jsx";

const publicNav = [
  ["/", "Overview"],
  ["/how-it-works/", "How it works"],
  ["/connect/", "Get connected"],
  ["/docs/", "Developers"],
];
export function PublicShell({ children, mode, setMode }) {
  const [menu, setMenu] = useState(false);
  const { path, href, link } = useRoute();
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
          <small>by Victor</small>
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
        </nav>
        <div className="public-header-actions">
          <IconBtn
            label={
              mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            name={mode === "dark" ? "sun" : "moon"}
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          />
          <Btn
            label="Open studio"
            target="_top"
            primary
            href={href("/studio/demo/")}
            onClick={(e) => link(e, "/studio/demo/")}
            end="diagonal"
          />
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
          <p>A quiet connection. An independent Victor project.</p>
        </div>
        <nav aria-label="Footer navigation">
          <A to="/how-it-works/">How it works</A>
          <A to="/connect/">Get connected</A>
          <A to="/pricing/">Preview & plans</A>
          <a
            href="https://github.com/premiumcentraal-boop/AgentBridge"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
        <div className="footer-line">
          <span>© 2026 AgentBridge</span>
          <span>Independent of Grok / xAI. Development preview.</span>
          <a href="https://victor.ceo" target="_top">
            A product by VICTOR ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
function StudioLink({
  label = "Explore the studio",
  primary = true,
  ...props
}) {
  const { href, link } = useRoute();
  return (
    <Btn
      label={label}
      primary={primary}
      target="_top"
      href={href("/studio/demo/")}
      onClick={(e) => link(e, "/studio/demo/")}
      {...props}
    />
  );
}
function SectionHead({ eyebrow, title, description, children }) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function ConnectionDiagram({ stage = 0, compact = false }) {
  return (
    <div className={"connection-diagram " + (compact ? "is-small" : "")}>
      <div className={"diagram-node " + (stage === 0 ? "selected" : "")}>
        <span className="diagram-icon agent-glyph">✳</span>
        <span>Your agent</span>
        <small>One familiar voice</small>
      </div>
      <span className="diagram-thread">
        <i />
      </span>
      <div className={"diagram-node " + (stage === 1 ? "selected" : "")}>
        <span className="diagram-icon">
          <Mark />
        </span>
        <span>AgentBridge</span>
        <small>A considered connection</small>
      </div>
      <span className="diagram-thread">
        <i />
      </span>
      <div className={"diagram-node " + (stage === 2 ? "selected" : "")}>
        <span className="diagram-icon">
          <Icon name="phone" size={23} />
        </span>
        <span>Your destination</span>
        <small>Only when approved</small>
      </div>
    </div>
  );
}
function MiniWorkspace() {
  return (
    <div className="mini-workspace" aria-label="Illustrative control studio">
      <div className="mini-top">
        <span>
          <Mark /> Your workspace
        </span>
        <Pill dot tone="sage">
          Preview
        </Pill>
      </div>
      <div className="mini-workspace-body">
        <span className="eyebrow">YOUR NEXT CONNECTION</span>
        <h3>A clear view of everything.</h3>
        <div className="mini-rows">
          {[
            ["LD", "London studio", "Draft"],
            ["NY", "New York office", "Draft"],
          ].map(([avatar, name, status]) => (
            <div key={name}>
              <span className="initials">{avatar}</span>
              <b>{name}</b>
              <Pill>{status}</Pill>
              <Icon name="diagonal" size={12} />
            </div>
          ))}
        </div>
        <p>
          <i className="tiny-dot" />
          Prepared, never placed automatically.
        </p>
      </div>
    </div>
  );
}
export function Home() {
  const { href, link } = useRoute();
  return (
    <main id="main" tabIndex={-1}>
      <section className="hero-section frame">
        <div className="hero-copy">
          <Pill dot>CONNECTION, WITHOUT THE COMPLEXITY</Pill>
          <h1>
            A little closer.
            <br />
            <span>A wider world.</span>
          </h1>
          <p>
            The quiet connection between your AI agent and the people you need
            to reach. One familiar voice. A little less in the way.
          </p>
          <div className="hero-actions">
            <StudioLink />
            <A to="/how-it-works/" className="text-action">
              See how it works <Icon name="diagonal" size={15} />
            </A>
          </div>
          <div className="hero-assurance">
            <Icon name="shield" size={14} />
            <span>Independent project · Development preview</span>
          </div>
        </div>
        <div className="hero-object">
          <div className="object-grid" />
          <Loop />
          <div className="floating-identity identity-agent">
            <span className="agent-glyph">✳</span>
            <div>
              <small>THE VOICE</small>
              <strong>Your agent</strong>
            </div>
            <i className="tiny-dot" />
          </div>
          <div className="floating-identity identity-bridge">
            <Mark />
            <span>Beautifully connected.</span>
          </div>
          <div className="object-caption">
            <span>01 / A SINGLE CONVERSATION</span>
            <span>MORE POSSIBILITY ↗</span>
          </div>
        </div>
      </section>
      <div className="connection-band frame">
        <span>YOUR AGENT</span>
        <span className="band-line" />
        <Mark />
        <span>AGENTBRIDGE</span>
        <span className="band-line" />
        <span>THE PEOPLE YOU NEED</span>
      </div>
      <section className="public-section frame">
        <SectionHead
          eyebrow="A SMALL CONNECTION. A BIGGER IDEA."
          title={
            <>
              Less to manage.
              <br />
              <span>More room to connect.</span>
            </>
          }
          description="Your agent already understands the request. AgentBridge is being built to help it reach the right person, with thoughtful checks along the way."
        />
        <div className="feature-bento">
          <Card className="feature-card voice-feature" padding={0}>
            <div className="feature-art voice-art">
              <div className="voice-orb">
                <Icon name="mute" size={27} />
              </div>
              <Wave />
            </div>
            <span className="eyebrow">ONE CONVERSATIONAL VOICE</span>
            <h3>
              Still your agent.
              <br />
              Still your conversation.
            </h3>
            <p>
              Grok Bot stays the only speaking AI. No second personality halfway
              through the call.
            </p>
          </Card>
          <Card className="feature-card preparation-feature" padding={0}>
            <div className="feature-art preparation-art">
              <div className="soft-avatars">
                <span>G</span>
                <i />
                <span>
                  <Mark />
                </span>
              </div>
              <Pill dot tone="sage">
                A LITTLE PREPARATION
              </Pill>
            </div>
            <span className="eyebrow">INTENTION BEFORE CONNECTION</span>
            <h3>
              Everything considered.
              <br />
              Nothing rushed.
            </h3>
            <p>
              Destination permissions, caller proof and a verified price ceiling
              belong before any future connection.
            </p>
          </Card>
          <Card className="feature-card workspace-feature" padding={0}>
            <MiniWorkspace />
            <div>
              <span className="eyebrow">A QUIETER WORKSPACE</span>
              <h3>A place for every detail.</h3>
              <p>
                Save destination drafts. Inspect your setup. Keep a clear view
                of what’s ready and what needs attention.
              </p>
              <StudioLink label="Look inside" primary={false} end="diagonal" />
            </div>
          </Card>
        </div>
      </section>
      <section className="public-section flow-section frame">
        <SectionHead
          eyebrow="THE INTENDED FLOW"
          title={
            <>
              One simple thread.
              <br />
              <span>From request to review.</span>
            </>
          }
          description="Designed to begin in your agent’s conversation, with meaningful approval before anything connects."
        />
        <ConnectionDiagram stage={1} />
        <div className="flow-caption">
          <p>
            Today, the studio lets you prepare and organise drafts. Live
            end-to-end calling is still being verified.
          </p>
          <A to="/how-it-works/" className="text-action">
            Follow the connection <Icon name="arrow" size={15} />
          </A>
        </div>
      </section>
      <section className="public-section frame">
        <div className="studio-story">
          <div>
            <Pill>YOUR CONNECTION, YOUR CONTROL</Pill>
            <h2>
              Small details.
              <br />
              <span>A clearer picture.</span>
            </h2>
            <p>
              A considered workspace, with everything close at hand. The
              floating navigation keeps your context, while the rest of the
              studio gives your next task room to breathe.
            </p>
            <StudioLink label="Open the working preview" />
          </div>
          <div className="studio-story-preview">
            <div className="story-rail">
              <Mark />
              <div className="story-call">
                <span className="eyebrow">DEMO CALL</span>
                <strong>London studio</strong>
                <Wave />
                <div>
                  <Icon name="mute" size={12} />
                  <span>02:34</span>
                  <Icon name="end" size={13} />
                </div>
              </div>
              {["overview", "routes", "connection", "activity", "settings"].map(
                (name) => (
                  <span
                    key={name}
                    className={name === "routes" ? "is-current" : ""}
                  >
                    <Icon name={name} size={16} />
                  </span>
                ),
              )}
              <span className="story-avatar">V</span>
            </div>
            <MiniWorkspace />
          </div>
        </div>
      </section>
      <section className="public-section frame">
        <SectionHead
          eyebrow="CLEAR BY DESIGN"
          title={
            <>
              Good connections
              <br />
              <span>start with trust.</span>
            </>
          }
        />
        <div className="trust-list">
          {[
            [
              "01",
              "Permission comes first.",
              "A short-lived route, an allowed destination, and independent approval. Never an open forwarder.",
            ],
            [
              "02",
              "The voice stays yours.",
              "No additional conversational AI. No call recordings or transcripts in the studio.",
            ],
            [
              "03",
              "Preview means preview.",
              "The working interface manages drafts and setup. Live calling and payments are not enabled.",
            ],
          ].map(([n, title, copy]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
              <Icon name="diagonal" size={15} />
            </article>
          ))}
        </div>
      </section>
      <section className="final-invitation frame">
        <Mark />
        <span className="eyebrow">ONE VOICE. MORE POSSIBILITY.</span>
        <h2>
          Make room for
          <br />
          <span>the next conversation.</span>
        </h2>
        <StudioLink label="Take a look inside" />
        <p>A working preview. No account needed to explore.</p>
      </section>
    </main>
  );
}
export function HowItWorks() {
  const [stage, setStage] = useState("prepare");
  const steps = [
    [
      "prepare",
      "Prepare",
      "A name. A destination. A clear intention.",
      "Save a destination draft and review its details. A draft is preparation; it does not reserve a carrier route or place a call.",
    ],
    [
      "review",
      "Review",
      "A considered pause before a connection.",
      "A future live route needs destination permission, independent owner approval, caller proof and verified pricing. The studio shows missing checks clearly.",
    ],
    [
      "connect",
      "Connect",
      "The same voice, from beginning to end.",
      "Once platform permission and the full carrier path have been verified, your agent would dial a US access line. End-to-end calling remains a development goal.",
    ],
  ];
  const selected = steps.find((s) => s[0] === stage);
  return (
    <main id="main" tabIndex={-1}>
      <section className="page-intro frame">
        <Pill>HOW IT WORKS</Pill>
        <h1>
          A single thread.
          <br />
          <span>Thoughtfully connected.</span>
        </h1>
        <p>
          The idea is simple: keep the conversation with your agent, and let a
          small bridge handle a permitted connection.
        </p>
      </section>
      <section className="frame interactive-flow">
        <SegmentedControl
          label="Explore the connection flow"
          value={stage}
          onChange={setStage}
          className="ab-segments"
        >
          {steps.map(([value, label], i) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={`${String(i + 1).padStart(2, "0")} ${label}`}
            />
          ))}
        </SegmentedControl>
        <ConnectionDiagram stage={steps.findIndex((s) => s[0] === stage)} />
        <Card className="flow-detail" padding={0}>
          <div>
            <span className="eyebrow">{selected[1].toUpperCase()}</span>
            <h2>{selected[2]}</h2>
          </div>
          <p>{selected[3]}</p>
        </Card>
      </section>
      <section className="public-section frame">
        <div className="two-column-story">
          <h2>
            Your agent does
            <br />
            <span>the talking.</span>
          </h2>
          <div>
            <p>
              AgentBridge is a routing layer, not a new voice agent. Grok Bot
              remains the only conversational speaking AI.
            </p>
            <p>
              Any eventual use depends on supported native calling behavior,
              permission from the calling platform, and a verified carrier
              setup. We show the product’s current stage clearly.
            </p>
            <StudioLink label="Explore the flow in the studio" />
          </div>
        </div>
      </section>
    </main>
  );
}
export function Connect() {
  const [copied, setCopied] = useState(false);
  const endpoint = "https://YOUR-PRIVATE-BACKEND/mcp";
  return (
    <main id="main" tabIndex={-1}>
      <section className="page-intro frame">
        <Pill>GET CONNECTED</Pill>
        <h1>
          One small setup.
          <br />
          <span>A quieter workspace.</span>
        </h1>
        <p>
          Explore the studio now. Connect your private backend when you’re ready
          to inspect your own setup.
        </p>
      </section>
      <section className="frame connect-grid">
        <Card className="connect-main-card" padding={0}>
          <div className="card-number">01</div>
          <span className="eyebrow">START WITH THE EXPERIENCE</span>
          <h2>
            Make yourself
            <br />
            <span>at home.</span>
          </h2>
          <p>
            Open a working sample workspace. Add a route draft, explore the
            floating call panel, and choose how much guidance feels right.
          </p>
          <StudioLink />
          <small>Sample data · Local preview interactions · No calls</small>
        </Card>
        <div className="connect-steps">
          {[
            [
              "02",
              "Open your private studio",
              "An operator deploys the Railway service, sets a studio access key and attaches persistent storage.",
              "Open operator sign-in",
              "/studio/",
            ],
            [
              "03",
              "Inspect your private backend",
              "A configured backend origin and scoped account token enable read-only setup and assigned-number checks.",
              "Read the setup guide",
              "/docs/",
            ],
          ].map(([n, title, description, label, to]) => (
            <Card key={n} className="connect-step" padding={0}>
              <span className="card-number">{n}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <A to={to} className="text-action">
                {label}
                <Icon name="diagonal" size={14} />
              </A>
            </Card>
          ))}
        </div>
      </section>
      <section className="public-section frame">
        <div className="developer-block">
          <div>
            <span className="eyebrow">DESIGNED FOR YOUR AGENT</span>
            <h2>
              A small tool.
              <br />
              <span>A natural extension.</span>
            </h2>
            <p>
              The private prototype exposes MCP tools for compatible hosts.
              Native Grok Bot dialing still needs verification.
            </p>
          </div>
          <Card className="code-card" padding={0}>
            <div>
              <span>MCP ENDPOINT TEMPLATE</span>
              <IconBtn
                label={
                  copied ? "Endpoint template copied" : "Copy endpoint template"
                }
                name={copied ? "check" : "copy"}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(endpoint);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              />
            </div>
            <code>{endpoint}</code>
            <small>
              Replace the placeholder with your private backend origin. Store
              account tokens in your host’s secret settings.
            </small>
          </Card>
        </div>
      </section>
    </main>
  );
}
export function Pricing() {
  return (
    <main id="main" tabIndex={-1}>
      <section className="page-intro frame">
        <Pill>PREVIEW & PLANS</Pill>
        <h1>
          Clarity comes
          <br />
          <span>before a price.</span>
        </h1>
        <p>
          AgentBridge is in development. There’s no live calling plan or
          checkout yet, and we won’t turn estimates into promises.
        </p>
      </section>
      <section className="frame plan-grid">
        <Card className="plan-card" padding={0}>
          <span className="eyebrow">EXPLORE TODAY</span>
          <h2>
            The working
            <br />
            preview.
          </h2>
          <p>
            Understand the product through real pages and working local
            interactions.
          </p>
          <ul>
            {[
              "Public product walkthrough",
              "Interactive control studio",
              "Destination draft creation",
              "Floating call-navigation demo",
            ].map((s) => (
              <li key={s}>
                <Icon name="check" size={15} />
                {s}
              </li>
            ))}
          </ul>
          <StudioLink label="Explore the studio" />
        </Card>
        <Card className="plan-card" padding={0}>
          <span className="eyebrow">FOR A PRIVATE OPERATOR</span>
          <h2>
            Your own
            <br />
            workspace.
          </h2>
          <p>
            Self-host the studio and connect an existing private backend for
            read-only inspection.
          </p>
          <ul>
            {[
              "Protected operator sign-in",
              "Persistent drafts and preferences",
              "Workspace activity and export",
              "Private backend discovery checks",
            ].map((s) => (
              <li key={s}>
                <Icon name="check" size={15} />
                {s}
              </li>
            ))}
          </ul>
          <A to="/docs/" className="text-action">
            Read the deployment guide
            <Icon name="diagonal" size={15} />
          </A>
        </Card>
      </section>
      <section className="public-section frame">
        <div className="quiet-note">
          <Icon name="shield" size={22} />
          <div>
            <h3>Carrier prices need their own proof.</h3>
            <p>
              Any future call cost depends on destination, carrier permission
              and a verified quote. This preview neither purchases phone numbers
              nor charges for calls.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
export function Docs() {
  return (
    <main id="main" tabIndex={-1}>
      <section className="page-intro frame">
        <Pill>DEVELOPER NOTES</Pill>
        <h1>
          Simple outside.
          <br />
          <span>Considered underneath.</span>
        </h1>
        <p>
          A clear boundary between the web workspace and the private carrier
          prototype.
        </p>
      </section>
      <section className="frame docs-grid">
        <nav className="docs-index" aria-label="On this page">
          <a href="#web-workspace">The web workspace</a>
          <a href="#private-backend">Private backend</a>
          <a href="#deployment">Deployment</a>
          <a href="#design-system">Design system</a>
        </nav>
        <div className="docs-reading">
          <section id="web-workspace">
            <span className="eyebrow">01 / THE WEB WORKSPACE</span>
            <h2>A place to prepare.</h2>
            <p>
              The studio stores route drafts, guidance preferences and workspace
              activity. Drafts are separate from carrier reservations, and the
              web service does not expose telephony callbacks.
            </p>
            <div className="doc-endpoints">
              <code>GET /api/studio/overview</code>
              <span>Workspace state</span>
              <code>POST /api/studio/routes</code>
              <span>Save a draft</span>
              <code>PATCH /api/studio/settings</code>
              <span>Save preferences</span>
            </div>
          </section>
          <section id="private-backend">
            <span className="eyebrow">02 / THE PRIVATE BACKEND</span>
            <h2>Inspect, with intention.</h2>
            <p>
              The optional backend connection uses an HTTPS origin and a scoped
              account token, stored only on the server. The studio calls the
              read-only get_bridge_setup and list_my_numbers tools.
            </p>
            <p>
              Keep carrier routing disabled while the separate security and
              platform checks remain unresolved. A successful inventory check
              does not prove live calling.
            </p>
          </section>
          <section id="deployment">
            <span className="eyebrow">03 / DEPLOYMENT</span>
            <h2>Made for its own home.</h2>
            <p>
              The intended host is agentbridge.victor.ceo, with the product
              linked from Victor beside Meridian. The Railway service needs one
              persistent volume and a configured operator access-key hash.
            </p>
            <a
              className="text-action"
              href="https://github.com/premiumcentraal-boop/AgentBridge/blob/feat/victor-product-studio/docs/RAILWAY_STUDIO.md"
              target="_blank"
              rel="noreferrer"
            >
              Open the Railway runbook
              <Icon name="diagonal" size={15} />
            </a>
          </section>
          <section id="design-system">
            <span className="eyebrow">04 / DESIGN SYSTEM</span>
            <h2>A shared set of details.</h2>
            <p>
              The interface uses Meta’s open-source Astryx React components:
              navigation, buttons, cards, segmented controls, dialogs and form
              inputs, composed with AgentBridge’s own connection imagery and
              material treatment.
            </p>
            <a
              className="text-action"
              href="https://astryx.atmeta.com/components"
              target="_blank"
              rel="noreferrer"
            >
              Explore Astryx
              <Icon name="diagonal" size={15} />
            </a>
          </section>
        </div>
      </section>
    </main>
  );
}
