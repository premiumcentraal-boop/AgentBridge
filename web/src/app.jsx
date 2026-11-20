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
import { Signup, Signin } from "./signup.jsx";
import { AccountEmail } from "./account-auth.jsx";
function Pages() {
  const { path, offline, accountDemo } = useRoute();
  const [mode, setMode] = useState("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("agentbridge-theme");
      if (saved === "light" || saved === "dark") setMode(saved);
    } catch {}
  }, []);
  const changeTheme = (next) => {
    setMode(next);
    try { localStorage.setItem("agentbridge-theme", next); } catch {}
  };
  const studio = path.startsWith("/studio/") || path.startsWith("/app/");
  const localDemo =
    offline ||
    (!accountDemo &&
      (path.startsWith("/studio/demo/") || path.startsWith("/app/")));
  useEffect(() => {
    if (!studio) document.title = TITLES[path] || TITLES["/"];
  }, [path]);
  const page =
    path === "/signup/" ? (
      <Signup />
    ) : path === "/signin/" ? (
      <Signin />
    ) : path === "/verify-email/" ? (
      <AccountEmail key="verify" mode="verify" />
    ) : path === "/forgot-password/" ? (
      <AccountEmail key="forgot" mode="forgot" />
    ) : path === "/reset-password/" ? (
      <AccountEmail key="reset" mode="reset" />
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
            key={String(localDemo)}
            mode={mode}
            setMode={changeTheme}
            isDemo={localDemo}
          />
        ) : (
          <PublicShell mode={mode} setMode={changeTheme}>
            {page}
          </PublicShell>
        )}
      </div>
    </Theme>
  );
}
export default function App({
  initialPath = "/",
  base = "",
  offline = false,
  accountDemo = false,
}) {
  return (
    <RouterProvider
      initialPath={initialPath}
      base={base}
      offline={offline}
      accountDemo={accountDemo}
    >
      <Pages />
    </RouterProvider>
  );
}
