import { deny, emptyWorkspace, publicAccount } from "./model.mjs";
import {
  authLimit,
  digest,
  normalizeEmail,
  onlyFields,
  randomToken,
  requirePassword,
  validEmail,
  validName,
} from "./auth-primitives.mjs";

const invalidLink = () =>
  deny(
    400,
    "INVALID_LINK",
    "This link has expired or has already been used. Request a new email.",
  );

export function createEmailAuth({
  database,
  passwords,
  mailer,
  session,
  json,
}) {
  async function requestEmail(input, purpose, clientAddress) {
    onlyFields(
      input,
      purpose === "verify" ? ["email", "name", "agent_name"] : ["email"],
    );
    await authLimit(database, "email-ip:" + (clientAddress || "unknown"));
    // This independent ceiling also protects a deployment with misconfigured proxy trust.
    await authLimit(database, "email-global", { maximum: 200 });
    const email = normalizeEmail(input.email);
    if (!validEmail(email))
      deny(422, "INVALID_EMAIL", "Enter a valid email address.");
    if (
      purpose === "verify" &&
      (!validName(input.name) || !validName(input.agent_name))
    )
      deny(
        422,
        "INVALID_PROFILE",
        "Enter your name and an agent name, each up to 80 characters.",
      );
    await authLimit(database, "email-address:" + email, {
      maximum: 3,
      window: 60 * 60_000,
    });
    if (!mailer?.ready)
      deny(
        503,
        "EMAIL_SETUP_REQUIRED",
        "Email signup is not available yet. Please try again later.",
      );
    const account = await database.first(
      "SELECT * FROM ab_accounts WHERE email=?",
      [email],
    );
    const eligible =
      purpose === "verify"
        ? !account ||
          (account.auth_provider === "password" && !account.email_verified_at)
        : account?.auth_provider === "password";
    if (eligible) {
      const token = randomToken(),
        tokenHash = await digest(token),
        now = Date.now();
      await database.run("DELETE FROM ab_email_tokens WHERE expires_at<=?", [
        now,
      ]);
      await database.run(
        "INSERT INTO ab_email_tokens(token_hash,purpose,email,account_id,profile,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
        [
          tokenHash,
          purpose,
          email,
          account?.id || null,
          purpose === "verify"
            ? JSON.stringify({
                name: account?.name || input.name.trim(),
                agent_name: account?.agent_name || input.agent_name.trim(),
              })
            : null,
          now + (purpose === "verify" ? 60 : 30) * 60_000,
          new Date(now).toISOString(),
        ],
      );
      // A timeout can mean delivery succeeded. Keep the token usable until expiry;
      // retries request a new bounded link and never change an account's password.
      await mailer.send({
        purpose,
        email,
        token,
        requestId: crypto.randomUUID(),
      });
    }
    // Existing/nonexistent addresses get the same status and response shape.
    return json(202, {
      request_accepted: true,
      verification_required: purpose === "verify",
      message:
        purpose === "verify"
          ? "Check your inbox for a link to finish creating your account. Already registered? Sign in."
          : "If an account uses this email, a password reset link is on its way.",
    });
  }

  async function finish(input, purpose, clientAddress) {
    onlyFields(input, ["token", "password"]);
    await authLimit(database, "email-confirm:" + (clientAddress || "unknown"));
    if (typeof input.token !== "string" || !/^[a-f0-9]{64}$/.test(input.token))
      invalidLink();
    requirePassword(input.password);
    const tokenHash = await digest(input.token),
      now = Date.now();
    const token = await database.first(
      "SELECT * FROM ab_email_tokens WHERE token_hash=? AND purpose=? AND expires_at>? AND consumed_by IS NULL",
      [tokenHash, purpose, now],
    );
    if (!token) invalidLink();
    const passwordHash = await passwords.hash(input.password),
      stamp = new Date().toISOString(),
      claim = randomToken();
    const accountId = token.account_id || crypto.randomUUID();
    const guard =
      "EXISTS(SELECT 1 FROM ab_email_tokens WHERE token_hash=? AND consumed_by=?)";
    const args = [tokenHash, claim];
    const statements = [
      {
        sql: "UPDATE ab_email_tokens SET consumed_by=? WHERE token_hash=? AND purpose=? AND expires_at>? AND consumed_by IS NULL",
        params: [claim, tokenHash, purpose, Date.now()],
      },
    ];
    if (purpose === "verify" && !token.account_id) {
      const profile = JSON.parse(token.profile);
      statements.push(
        {
          sql: `INSERT INTO ab_accounts(id,email,name,agent_name,auth_provider,password_hash,email_verified_at,created_at,updated_at) SELECT ?,?,?,?,'password',?,?,?,? WHERE ${guard}`,
          params: [
            accountId,
            token.email,
            profile.name,
            profile.agent_name,
            passwordHash,
            stamp,
            stamp,
            stamp,
            ...args,
          ],
        },
        {
          sql: `INSERT INTO ab_workspaces(account_id,revision,document,updated_at) SELECT ?,0,?,? WHERE ${guard}`,
          params: [accountId, JSON.stringify(emptyWorkspace()), stamp, ...args],
        },
      );
    } else {
      statements.push(
        {
          sql: `UPDATE ab_accounts SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=? AND email=? AND auth_provider='password' AND ${guard}`,
          params: [passwordHash, stamp, stamp, accountId, token.email, ...args],
        },
        {
          sql: `DELETE FROM ab_sessions WHERE account_id=? AND ${guard}`,
          params: [accountId, ...args],
        },
      );
    }
    // Revoke every outstanding link for this email in the same transaction.
    statements.push({
      sql: `UPDATE ab_email_tokens SET consumed_by=? WHERE email=? AND consumed_by IS NULL AND ${guard}`,
      params: [claim, token.email, ...args],
    });
    try {
      await database.batch(statements);
    } catch (error) {
      if (
        purpose === "verify" &&
        (await database.first("SELECT id FROM ab_accounts WHERE email=?", [
          token.email,
        ]))
      )
        invalidLink();
      throw error;
    }
    const claimed = await database.first(
      "SELECT consumed_by FROM ab_email_tokens WHERE token_hash=?",
      [tokenHash],
    );
    if (claimed?.consumed_by !== claim) invalidLink();
    const account = await database.first(
      "SELECT * FROM ab_accounts WHERE id=? AND email=? AND auth_provider='password'",
      [accountId, token.email],
    );
    if (
      !account ||
      account.password_hash !== passwordHash ||
      !account.email_verified_at
    )
      invalidLink();
    // Recovery returns to sign-in so an old browser session cannot re-enter.
    if (purpose === "reset")
      return json(200, { password_reset: true, redirect: "/signin/" });
    return json(
      201,
      {
        authenticated: true,
        sandbox: true,
        account: publicAccount(account),
        redirect: "/studio/",
      },
      await session(account),
    );
  }

  return async ({ route, readBody, clientAddress }) => {
    if (route === "register")
      return requestEmail(await readBody(), "verify", clientAddress);
    if (route === "forgot-password")
      return requestEmail(await readBody(), "reset", clientAddress);
    if (route === "verify-email")
      return finish(await readBody(), "verify", clientAddress);
    if (route === "reset-password")
      return finish(await readBody(), "reset", clientAddress);
    return null;
  };
}
