import { NAV } from "./data.js";
import { CALL_COUNTRIES } from "../../shared/call-plans.mjs";

const keywords = {
  overview: "home dashboard workspace",
  numbers: "phone routing purchased owned inventory signalwire",
  connections: "destination receiver contacts countries",
  calls: "international call plans calling live",
  routes: "route routing transfer destinations",
  memory:
    "recording audio capture transcript transcription language retention preferences",
  connection: "backend provider setup integration signalwire",
  activity: "history events recent",
  settings: "account profile theme dark light mode guidance export sign out",
  design: "design boards styles",
};
const pageDetails = {
  overview: "Live calls and recent connections",
  numbers: "Your AgentBridge routing numbers",
  connections: "Saved destinations",
  calls: "Active calls and call plans",
  routes: "Choose where a call goes",
  memory: "Recordings, transcripts and capture preferences",
  connection: "Provider and backend setup",
  activity: "Recent workspace events",
  settings: "Theme, account and preferences",
  design: "Three visual directions",
};
const countryWords = (code) => {
  const country = CALL_COUNTRIES.find((item) => item.code === code);
  return country ? `${country.name} ${country.code}` : "";
};
export function studioSearchEntries(snapshot, call) {
  const entries = NAV.map(([id, title]) => ({
    id: `page:${id}`,
    group: "Pages",
    title,
    detail: pageDetails[id],
    keywords: keywords[id],
    icon: id,
    action: "page",
    page: id,
  }));
  entries.push(
    {
      id: "action:buy",
      group: "Actions",
      title: "Buy a number",
      detail: "Get a dedicated AgentBridge routing number",
      icon: "phone",
      action: "buy",
    },
    {
      id: "action:connect",
      group: "Actions",
      title: "Connect a destination",
      detail: "Pair an outside number with your routing number",
      icon: "connection",
      action: "connect",
    },
  );
  if (call.active)
    entries.unshift({
      id: "call:live",
      group: "Calls",
      title: call.label || "Active call",
      detail: `Live call · ${call.destination || ""} · Call overview`,
      icon: "calls",
      action: "page",
      page: "call",
    });
  for (const connection of snapshot.connections || []) {
    if (connection.status !== "saved") continue;
    const number = (snapshot.routing_numbers || []).find(
      (n) => n.id === connection.routing_number_id,
    );
    entries.push({
      id: `connection:${connection.id}`,
      group: "Connections",
      title: connection.label,
      detail: `${connection.destination} · ${number?.e164 || ""}`,
      keywords: countryWords(connection.country),
      icon: "connection",
      action: "connection",
      record: connection,
    });
  }
  for (const number of snapshot.routing_numbers || []) {
    if (number.status !== "owned") continue;
    entries.push({
      id: `number:${number.id}`,
      group: "Numbers",
      title: number.e164,
      detail: `${number.label} · ${number.provider}`,
      keywords: countryWords(number.country),
      icon: "phone",
      action: "number",
      record: number,
    });
  }
  for (const plan of snapshot.call_plans || []) {
    if (plan.status === "archived") continue;
    entries.push({
      id: `plan:${plan.id}`,
      group: "Call plans",
      title: plan.label,
      detail: plan.destination,
      icon: "calls",
      action: "page",
      page: "calls",
    });
  }
  for (const country of CALL_COUNTRIES)
    entries.push({
      id: `country:${country.code}`,
      group: "Countries",
      title: country.name,
      detail: `${country.code} · +${country.prefix}`,
      icon: "globe",
      action: "country",
      record: country,
    });
  return entries;
}
const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function searchStudio(entries, query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length)
    return entries.filter((entry) =>
      ["Pages", "Actions", "Calls"].includes(entry.group),
    );
  const phone = query.replace(/[\s().-]/g, "");
  return entries.filter((entry) => {
    const content = normalize(
      `${entry.title} ${entry.detail} ${entry.group} ${entry.keywords || ""}`,
    );
    return (
      terms.every((term) => content.includes(term)) ||
      (/^\+?\d{3,}$/.test(phone) &&
        content.replace(/[\s().-]/g, "").includes(phone))
    );
  });
}
