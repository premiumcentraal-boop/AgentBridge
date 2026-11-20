import React, { createContext, useContext, useEffect, useState } from "react";
export const Router = createContext({
  path: "/",
  base: "",
  offline: false,
  accountDemo: false,
  go() {},
  href: (p) => p,
  link: () => undefined,
});
export const useRoute = () => useContext(Router);
const isStudio = (path) =>
  // Query strings carry OAuth return context, never a separate route.
  isStudioPath(path.split(/[?#]/)[0]);
const isStudioPath = (path) =>
  path.startsWith("/studio/") ||
  path.startsWith("/app/") ||
  [
    "/signup/",
    "/signin/",
    "/verify-email/",
    "/forgot-password/",
    "/reset-password/",
  ].includes(path);
export function RouterProvider({
  initialPath = "/",
  base = "",
  offline = false,
  children,
  accountDemo = false,
}) {
  const [path, setPath] = useState(initialPath.split(/[?#]/)[0]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const read = () => {
      const next = offline
        ? location.hash.slice(1) || "/"
        : location.pathname.slice(base.length) || "/";
      // Ordinary document fragments (including the skip link) are not routes.
      if (!next.startsWith("/")) return;
      setSearch(offline ? next.split("?")[1] || "" : location.search);
      const route = next.split(/[?#]/)[0];
      setPath(route.endsWith("/") ? route : route + "/");
    };
    window.addEventListener(offline ? "hashchange" : "popstate", read);
    read();
    return () =>
      window.removeEventListener(offline ? "hashchange" : "popstate", read);
  }, [base, offline]);
  const normalize = (url) =>
    accountDemo ? url.replace(/^\/studio\/demo\//, "/studio/") : url;
  // Standalone auth pages deny microphone access. A full studio document
  // loads the call-room policy after login, including for SPA redirects.
  const needsDocument = (url) => isStudio(path) !== isStudio(url) ||
    (document.getElementById("foundation-root")?.dataset.hostedMedia === "true" &&
      path.startsWith("/studio/") !== url.startsWith("/studio/"));
  const go = (target) => {
    const url = normalize(target);
    // Load a new document across CSP/framing boundaries: the public page's
    // connect-src 'none' must never carry into a signed-in workspace.
    if (!offline && needsDocument(url)) {
      window.location.assign(base + url);
      return;
    }
    setSearch(url.split("?")[1] || "");
    if (offline) {
      location.hash = url;
      setPath(url.split(/[?#]/)[0]);
    } else {
      history.pushState({}, "", base + url);
      setPath(url.split(/[?#]/)[0]);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const href = (p) => (offline ? "#" + p : base + normalize(p));
  const link = (e, p) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    if (
      !offline &&
      (needsDocument(p) ||
        (e.currentTarget.target && e.currentTarget.target !== "_self"))
    )
      return;
    e.preventDefault();
    go(p);
  };
  useEffect(() => {
    document.querySelector("main")?.focus({ preventScroll: true });
  }, [path]);
  return (
    <Router.Provider
      value={{ path, search, base, offline, accountDemo, go, href, link }}
    >
      {children}
    </Router.Provider>
  );
}
export function A({ to, children, ...props }) {
  const { path, offline, href, link } = useRoute();
  return (
    <a
      href={href(to)}
      target={!offline && !isStudio(path) && isStudio(to) ? "_top" : undefined}
      onClick={(e) => link(e, to)}
      {...props}
    >
      {children}
    </a>
  );
}
