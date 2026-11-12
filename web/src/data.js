export const NAV = [
  ["overview", "Overview"],
  ["calls", "Calls"],
  ["memory", "Recordings & transcripts"],
  ["routes", "Route drafts"],
  ["connection", "Connection"],
  ["activity", "Activity"],
  ["settings", "Settings"],
  ["design", "Design boards"],
];
export const PUBLIC_PAGES = [
  "/",
  "/features/",
  "/international-calling/",
  "/call-memory/",
  "/join-call/",
  "/how-it-works/",
  "/pricing/",
  "/connect/",
  "/docs/",
];
export const WEB_PAGES = [
  ...PUBLIC_PAGES,
  "/app/",
  "/studio/",
  "/studio/demo/",
  ...[
    "routes",
    "calls",
    "memory",
    "connection",
    "activity",
    "settings",
    "call",
    "design",
  ].flatMap((id) => [`/studio/${id}/`, `/studio/demo/${id}/`]),
];
export const SAMPLE_ROUTES = [
  {
    id: "demo-london",
    label: "London studio",
    destination: "+442079460123",
    status: "draft",
    created_at: "2026-11-11T08:30:00.000Z",
    country: "United Kingdom",
    initials: "LD",
  },
  {
    id: "demo-new-york",
    label: "New York office",
    destination: "+12125550124",
    status: "draft",
    created_at: "2026-11-11T08:00:00.000Z",
    country: "United States",
    initials: "NY",
  },
  {
    id: "demo-sf",
    label: "San Francisco team",
    destination: "+14155550126",
    status: "draft",
    created_at: "2026-11-10T16:20:00.000Z",
    country: "United States",
    initials: "SF",
  },
];
export const SAMPLE_CALL_PLANS = [
  {
    id: "sample-plan-london",
    label: "London studio viewing",
    destination: "+442079460123",
    country: "GB",
    purpose: "Arrange a fictional viewing and ask for a reference.",
    permission: "ask",
    status: "draft",
    capture: {
      recording: false,
      transcription: false,
      language: "en",
      retention_days: 30,
      join_method: "browser",
      join_number: "",
    },
    created_at: "2026-11-12T09:00:00.000Z",
    updated_at: "2026-11-12T09:00:00.000Z",
  },
];
export const SAMPLE_EVENTS = [
  {
    id: "event-1",
    type: "route.created",
    message: "London studio draft saved",
    created_at: "2026-11-11T08:30:00.000Z",
  },
  {
    id: "event-2",
    type: "settings.updated",
    message: "Conversation guidance set to Simple",
    created_at: "2026-11-11T08:20:00.000Z",
  },
  {
    id: "event-3",
    type: "route.created",
    message: "New York office draft saved",
    created_at: "2026-11-11T08:00:00.000Z",
  },
];
export const TITLES = {
  "/features/": "Calling, memory & joining | AgentBridge",
  "/international-calling/": "International calling | AgentBridge",
  "/call-memory/": "Optional recording & transcription | AgentBridge",
  "/join-call/": "Let me join | AgentBridge",
  "/": "AgentBridge — connect agents worldwide",
  "/how-it-works/": "How it works | AgentBridge",
  "/pricing/": "Preview & plans | AgentBridge",
  "/connect/": "Get connected | AgentBridge",
  "/docs/": "Documentation | AgentBridge",
};
