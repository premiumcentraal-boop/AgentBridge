import { deny } from "./model.mjs";
import { validEmail } from "./auth-primitives.mjs";

const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

// Only this fixed API receives the sending key. There are no browser credentials,
// arbitrary webhook targets, redirects, tracking pixels or link shorteners.
export function createAuthEmail({
  apiKey,
  from,
  publicOrigin,
  fetcher = fetch,
} = {}) {
  let origin;
  try {
    const url = new URL(publicOrigin);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    )
      origin = url.origin;
  } catch {
    /* An invalid origin keeps email registration closed. */
  }
  const sender = typeof from === "string" ? from.trim() : "";
  const address = sender.match(/^[^<>\r\n]{1,80}<([^<>]+)>$/)?.[1] || sender;
  const ready = Boolean(
    origin &&
    validEmail(address) &&
    sender.length <= 340 &&
    !/[\r\n\u0000-\u001f\u007f]/.test(sender) &&
    typeof apiKey === "string" &&
    /^re_[A-Za-z0-9_-]{10,200}$/.test(apiKey),
  );
  return {
    ready,
    async send({ purpose, email, token, requestId }) {
      if (!ready)
        deny(
          503,
          "EMAIL_SETUP_REQUIRED",
          "Email signup is not available yet. Please try again later.",
        );
      if (
        !["verify", "reset"].includes(purpose) ||
        !validEmail(email) ||
        !/^[a-f0-9]{64}$/.test(token) ||
        !/^[a-f0-9-]{36}$/.test(requestId)
      )
        throw new Error("Invalid auth email.");
      const verifying = purpose === "verify";
      const url = `${origin}/${verifying ? "verify-email" : "reset-password"}/#token=${token}`;
      const title = verifying
        ? "Connect your AgentBridge account"
        : "Reset your AgentBridge password";
      const action = verifying
        ? "Verify email & choose password"
        : "Choose a new password";
      const detail = verifying
        ? "Finish creating your account and connect your first agent."
        : "Use this link to choose a new password. Your other signed-in sessions will be closed.";
      const lifetime = verifying ? "1 hour" : "30 minutes";
      let response;
      try {
        response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `agentbridge-auth/${requestId}`,
          },
          body: JSON.stringify({
            from: sender,
            to: [email],
            subject: title,
            text: `${title}\n\n${detail}\n\n${action}: ${url}\n\nThis link expires in ${lifetime} and works once. If you did not request this, ignore this email.\n\nAgentBridge`,
            html: `<div style="background:#f5f5f5;padding:32px 16px;font-family:Arial,sans-serif;color:#111"><div style="max-width:480px;margin:auto;background:white;border-radius:24px;padding:32px"><p style="font-size:12px;letter-spacing:2px">AGENTBRIDGE</p><h1 style="font-size:28px;line-height:1.15">${escape(title)}</h1><p style="line-height:1.6;color:#555">${escape(detail)}</p><p style="margin:28px 0"><a href="${escape(url)}" style="display:inline-block;background:#111;color:white;padding:16px 20px;border-radius:30px;text-decoration:none">${escape(action)}</a></p><p style="font-size:13px;line-height:1.6;color:#777">This link expires in ${lifetime} and works once. If you did not request this, ignore this email.</p></div></div>`,
          }),
        });
      } catch {
        deny(
          503,
          "EMAIL_UNAVAILABLE",
          "We could not send the email right now. Please try again later.",
        );
      }
      // Do not reflect provider errors, recipient details or API responses.
      if (!response.ok) {
        await response.body?.cancel();
        deny(
          503,
          "EMAIL_UNAVAILABLE",
          "We could not send the email right now. Please try again later.",
        );
      }
      await response.body?.cancel();
    },
  };
}
