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
const base = root.dataset.base || "";
let path = offline
  ? location.hash.slice(1) || "/"
  : location.pathname.slice(base.length) || "/";
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
  <App initialPath={path} base={base} offline={offline} />,
);
