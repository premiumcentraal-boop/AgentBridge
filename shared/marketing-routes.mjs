// Bookmarks and printed links to the former guides now land at their chapter.
export const marketingSections = Object.freeze({
  "/features/": "call-tour",
  "/connect/": "contacts",
  "/call-memory/": "transcript",
  "/join-call/": "call-room",
  "/how-it-works/": "how-it-works",
  "/international-calling/": "coverage",
  "/pricing/": "pricing",
});

export function marketingSection(path) {
  const key = path.endsWith("/") ? path : path + "/";
  return Object.hasOwn(marketingSections, key) ? marketingSections[key] : "";
}
