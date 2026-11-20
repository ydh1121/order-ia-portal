// The Pages route has verified the OWNER before rendering HTML or serving
// assets. All browser code in this inventory comes from the sealed order build.
import {quoteCommit,quoteTemplate,quoteFiles} from './r3-product-sources.mjs';
import {extendQuoteSource,quoteExtension} from './r3-product-extensions.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from './order-engine/browser/brand-account-menu.mjs';
import {browserFunction} from './browser-source.mjs';

const prefix='/ia/r3-product/';
const base={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Vary':'Cookie, Cf-Access-Jwt-Assertion','Cross-Origin-Resource-Policy':'same-origin'};

export async function renderR3ProductPage(nonce,mode,actorId){
 if(!/^[a-zA-Z0-9+/=_-]+$/.test(nonce)||!['simple','detailed'].includes(mode)||typeof actorId!=='string'||!actorId)throw Error('Invalid R3 quote context');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('order.ooo/ia/quote/v1/'+actorId));
 const partition=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 return quoteTemplate.replace('<html lang="ko">',`<html lang="ko" data-r3-quote-extension="${quoteExtension}" data-r3-quote-mode="${mode}" data-r3-quote-commit="${quoteCommit}" data-r3-quote-partition="${partition}">`)
   .replace(/<link rel="stylesheet" href="\/([a-z-]+\.css)">/g,(_,name)=>`<link rel="stylesheet" href="${prefix}web/${name}">`)
   .replace('<script type="module" src="/main.mjs">',`<script nonce="${nonce}" type="module" src="${prefix}web/main.mjs">`)
   .replace('</body>','<a class="ui-copy-action" data-product-qa-return href="/ia?view=qa-lab" style="display:block;text-align:center;margin:20px auto">QA LAB으로</a></body>');
}

export function r3ProductAsset(pathname){
 const path=pathname.startsWith(prefix)?pathname.slice(prefix.length):'';
 if(path==='extension/brand-account-menu.mjs')return new Response('export const mountBrandAccountMenu='+browserFunction(mountBrandAccountMenu)+';\nexport const brandAccountMenuCss='+JSON.stringify(brandAccountMenuCss)+';',{headers:{...base,'Content-Type':'text/javascript; charset=utf-8'}});
 if(!Object.hasOwn(quoteFiles,path))return new Response(null,{status:404,headers:base});
 const bytes=Uint8Array.from(atob(quoteFiles[path]),char=>char.charCodeAt(0));
 let stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 if(['web/main.mjs','web/app.mjs','web/quote-mode-switch.mjs','web/brand.mjs','web/order-menu.mjs'].includes(path)){
  const original=stream;stream=new ReadableStream({async start(controller){try{const text=await new Response(original).text();controller.enqueue(new TextEncoder().encode(extendQuoteSource(path,text)));controller.close();}catch(error){controller.error(error);}}});
 }
 const type=path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':'application/json';
 return new Response(stream,{headers:{...base,'Content-Type':type+'; charset=utf-8'}});
}
