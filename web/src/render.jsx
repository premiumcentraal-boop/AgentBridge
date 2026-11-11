import React from "react";
import { renderToString } from "react-dom/server";
import App from "./app.jsx";
export { WEB_PAGES, TITLES } from "./data.js";
export function renderPage(path, base = "", offline = false) {
  return renderToString(
    <App initialPath={path} base={base} offline={offline} />,
  );
}
