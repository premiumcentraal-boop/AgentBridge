export function agentReturnPath(value) {
  return typeof value === "string" &&
    /^\/studio\/agents\/(?:\?(?:authorize|call)=[a-f0-9-]{36})?$/.test(value)
    ? value
    : "/studio/";
}
