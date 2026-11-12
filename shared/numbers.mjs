import { CALL_COUNTRIES, validPhone } from "./call-plans.mjs";

// Provider identity belongs to the routing number, never to the destination.
// More providers/countries can be added when their provisioning path is ready.
export const NUMBER_PROVIDERS = Object.freeze([
  { id: "signalwire", name: "SignalWire", countries: ["US"] },
]);
export const normalizeNumber = (value) =>
  typeof value === "string" ? value.replace(/[\s().-]/g, "") : "";
const named = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= 80 &&
  !/[\u0000-\u001f\u007f]/.test(value);
const only = (input, fields) =>
  input &&
  typeof input === "object" &&
  !Array.isArray(input) &&
  Object.keys(input).every((key) => fields.includes(key));
export function validateNumberConnection(input) {
  if (!only(input, ["label", "routing_number_id", "destination", "country"]))
    return { error: "Enter a routing number and destination." };
  if (!named(input.label))
    return { error: "Enter a connection name of up to 80 characters." };
  if (
    typeof input.routing_number_id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(input.routing_number_id)
  )
    return { error: "Choose one of your routing numbers." };
  const destination = normalizeNumber(input.destination),
    country = CALL_COUNTRIES.find((item) => item.code === input.country);
  if (
    !validPhone(destination) ||
    !country ||
    !destination.startsWith("+" + country.prefix)
  )
    return { error: "Enter a destination matching the selected country code." };
  return {
    value: {
      label: input.label.trim(),
      routing_number_id: input.routing_number_id,
      destination,
      country: country.code,
    },
  };
}
export function validateNumberOrder(input) {
  if (!only(input, ["request_id", "provider", "country", "area_code", "label"]))
    return { error: "Enter the number request." };
  if (
    typeof input.request_id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      input.request_id,
    )
  )
    return { error: "A valid request identifier is required." };
  const provider = NUMBER_PROVIDERS.find((item) => item.id === input.provider);
  if (!provider || !provider.countries.includes(input.country))
    return {
      error:
        "This routing-number country is not available from the selected provider yet.",
    };
  if (
    typeof input.area_code !== "string" ||
    !/^[2-9][0-9]{2}$/.test(input.area_code)
  )
    return { error: "Enter a three-digit US area code." };
  if (!named(input.label))
    return { error: "Give the number a name of up to 80 characters." };
  return {
    value: {
      request_id: input.request_id,
      provider: provider.id,
      country: input.country,
      area_code: input.area_code,
      label: input.label.trim(),
    },
  };
}
