import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const web = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  root = resolve(web, ".."),
  dist = resolve(root, "dist");
const base = (process.env.BASE_PATH || "").replace(/\/+$/, "");
if (base && (!/^\/(?:[A-Za-z0-9_-]+\/?)+$/.test(base) || base.includes("..")))
  throw new Error("Unsafe BASE_PATH");
await mkdir(resolve(web, ".cache"), { recursive: true });
await build({
  entryPoints: [resolve(web, "src/render.jsx")],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  jsx: "automatic",
  loader: { ".svg": "dataurl" },
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
  loader: { ".svg": "dataurl" },
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
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests";
for (const path of WEB_PAGES) {
  const privatePage = path.startsWith("/studio/") || path.startsWith("/app/");
  const policy = privatePage
    ? defaultCsp.replace("connect-src 'none'", "connect-src 'self'")
    : defaultCsp;
  const content = renderPage(path, base);
  const title =
    TITLES[path] ||
    (path.includes("/demo/")
      ? "Your workspace | AgentBridge"
      : "Private Studio | AgentBridge");
  const html = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#111514"><meta name="description" content="AgentBridge. A quiet connection between your AI agent and the people you need to reach. Product walkthrough and private control studio.">${privatePage ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="https://agentbridge.victor.ceo${path}">`}<title>${title}</title><link rel="icon" href="${base}/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${base}/assets/foundation/main.css?v=${revision}"><script type="module" src="${base}/assets/foundation/main.js?v=${revision}"></script></head><body><div id="foundation-root" data-base="${base}">${content}</div><noscript><p class="no-script-note">Public pages and links remain readable. Enable JavaScript for studio forms and call-preview interactions.</p></noscript></body></html>`;
  const file = resolve(
    dist,
    path === "/" ? "index.html" : path.slice(1) + "index.html",
  );
  await mkdir(dirname(file), { recursive: true });
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
  loader: { ".svg": "dataurl" },
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
const offlineHtml = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="AgentBridge working website prototype, built with Astryx components."><title>AgentBridge — Working website prototype</title><style>${offlineCss.replaceAll("</style", "<\\/style")}</style></head><body><div id="foundation-root" data-offline="true">${renderPage("/", "", true)}</div><script>globalThis.__AGENTBRIDGE_BOARDS__=${JSON.stringify(boards)};${script.replaceAll("</script", "<\\/script")}</script><!-- Third party licenses\n${thirdPartyNotices.replaceAll("--", "—")}\n--></body></html>`;
await writeFile(
  resolve(web, ".cache/AgentBridge-Working-Website.html"),
  offlineHtml,
);
console.log(
  `Built ${WEB_PAGES.length} rendered Astryx pages and a portable HTML prototype (${Math.round(offlineHtml.length / 1024)} KB).`,
);
