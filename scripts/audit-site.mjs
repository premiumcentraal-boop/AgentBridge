import {readFile,stat} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

// Dependency-free structural audit. Not a replacement for browser-based WCAG testing.
export const PAGES=['index.html','how-it-works/index.html','pricing/index.html','connect/index.html','docs/index.html','app/index.html'];
export function attrs(tag){const out={};for(const m of tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))out[m[1].toLowerCase()]=m[2]??m[3];return out;}
export function scan(html,page){
 const issues=[],add=m=>issues.push(page+': '+m),ids=new Set();
 for(const m of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)){if(ids.has(m[1]))add('duplicate id '+m[1]);ids.add(m[1]);}
 if(!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html))add('missing document language');
 if(!/<title>[^<]+<\/title>/i.test(html))add('missing document title');
 if(!/<meta\s+name="description"\s+content="[^"]+"/i.test(html))add('missing description');
 if((html.match(/<main\b/gi)||[]).length!==1)add('expected exactly one main landmark');
 if((html.match(/<h1\b/gi)||[]).length!==1)add('expected exactly one h1');
 if(!/<a\b[^>]*href="#main"[^>]*>[^<]+<\/a>/i.test(html))add('missing skip link');
 for(const m of html.matchAll(/<(img|button|input|select|textarea|a)\b[^>]*>/gi)){
   const kind=m[1].toLowerCase(),a=attrs(m[0]);
   if(kind==='img'&&!('alt'in a))add('image missing alt');
   if(kind==='button'&&!a['aria-label']){
     const inner=(html.slice(m.index+m[0].length).split(/<\/button>/i,1)[0]||'').replace(/<[^>]*>/g,'').trim();
     if(!inner)add('button missing accessible text');
   }
   if(['input','select','textarea'].includes(kind)&&a.type!=='hidden'&&!a['aria-label']){
     const labelled=[...html.matchAll(/<label\b[^>]*>/gi)].some(x=>attrs(x[0]).for===a.id);
     if(!a.id||!labelled)add(kind+' missing associated label');
   }
   for(const key of ['aria-controls','aria-describedby','aria-labelledby']){
     if(a[key])for(const id of a[key].split(/\s+/))if(!ids.has(id))add(key+' references missing id '+id);
   }
   if(kind==='a'&&a.href==='#')add('placeholder link');
 }
 for(const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)){
   if(m[1].startsWith('javascript:'))add('javascript: URL prohibited');
   if(m[1].startsWith('#')&&m[1].length>1&&!ids.has(m[1].slice(1)))add('broken fragment '+m[1]);
 }
 return issues;
}
export function internalPaths(html,base=''){
 const out=[];
 for(const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)){
   let href=m[1];if(!href.startsWith('/'))continue;
   if(base&&href.startsWith(base+'/'))href=href.slice(base.length);
   else if(base)throw new Error('internal URL missing BASE_PATH prefix: '+href);
   const raw=href.split(/[?#]/)[0];
   out.push(!raw||raw==='/'?'index.html':raw.endsWith('/')?raw.slice(1)+'index.html':raw.slice(1));
 }
 return out;
}
export async function audit(root,base=''){
 const errors=[],rootPath=resolve(root);
 for(const page of PAGES){
   const html=await readFile(join(root,page),'utf8');errors.push(...scan(html,page));
   for(const target of internalPaths(html,base)){
     const absolute=resolve(root,target);
     if(absolute!==rootPath&&!absolute.startsWith(rootPath+sep)){errors.push(page+': unsafe local link '+target);continue;}
     try{const file=await stat(absolute);if(!file.isFile())errors.push(page+': link is not a file '+target);}
     catch{errors.push(page+': missing internal link '+target);}
   }
 }
 return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const root=resolve(process.argv[2]||'dist'),base=(process.env.BASE_PATH||'').replace(/\/$/,'');
 const errors=await audit(root,base);
 if(errors.length){for(const issue of errors)console.error('FAIL '+issue);process.exitCode=1;}
 else console.log('Static audit passed: '+PAGES.length+' pages, semantics, labels, anchors and local assets verified.');
}
