import React, { useEffect, useState } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { RouterProvider, useRoute } from "./context.jsx";
import {
  PublicShell,
  Home,
  HowItWorks,
  Connect,
  Pricing,
  Docs,
} from "./public.jsx";
import { Studio } from "./studio.jsx";
import { Features, FeaturePage } from "./features.jsx";
import { TITLES } from "./data.js";
import { Signup } from "./signup.jsx";
function Pages() {
  const { path, offline } = useRoute();
  const [mode, setMode] = useState("dark");
  const studio = path.startsWith("/studio/") || path.startsWith("/app/");
  useEffect(() => {
    if (!studio) document.title = TITLES[path] || TITLES["/"];
  }, [path]);
  const page =
    path === "/signup/" ? (
      <Signup />
    ) : path === "/features/" ? (
      <Features />
    ) : path === "/international-calling/" ? (
      <FeaturePage type="international" />
    ) : path === "/call-memory/" ? (
      <FeaturePage type="memory" />
    ) : path === "/join-call/" ? (
      <FeaturePage type="join" />
    ) : path === "/how-it-works/" ? (
      <HowItWorks />
    ) : path === "/connect/" ? (
      <Connect />
    ) : path === "/pricing/" ? (
      <Pricing />
    ) : path === "/docs/" ? (
      <Docs />
    ) : (
      <Home />
    );
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <div className="foundation-app" data-mode={mode}>
        {studio ? (
          <Studio
            key={String(
              offline ||
                path.startsWith("/studio/demo/") ||
                path.startsWith("/app/"),
            )}
            mode={mode}
            setMode={setMode}
            isDemo={
              offline ||
              path.startsWith("/studio/demo/") ||
              path.startsWith("/app/")
            }
          />
        ) : (
          <PublicShell mode={mode} setMode={setMode}>
            {page}
          </PublicShell>
        )}
      </div>
    </Theme>
  );
}
export default function App({ initialPath = "/", base = "", offline = false }) {
  return (
    <RouterProvider initialPath={initialPath} base={base} offline={offline}>
      <Pages />
    </RouterProvider>
  );
}
