import {bootBusinessDirectory, businessDirectoryPanelMarkup} from '../product-ui/business-directory.mjs';
import {browserFunction} from '../browser-source.mjs';

const once = (source, marker, replacement) => {
  const matches = marker instanceof RegExp ? [...source.matchAll(marker)].length : source.split(marker).length - 1;
  if (matches !== 1) throw Error('RESEARCH_BUSINESS_SOURCE_CHANGED:' + String(marker).slice(0, 90));
  return source.replace(marker, replacement);
};
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
export const getResearchBusinessPanelMarkup = () => businessDirectoryPanelMarkup();
let cached;

/** Derive the research controller from the current product controller. Only
 * field I/O and its async validation seam change; storage, revision, retry,
 * delete, reload, confirmation and pending-state behavior remain its own. */
export function getResearchBusinessPanelSource() {
  return cached ??= (async () => {
    const original = browserFunction(bootBusinessDirectory), markup = businessDirectoryPanelMarkup();
    // Wrangler's serializer changes whitespace, string quote style and arrow
    // parameter parentheses. Match these exact I/O expressions once in either
    // spelling; fail closed if the original controller's behavior changes.
    let source = once(original,
      /for\s*\(\s*const\s+key\s+of\s+fields\s*\)\s*\$\(\s*["']business-["']\s*\+\s*key\s*\)\.value\s*=\s*record\?\.profile\[key\]\s*\|\|\s*["']["']\s*;/g,
      "options.fieldBridge.restore(record?.profile||{});");
    source = once(source,
      /button\.className\s*=\s*["']business-card btn secondary["']\s*;/g,
      matched => matched + 'button.dataset.businessId=record.id;');
    source = once(source,
      /for\s*\(\s*const\s+key\s+of\s+fields\s*\)\s*p\[key\]\s*=\s*\$\(\s*["']business-["']\s*\+\s*key\s*\)\.value\.trim\(\)\s*;/g,
      "for(const key of fields)p[key]=options.fieldBridge.get(key).trim();");
    source = once(source,
      /if\s*\(\s*p\.road\s*!==\s*editing\?\.profile\.road\s*\|\|\s*p\.postal\s*!==\s*editing\?\.profile\.postal\s*\)\s*\{\s*p\.providerId\s*=\s*["']["'];\s*p\.addressProvider\s*=\s*["']["'];\s*p\.jibun\s*=\s*["']["'];\s*\}/g,
      "options.fieldBridge.reconcileAddress(p);");
    source = once(source,
      /fields\.some\(\s*(?:\(\s*key\s*\)|key)\s*=>\s*\$\(\s*["']business-["']\s*\+\s*key\s*\)\.value\.trim\(\)\s*!==\s*\(\s*editing\.profile\[key\]\s*\|\|\s*["']["']\s*\)\s*\)/g,
      'options.fieldBridge.dirty()');
    source = once(source,
      /fields\.some\(\s*(?:\(\s*key\s*\)|key)\s*=>\s*\$\(\s*["']business-["']\s*\+\s*key\s*\)\.value\.trim\(\)\s*\)/g,
      'options.fieldBridge.dirty()');
    source = once(source,
      /if\s*\(\s*!alive\s*\|\|\s*pending\s*\)\s*return;\s*(?=const\s+data\s*=\s*\{\s*id:\s*editing\?\.id\s*\|\|\s*draftId)/g,
      matched => matched + `
  let checked;pending=true;options.fieldBridge.validating(true);status.textContent='입력을 확인하고 있습니다.';
  try{checked=await options.fieldBridge.validate({deleted,signal});}
  catch{checked={ok:false,message:'입력을 확인할 수 없습니다. 다시 시도해 주세요.'};}
  finally{pending=false;options.fieldBridge.validating(false);}
  if(!alive||signal.aborted)return;
  if(!checked?.ok){status.textContent=checked?.message||'입력을 확인해 주세요.';return;}
  `);
    const identity = {source: 'src/server/product-ui/business-directory.mjs',
      originalControllerSha256: await hash(original), researchControllerSha256: await hash(source), markupSha256: await hash(markup),
      mutations: ['field restore', 'business record identity', 'full field values', 'selected address provenance', 'field dirty projection', 'async validation gate'],
      storageContract: 'actor-private saved-business revision; no membership or commercial grants'};
    return `export const BUSINESS_PANEL_MARKUP=${JSON.stringify(markup)};
export const BUSINESS_SOURCE_IDENTITY=${JSON.stringify(identity)};
export function bootResearchBusinessDirectory(installSession,regions,options={}){
 if(typeof options.adapter?.roleRequest!=='function'||!['restore','get','reconcileAddress','dirty','validating','validate'].every(key=>typeof options.fieldBridge?.[key]==='function'))throw TypeError('RESEARCH_BUSINESS_ADAPTER_REQUIRED');
 const document=options.root?.ownerDocument??globalThis.document,window=document.defaultView??globalThis.window;
 const AbortController=window.AbortController,CustomEvent=window.CustomEvent,crypto=window.crypto;
 const fetch=(...args)=>window.fetch(...args),confirm=message=>window.confirm(message);
 return (${source})(installSession,regions,options);
}
`;
  })();
}
