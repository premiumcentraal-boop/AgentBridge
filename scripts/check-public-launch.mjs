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
      checks.push(['MCP account runtime',body.mcp_configured===true&&body.oauth_pkce===true]);
      checks.push(['Built release matches running service',typeof body.version==='string'&&body.version===body.build?.version]);
      const [readyResponse, buildResponse, roomPage] = await Promise.all([get('/readyz'), get('/build.json'), get('/studio/calls/')]);
      const ready = await readyResponse.json(), build = await buildResponse.json();
      checks.push(['Public configuration ready', readyResponse.status === 200 && ready.configuration_ready === true]);
      checks.push(['Static and running commit match', buildResponse.ok && /^[a-f0-9]{40}$/.test(build.commit || '') && build.commit === body.build?.commit && build.version === body.version]);
      checks.push(['Studio audio and captions available', body.features?.browser_join === true && body.features?.live_captions === true && roomPage.ok && (roomPage.headers.get('permissions-policy') || '').includes('microphone=(self)')]);
      await roomPage.body?.cancel();
      if(process.argv[3])checks.push(['Deployed commit matches requested release',build.commit===process.argv[3] && body.build?.commit===process.argv[3]]);
    })(),
    (async()=>{
      const response=await get('/.well-known/oauth-authorization-server'),body=await response.json();
      checks.push(['OAuth discovery and S256',response.ok&&body.issuer===origin+'/'&&body.code_challenge_methods_supported?.includes('S256')&&body.token_endpoint===origin+'/token']);
      const resource=await get('/.well-known/oauth-protected-resource/mcp'),metadata=await resource.json();
      checks.push(['MCP resource audience',resource.ok&&metadata.resource===origin+'/mcp'&&metadata.authorization_servers?.includes(origin+'/')]);
      const mcp=await get('/mcp');checks.push(['MCP rejects anonymous callers',mcp.status===401&&(mcp.headers.get('www-authenticate')||'').includes('oauth-protected-resource/mcp')]);await mcp.body?.cancel();
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
