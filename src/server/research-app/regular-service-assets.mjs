import {quoteCommit, quoteFiles, quoteSourceHashes} from '../r3-product-sources.mjs';
import {REGULAR_IANA_REFERENCE_PROVENANCE} from './regular-iana-reference.mjs';

export const REGULAR_RESEARCH_PREFIX = '/ia/research-assets/';
const CONTACT_PATH = 'web/contact-ui.mjs';
const SOURCES = [CONTACT_PATH, 'src/engine/adapters/phone-browser.mjs',
  'src/engine/validation/phone.mjs', 'src/engine/reference/phone-rules.mjs',
  'src/engine/validation/email.mjs', 'src/engine/validation/email-dns.mjs',
  'src/engine/adapters/email-browser.mjs', 'src/engine/adapters/dns-browser.mjs',
  'src/engine/adapters/iana-browser.mjs', 'web/address-contract.mjs',
  'web/address-service.mjs', 'web/address-ui.mjs'];

async function sealedText(path) {
  if (!Object.hasOwn(quoteFiles, path)) throw Error('REGULAR_SERVICE_SOURCE_MISSING:' + path);
  const compressed = Uint8Array.from(atob(quoteFiles[path]), c => c.charCodeAt(0));
  return new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
async function sha256(text) {
  const value = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
}
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error('REGULAR_CONTACT_SOURCE_CHANGED:' + before.slice(0, 65));
  return source.replace(before, after);
}
let identityPromise, modulePromise, presentationPromise;

/** Reuse the regular phone editor's actual layout and tokens wherever the
 * same controller is mounted inside the shared 64px floating input. */
export function regularContactPresentationCss() {
  return presentationPromise ??= (async () => {
    const path='web/styles.css',source=await sealedText(path),host='.ds .field.is-floating .input-shell';
    const rules=source.split('\n').filter(line=>line.startsWith('.ui-phone'));
    if(rules.length!==8||rules.some(rule=>!/^\.ui-phone[^{}]+\{[^{}]+\}$/.test(rule)))throw Error('REGULAR_PHONE_PRESENTATION_SOURCE_CHANGED');
    const tokens=['--ui-border','--ui-control-radius','--ui-control-height','--ui-danger','--ui-input-focus','--ui-phone-hyphen-size','--text-primary','--text-secondary','--type-control','--pale'].map(name=>{
      const matches=[...source.matchAll(new RegExp(name+':([^;}{]+)','g'))];if(matches.length!==1)throw Error('REGULAR_PHONE_PRESENTATION_TOKEN_CHANGED:'+name);return name+':'+matches[0][1];
    });
    const scoped=rules.map(rule=>{const index=rule.indexOf('{');return rule.slice(0,index).split(',').map(selector=>host+' '+selector).join(',')+rule.slice(index);}).join('\n');
    return '/* Regular phone layout: '+path+'; sealed SHA256 '+await sha256(source)+' */\n'+host+':has(>.ui-phone-shell){'+tokens.join(';')+'}\n'+scoped+'\n'+
      // The retained common input supplies its label, surface and focus ring.
      // Adapt the inner editor to that box without replacing any input node.
      host+'>.ui-phone-shell{box-sizing:border-box;height:100%;min-height:0;padding:25px 14px 8px;border:0;border-radius:0;background:transparent}\n'+
      host+'>.ui-phone-shell:focus-within{border:0;outline:0;box-shadow:none;background:transparent}\n'+
      host+'>.ui-phone-shell>.ui-phone-part,'+host+'>.ui-phone-shell>.ui-phone-part:focus-visible{height:100%;min-height:0;padding:0 .125rem}\n';
  })();
}
export function regularServiceSourceIdentity() {
  return identityPromise ??= Promise.all(SOURCES.map(async path => ({path,
    originalSha256: quoteSourceHashes[path], servedSealedSha256: await sha256(await sealedText(path))
  }))).then(sources => ({repository: 'ydh1121/order', commit: quoteCommit, sources,
    ianaReference: REGULAR_IANA_REFERENCE_PROVENANCE,
    contactAdaptation: 'Scoped environment and lifecycle only; sealed contact source includes its existing IANA URL substitution.',
    ownershipVerified: false, mailboxVerified: false}));
}

/** Keep the shipped input, IME, suggestion, proof and retry bodies. The regular
 * route is untouched. This separate ESM factory gives those bodies an explicit
 * environment and lets their owner remove listeners when a research form exits. */
export function regularContactModuleSource() {
  return modulePromise ??= (async () => {
    const original = await sealedText(CONTACT_PATH), identity = await regularServiceSourceIdentity();
    const importLines = original.split('\n').filter(line => line.startsWith('import '));
    let body = original.split('\n').filter(line => !line.startsWith('import ')).join('\n');
    const imports = importLines.map(line => line.replace("from '../", "from '" + REGULAR_RESEARCH_PREFIX)
      .replace('{createOrderPhoneAdapter}', '{createOrderPhoneAdapter as originalPhoneAdapter}')
      .replace('{createBrowserIanaProvider,browserIanaFreshness}', '{createBrowserIanaProvider as originalIanaProvider,browserIanaFreshness}')
      .replace('{createBrowserEmailService}', '{createBrowserEmailService as originalEmailService}')).join('\n');
    for (const name of ['OrderPhone', 'OrderEmail', 'OrderEmailDomain', 'OrderEmailUI'])
      body = replaceOnce(body, 'window.' + name + '=', 'window.' + name + '=' + name + '=');
    // Event registration is bookkeeping; every event handler remains the
    // original handler. No input validator or editing rule is replaced here.
    body = body.replaceAll('input.addEventListener(', 'listen(input,')
      .replaceAll('list.addEventListener(', 'listen(list,');
    const subscription = body.split('\n').find(line => line.trimStart().startsWith('OrderEmailDomain.subscribe('));
    if (!subscription) throw Error('REGULAR_CONTACT_SUBSCRIPTION_CHANGED');
    body = replaceOnce(body, subscription, subscription.replace('OrderEmailDomain.subscribe(', 'trackSubscription(OrderEmailDomain.subscribe(').replace(/\);$/, '));'));
    body = replaceOnce(body, 'return {mount,instance:input=>owners.get(input)};',
      'return {mount,instance:input=>owners.get(input),forget:input=>owners.delete(input)};');
    return `${imports}\nexport const REGULAR_SOURCE_PROVENANCE=${JSON.stringify(identity)};
export function createRegularContactAdapters(environment={}) {
 const document=environment.document??globalThis.document;
 if(!document)throw TypeError('REGULAR_CONTACT_DOCUMENT_REQUIRED');
 const now=environment.now??globalThis.Date.now;
 const Date=class extends globalThis.Date {constructor(...args){super(...(args.length?args:[now()]));}static now(){return now();}};
 const location={origin:environment.origin??globalThis.location?.origin};
 const CustomEvent=document.defaultView?.CustomEvent??globalThis.CustomEvent;
 const window={};let OrderPhone,OrderEmail,OrderEmailDomain,OrderEmailUI;
 const fetcher=environment.fetcher??globalThis.fetch;
 const fetch=(url,init)=>fetcher(new URL(url=== '/ia/r3-product/assets/iana-reference.json'?'${REGULAR_RESEARCH_PREFIX}assets/iana-reference.json':url,location.origin).href,init);
 const ownedProviders=new Set(),ownedServices=new Set(),lives=new Map(),phoneOwners=new WeakMap();let mounting=null,eventOwner=null,closed=false;
 const setTimeout=(callback,delay,...args)=>{const owner=eventOwner;let timer;timer=globalThis.setTimeout(()=>{owner?.timers.delete(timer);if(!owner?.disposed)callback(...args);},delay);owner?.timers.add(timer);return timer;};
 const clearTimeout=timer=>globalThis.clearTimeout(timer);
 const createOrderPhoneAdapter=()=>{
  const base=originalPhoneAdapter();
  return Object.freeze({...base,mount(input){if(closed)throw Error('REGULAR_CONTACT_CLOSED');if(!phoneOwners.has(input))phoneOwners.set(input,originalPhoneAdapter().mount(input));return phoneOwners.get(input);},
   instance:input=>phoneOwners.get(input),get:input=>phoneOwners.get(input)?.get()??input?.value??'',
   set(input,value){if(closed)return false;const control=phoneOwners.get(input);if(control)control.set(value);else if(input)input.value=String(value??'');}});
 };
 const createBrowserIanaProvider=options=>{
  const supplied=environment.referenceProvider;
  const provider=supplied?{get:options=>supplied.get(options),inspect:()=>supplied.inspect?.()??{source:'INJECTED_REFERENCE',lastError:null}}:originalIanaProvider({...options,now,crypto:environment.crypto??globalThis.crypto});
  if(!environment.referenceProvider)ownedProviders.add(provider);return provider;
 };
 const createBrowserEmailService=options=>{
  const service=originalEmailService({...environment.dns,...options,fetcher,now});ownedServices.add(service);return service;
 };
 function listen(target,type,callback,options){const owner=mounting,wrapped=function(...args){const previous=eventOwner;eventOwner=owner;try{if(!owner?.disposed)return callback.apply(this,args);}finally{eventOwner=previous;}};target.addEventListener(type,wrapped,options);owner?.cleanups.push(()=>target.removeEventListener(type,wrapped,options));}
 function trackSubscription(unsubscribe){mounting?.cleanups.push(unsubscribe);return unsubscribe;}
${body}
 return Object.freeze({email:OrderEmail,domain:OrderEmailDomain,phone:OrderPhone,emailInstance:input=>OrderEmailUI.instance(input),forgetPhone:input=>phoneOwners.delete(input),
  mountEmail(input){
   if(closed)throw Error('REGULAR_CONTACT_CLOSED');if(lives.has(input))return lives.get(input).api;
   const focused=document.activeElement===input;
   const selection=focused&&typeof input.selectionStart==='number'&&typeof input.selectionEnd==='number'?{start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection}:null;
   const life={cleanups:[],timers:new Set(),disposed:false,api:null};mounting=life;
   try{
    life.api=OrderEmailUI.mount(input);lives.set(input,life);
    // The original controller wraps its input by removing and reattaching it.
    // An auth sheet may already own focus when this late adapter mounts.
    const active=document.activeElement;
    if(focused&&input.isConnected&&(!active||active===input||active===document.body||active===document.documentElement)){
     input.focus({preventScroll:true});
     if(document.activeElement===input&&selection)input.setSelectionRange(selection.start,selection.end,selection.direction);
    }
    return life.api;
   }
   finally{mounting=null;}
  },
  suspendEmail(input){const life=lives.get(input);if(!life)return;life.api.cancel();for(const timer of life.timers)clearTimeout(timer);for(const cleanup of life.cleanups)cleanup();life.cleanups=[];life.timers.clear();},
  disposeEmail(input){const life=lives.get(input);if(!life)return;life.disposed=true;life.api.cancel();for(const timer of life.timers)clearTimeout(timer);for(const cleanup of life.cleanups)cleanup();lives.delete(input);OrderEmailUI.forget(input);},
  releaseWithin(root){let released=0;for(const input of [...lives.keys()])if(root===input||root.contains(input)){this.disposeEmail(input);released++;}for(const input of root.querySelectorAll?.('input')??[])phoneOwners.delete(input);return released;},
  inspect(){return {mountedEmails:lives.size,closed};},
  dispose(){if(closed)return;closed=true;for(const input of [...lives.keys()])this.disposeEmail(input);OrderEmailDomain.clearCache();for(const service of ownedServices)service.close();for(const provider of ownedProviders)provider.close();}
 });
}
`;
  })();
}
