import {rm,mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const root=process.cwd(),out=join(root,'dist');
const pages=['index.html','how-it-works/index.html','pricing/index.html','connect/index.html','docs/index.html','app/index.html'];
// All assets must be served locally. Existing inline style attributes require
// 'unsafe-inline' for styles only; scripts never receive that exemption.
export const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests";
await rm(out,{force:true,recursive:true});await mkdir(out,{recursive:true});
for(const path of ['index.html','favicon.svg','assets','how-it-works','pricing','connect','docs','app'])
 await cp(join(root,path),join(out,path),{recursive:true});
// GitHub Pages project site needs prefix; Cloudflare Pages uses root.
const base=(process.env.BASE_PATH||'').replace(/\\/$/,'');
if(base&&(!/^\\/[A-Za-z0-9_-]+(?:\\/[A-Za-z0-9_-]+)*$/.test(base)))throw new Error('Unsafe BASE_PATH');
for(const path of pages){
 const file=join(out,path);
 let html=await readFile(file,'utf8');
 if(!html.includes('<head>'))throw new Error('Missing head: '+path);
 html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+CSP+'"><meta name="referrer" content="no-referrer">');
 if(base)html=html.replaceAll('href="/','href="'+base+'/').replaceAll('src="/','src="'+base+'/');
 await writeFile(file,html);
}
console.log('Built offline-first dist/ for '+(base||'/')+' with restrictive CSP and no third-party font calls');
