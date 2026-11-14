import { deny } from "./model.mjs";

export const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
export const validEmail = (value) =>
  /^[^\s@<>\u0000-\u001f\u007f]+@[^\s@<>\u0000-\u001f\u007f]+\.[^\s@<>\u0000-\u001f\u007f]+$/.test(
    value,
  ) && value.length <= 254;
export const validName = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= 80 &&
  !/[\u0000-\u001f\u007f]/.test(value);
export function onlyFields(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    deny(422, "INVALID_FIELDS", "The request contains unsupported fields.");
}
const hex = (bytes) =>
  [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
export const digest = async (text) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
export function requirePassword(value) {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    value.length > 128 ||
    !value.trim()
  )
    deny(422, "INVALID_PASSWORD", "Choose a password of 12 to 128 characters.");
}

// Fixed windows persist across deployments and are shared by all auth endpoints.
export async function authLimit(
  database,
  key,
  { maximum = 10, window = 15 * 60_000 } = {},
) {
  const bucket = await digest(key),
    now = Date.now();
  await database.run("DELETE FROM ab_auth_attempts WHERE expires_at<=?", [now]);
  await database.run(
    "INSERT INTO ab_auth_attempts(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
    [bucket, now + window],
  );
  const row = await database.first(
    "SELECT count FROM ab_auth_attempts WHERE bucket=?",
    [bucket],
  );
  if (row.count > maximum)
    deny(429, "RATE_LIMITED", "Too many attempts. Please try again later.");
  return bucket;
}
