import {
  parsePhoneNumberFromString,
  isSupportedCountry,
} from "libphonenumber-js";

export function canonicalPhone(value, country) {
  if (typeof value !== "string" || value.length > 80 || /[a-z@#*]/i.test(value))
    return null;
  const input = value.trim().replace(/^00/, "+");
  const region =
    typeof country === "string" && isSupportedCountry(country.toUpperCase())
      ? country.toUpperCase()
      : undefined;
  if (!input.startsWith("+") && !region) return null;
  try {
    const phone = parsePhoneNumberFromString(input, {
      defaultCountry: region,
      extract: false,
    });
    if (!phone?.isPossible() || phone.ext) return null;
    return { e164: phone.number, country: phone.country || null };
  } catch {
    return null;
  }
}
export const normalizeContactName = (value) =>
  typeof value === "string"
    ? value
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en")
    : "";
