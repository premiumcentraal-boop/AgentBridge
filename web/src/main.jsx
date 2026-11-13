import React from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./styles.css";
import App from "./app.jsx";
import "./grok-language.css";
import "./studio-interface.css";
import "./studio-refinements.css";
const root = document.getElementById("foundation-root");
const offline = root.dataset.offline === "true";
const accountDemo = root.dataset.accountDemo === "true";
const base = root.dataset.base || "";
let path = offline
  ? location.hash.slice(1) || "/"
  : location.pathname.slice(base.length) || "/";
if (accountDemo && location.hash.startsWith("#/")) {
  path = location.hash.slice(1).replace(/^\/studio\/demo\//, "/studio/");
  history.replaceState({}, "", path);
}
if (accountDemo) path = path.replace(/^\/studio\/demo\//, "/studio/");
if (!path.startsWith("/")) path = "/";
if (!path.endsWith("/")) path += "/";
if (
  !offline &&
  new URLSearchParams(location.search).get("demo") === "1" &&
  path.startsWith("/studio/")
) {
  path =
    "/studio/demo/" + (location.hash.slice(1) || path.slice("/studio/".length));
  if (!path.endsWith("/")) path += "/";
  history.replaceState({}, "", base + path);
}
createRoot(root).render(
  <App
    initialPath={path}
    base={base}
    offline={offline}
    accountDemo={accountDemo}
  />,
);
