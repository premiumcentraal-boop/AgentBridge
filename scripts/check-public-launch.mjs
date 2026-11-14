// Read-only checks: no signup email, carrier request, call or purchase is made.
const argument = process.argv[2];
let origin;
try {
  const url = new URL(argument);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error();
  origin = url.origin;
} catch {
  console.error(
    "Usage: npm run launch:check -- https://agentbridge.victor.ceo",
  );
  process.exit(2);
}
const checks = [];
async function get(path) {
  return fetch(origin + path, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
}
await Promise.all(
  [
    (async () => {
      const response = await get("/health"),
        body = await response.json();
      checks.push([
        "Public account runtime",
        response.ok &&
          body.mode === "public-accounts" &&
          body.accounts_configured === true,
      ]);
      checks.push([
        "Email delivery configured",
        body.email_configured === true && body.public_signup_enabled === true,
      ]);
      checks.push([
        "Encrypted provider storage configured",
        body.secure_provider_storage === true,
      ]);
    })(),
    (async () => {
      const response = await get("/api/auth/session"),
        body = await response.json();
      checks.push([
        "Open email registration",
        response.ok &&
          body.signup_mode === "public" &&
          body.registration_available === true &&
          body.invitation_required === false,
      ]);
      checks.push([
        "Verification and recovery enabled",
        body.email_verification_required === true &&
          body.password_reset_available === true,
      ]);
      checks.push([
        "No anonymous account session",
        body.authenticated === false && body.account === null,
      ]);
    })(),
    (async () => {
      const response = await get("/api/studio/overview");
      checks.push(["Workspace requires sign in", response.status === 401]);
      await response.body?.cancel();
    })(),
    ...[
      "signup",
      "signin",
      "verify-email",
      "forgot-password",
      "reset-password",
    ].map((page) =>
      (async () => {
        const response = await get("/" + page + "/");
        const policy = response.headers.get("content-security-policy") || "";
        checks.push([
          page + " page and account security headers",
          response.ok &&
            /text\/html/.test(response.headers.get("content-type") || "") &&
            policy.includes("connect-src 'self'") &&
            policy.includes("frame-ancestors 'none'") &&
            response.headers.get("cache-control") === "no-store",
        ]);
        await response.body?.cancel();
      })(),
    ),
  ].map(async (promise) => {
    try {
      await promise;
    } catch {
      checks.push(["Reachable HTTPS endpoint", false]);
    }
  }),
);
for (const [label, passed] of checks.sort(([a], [b]) => a.localeCompare(b)))
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
console.log(
  "Read-only checks do not prove inbox delivery. Complete one signup and password reset in your inbox before launch.",
);
if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
