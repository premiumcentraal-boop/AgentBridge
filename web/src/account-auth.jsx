import React, { useEffect, useId, useState } from "react";
import { A, useRoute } from "./context.jsx";
import { BotFace } from "./grok-ui.jsx";
import { Btn, Icon } from "./ui.jsx";

export async function accountRequest(endpoint, options = {}) {
  const response = await fetch("/api/auth/" + endpoint, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error?.message || "The request could not be completed.",
    );
  return data;
}
export function AccountAuth({ signup = false, embedded = false }) {
  const { offline, go } = useRoute(),
    id = useId();
  const [session, setSession] = useState(null),
    [value, setValue] = useState({
      name: "",
      email: "",
      agent_name: "",
      password: "",
      invite_token: "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (offline) return;
    let alive = true;
    accountRequest("session")
      .then((data) => {
        if (!alive) return;
        setSession(data);
        if (data.verified_email)
          setValue((current) => ({ ...current, email: data.verified_email }));
        if (data.authenticated && !signup) {
          if (embedded) location.assign("/studio/");
          else go("/studio/");
        }
      })
      .catch(() => {
        if (alive)
          setError("The account service is unavailable. Please try again.");
      });
    const invite = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (invite) {
      setValue((current) => ({ ...current, invite_token: invite }));
      history.replaceState({}, "", location.pathname + location.search);
    }
    return () => {
      alive = false;
    };
  }, [signup, offline]);
  const set = (key, next) =>
    setValue((current) => ({ ...current, [key]: next }));
  const platform = session?.auth_method === "chatgpt";
  const body = (
    <>
      <span className="hub-kicker">AGENTBRIDGE ACCOUNT</span>
      <h2>{signup ? "Create your account." : "Welcome back."}</h2>
      {offline ? (
        <div className="account-offline">
          <p>
            Accounts need the online demo. This portable file keeps its sample
            workspace separate.
          </p>
          <A to="/studio/demo/" className="gb-secondary-link">
            Open the sample studio <Icon name="arrow" size={16} />
          </A>
        </div>
      ) : !session ? (
        <p role="status">{error || "Connecting to your account…"}</p>
      ) : session.authenticated ? (
        <div className="signup-confirmation">
          <p>You’re signed in as {session.account.email}.</p>
          <A to="/studio/" className="gb-secondary-link">
            Open studio <Icon name="arrow" size={16} />
          </A>
        </div>
      ) : !session.configured ? (
        <p>
          The account service needs to be configured before you can sign in.
        </p>
      ) : signup && !session.registration_available ? (
        <div>
          <p>
            {session.account_exists
              ? "The tester account is already registered."
              : "Registration is available by private invitation."}
          </p>
          <A to="/signin/" className="gb-secondary-link">
            Sign in <Icon name="arrow" size={16} />
          </A>
        </div>
      ) : !signup &&
        platform &&
        session.verified_email &&
        !session.account_exists ? (
        <div>
          <p>Your tester invitation is ready.</p>
          <A to="/signup/" className="gb-secondary-link">
            Create your account <Icon name="arrow" size={16} />
          </A>
        </div>
      ) : platform && (!signup || !session.verified_email) ? (
        <div className="account-platform-login">
          <p>Use the invited tester email to open your account.</p>
          <a
            href={
              signup
                ? "/signin-with-chatgpt?return_to=%2Fsignup%2F"
                : session.signin_url
            }
            target="_top"
            className="account-signin-link"
          >
            Continue with ChatGPT <Icon name="arrow" size={18} />
          </a>
          {signup && (
            <A to="/signin/" className="gb-secondary-link">
              Already registered? Sign in
            </A>
          )}
        </div>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              const payload = signup
                ? {
                    name: value.name,
                    email: value.email,
                    agent_name: value.agent_name,
                    ...(platform
                      ? {}
                      : {
                          password: value.password,
                          invite_token: value.invite_token,
                        }),
                  }
                : { email: value.email, password: value.password };
              await accountRequest(signup ? "register" : "login", {
                method: "POST",
                body: JSON.stringify(payload),
              });
              set("password", "");
              if (embedded) location.assign("/studio/");
              else go("/studio/");
            } catch (error) {
              setError(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <label htmlFor={id + "name"}>
              Your name
              <input
                id={id + "name"}
                autoComplete="name"
                required
                maxLength={80}
                value={value.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </label>
          )}
          <label htmlFor={id + "email"}>
            Email address
            <input
              id={id + "email"}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              readOnly={platform}
              value={value.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </label>
          {signup && (
            <label htmlFor={id + "agent"}>
              Agent name
              <input
                id={id + "agent"}
                autoComplete="off"
                required
                maxLength={80}
                placeholder="Your agent"
                value={value.agent_name}
                onChange={(event) => set("agent_name", event.target.value)}
              />
            </label>
          )}
          {!platform && (
            <label htmlFor={id + "password"}>
              Password
              <input
                id={id + "password"}
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={signup ? 12 : 1}
                maxLength={128}
                value={value.password}
                onChange={(event) => set("password", event.target.value)}
              />
              {signup && <small>At least 12 characters.</small>}
            </label>
          )}
          {signup && session.invitation_required && !value.invite_token && (
            <label htmlFor={id + "invite"}>
              Tester invitation
              <input
                id={id + "invite"}
                type="password"
                autoComplete="off"
                required
                maxLength={256}
                value={value.invite_token}
                onChange={(event) => set("invite_token", event.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Btn
            label={
              busy ? "Please wait…" : signup ? "Create account" : "Sign in"
            }
            primary
            type="submit"
            disabled={busy}
          />
          <A
            to={signup ? "/signin/" : "/signup/"}
            className="gb-secondary-link"
          >
            {signup
              ? "Already have an account? Sign in"
              : "Create your account"}
          </A>
        </form>
      )}
      <p className="signup-form-note">
        Demo mode · No real charges or live calls.
      </p>
    </>
  );
  if (embedded)
    return (
      <main id="main" tabIndex={-1} className="account-access">
        <h1 className="sr-only">Sign in to AgentBridge</h1>
        <section className="signup-card" aria-label="Account sign in">
          {body}
        </section>
      </main>
    );
  return (
    <main id="main" tabIndex={-1} className="signup-page frame">
      <div className="signup-intro">
        <BotFace size={94} tone="teal" state="idle" />
        <h1>
          {signup ? "Your agent." : "Your account."}
          <br />
          <span>{signup ? "Connected." : "Connected."}</span>
        </h1>
        <p>
          {signup
            ? "Set up your account, choose a demo number and connect your first destination."
            : "Your connections, calls and preferences are saved in your account."}
        </p>
      </div>
      <section
        className="signup-card"
        aria-label={signup ? "Create account" : "Account sign in"}
      >
        {body}
      </section>
    </main>
  );
}

export function AccountProfile({ account, onSave }) {
  const id = useId(),
    [value, setValue] = useState({
      name: account.name,
      agent_name: account.agent_name,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => setValue({ name: account.name, agent_name: account.agent_name }),
    [account.name, account.agent_name],
  );
  return (
    <section className="account-profile-card">
      <h2>Your account</h2>
      <p>
        {account.email} <span className="account-demo-badge">Demo account</span>
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(value);
          } catch (error) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={id + "name"}>
          Your name
          <input
            id={id + "name"}
            required
            maxLength={80}
            autoComplete="name"
            value={value.name}
            onChange={(event) =>
              setValue((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        <label htmlFor={id + "agent"}>
          Agent name
          <input
            id={id + "agent"}
            required
            maxLength={80}
            value={value.agent_name}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                agent_name: event.target.value,
              }))
            }
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Btn
          label={busy ? "Saving…" : "Save account"}
          primary
          type="submit"
          disabled={busy}
          end={null}
        />
      </form>
    </section>
  );
}
