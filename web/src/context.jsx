import React, { createContext, useContext, useEffect, useState } from "react";
import { marketingSection } from "../../shared/marketing-routes.mjs";
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
  const [fragment, setFragment] = useState("");
  useEffect(() => {
    const read = () => {
      const next = offline
        ? location.hash.slice(1) || "/"
        : (location.pathname.slice(base.length) || "/") +
          location.search +
          location.hash;
      // Ordinary document fragments (including the skip link) are not routes.
      if (!next.startsWith("/")) return;
      const route = next.split(/[?#]/)[0];
      const query = next.split("#")[0].split("?")[1] || "";
      const chapter = marketingSection(route);
      if (chapter) {
        const target = "/" + (query ? "?" + query : "") + "#" + chapter;
        if (offline) location.replace("#" + target);
        else history.replaceState({}, "", base + target);
      }
      setSearch(query);
      setFragment(chapter || (route === "/" ? next.split("#")[1] || "" : ""));
      const normalizedPath = route.endsWith("/") ? route : route + "/";
      setPath(chapter ? "/" : normalizedPath);
    };
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    read();
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, [base, offline]);
  const normalize = (url) => {
    const [pathname] = url.split(/[?#]/);
    const chapter = marketingSection(pathname);
    if (chapter)
      return "/" + url.split("#")[0].slice(pathname.length) + "#" + chapter;
    return accountDemo ? url.replace(/^\/studio\/demo\//, "/studio/") : url;
  };
  // Standalone auth pages deny microphone access. A full studio document
  // loads the call-room policy after login, including for SPA redirects.
  const needsDocument = (url) =>
    isStudio(path) !== isStudio(url) ||
    (document.getElementById("foundation-root")?.dataset.hostedMedia ===
      "true" &&
      path.startsWith("/studio/") !== url.startsWith("/studio/"));
  const go = (target) => {
    const url = normalize(target);
    // Load a new document across CSP/framing boundaries: the public page's
    // connect-src 'none' must never carry into a signed-in workspace.
    if (!offline && needsDocument(url)) {
      window.location.assign(base + url);
      return;
    }
    const [address, anchor = ""] = url.split("#");
    const [nextPath, query = ""] = address.split("?");
    if (offline) location.hash = url;
    else history.pushState({}, "", base + url);
    setPath(nextPath);
    setSearch(query);
    setFragment(nextPath === "/" ? anchor : "");
    if (!anchor) window.scrollTo({ top: 0, behavior: "instant" });
    else if (fragment === anchor && path === nextPath)
      document.getElementById(fragment)?.scrollIntoView();
  };
  const href = (p) => {
    const url = normalize(p);
    if (!offline && path === "/" && url.startsWith("/#")) return url.slice(1);
    return (offline ? "#" : base) + url;
  };
  const link = (e, p) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    if (
      !offline &&
      (e.currentTarget.getAttribute("href")?.startsWith("#") ||
        needsDocument(p) ||
        (e.currentTarget.target && e.currentTarget.target !== "_self"))
    )
      return;
    e.preventDefault();
    go(p);
  };
  useEffect(() => {
    const destination = fragment && document.getElementById(fragment);
    if (destination) {
      destination.scrollIntoView();
      destination.focus({ preventScroll: true });
    } else {
      document.querySelector("main")?.focus({ preventScroll: true });
    }
  }, [path, fragment]);
  return (
    <Router.Provider
      value={{ path, search, base, offline, accountDemo, go, href, link }}
    >
      {children}
    </Router.Provider>
  );
}
export function A({ to, children, onClick, ...props }) {
  const { path, offline, href, link } = useRoute();
  return (
    <a
      href={href(to)}
      target={!offline && !isStudio(path) && isStudio(to) ? "_top" : undefined}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) link(e, to);
      }}
      {...props}
    >
      {children}
    </a>
  );
}
