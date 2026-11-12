import React, { useEffect, useRef, useState } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { A, useRoute } from "./context.jsx";
import {
  NAV,
  SAMPLE_ROUTES,
  SAMPLE_EVENTS,
  SAMPLE_CALL_PLANS,
  SAMPLE_ROUTING_NUMBERS,
  SAMPLE_NUMBER_CONNECTIONS,
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
import { DEFAULT_CAPTURE, CALL_COUNTRIES } from "../../shared/call-plans.mjs";
import { BotFace } from "./grok-ui.jsx";
import { RoutingReview } from "./connection-hub.jsx";
import sampleAudio from "./samples/sample-call.mp3";
import { ActiveCallCard, StudioDrawer } from "./studio-navigation.jsx";
import {
  NumberWorkspace,
  ConnectionEditor,
  BuyNumberDialog,
} from "./number-studio.jsx";
import { validateNumberConnection } from "../../shared/numbers.mjs";
const empty = () => ({
  routing_numbers: [],
  connections: [],
  number_orders: [],
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
          routing_numbers: SAMPLE_ROUTING_NUMBERS.map((number) => ({
            ...number,
          })),
          connections: SAMPLE_NUMBER_CONNECTIONS.map((connection) => ({
            ...connection,
          })),
          number_orders: [],
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
    [joinOpen, setJoinOpen] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [numberEditorOpen, setNumberEditorOpen] = useState(false);
  const [numberConnection, setNumberConnection] = useState(null);
  const [selectedRoutingNumber, setSelectedRoutingNumber] = useState("");
  const [buyNumberOpen, setBuyNumberOpen] = useState(false);
  const [routingDestination, setRoutingDestination] = useState("");
  const sampleAudioRef = useRef(null);
  const samplePlayAttempt = useRef(0);
  const jumpTimer = useRef();
  const [call, setCall] = useState({
      active: isDemo,
      muted: false,
      elapsed: 18,
      joined: false,
      userMuted: true,
      recording: false,
      transcription: false,
      recordingPaused: false,
      label: "London studio",
      routing_number: "+12025550110",
      destination: "+442079460123",
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
        setNumberEditorOpen(false);
        setNumberConnection(null);
        setBuyNumberOpen(false);
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
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(jumpTimer.current);
    },
    [],
  );
  const previousPath = useRef(path);
  useEffect(() => {
    if (previousPath.current !== path) {
      setMobileOpen(false);
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
  const beginConnection = (numberId = "") => {
    const owned = (snapshot.routing_numbers || []).filter(
      (number) => number.status === "owned",
    );
    const free = owned.find(
      (number) =>
        !(snapshot.connections || []).some(
          (connection) =>
            connection.status === "saved" &&
            connection.routing_number_id === number.id,
        ),
    );
    if (!numberId && !free) {
      setBuyNumberOpen(true);
      return;
    }
    setNumberConnection(null);
    setSelectedRoutingNumber(numberId || free.id);
    setNumberEditorOpen(true);
  };
  const saveNumberConnection = async (value, id) => {
    const validated = validateNumberConnection(value);
    if (validated.error) throw new Error(validated.error);
    if (isDemo) {
      if (
        !(snapshot.routing_numbers || []).some(
          (number) =>
            number.id === value.routing_number_id && number.status === "owned",
        )
      )
        throw new Error("Choose an owned routing number.");
      if (
        snapshot.routing_numbers.some(
          (number) => number.e164 === value.destination,
        )
      )
        throw new Error("Choose an outside destination.");
      if (
        snapshot.connections.some(
          (connection) =>
            connection.status === "saved" &&
            connection.id !== id &&
            connection.routing_number_id === value.routing_number_id,
        )
      )
        throw new Error("This routing number already has a destination.");
      if (!id && snapshot.connections.length >= 200)
        throw new Error("The connection limit has been reached.");
      const now = new Date().toISOString();
      setSnapshot((state) => ({
        ...state,
        connections: id
          ? state.connections.map((connection) =>
              connection.id === id
                ? { ...connection, ...value, updated_at: now }
                : connection,
            )
          : [
              {
                id: uuid(),
                ...value,
                status: "saved",
                created_at: now,
                updated_at: now,
              },
              ...state.connections,
            ],
      }));
    } else {
      await api(id ? "connections/" + id : "connections", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(value),
      });
      await refresh();
    }
    notify("Connection saved.");
  };
  const archiveNumberConnection = async (connection) => {
    try {
      if (isDemo)
        setSnapshot((state) => ({
          ...state,
          connections: state.connections.map((item) =>
            item.id === connection.id ? { ...item, status: "archived" } : item,
          ),
        }));
      else {
        await api("connections/" + connection.id, { method: "DELETE" });
        await refresh();
      }
      notify("Connection removed.");
    } catch (error) {
      notify(error.message);
    }
  };
  const saveNumberOrder = async (value, candidate) => {
    if (isDemo) {
      if (snapshot.routing_numbers.some((number) => number.e164 === candidate))
        throw new Error("This number has already been added.");
      if (snapshot.routing_numbers.length >= 100)
        throw new Error("The number limit has been reached.");
      const id = uuid(),
        now = new Date().toISOString();
      setSnapshot((state) => ({
        ...state,
        routing_numbers: [
          {
            id,
            provider: value.provider,
            provider_number_id: "example-" + id,
            e164: candidate,
            country: value.country,
            label: value.label,
            status: "owned",
            ownership_source: "example",
            created_at: now,
            updated_at: now,
          },
          ...state.routing_numbers,
        ],
      }));
      setNumberConnection(
        numberConnection && !numberConnection.id
          ? { ...numberConnection, routing_number_id: id }
          : null,
      );
      setSelectedRoutingNumber(id);
      setNumberEditorOpen(true);
      notify("Number added. Connect a destination.");
    } else {
      await api("number-orders", {
        method: "POST",
        body: JSON.stringify(value),
      });
      await refresh();
      notify("Number request saved. Purchase pending.");
    }
  };
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
      setNumberEditorOpen(false);
      setNumberConnection(null);
      setBuyNumberOpen(false);
    } catch (error) {
      notify(error.message);
    }
  };
  const toggleMute = () => {
    if (isDemo) setCall((c) => ({ ...c, muted: !c.muted }));
  };
  const endCall = () => {
    if (isDemo) {
      samplePlayAttempt.current++;
      if (call.listening) sampleAudioRef.current?.pause();
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
        events: [event("preview.call_ended", "Call ended."), ...s.events],
      }));
      notify("Call ended.");
    }
  };
  const returnCall = () => go(studioBase + "call/");
  const reviewRouting = (destinationId = "") => {
    setRoutingDestination(destinationId);
    setRoutingOpen(true);
  };
  const listenToSample = async (options = {}) => {
    if (!isDemo || !call.active || !sampleAudioRef.current) return;
    const audio = sampleAudioRef.current;
    const attempt = ++samplePlayAttempt.current;
    try {
      await audio.play();
      if (attempt !== samplePlayAttempt.current) {
        audio.pause();
        return;
      }
      setCall((c) => ({
        ...c,
        listening: true,
        playbackPaused: false,
        samplePosition: audio.currentTime,
        joined: true,
        userMuted:
          typeof options.userMuted === "boolean" ? options.userMuted : true,
        joinMethod: options.joinMethod || c.joinMethod || "browser",
      }));
      notify("Listening.");
    } catch {
      if (attempt === samplePlayAttempt.current)
        notify("Playback could not start. Try the sample audio controls.");
    }
  };
  const leaveListening = () => {
    samplePlayAttempt.current++;
    sampleAudioRef.current?.pause();
    setCall((c) => ({ ...c, listening: false, joined: false }));
    notify("Left call. The agent continues.");
  };
  useEffect(() => {
    if (sampleAudioRef.current) sampleAudioRef.current.muted = call.muted;
    if (call.listening && (!call.active || !call.joined)) {
      sampleAudioRef.current?.pause();
      setCall((c) => ({ ...c, listening: false }));
    }
  }, [call.active, call.joined, call.listening, call.muted]);
  useEffect(
    () => () => {
      if (samplePlayAttempt.current) sampleAudioRef.current?.pause();
      samplePlayAttempt.current++;
    },
    [],
  );
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
  const openCall = () => {
    setMobileOpen(false);
    returnCall();
  };
  const jumpIntoCall = () => {
    setMobileOpen(false);
    returnCall();
    clearTimeout(jumpTimer.current);
    if (mobileOpen)
      jumpTimer.current = setTimeout(() => setJoinOpen(true), 230);
    else setJoinOpen(true);
  };
  const primaryIds = [
    "overview",
    "numbers",
    "connections",
    "calls",
    "routes",
    "memory",
  ];
  const renderNav = (mobile = false) => (
    <nav
      className={
        "studio-nav " +
        (mobile ? "is-mobile" : "") +
        (compact && !mobile ? " is-compact" : "")
      }
      aria-label="Studio navigation"
    >
      <div className="studio-nav-brand">
        <A to="/" aria-label="AgentBridge home">
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
          onClick={() => (mobile ? setMobileOpen(false) : setCompact(!compact))}
        />
      </div>
      <ActiveCallCard
        call={call}
        compact={compact && !mobile}
        navigation
        onOpen={openCall}
        onJump={jumpIntoCall}
      />
      <div className="studio-nav-primary">
        {NAV.filter(([id]) => primaryIds.includes(id)).map(([id, label]) => (
          <a
            key={id}
            href={href(navTo(id))}
            aria-label={label}
            aria-current={
              page === id || (page === "call" && id === "calls")
                ? "page"
                : undefined
            }
            onClick={(event) => {
              link(event, navTo(id));
              if (mobile) setMobileOpen(false);
            }}
          >
            <Icon name={id} size={19} />
            <span className="studio-nav-text">{label}</span>
            {id === "connections" &&
              snapshot.connections?.filter(
                (connection) => connection.status === "saved",
              ).length > 0 && (
                <small>
                  {
                    snapshot.connections.filter(
                      (connection) => connection.status === "saved",
                    ).length
                  }
                </small>
              )}
          </a>
        ))}
      </div>
      <div className="studio-nav-secondary">
        {NAV.filter(([id]) => !primaryIds.includes(id)).map(([id, label]) => (
          <a
            key={id}
            href={href(navTo(id))}
            aria-label={label}
            aria-current={page === id ? "page" : undefined}
            onClick={(event) => {
              link(event, navTo(id));
              if (mobile) setMobileOpen(false);
            }}
          >
            <Icon name={id} size={17} />
            <span className="studio-nav-text">{label}</span>
          </a>
        ))}
      </div>
      <div className="studio-nav-footer">
        <button
          type="button"
          aria-label={
            mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
          }
          onClick={() => setMode(mode === "dark" ? "light" : "dark")}
        >
          <Icon name={mode === "dark" ? "sun" : "moon"} size={17} />
          <span className="studio-nav-text">
            {mode === "dark" ? "Light mode" : "Dark mode"}
          </span>
        </button>
        <A
          to={navTo("settings")}
          aria-label="Account settings"
          onClick={(event) => {
            link(event, navTo("settings"));
            if (mobile) setMobileOpen(false);
          }}
        >
          <span className="studio-account-avatar">V</span>
          <span className="studio-nav-text">Account</span>
        </A>
      </div>
    </nav>
  );
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
            <A to="/" className="text-action">
              Product page <Icon name="diagonal" size={13} />
            </A>
            <span className="owner-dot">V</span>
          </div>
        </header>
        {call.active && !["overview", "call", "calls"].includes(page) && (
          <div className="mobile-current-call">
            <ActiveCallCard
              call={call}
              navigation
              onOpen={openCall}
              onJump={jumpIntoCall}
            />
          </div>
        )}
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
              onListen={listenToSample}
              onRoute={reviewRouting}
            />
          ) : ["overview", "numbers", "connections", "routes"].includes(
              page,
            ) ? (
            <NumberWorkspace
              key={page}
              page={page}
              snapshot={snapshot}
              call={call}
              navTo={navTo}
              onOpenCall={openCall}
              onJump={jumpIntoCall}
              onBuy={() => setBuyNumberOpen(true)}
              onAdd={beginConnection}
              onEdit={(connection) => {
                setNumberConnection(connection);
                setSelectedRoutingNumber(connection.routing_number_id);
                setNumberEditorOpen(true);
              }}
              onArchive={archiveNumberConnection}
              onLegacy={(route) => {
                const free = snapshot.routing_numbers.find(
                  (number) =>
                    number.status === "owned" &&
                    !snapshot.connections.some(
                      (connection) =>
                        connection.status === "saved" &&
                        connection.routing_number_id === number.id,
                    ),
                );
                const country =
                  CALL_COUNTRIES.find((country) =>
                    route.destination.startsWith("+" + country.prefix),
                  )?.code || "US";
                setNumberConnection({
                  label: route.label,
                  destination: route.destination,
                  country,
                  routing_number_id: free?.id || "",
                });
                setSelectedRoutingNumber(free?.id || "");
                if (free) setNumberEditorOpen(true);
                else setBuyNumberOpen(true);
              }}
              onLegacyRemove={archive}
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
          <span>AgentBridge</span>
        </footer>
      </div>
      <StudioDrawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        {renderNav(true)}
      </StudioDrawer>
      <ConnectionEditor
        open={numberEditorOpen}
        initial={numberConnection}
        selectedNumber={selectedRoutingNumber}
        snapshot={snapshot}
        onClose={() => setNumberEditorOpen(false)}
        onSave={saveNumberConnection}
        onBuy={() => setBuyNumberOpen(true)}
      />
      <BuyNumberDialog
        open={buyNumberOpen}
        isDemo={isDemo}
        onClose={() => setBuyNumberOpen(false)}
        onSave={saveNumberOrder}
        numbers={snapshot.routing_numbers || []}
      />
      <RoutingReview
        open={routingOpen}
        destinationId={routingDestination}
        connections={snapshot.connections}
        numbers={snapshot.routing_numbers}
        call={call}
        isDemo={isDemo}
        onClose={() => setRoutingOpen(false)}
        onSave={(route) => {
          if (isDemo)
            setCall((c) => ({
              ...c,
              proposedRoute: {
                id: route.id,
                label: route.label,
                destination: route.destination,
                routing_number_id: route.routing_number_id,
              },
            }));
          notify(isDemo ? "Routing choice saved." : "Routing choice reviewed.");
        }}
      />
      {isDemo && (
        <div className="sample-listen-dock" hidden={!call.listening}>
          <BotFace
            size={40}
            state={call.playbackPaused ? "idle" : "working"}
            tone="teal"
          />
          <div className="sample-listen-title">
            <strong>
              {call.playbackPaused ? "Playback paused" : "Listening"}
            </strong>
            <small>Example audio · Microphone off</small>
          </div>
          <audio
            ref={sampleAudioRef}
            src={sampleAudio}
            controls
            preload="none"
            aria-label="Example call audio"
            onTimeUpdate={(event) => {
              const position = event.currentTarget.currentTime;
              setCall((c) => ({ ...c, samplePosition: position }));
            }}
            onPlay={() => setCall((c) => ({ ...c, playbackPaused: false }))}
            onPause={() => setCall((c) => ({ ...c, playbackPaused: true }))}
            onEnded={() =>
              setCall((c) => ({ ...c, listening: false, joined: false }))
            }
          />
          <IconBtn
            label="Leave listening"
            name="close"
            onClick={leaveListening}
          />
        </div>
      )}
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
function PageHead({ eyebrow, title, description, action }) {
  return (
    <div className="workspace-page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
function Connection({ integration, checking, check, isDemo }) {
  return (
    <>
      <PageHead
        eyebrow=""
        title="Calling setup"
        description="Provider connection and assigned numbers."
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
      <PageHead eyebrow="" title="Activity" description="" />
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
            <h3>No activity yet</h3>
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
      <PageHead eyebrow="" title="Settings" description="" />
      <div className="studio-data-source">
        <span>Data source</span>
        <strong>{isDemo ? "Example data" : "Private workspace"}</strong>
      </div>
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
          <h2>Appearance</h2>
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
          <h2>Export workspace</h2>
          <p>
            Export drafts, preferences and activity. The file includes
            destination numbers, so keep it private.
          </p>
          <Btn label="Export workspace" end="download" onClick={exportData} />
        </Card>
        <Card className="data-card" padding={0}>
          <Icon name="shield" size={22} />
          <h2>Access</h2>
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
      <PageHead eyebrow="" title="Design boards" description="" />
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
