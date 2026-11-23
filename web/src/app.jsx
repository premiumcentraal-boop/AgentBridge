import React, { useEffect, useState } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { RouterProvider, useRoute } from "./context.jsx";
import { PublicShell, Home, Docs } from "./public.jsx";
import { Studio } from "./studio.jsx";
import { TITLES } from "./data.js";
import { Signup, Signin } from "./signup.jsx";
import { AccountEmail } from "./account-auth.jsx";
function Pages() {
  const { path, offline, accountDemo } = useRoute();
  const studio = path.startsWith("/studio/") || path.startsWith("/app/");
  const [preference, setPreference] = useState(null);
  const mode = preference || (studio ? "dark" : "light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("agentbridge-theme");
      if (saved === "light" || saved === "dark") setPreference(saved);
    } catch {}
  }, []);
  const changeTheme = (next) => {
    setPreference(next);
    try {
      localStorage.setItem("agentbridge-theme", next);
    } catch {}
  };
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", mode === "dark" ? "#111319" : "#f8f9fc");
  }, [mode]);
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
