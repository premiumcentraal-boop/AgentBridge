// Shared schema for non-chargeable studio call plans. Carrier authorization is
// a separate operation; this module never creates a reservation or a call.
export const CALL_COUNTRIES = [
  ["NL", "Netherlands", "31"],
  ["GB", "United Kingdom", "44"],
  ["US", "United States / Canada", "1"],
  ["DE", "Germany", "49"],
  ["FR", "France", "33"],
  ["ES", "Spain", "34"],
  ["IT", "Italy", "39"],
  ["AU", "Australia", "61"],
  ["JP", "Japan", "81"],
  ["IN", "India", "91"],
  ["BR", "Brazil", "55"],
  ["SG", "Singapore", "65"],
  ["AE", "United Arab Emirates", "971"],
  ["ZA", "South Africa", "27"],
].map(([code, name, prefix]) => ({ code, name, prefix }));
export const CALL_LANGUAGES = [
  ["auto", "Detect language"],
  ["en", "English"],
  ["nl", "Dutch"],
  ["de", "German"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["ja", "Japanese"],
].map(([code, name]) => ({ code, name }));
export const DEFAULT_CAPTURE = Object.freeze({
  recording: false,
  transcription: false,
  language: "auto",
  retention_days: 30,
  join_method: "browser",
  join_number: "",
});
const cleanNumber = (value) =>
  typeof value === "string" ? value.replace(/[\s().-]/g, "") : "";
export const validPhone = (value) => /^\+[1-9]\d{7,14}$/.test(value);
const text = (value, max) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
export function validateCapture(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "Choose recording, transcription and join preferences." };
  if (Object.keys(input).some((k) => !Object.keys(DEFAULT_CAPTURE).includes(k)))
    return { error: "Unknown capture preference." };
  if (input.join_number !== undefined && typeof input.join_number !== "string")
    return { error: "Use a phone number as text." };
  const p = {
    ...DEFAULT_CAPTURE,
    ...input,
    join_number: cleanNumber(input.join_number ?? ""),
  };
  if (typeof p.recording !== "boolean" || typeof p.transcription !== "boolean")
    return { error: "Recording and transcription must be on or off." };
  if (!CALL_LANGUAGES.some((l) => l.code === p.language))
    return { error: "Choose a supported language preference." };
  if (![7, 30, 90].includes(p.retention_days))
    return { error: "Choose 7, 30 or 90 days of retention." };
  if (!["browser", "phone"].includes(p.join_method))
    return { error: "Choose browser or phone joining." };
  if (p.join_number && !validPhone(p.join_number))
    return { error: "Use an international phone number starting with +." };
  if (p.join_method === "phone" && !validPhone(p.join_number))
    return {
      error: "Add the international number where you would like to join.",
    };
  return { value: p };
}
export function validateCallPlan(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "Enter the call details." };
  const fields = [
    "label",
    "destination",
    "country",
    "purpose",
    "capture",
    "permission",
  ];
  if (Object.keys(input).some((k) => !fields.includes(k)))
    return { error: "Unknown call-plan field." };
  if (!text(input.label, 80))
    return { error: "Give this call a name of up to 80 characters." };
  const destination = cleanNumber(input.destination),
    country = CALL_COUNTRIES.find((c) => c.code === input.country);
  if (!validPhone(destination))
    return {
      error:
        "Use an international destination starting with + and its country code.",
    };
  if (!country || !destination.startsWith("+" + country.prefix))
    return { error: "The destination must match the selected country code." };
  if (input.purpose !== undefined && typeof input.purpose !== "string")
    return { error: "Write the call brief as text." };
  const purpose = typeof input.purpose === "string" ? input.purpose.trim() : "";
  if (
    purpose.length > 500 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(purpose)
  )
    return { error: "Keep the call brief under 500 characters." };
  const capture = validateCapture(input.capture);
  if (capture.error) return capture;
  const permission = input.permission ?? "ask";
  if (!["ask", "confirmed"].includes(permission))
    return { error: "Choose when to confirm capture permission." };
  return {
    value: {
      label: input.label.trim(),
      destination,
      country: country.code,
      purpose,
      capture: capture.value,
      permission,
    },
  };
}
