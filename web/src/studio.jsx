import React, { useEffect, useRef, useState } from "react";
import {
  SideNav,
  SideNavSection,
  SideNavItem,
} from "@astryxdesign/core/SideNav";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { A, useRoute } from "./context.jsx";
import {
  NAV,
  SAMPLE_ROUTES,
  SAMPLE_EVENTS,
  SAMPLE_CALL_PLANS,
} from "./data.js";
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
import { CallExtensions } from "./call-tools.jsx";
import { ExtensionShortcuts } from "./features.jsx";
import { DEFAULT_CAPTURE } from "../../shared/call-plans.mjs";
const empty = () => ({
  call_plans: [],
  capture_preferences: { ...DEFAULT_CAPTURE },
  routes: [],
  events: [],
  settings: { experience: "simple" },
  integration_configured: false,
});
const time = (value) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const initials = (route) =>
  route.initials ||
  route.label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
const country = (route) =>
  route.country ||
  (route.destination.startsWith("+44")
    ? "United Kingdom"
    : route.destination.startsWith("+1")
      ? "United States"
      : "International");
const uuid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export function Studio({ mode, setMode, isDemo }) {
  const { path, base, offline, href, link, go } = useRoute();
  const studioBase = isDemo ? "/studio/demo/" : "/studio/";
  const current =
    path.replace(/^\/(?:studio\/(?:demo\/)?|app\/)/, "").split("/")[0] ||
    "overview";
  const page = ["overview", "call", ...NAV.map(([id]) => id)].includes(current)
    ? current
    : "overview";
  const [snapshot, setSnapshot] = useState(() =>
    isDemo
      ? {
          call_plans: SAMPLE_CALL_PLANS.map((p) => ({
            ...p,
            capture: { ...p.capture },
          })),
          capture_preferences: { ...DEFAULT_CAPTURE },
          routes: SAMPLE_ROUTES.map((r) => ({ ...r })),
          events: SAMPLE_EVENTS.map((e) => ({ ...e })),
          settings: { experience: "simple" },
          integration_configured: false,
        }
      : empty(),
  );
  const [session, setSession] = useState({
    authenticated: isDemo,
    configured: true,
    loading: !isDemo,
  });
  const [compact, setCompact] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    [newDraft, setNewDraft] = useState(false),
    [detail, setDetail] = useState(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [joinOpen, setJoinOpen] = useState(false);
  const [call, setCall] = useState({
      active: isDemo,
      muted: false,
      elapsed: 18,
      joined: false,
      userMuted: true,
      recording: false,
      transcription: false,
      recordingPaused: false,
    }),
    [message, setMessage] = useState(""),
    [integration, setIntegration] = useState({
      status: "not_configured",
      message: "Connect a private backend to inspect your assigned number.",
    }),
    [checking, setChecking] = useState(false);
  const toastTimer = useRef();
  const notify = (text) => {
    setMessage(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(""), 4500);
  };
  const api = async (endpoint, options = {}) => {
    const response = await fetch(base + "/api/studio/" + endpoint, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && endpoint !== "session") {
        setSession((s) => ({ ...s, authenticated: false }));
        setSnapshot(empty());
        setNewDraft(false);
        setDetail(null);
      }
      throw new Error(
        data.error?.message || "The request could not be completed.",
      );
    }
    return data;
  };
  const refresh = async () => setSnapshot(await api("overview"));
  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    (async () => {
      try {
        const data = await api("session");
        if (!alive) return;
        setSession({ ...data, loading: false });
        if (data.authenticated) {
          const state = await api("overview");
          if (alive) setSnapshot(state);
        }
      } catch {
        if (alive)
          setSession({
            configured: true,
            authenticated: false,
            loading: false,
            error: "The studio server is unavailable. Please try again.",
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [isDemo]);
  useEffect(() => {
    if (!isDemo || !call.active) return;
    const timer = setInterval(
      () => setCall((c) => ({ ...c, elapsed: c.elapsed + 1 })),
      1000,
    );
    return () => clearInterval(timer);
  }, [isDemo, call.active]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const previousPath = useRef(path);
  useEffect(() => {
    if (previousPath.current !== path) {
      setMobileOpen(false);
      setNewDraft(false);
      setDetail(null);
      previousPath.current = path;
    }
    document.title =
      (page === "overview"
        ? "Your workspace"
        : page[0].toUpperCase() + page.slice(1)) + " | AgentBridge";
  }, [path]);
  const event = (type, text) => ({
    id: uuid(),
    type,
    message: text,
    created_at: new Date().toISOString(),
  });
  const saveCallPlan = async (value) => {
    if (isDemo) {
      if ((snapshot.call_plans || []).length >= 200)
        throw new Error("This workspace can hold up to 200 call plans.");
      const now = new Date().toISOString();
      setSnapshot((s) => ({
        ...s,
        call_plans: [
          {
            ...value,
            id: uuid(),
            status: "draft",
            created_at: now,
            updated_at: now,
          },
          ...(s.call_plans || []),
        ],
        events: [
          event("call_plan.created", "Sample call plan saved. No call placed."),
          ...s.events,
        ],
      }));
    } else {
      await api("call-plans", { method: "POST", body: JSON.stringify(value) });
      await refresh();
    }
    notify(
      isDemo
        ? "Call plan saved in this sample workspace."
        : "Call plan saved. No call placed.",
    );
  };
  const archiveCallPlan = async (id) => {
    if (isDemo)
      setSnapshot((s) => ({
        ...s,
        call_plans: s.call_plans.map((p) =>
          p.id === id ? { ...p, status: "archived" } : p,
        ),
        events: [
          event("call_plan.archived", "Sample call plan archived."),
          ...s.events,
        ],
      }));
    else {
      await api(`call-plans/${id}/archive`, { method: "POST", body: "{}" });
      await refresh();
    }
    notify("Call plan archived.");
  };
  const saveCapture = async (value) => {
    if (isDemo)
      setSnapshot((s) => ({
        ...s,
        capture_preferences: { ...value },
        events: [
          event(
            "capture.preferences_updated",
            "Capture and join preferences changed in the sample workspace.",
          ),
          ...s.events,
        ],
      }));
    else {
      await api("capture-preferences", {
        method: "PATCH",
        body: JSON.stringify(value),
      });
      await refresh();
    }
  };
  const saveRoute = async ({ label, destination }) => {
    const clean = {
      label: label.trim(),
      destination: destination.replace(/[\s().-]/g, ""),
    };
    if (
      !clean.label ||
      clean.label.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(clean.label)
    )
      throw new Error("Give this draft a name of up to 80 characters.");
    if (!/^\+[1-9]\d{7,14}$/.test(clean.destination))
      throw new Error(
        "Use international format, starting with + and a country code.",
      );
    if (isDemo) {
      if (snapshot.routes.length >= 200)
        throw new Error("This workspace can hold up to 200 drafts.");
      setSnapshot((s) => ({
        ...s,
        routes: [
          {
            ...clean,
            id: uuid(),
            status: "draft",
            created_at: new Date().toISOString(),
          },
          ...s.routes,
        ],
        events: [
          event("route.created", "Route draft saved. No call placed."),
          ...s.events,
        ],
      }));
    } else {
      await api("routes", { method: "POST", body: JSON.stringify(clean) });
      await refresh();
    }
    setNewDraft(false);
    notify(
      isDemo
        ? "Draft saved in this preview. No call placed."
        : "Route draft saved.",
    );
  };
  const archive = async (route) => {
    try {
      if (isDemo)
        setSnapshot((s) => ({
          ...s,
          routes: s.routes.map((r) =>
            r.id === route.id ? { ...r, status: "archived" } : r,
          ),
          events: [
            event("route.archived", "Route draft archived."),
            ...s.events,
          ],
        }));
      else {
        await api(`routes/${route.id}/archive`, { method: "POST", body: "{}" });
        await refresh();
      }
      setDetail(null);
      notify("Draft archived.");
    } catch (e) {
      notify(e.message);
    }
  };
  const saveGuidance = async (experience) => {
    if (isDemo)
      setSnapshot((s) => ({
        ...s,
        settings: { experience },
        events: [
          event(
            "settings.updated",
            `Conversation guidance set to ${experience}.`,
          ),
          ...s.events,
        ],
      }));
    else {
      await api("settings", {
        method: "PATCH",
        body: JSON.stringify({ experience }),
      });
      await refresh();
    }
    notify(
      isDemo ? "Preference changed for this preview." : "Preference saved.",
    );
  };
  const check = async () => {
    setChecking(true);
    try {
      setIntegration(
        isDemo
          ? {
              status: "not_configured",
              message:
                "This is a sample workspace. Connect a private backend in your operator workspace to inspect your own setup.",
            }
          : await api("integration"),
      );
    } catch (e) {
      notify(e.message);
    } finally {
      setChecking(false);
    }
  };
  const exportData = async () => {
    try {
      const data = isDemo
        ? { ...snapshot, mode: "demo", routing_enabled: false }
        : await api("export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "agentbridge-workspace.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Workspace exported. Keep your destination data private.");
    } catch (e) {
      notify(e.message);
    }
  };
  const signout = async () => {
    try {
      await api("session", { method: "DELETE" });
      setSession((s) => ({ ...s, authenticated: false }));
      setSnapshot(empty());
      setCall({ active: false, muted: false, elapsed: 0 });
    } catch (error) {
      notify(error.message);
    }
  };
  const toggleMute = () => {
    if (isDemo) setCall((c) => ({ ...c, muted: !c.muted }));
  };
  const endCall = () => {
    if (isDemo) {
      setCall((c) => ({
        ...c,
        active: false,
        muted: false,
        joined: false,
        recording: false,
        transcription: false,
        recordingPaused: false,
      }));
      setJoinOpen(false);
      setSnapshot((s) => ({
        ...s,
        events: [
          event("preview.call_ended", "Simulated call ended."),
          ...s.events,
        ],
      }));
      notify("Simulated call ended. No real call was made.");
    }
  };
  const returnCall = () => go(studioBase + "call/");
  const restartCall = () => {
    if (isDemo) {
      setCall({
        active: true,
        muted: false,
        elapsed: 0,
        joined: false,
        userMuted: true,
        recording: false,
        transcription: false,
        recordingPaused: false,
      });
      returnCall();
    }
  };
  if (!session.authenticated)
    return (
      <AccessPage
        session={session}
        mode={mode}
        setMode={setMode}
        onLogin={async (key) => {
          await api("session", {
            method: "POST",
            body: JSON.stringify({ key }),
          });
          await refresh();
          setSession((s) => ({ ...s, authenticated: true, loading: false }));
        }}
      />
    );
  const navTo = (id) =>
    id === "overview" ? studioBase : studioBase + id + "/";
  const count = snapshot.routes.filter((r) => r.status === "draft").length;
  const collapsed = {
    isCollapsed: compact,
    onCollapsedChange: setCompact,
    hasButton: false,
  };
  const renderNav = (mobile = false) => (
    <SideNav
      className="real-side-nav"
      style={{ width: mobile ? 236 : compact ? 76 : 236 }}
      collapsible={mobile ? false : collapsed}
      header={
        <div className="rail-brand">
          <A to="/" className="rail-wordmark" aria-label="AgentBridge home">
            <Mark />
            {(!compact || mobile) && <span>AgentBridge</span>}
          </A>
          <IconBtn
            label={
              mobile
                ? "Close navigation"
                : compact
                  ? "Expand navigation"
                  : "Collapse navigation"
            }
            name={mobile ? "close" : compact ? "expand" : "collapse"}
            onClick={() =>
              mobile ? setMobileOpen(false) : setCompact(!compact)
            }
          />
        </div>
      }
      topContent={
        <CallCard
          call={call}
          compact={!mobile && compact}
          isDemo={isDemo}
          onMute={toggleMute}
          onEnd={endCall}
          onReturn={returnCall}
          onRestart={restartCall}
          onJoin={() => {
            returnCall();
            setJoinOpen(true);
          }}
        />
      }
      footer={
        <div className="rail-footer">
          <SegmentedControl
            label="Studio colour theme"
            value={mode}
            onChange={setMode}
            layout="fill"
            size="sm"
            className="theme-segments"
          >
            <SegmentedControlItem
              value="dark"
              label="Dark"
              icon={<Icon name="moon" size={12} />}
              isLabelHidden={compact && !mobile}
            />
            <SegmentedControlItem
              value="light"
              label="Light"
              icon={<Icon name="sun" size={12} />}
              isLabelHidden={compact && !mobile}
            />
          </SegmentedControl>
          <A to={navTo("settings")} className="rail-owner">
            <span>V</span>
            {(!compact || mobile) && (
              <>
                <div>
                  <strong>Victor</strong>
                  <small>
                    {isDemo ? "Preview workspace" : "Workspace owner"}
                  </small>
                </div>
                <Icon name="more" size={16} />
              </>
            )}
          </A>
        </div>
      }
    >
      <SideNavSection title="Workspace" isHeaderHidden={compact && !mobile}>
        {NAV.map(([id, label]) => (
          <SideNavItem
            key={id}
            label={label}
            icon={<Icon name={id} size={17} />}
            isSelected={page === id || (page === "call" && id === "calls")}
            href={href(navTo(id))}
            onClick={(e) => link(e, navTo(id))}
            endContent={
              id === "routes" && count ? (
                <span className="nav-count">{count}</span>
              ) : undefined
            }
            className="real-nav-item"
          />
        ))}
      </SideNavSection>
    </SideNav>
  );
  const shared = { snapshot, isDemo, navTo, setNewDraft, setDetail };
  return (
    <div className={"workspace-shell " + (compact ? "rail-collapsed" : "")}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="floating-rail" aria-label="AgentBridge workspace">
        {renderNav()}
      </aside>
      <div className="workspace-frame">
        <header className="workspace-top">
          <div className="workspace-breadcrumb">
            <IconBtn
              className="drawer-toggle"
              label="Open navigation"
              name="menu"
              onClick={() => setMobileOpen(true)}
            />
            <span>Workspace</span>
            <i>/</i>
            <strong>
              {page === "call"
                ? "Call workspace"
                : NAV.find(([id]) => id === page)?.[1] || "Overview"}
            </strong>
          </div>
          <div className="workspace-top-actions">
            <Pill dot tone={isDemo ? "sage" : "muted"}>
              {isDemo ? "Preview workspace" : "Private workspace"}
            </Pill>
            <A to="/" className="text-action">
              Product page <Icon name="diagonal" size={13} />
            </A>
            <span className="owner-dot">V</span>
          </div>
        </header>
        {isDemo && (
          <div className="workspace-demo-note">
            <span>
              <i className="tiny-dot" />
              You’re exploring a sample workspace. Drafts stay in this tab.
            </span>
            <A to="/studio/">
              Open your studio <Icon name="diagonal" size={12} />
            </A>
          </div>
        )}
        <div className="mobile-call-bar">
          {call.active ? (
            <button type="button" onClick={returnCall}>
              <i />
              <span>London studio</span>
              <time>{formatDuration(call.elapsed)}</time>
              <small>Demo</small>
            </button>
          ) : (
            <span>
              <Icon name="phone" size={13} />
              No active call
            </span>
          )}
        </div>
        <main className="workspace-main" id="main" tabIndex={-1}>
          {["calls", "memory", "call"].includes(page) ? (
            <CallExtensions
              page={page}
              snapshot={snapshot}
              isDemo={isDemo}
              call={call}
              setCall={setCall}
              onMute={toggleMute}
              onEnd={endCall}
              onRestart={restartCall}
              onSavePlan={saveCallPlan}
              onArchivePlan={archiveCallPlan}
              onSaveCapture={saveCapture}
              navTo={navTo}
              notify={notify}
              joinOpen={joinOpen}
              setJoinOpen={setJoinOpen}
            />
          ) : page === "overview" ? (
            <>
              <Overview {...shared} integration={integration} />
              <ExtensionShortcuts navTo={navTo} />
            </>
          ) : page === "routes" ? (
            <Routes
              {...shared}
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
            />
          ) : page === "connection" ? (
            <Connection
              integration={integration}
              checking={checking}
              check={check}
              isDemo={isDemo}
            />
          ) : page === "activity" ? (
            <Activity events={snapshot.events} />
          ) : page === "settings" ? (
            <Settings
              snapshot={snapshot}
              mode={mode}
              setMode={setMode}
              save={saveGuidance}
              exportData={exportData}
              signout={signout}
              isDemo={isDemo}
            />
          ) : (
            <DesignArchive />
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            <i className="tiny-dot" />
            Development preview · Live call controls require setup
          </span>
          <span>AGENTBRIDGE / VICTOR</span>
        </footer>
      </div>
      <Dialog
        isOpen={mobileOpen}
        onOpenChange={setMobileOpen}
        width={260}
        padding={0}
        className="mobile-navigation-dialog"
        aria-label="Workspace navigation"
      >
        {renderNav(true)}
      </Dialog>
      <NewDraft
        isOpen={newDraft}
        onClose={() => setNewDraft(false)}
        save={saveRoute}
      />
      <DraftDetail
        route={detail}
        onClose={() => setDetail(null)}
        archive={archive}
      />
      <div
        className={"toast-message " + (message ? "is-visible" : "")}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </div>
  );
}
const formatDuration = (s) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
function CallCard({
  call,
  compact,
  isDemo,
  onMute,
  onEnd,
  onReturn,
  onRestart,
  onJoin,
}) {
  return (
    <div className={"rail-call-card " + (!call.active ? "call-idle" : "")}>
      {call.active ? (
        <>
          <div className="call-card-label">
            <i />
            {!compact && (
              <>
                <span>ACTIVE CALL</span>
                <small>DEMO</small>
              </>
            )}
          </div>
          <button
            type="button"
            className="call-recipient"
            onClick={onReturn}
            aria-label="Return to the simulated London studio call"
          >
            <span className="call-avatar">
              <Icon name="phone" size={17} />
            </span>
            {!compact && (
              <span>
                <strong>London studio</strong>
                <small>Grok Bot · United Kingdom</small>
              </span>
            )}
          </button>
          <div className="call-wave-row">
            {!compact && <Wave muted={call.muted} />}
            <time>{formatDuration(call.elapsed)}</time>
          </div>
          <div className="call-control-row">
            <IconBtn
              label={
                call.muted ? "Unmute simulated call" : "Mute simulated call"
              }
              name={call.muted ? "muted" : "mute"}
              aria-pressed={call.muted}
              onClick={onMute}
            />
            {!compact && (
              <IconBtn
                label="Return to simulated call"
                name="arrow"
                onClick={onReturn}
              />
            )}
            {!compact && (
              <IconBtn
                label={
                  call.joined
                    ? "Return to joined sample call"
                    : "Let me join sample call"
                }
                name="join"
                onClick={call.joined ? onReturn : onJoin}
              />
            )}
            <IconBtn
              label="End simulated call"
              name="end"
              className="end-call-control"
              onClick={onEnd}
            />
          </div>
        </>
      ) : (
        <>
          <Icon name="phone" size={compact ? 18 : 23} />
          {!compact && (
            <>
              <strong>No active call</strong>
              <p>
                A little quiet.
                <br />
                Ready for what’s next.
              </p>
            </>
          )}
          {isDemo && (
            <IconBtn
              label="Restart the simulated call"
              name="arrow"
              onClick={onRestart}
            />
          )}
        </>
      )}
    </div>
  );
}
function PageHead({ eyebrow, title, description, action }) {
  return (
    <div className="workspace-page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
function RouteRows({ routes, setDetail, emptyAction }) {
  if (!routes.length)
    return (
      <div className="empty-workspace">
        <span className="empty-symbol">
          <Icon name="routes" size={26} />
        </span>
        <h3>Every connection starts somewhere.</h3>
        <p>Save a destination draft, ready for a little consideration.</p>
        {emptyAction && (
          <Btn
            label="Create a route draft"
            icon="plus"
            primary
            end={null}
            onClick={emptyAction}
          />
        )}
      </div>
    );
  return (
    <div className="routes-table-wrap">
      <table className="routes-table">
        <thead>
          <tr>
            <th>DESTINATION</th>
            <th>PHONE NUMBER</th>
            <th>STATUS</th>
            <th>
              <span className="sr-only">Open details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={route.id}>
              <td>
                <button
                  type="button"
                  className="route-record"
                  onClick={() => setDetail(route)}
                >
                  <span
                    className={
                      "route-avatar " +
                      (route.destination.startsWith("+44")
                        ? "tone-blue"
                        : "tone-sage")
                    }
                  >
                    {initials(route)}
                  </span>
                  <span>
                    <strong>{route.label}</strong>
                    <small>{country(route)}</small>
                  </span>
                </button>
              </td>
              <td className="route-number">{route.destination}</td>
              <td>
                <Pill tone={route.status === "draft" ? "sage" : "muted"} dot>
                  {route.status === "draft" ? "Draft" : "Archived"}
                </Pill>
              </td>
              <td>
                <IconBtn
                  label={"View " + route.label + " details"}
                  name="diagonal"
                  onClick={() => setDetail(route)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Overview({ snapshot, setNewDraft, setDetail, integration, navTo }) {
  const active = snapshot.routes.filter((r) => r.status === "draft");
  return (
    <>
      <PageHead
        eyebrow="A LITTLE LESS TO MANAGE"
        title={
          <>
            Everything, a little
            <br className="desktop-break" /> more connected.
          </>
        }
        description="A quiet space for your next conversation."
        action={
          <Btn
            label="New route draft"
            icon="plus"
            primary
            end={null}
            onClick={() => setNewDraft(true)}
          />
        }
      />
      <div className="workspace-stats">
        <Card className="stat-tile" padding={0}>
          <span>
            ROUTING STATUS
            <Icon name="connection" size={14} />
          </span>
          <strong>
            <i className="status-orb" />
            Paused
          </strong>
          <small>Prepared with intention.</small>
        </Card>
        <Card className="stat-tile" padding={0}>
          <span>
            SAVED DESTINATIONS
            <Icon name="routes" size={14} />
          </span>
          <strong>
            {String(active.length).padStart(2, "0")}
            <em>route drafts</em>
          </strong>
          <small>One place for every detail.</small>
        </Card>
        <Card className="stat-tile" padding={0}>
          <span>
            YOUR BACKEND
            <Icon name="shield" size={14} />
          </span>
          <strong className="connection-value">
            {integration.status === "connected"
              ? "Connected"
              : snapshot.integration_configured
                ? "Ready to inspect"
                : "Not connected"}
          </strong>
          <A to={navTo("connection")}>
            View connection
            <Icon name="diagonal" size={12} />
          </A>
        </Card>
      </div>
      <div className="workspace-bento">
        <Card className="next-connection-card" padding={0}>
          <span className="eyebrow">THE NEXT LITTLE CONNECTION</span>
          <h2>
            Good things start
            <br />
            with a little preparation.
          </h2>
          <p>
            A name. A destination.
            <br />A clear next step.
          </p>
          <Btn
            label="Prepare a draft"
            end="diagonal"
            onClick={() => setNewDraft(true)}
          />
          <div className="card-loop">
            <Loop variant="small" />
          </div>
          <span className="card-note">
            <Icon name="shield" size={12} />A draft never places a call.
          </span>
        </Card>
        <Card className="workspace-steps" padding={0}>
          <div className="section-title">
            <h2>Make it yours.</h2>
            <small>{active.length ? "02" : "01"} / 03</small>
          </div>
          <p>A few considered details.</p>
          <div className="setup-step complete">
            <span>
              <Icon name="check" size={13} />
            </span>
            <div>
              <strong>Explore your workspace</strong>
              <small>You’re right where you need to be.</small>
            </div>
          </div>
          <button
            className={"setup-step " + (active.length ? "complete" : "")}
            type="button"
            onClick={() => setNewDraft(true)}
          >
            <span>
              {active.length ? <Icon name="check" size={13} /> : "02"}
            </span>
            <div>
              <strong>Prepare a route draft</strong>
              <small>A destination to start with.</small>
            </div>
            <Icon name="diagonal" size={12} />
          </button>
          <A to={navTo("connection")} className="setup-step">
            <span>03</span>
            <div>
              <strong>Connect your private backend</strong>
              <small>Inspect your own setup.</small>
            </div>
            <Icon name="diagonal" size={12} />
          </A>
        </Card>
      </div>
      <Card className="destinations-card" padding={0}>
        <div className="section-title">
          <h2>
            Your next connections.<span>{active.length}</span>
          </h2>
          <A to={navTo("routes")} className="text-action">
            View all
            <Icon name="diagonal" size={13} />
          </A>
        </div>
        <RouteRows
          routes={active.slice(0, 4)}
          setDetail={setDetail}
          emptyAction={() => setNewDraft(true)}
        />
      </Card>
      <div className="workspace-bottom-row">
        <Card className="guidance-summary" padding={0}>
          <span className="guidance-orb">✳</span>
          <div>
            <span className="eyebrow">YOUR PACE. YOUR PREFERENCE.</span>
            <h3>
              {snapshot.settings.experience[0].toUpperCase() +
                snapshot.settings.experience.slice(1)}{" "}
              feels right.
            </h3>
            <p>The same checks. A little more or less guidance.</p>
          </div>
          <A to={navTo("settings")} aria-label="Change guidance preference">
            <Icon name="diagonal" size={17} />
          </A>
        </Card>
        <div className="workspace-principle">
          <Icon name="shield" size={21} />
          <p>
            Permission before connection.
            <span>Every future live route needs its own review.</span>
          </p>
        </div>
      </div>
    </>
  );
}
function Routes({
  snapshot,
  setNewDraft,
  setDetail,
  search,
  setSearch,
  filter,
  setFilter,
}) {
  const rows = snapshot.routes.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      `${r.label} ${r.destination}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHead
        eyebrow="DESTINATIONS, CONSIDERED"
        title="Your next connections."
        description="A little preparation, all in one place."
        action={
          <Btn
            label="New route draft"
            icon="plus"
            end={null}
            primary
            onClick={() => setNewDraft(true)}
          />
        }
      />
      <Card className="destinations-card" padding={0}>
        <div className="routes-toolbar">
          <TextInput
            label="Search destinations"
            isLabelHidden
            startIcon={<Icon name="search" size={15} />}
            placeholder="Search destinations…"
            value={search}
            onChange={setSearch}
            className="search-input"
          />
          <SegmentedControl
            label="Filter route drafts"
            value={filter}
            onChange={setFilter}
            size="sm"
            className="ab-segments"
          >
            <SegmentedControlItem value="all" label="All" />
            <SegmentedControlItem value="draft" label="Active" />
            <SegmentedControlItem value="archived" label="Archived" />
          </SegmentedControl>
        </div>
        {rows.length ? (
          <RouteRows routes={rows} setDetail={setDetail} />
        ) : (
          <div className="empty-workspace">
            <Icon name="routes" size={27} />
            <h3>
              {snapshot.routes.length
                ? "Nothing matches just yet."
                : "A fresh start."}
            </h3>
            <p>
              {snapshot.routes.length
                ? "Try a different destination or filter."
                : "A name and a number are all you need to save a draft."}
            </p>
            {!snapshot.routes.length && (
              <Btn
                label="Create your first draft"
                primary
                onClick={() => setNewDraft(true)}
              />
            )}
          </div>
        )}
      </Card>
      <div className="subtle-note">
        <Icon name="shield" size={14} />
        Drafts are saved destinations. Permission, caller proof and carrier
        pricing are not verified by saving a number.
      </div>
    </>
  );
}
function Connection({ integration, checking, check, isDemo }) {
  return (
    <>
      <PageHead
        eyebrow="THE LAYER IN BETWEEN"
        title="One considered connection."
        description="A clear view of your private backend, whenever you’re ready."
      />
      <div className="connection-page-grid">
        <Card className="backend-card" padding={0}>
          <div className="section-title">
            <h2>Private backend</h2>
            <Pill
              dot
              tone={integration.status === "connected" ? "sage" : "muted"}
            >
              {integration.status === "connected"
                ? "Connected"
                : integration.status === "error"
                  ? "Needs attention"
                  : "Not connected"}
            </Pill>
          </div>
          <div className="backend-symbol">
            <span>✳</span>
            <i />
            <Mark />
            <i />
            <span>
              <Icon name="phone" size={22} />
            </span>
          </div>
          <h2>
            {integration.status === "connected"
              ? "A response from your bridge."
              : "Ready when you are."}
          </h2>
          <p>{integration.message}</p>
          <Btn
            label={
              checking
                ? "Checking…"
                : integration.status === "connected"
                  ? "Refresh setup"
                  : "Check connection"
            }
            icon="connection"
            end={null}
            isLoading={checking}
            onClick={check}
          />
          <small>Read-only setup and assigned-number inspection.</small>
          {integration.status === "connected" && (
            <details className="backend-details">
              <summary>View the backend response</summary>
              <pre>
                {JSON.stringify(
                  { setup: integration.setup, numbers: integration.numbers },
                  null,
                  2,
                )}
              </pre>
            </details>
          )}
        </Card>
        <Card className="backend-guide" padding={0}>
          <span className="eyebrow">ONE SMALL SETUP</span>
          <h2>
            Keep the private
            <br />
            details private.
          </h2>
          <p>
            Your account token stays on the server. The studio only asks for the
            setup it needs to show.
          </p>
          <ol>
            <li>
              <b>Deploy your private backend.</b>
              <span>
                Follow the existing staging runbook, with carrier routing
                paused.
              </span>
            </li>
            <li>
              <b>Add your Railway variables.</b>
              <code>AGENTBRIDGE_BACKEND_URL</code>
              <code>AGENTBRIDGE_ACCOUNT_TOKEN</code>
            </li>
            <li>
              <b>Redeploy, then inspect.</b>
              <span>
                Use Check connection to read the assigned-number setup.
              </span>
            </li>
          </ol>
          <A to="/docs/" className="text-action">
            Read the setup notes
            <Icon name="diagonal" size={14} />
          </A>
        </Card>
      </div>
      <div className="subtle-note">
        <Icon name="shield" size={14} />A backend response verifies these
        read-only tools. It does not verify native dialing, carrier permission
        or a live call.
      </div>
    </>
  );
}
function Activity({ events }) {
  return (
    <>
      <PageHead
        eyebrow="A CLEAR RECORD"
        title="The story so far."
        description="Small workspace actions, thoughtfully kept."
      />
      <Card className="activity-card" padding={0}>
        <div className="section-title">
          <h2>Workspace activity</h2>
          <small>{events.length} events</small>
        </div>
        {events.length ? (
          <ol className="activity-timeline">
            {events.map((item) => (
              <li key={item.id}>
                <span className="timeline-symbol">
                  <Icon
                    name={
                      item.type.startsWith("settings")
                        ? "settings"
                        : item.type.startsWith("preview")
                          ? "phone"
                          : "routes"
                    }
                    size={16}
                  />
                </span>
                <div>
                  <strong>{item.message}</strong>
                  <small>{item.type}</small>
                </div>
                <time dateTime={item.created_at}>{time(item.created_at)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-workspace">
            <Icon name="activity" size={27} />
            <h3>A quiet beginning.</h3>
            <p>
              Save a draft or change your guidance to start a workspace history.
            </p>
          </div>
        )}
      </Card>
      <div className="subtle-note">
        <Icon name="shield" size={14} />
        These are workspace events. AgentBridge stores no call audio or
        conversation transcripts.
      </div>
    </>
  );
}
function Settings({
  snapshot,
  mode,
  setMode,
  save,
  exportData,
  signout,
  isDemo,
}) {
  const [experience, setExperience] = useState(snapshot.settings.experience),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <PageHead
        eyebrow="MAKE THIS SPACE YOURS"
        title="Your pace. Your preference."
        description="A few small choices, for a workspace that feels right."
      />
      <Card className="settings-card" padding={0}>
        <div className="section-title">
          <h2>Conversation guidance</h2>
          <Pill>Studio preference</Pill>
        </div>
        <p>
          Choose how much explanation you see. Permission and price checks stay
          the same.
        </p>
        <div
          className="guidance-options"
          role="radiogroup"
          aria-label="Conversation guidance"
        >
          {[
            ["simple", "Simple", "A clear explanation. One next step."],
            ["guided", "Guided", "A little context, every step of the way."],
            ["advanced", "Advanced", "More detail for a technical view."],
          ].map(([value, title, description]) => (
            <button
              type="button"
              role="radio"
              aria-checked={experience === value}
              tabIndex={experience === value ? 0 : -1}
              key={value}
              className={
                "guidance-option " + (experience === value ? "is-selected" : "")
              }
              onClick={() => setExperience(value)}
              onKeyDown={(event) => {
                const values = ["simple", "guided", "advanced"];
                const offset = ["ArrowRight", "ArrowDown"].includes(event.key)
                  ? 1
                  : ["ArrowLeft", "ArrowUp"].includes(event.key)
                    ? -1
                    : 0;
                if (!offset && !["Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (values.indexOf(experience) + offset + values.length) %
                        values.length;
                setExperience(values[next]);
                event.currentTarget.parentElement
                  .querySelectorAll('[role="radio"]')
                  [next]?.focus();
              }}
            >
              <span className="radio-dot">
                {experience === value && <Icon name="check" size={12} />}
              </span>
              <strong>{title}</strong>
              <small>{description}</small>
              {value === "simple" && (
                <span className="default-tag">DEFAULT</span>
              )}
            </button>
          ))}
        </div>
        <div className="settings-save">
          <span>
            This changes studio guidance, not your agent or carrier policy.
          </span>
          <Btn
            label="Save preference"
            primary
            end="check"
            isLoading={saving}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                await save(experience);
              } catch (e) {
                setError(e.message);
              } finally {
                setSaving(false);
              }
            }}
          />
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </Card>
      <Card className="appearance-card" padding={0}>
        <div>
          <h2>A little light, or a little quiet.</h2>
          <p>Choose the studio appearance that feels comfortable.</p>
        </div>
        <SegmentedControl
          label="Workspace appearance"
          value={mode}
          onChange={setMode}
          className="ab-segments"
        >
          <SegmentedControlItem
            value="dark"
            label="Dark"
            icon={<Icon name="moon" size={13} />}
          />
          <SegmentedControlItem
            value="light"
            label="Light"
            icon={<Icon name="sun" size={13} />}
          />
        </SegmentedControl>
      </Card>
      <div className="workspace-bottom-row">
        <Card className="data-card" padding={0}>
          <Icon name="download" size={22} />
          <h2>Your workspace, to keep.</h2>
          <p>
            Export drafts, preferences and activity. The file includes
            destination numbers, so keep it private.
          </p>
          <Btn label="Export workspace" end="download" onClick={exportData} />
        </Card>
        <Card className="data-card" padding={0}>
          <Icon name="shield" size={22} />
          <h2>A private place to prepare.</h2>
          <p>
            Access keys stay out of URLs and browser storage. Sessions expire
            after eight hours.
          </p>
          {isDemo ? (
            <A to="/studio/" className="text-action">
              Open your own studio
              <Icon name="diagonal" size={14} />
            </A>
          ) : (
            <Btn label="Sign out" end="logout" clickAction={signout} />
          )}
        </Card>
      </div>
    </>
  );
}
function DesignArchive() {
  const { base, offline } = useRoute();
  const source = (file) =>
    offline
      ? globalThis.__AGENTBRIDGE_BOARDS__?.[file]
      : base + "/assets/design-boards/" + file;
  return (
    <>
      <PageHead
        eyebrow="WHERE THE DESIGN BEGAN"
        title="Three perspectives."
        description="Original visual studies for the product and studio. The current interface is built from real components."
      />
      <div className="design-archive">
        {[
          ["01", "Signal", "White, ink and a clear signal.", "01-signal.png"],
          [
            "02",
            "Material",
            "A steady frame. An expressive voice.",
            "02-material.png",
          ],
          [
            "03",
            "Atlas",
            "Precision underneath. Possibility above.",
            "03-atlas.png",
          ],
        ].map(([n, name, description, file]) => (
          <Card key={n} className="archive-card" padding={0}>
            <div>
              <span className="eyebrow">DIRECTION {n}</span>
              <h2>{name}</h2>
              <p>{description}</p>
            </div>
            <a href={source(file)} target="_blank" rel="noreferrer">
              <img
                src={source(file)}
                width="1536"
                height="1024"
                alt={name + " original AgentBridge design board"}
                loading="lazy"
              />
            </a>
          </Card>
        ))}
      </div>
    </>
  );
}
function NewDraft({ isOpen, onClose, save }) {
  const [label, setLabel] = useState(""),
    [destination, setDestination] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (isOpen) {
      setLabel("");
      setDestination("");
      setError("");
    }
  }, [isOpen]);
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      width={470}
      padding={0}
      className="foundation-dialog"
      aria-label="Create a route draft"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save({ label, destination });
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <DialogHeader
          className="dialog-heading"
          title="A new connection."
          subtitle="A little preparation starts here."
          onOpenChange={(open) => !open && onClose()}
        />
        <div className="dialog-fields">
          <TextInput
            label="Give it a name"
            value={label}
            onChange={setLabel}
            placeholder="e.g. London design studio"
            isRequired
            maxLength={80}
            autoComplete="off"
            hasAutoFocus
          />
          <TextInput
            label="Destination number"
            value={destination}
            onChange={setDestination}
            type="tel"
            placeholder="+44 20 7946 0123"
            isRequired
            description="International format, starting with + and a country code."
            autoComplete="off"
          />
          <div className="dialog-consideration">
            <Icon name="shield" size={17} />
            <p>
              This saves a destination draft. It never places a call or creates
              a carrier reservation.
            </p>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <Btn label="Cancel" end={null} onClick={onClose} />
          <Btn
            label="Save route draft"
            primary
            type="submit"
            isLoading={busy}
          />
        </div>
      </form>
    </Dialog>
  );
}
function DraftDetail({ route, onClose, archive }) {
  return (
    <Dialog
      isOpen={Boolean(route)}
      onOpenChange={(open) => !open && onClose()}
      width={460}
      padding={0}
      className="foundation-dialog"
      aria-label="Destination draft details"
    >
      {route && (
        <>
          <DialogHeader
            className="dialog-heading"
            title={route.label}
            subtitle="A destination, thoughtfully prepared."
            onOpenChange={(open) => !open && onClose()}
          />
          <div className="dialog-fields">
            <div className="detail-number">
              <span className="route-avatar">{initials(route)}</span>
              <div>
                <strong>{route.destination}</strong>
                <small>{country(route)}</small>
              </div>
              <Pill dot tone="sage">
                {route.status === "draft" ? "Draft" : "Archived"}
              </Pill>
            </div>
            <dl className="details-list">
              {[
                ["Created", time(route.created_at)],
                ["Carrier reservation", "Not created"],
                ["Destination permission", "Not verified"],
                ["Caller proof", "Not verified"],
                ["Carrier price", "Not quoted"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="dialog-consideration">
              <Icon name="shield" size={17} />
              <p>
                A saved draft is preparation. No access number, caller PIN or
                live approval has been issued.
              </p>
            </div>
          </div>
          <div className="dialog-actions">
            <Btn label="Close" end={null} onClick={onClose} />
            {route.status === "draft" && (
              <Btn
                label="Archive draft"
                end={null}
                clickAction={() => archive(route)}
              />
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
function AccessPage({ session, onLogin, mode, setMode }) {
  const [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="access-page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="access-header">
        <A to="/" className="wordmark">
          <Mark />
          <span>AgentBridge</span>
          <small>CONTROL STUDIO</small>
        </A>
        <IconBtn
          label={mode === "dark" ? "Light theme" : "Dark theme"}
          name={mode === "dark" ? "sun" : "moon"}
          onClick={() => setMode(mode === "dark" ? "light" : "dark")}
        />
      </header>
      <main id="main" tabIndex={-1} className="access-main">
        <div className="access-intro">
          <span className="eyebrow">YOUR CONNECTION, YOUR CONTROL</span>
          <h1>
            A quiet space.
            <br />
            <span>For what’s next.</span>
          </h1>
          <p>
            Your destinations, your preferences, and a clearer view of every
            detail. Welcome to your private studio.
          </p>
          <div className="access-loop">
            <Loop />
          </div>
        </div>
        <Card className="access-card" padding={0}>
          <Mark />
          <span className="eyebrow">PRIVATE WORKSPACE</span>
          <h2>Welcome inside.</h2>
          {session.loading ? (
            <p>Opening your workspace…</p>
          ) : session.configured ? (
            <>
              <p>Use your operator access key to make yourself at home.</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await onLogin(key);
                    setKey("");
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <TextInput
                  label="Studio access key"
                  value={key}
                  onChange={setKey}
                  type="password"
                  autoComplete="current-password"
                  isRequired
                  placeholder="Your private access key"
                />
                {(error || session.error) && (
                  <p className="form-error" role="alert">
                    {error || session.error}
                  </p>
                )}
                <Btn
                  label="Open your workspace"
                  primary
                  type="submit"
                  isLoading={busy}
                />
              </form>
            </>
          ) : (
            <>
              <p>
                Your operator needs to configure a studio access key before this
                private workspace can open.
              </p>
              <A to="/docs/" className="text-action">
                Read the setup notes
                <Icon name="diagonal" size={14} />
              </A>
            </>
          )}
          <div className="access-divider">
            <span>OR TAKE A LOOK AROUND</span>
          </div>
          <A to="/studio/demo/" className="access-demo">
            Explore the sample workspace
            <Icon name="diagonal" size={15} />
          </A>
          <small>No access key needed. No real calls.</small>
        </Card>
      </main>
      <footer className="access-footer">
        <a href="https://victor.ceo" target="_top">
          A product by VICTOR ↗
        </a>
        <span>INDEPENDENT PROJECT / DEVELOPMENT PREVIEW</span>
      </footer>
    </div>
  );
}
