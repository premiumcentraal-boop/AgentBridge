import {rm,mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const root=process.cwd(),out=join(root,'dist');
const pages=['index.html','how-it-works/index.html','pricing/index.html','connect/index.html','docs/index.html','app/index.html'];
await rm(out,{force:true,recursive:true});await mkdir(out,{recursive:true});
for(const path of ['index.html','favicon.svg','assets','how-it-works','pricing','connect','docs','app'])
 await cp(join(root,path),join(out,path),{recursive:true});
// GitHub Pages serves project sites under /AgentBridge. Default is root for Cloudflare Pages.
const base=(process.env.BASE_PATH||'').replace(/\/$/,'');
if(base&&(!base.startsWith('/')||base.includes('..')))throw new Error('Unsafe BASE_PATH');
if(base)for(const path of pages){
 const file=join(out,path),html=await readFile(file,'utf8');
 await writeFile(file,html.replaceAll('href="/','href="'+base+'/').replaceAll('src="/','src="'+base+'/'));
}
console.log('Built dist/ for base '+(base||'/')+' without backend code or secrets');
