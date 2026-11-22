import { readFile, writeFile, readdir, mkdir, rm, cp } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { createRequire } from 'node:module';
import { WEB_PAGES } from '../web/src/data.js';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = require('esbuild');
const root = resolve(new URL('..', import.meta.url).pathname), output = resolve(root,'web/.cache/account-site');
await rm(output,{recursive:true,force:true});await mkdir(resolve(output,'dist/server'),{recursive:true});
const mime={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg', '.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const assets={};
async function collect(directory){for(const item of await readdir(directory,{withFileTypes:true})){const file=resolve(directory,item.name);if(item.isDirectory())await collect(file);else {const path='/'+relative(resolve(root,'dist'),file);assets[path]={type:mime[extname(file)]||'application/octet-stream',data:(await readFile(file)).toString('base64')};}}}
await collect(resolve(root,'dist/assets'));
assets['/favicon.svg']={type:'image/svg+xml',data:(await readFile(resolve(root,'favicon.svg'))).toString('base64')};
// Serve the actual landing page and guides on the first paint of the private Site.
const pages = {};
for (const route of WEB_PAGES) {
  if (route.startsWith('/studio/demo/') || route === '/app/') continue;
  const html = await readFile(resolve(root, 'dist', '.' + route, 'index.html'), 'utf8');
  pages[route] = html
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(/<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex,nofollow">')
    .replace('id="foundation-root"', 'id="foundation-root" data-account-demo="true"');
}
await build({entryPoints:[resolve(root,'server/accounts/worker.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,legalComments:'linked',outfile:resolve(output,'dist/server/index.js'),plugins:[{name:'agentbridge-assets',setup(builder){builder.onResolve({filter:/^agentbridge:assets$/},()=>({path:'assets',namespace:'agentbridge'}));builder.onLoad({filter:/.*/,namespace:'agentbridge'},()=>({contents:`export const assets=${JSON.stringify(assets)};export const pages=${JSON.stringify(pages)};`,loader:'js'}));}}]});
await cp(resolve(root,'server/accounts/migrations'),resolve(output,'drizzle'),{recursive:true});
await writeFile(resolve(output,'README.md'),'AgentBridge persistent single-tester demo. The Worker uses the verified Sites identity, a D1 account/workspace database, and the same API service as the Railway adapter. Set DEMO_TESTER_EMAIL, STUDIO_PUBLIC_ORIGIN and the secret PROVIDER_CREDENTIALS_KEY through Sites runtime variables. Keep owner-private access. Customer SignalWire credentials are encrypted at rest; paid actions require the signed-in owner to enable live testing and confirm charges.\n');
console.log('Built persistent account Worker and schema migrations at '+output);
