import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..'),out=path.join(here,'dist');
await mkdir(out,{recursive:true});
const shims={
 'next/image':`import React from 'react';export default function Image({src,alt='',fill,priority,unoptimized,quality,sizes,loader,placeholder,blurDataURL,onLoadingComplete,...props}){return <img src={typeof src==='string'?src:src.src} alt={alt} {...props} style={{...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{}),...props.style}}/>}`,
 'next/dynamic':`import React,{lazy,Suspense} from 'react';export default function dynamic(loader,options={}){const C=lazy(()=>loader().then(m=>({default:m.default||m})));return function Dynamic(p){return <Suspense fallback={options.loading?<options.loading/>:null}><C {...p}/></Suspense>}}`,
 'next/link':`import React from 'react';export default function Link({href,prefetch,replace,scroll,...p}){return <a href={href} {...p}/>}`,
 'next/navigation':`export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{},back:()=>{}});export const usePathname=()=>'/';export const useSearchParams=()=>new URLSearchParams();`
};
await build({absWorkingDir:root,entryPoints:[path.join(here,'entry.jsx')],outdir:out,bundle:true,format:'esm',splitting:true,jsx:'automatic',loader:{'.svg':'text'},minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_VERSI_APLIKASI':'"1.22.0"','process.env.NEXT_PUBLIC_DEMO_MODE':'"false"'},plugins:[{name:'next-preview',setup(b){b.onResolve({filter:/^next\/(image|dynamic|link|navigation)$/},a=>({path:a.path,namespace:'preview'}));b.onLoad({filter:/.*/,namespace:'preview'},a=>({contents:shims[a.path],loader:'jsx',resolveDir:root}));}}]}).then(async r=>writeFile(path.join(out,'source-map.json'),JSON.stringify({inputs:Object.keys(r.metafile.inputs).filter(p=>p.startsWith('src/'))},null,2)));
let css=await readFile(path.join(root,'src/app/globals.css'),'utf8');
css=css.replace('@import "tailwindcss";',`@import "tailwindcss";\n@source "${root}/src";\n@source "${here}/entry.jsx";`);
const processed=await postcss([tailwind()]).process(css,{from:path.join(root,'src/app/globals.css')});
await writeFile(path.join(out,'style.css'),processed.css);
await cp(path.join(root,'public'),out,{recursive:true});
// Font lokal hasil build Next sebelumnya; tidak mengunduh apa pun.
let fonts='';
try{for(const f of await readdir(path.join(root,'.next/dev/static/chunks'))){if(f.includes('_internal_font_google_')&&f.endsWith('.single.css')){const source=await readFile(path.join(root,'.next/dev/static/chunks',f),'utf8');fonts+=(source.match(/@font-face\s*\{[^}]+\}/g)||[]).filter(x=>!x.includes('src: local(')).join('\n');}}await cp(path.join(root,'.next/dev/static/media'),path.join(out,'_next/static/media'),{recursive:true});}catch{console.warn('Font Next lokal tidak ditemukan; browser memakai font cadangan.');}
await writeFile(path.join(out,'fonts.css'),fonts.replaceAll('../media/','./_next/static/media/')+'\n:root{--font-inter:"Inter";--font-jakarta:"Plus Jakarta Sans";--font-geist-mono:"Geist Mono"}');
await cp(path.join(here,'index.html'),path.join(out,'index.html'));
await writeFile(path.join(out,'app.html'),`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; object-src 'none'; base-uri 'self'"><title>PRI SuperApp — Komponen asli</title><link rel="stylesheet" href="./fonts.css"><link rel="stylesheet" href="./style.css"></head><body><div id="root"></div><script type="module" src="./entry.js"></script></body></html>`);
console.log('Pratinjau komponen asli siap:',out);
