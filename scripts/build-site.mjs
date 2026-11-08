import {rm,mkdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
const root=process.cwd(),out=join(root,'dist');
await rm(out,{force:true,recursive:true});await mkdir(out,{recursive:true});
for(const path of ['index.html','favicon.svg','assets','how-it-works','pricing','connect','docs','app'])
 await cp(join(root,path),join(out,path),{recursive:true});
console.log('Built dist/ — public static pages only, without backend code or secrets');
