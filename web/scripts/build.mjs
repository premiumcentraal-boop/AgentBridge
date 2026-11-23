import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { marketingSection } from "../../shared/marketing-routes.mjs";
const web = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  root = resolve(web, ".."),
  dist = resolve(root, "dist");
const base = (process.env.BASE_PATH || "").replace(/\/+$/, "");
if (base && (!/^\/(?:[A-Za-z0-9_-]+\/?)+$/.test(base) || base.includes("..")))
  throw new Error("Unsafe BASE_PATH");
await mkdir(resolve(web, ".cache"), { recursive: true });
const assetRoot = base + "/assets/foundation";
const hostedLoaders = {
  ".svg": "text",
  ".mp3": "file",
  ".webp": "file",
  ".woff2": "file",
};
await build({
  entryPoints: [resolve(web, "src/render.jsx")],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  jsx: "automatic",
  publicPath: assetRoot,
  loader: hostedLoaders,
  outfile: resolve(web, ".cache/render.mjs"),
  logLevel: "warning",
});
const { renderPage, WEB_PAGES, TITLES } = await import(
  pathToFileURL(resolve(web, ".cache/render.mjs")) + "?" + Date.now()
);
const output = resolve(dist, "assets/foundation/main.js");
await build({
  entryPoints: [resolve(web, "src/main.jsx")],
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  publicPath: assetRoot,
  loader: hostedLoaders,
  minify: true,
  legalComments: "linked",
  outfile: output,
  define: { "process.env.NODE_ENV": '"production"' },
  target: ["es2022"],
  logLevel: "warning",
});
const js = await readFile(output, "utf8"),
  css = await readFile(output.replace(".js", ".css"), "utf8");
const revision = createHash("sha256")
  .update(js)
  .update(css)
  .digest("hex")
  .slice(0, 10);
const defaultCsp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests";
for (const path of WEB_PAGES) {
  const file = resolve(dist, path === "/" ? "index.html" : path.slice(1) + "index.html");
  await mkdir(dirname(file), { recursive: true });
  const chapter = marketingSection(path);
  if (chapter) {
    // Static hosts without server redirects also retain a working bookmark.
    const target = base + "/#" + chapter;
    const title = TITLES[path];
    const fallback = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${defaultCsp}"><meta name="referrer" content="no-referrer">
<meta name="description" content="This guide is now part of the AgentBridge product tour.">
<link rel="canonical" href="https://agentbridge.victor.ceo/"><meta http-equiv="refresh" content="0;url=${target}">
<title>${title}</title></head><body>
<a href="#main">Skip to content</a><main id="main"><h1>${title.split(" | ")[0]}</h1>
<p><a href="${target}">Continue to this section on the AgentBridge homepage</a></p></main>
</body></html>`;
    await writeFile(file, fallback);
    continue;
  }
  const studioPage = path.startsWith("/studio/") || path.startsWith("/app/");
  const initialTheme = studioPage ? "dark" : "light";
  const privatePage =
    studioPage ||
    [
      "/signup/",
      "/signin/",
      "/verify-email/",
      "/forgot-password/",
      "/reset-password/",
    ].includes(path);
  const policy = privatePage
    ? defaultCsp.replace("connect-src 'none'", "connect-src 'self'")
    : defaultCsp;
  const content = renderPage(path, base);
  const title =
    TITLES[path] ||
    (path.includes("/demo/")
      ? "Your workspace | AgentBridge"
      : "Private Studio | AgentBridge");
  const html = `<!doctype html><html lang="en" data-theme="${initialTheme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="${studioPage ? "#111319" : "#f8f9fc"}"><meta name="description" content="Connect a phone number to your agent. Follow a call, join the conversation and keep the details you choose in AgentBridge Studio.">${privatePage ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="https://agentbridge.victor.ceo${path}">`}<title>${title}</title><link rel="icon" href="${base}/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${base}/assets/foundation/main.css?v=${revision}"><script type="module" src="${base}/assets/foundation/main.js?v=${revision}"></script></head><body><div id="foundation-root" data-base="${base}">${content}</div><noscript><p class="no-script-note">Public pages and links remain readable. Enable JavaScript for studio forms and call-preview interactions.</p></noscript></body></html>`;
  await writeFile(file, html);
}
const lock = JSON.parse(
  await readFile(resolve(web, "package-lock.json"), "utf8"),
);
const notices = [];
for (const [name, pkg] of Object.entries(lock.packages)) {
  if (!name || pkg.dev) continue;
  const dir = resolve(web, name);
  const file = (await readdir(dir)).find((file) =>
    /^license(?:\.|$)/i.test(file),
  );
  const license = file
    ? await readFile(resolve(dir, file), "utf8")
    : await readFile(
        resolve(
          root,
          name.includes("@astryxdesign")
            ? "docs/ASTRYX_LICENSE.txt"
            : "docs/STYLEX_LICENSE.txt",
        ),
        "utf8",
      );
  notices.push(
    `${name.replace("node_modules/", "")} ${pkg.version}\n${license}`,
  );
}
notices.push(
  "flag-icons — country flag vectors\n" +
    (await readFile(resolve(root, "docs/FLAG_ICONS_LICENSE.txt"), "utf8")),
);
for (const [name, licenseFile] of [
  ["DM Sans", "dm-sans-OFL.txt"],
  ["Barlow Semi Condensed", "barlow-semi-condensed-OFL.txt"],
]) {
  notices.push(
    name +
      "\n" +
      (await readFile(resolve(web, "src/type", licenseFile), "utf8")),
  );
}
const thirdPartyNotices = notices.join("\n\n--------------------\n\n");
await writeFile(
  resolve(dist, "assets/foundation/THIRD_PARTY_NOTICES.txt"),
  thirdPartyNotices,
);
// A portable, actually rendered HTML prototype: all pages, real components and
// in-memory demo interactions. No server, network, account key or carrier needed.
const offlineBuild = await build({
  entryPoints: [resolve(web, "src/main.jsx")],
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  loader: {
    ".svg": "text",
    ".mp3": "dataurl",
    ".webp": "dataurl",
    ".woff2": "dataurl",
  },
  minify: true,
  write: false,
  legalComments: "inline",
  outfile: "prototype.js",
  define: { "process.env.NODE_ENV": '"production"' },
  target: ["es2022"],
});
const script = offlineBuild.outputFiles.find((f) =>
  f.path.endsWith(".js"),
).text;
const offlineCss = offlineBuild.outputFiles.find((f) =>
  f.path.endsWith(".css"),
).text;
const boards = {};
for (const file of ["01-signal.png", "02-material.png", "03-atlas.png"]) {
  boards[file] =
    "data:image/png;base64," +
    (await readFile(resolve(root, "assets/design-boards", file))).toString(
      "base64",
    );
}
let offlineLanding = renderPage("/", "", true);
for (const name of await readdir(dirname(output))) {
  if (name.endsWith(".mp3")) {
    const sampleBytes = await readFile(resolve(dirname(output), name));
    offlineLanding = offlineLanding.replaceAll(
      assetRoot + "/" + name,
      "data:audio/mpeg;base64," + sampleBytes.toString("base64"),
    );
  }
}
const offlineHtml = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f8f9fc"><meta name="description" content="AgentBridge working website prototype, built with Astryx components."><title>AgentBridge — Working website prototype</title><style>${offlineCss.replaceAll("</style", "<\\/style")}</style></head><body><div id="foundation-root" data-offline="true">${offlineLanding}</div><script>globalThis.__AGENTBRIDGE_BOARDS__=${JSON.stringify(boards)};${script.replaceAll("</script", "<\\/script")}</script><!-- Third party licenses\n${thirdPartyNotices.replaceAll("--", "—")}\n--></body></html>`;
await writeFile(
  resolve(web, ".cache/AgentBridge-Working-Website.html"),
  offlineHtml,
);
console.log(
  `Built ${WEB_PAGES.length} rendered Astryx pages and a portable HTML prototype (${Math.round(offlineHtml.length / 1024)} KB).`,
);
