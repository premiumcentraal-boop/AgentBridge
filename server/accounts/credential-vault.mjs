import { deny } from "./model.mjs";
const encoder = new TextEncoder();
const hex = (bytes) =>
  [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const bytes = (value) =>
  Uint8Array.from(value.match(/.{2}/g) || [], (v) => parseInt(v, 16));
export const vaultAvailable = (key) =>
  typeof key === "string" && /^[a-f0-9]{64}$/i.test(key);
async function vaultKey(value) {
  if (!vaultAvailable(value))
    deny(
      503,
      "VAULT_UNAVAILABLE",
      "Secure provider storage is not configured on this server.",
    );
  return crypto.subtle.importKey("raw", bytes(value), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
// Random nonce and account/purpose AAD prevent ciphertext reuse across accounts.
// The wrapping key lives only in the host secret store, separately from D1/SQLite.
export async function sealCredential(
  value,
  key,
  accountId,
  purpose = "signalwire",
) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: encoder.encode(`agentbridge:v1:${accountId}:${purpose}`),
    },
    await vaultKey(key),
    encoder.encode(JSON.stringify(value)),
  );
  return `v1:${hex(nonce)}:${hex(ciphertext)}`;
}
export async function openCredential(
  value,
  key,
  accountId,
  purpose = "signalwire",
) {
  await vaultKey(key);
  try {
    const [version, nonce, ciphertext, extra] = value.split(":");
    if (
      version !== "v1" ||
      !/^[a-f0-9]{24}$/.test(nonce) ||
      !/^(?:[a-f0-9]{2}){16,}$/.test(ciphertext) ||
      extra !== undefined
    )
      throw new Error();
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(nonce),
        additionalData: encoder.encode(
          `agentbridge:v1:${accountId}:${purpose}`,
        ),
      },
      await vaultKey(key),
      bytes(ciphertext),
    );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    deny(
      503,
      "VAULT_UNAVAILABLE",
      "The saved provider credentials could not be unlocked.",
    );
  }
}
