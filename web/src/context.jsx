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
  path.startsWith("/studio/") ||
  path.startsWith("/app/") ||
  ["/signup/", "/signin/"].includes(path);
export function RouterProvider({
  initialPath = "/",
  base = "",
  offline = false,
  children,
  accountDemo = false,
}) {
  const [path, setPath] = useState(initialPath);
  useEffect(() => {
    const read = () => {
      const next = offline
        ? location.hash.slice(1) || "/"
        : location.pathname.slice(base.length) || "/";
      // Ordinary document fragments (including the skip link) are not routes.
      if (!next.startsWith("/")) return;
      setPath(next.endsWith("/") ? next : next + "/");
    };
    window.addEventListener(offline ? "hashchange" : "popstate", read);
    read();
    return () =>
      window.removeEventListener(offline ? "hashchange" : "popstate", read);
  }, [base, offline]);
  const normalize = (url) =>
    accountDemo ? url.replace(/^\/studio\/demo\//, "/studio/") : url;
  const go = (target) => {
    const url = normalize(target);
    // Load a new document across CSP/framing boundaries: the public page's
    // connect-src 'none' must never carry into a signed-in workspace.
    if (!offline && isStudio(path) !== isStudio(url)) {
      window.location.assign(base + url);
      return;
    }
    if (offline) {
      location.hash = url;
      setPath(url);
    } else {
      history.pushState({}, "", base + url);
      setPath(url);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const href = (p) => (offline ? "#" + p : base + normalize(p));
  const link = (e, p) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    if (
      !offline &&
      (isStudio(path) !== isStudio(p) ||
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
      value={{ path, base, offline, accountDemo, go, href, link }}
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
