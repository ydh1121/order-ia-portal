/** The regular schema and atomic browser writer, with application-owned keys.
 * A research sync mirror implements only the existing per-mode draft contract;
 * it never issues HTTP requests or presents drafts as issued quotations. */
const MODES=Object.freeze(['simple','detailed']);
const modeOptions=mode=>mode==='simple'?{key:'order_simple_prework_0581',migrateLegacy:false}:{};
const scopedStorage=(storage,prefix)=>Object.freeze({getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,String(value)),removeItem:key=>storage.removeItem(prefix+key)});
const failure=(status,code)=>Object.assign(new Error(code),{status,code});

const defaultModules=()=>Promise.all([import('/ia/research-assets/web/storage.mjs'),import('/ia/research-assets/web/simple-quote-contract.mjs')]);
export async function createResearchQuoteRepository({window=globalThis.window,namespace='application',partition,storage={},now=Date.now,loadModule}={}){
  if(!window||!/^[-\w.:]{1,128}$/.test(namespace)||typeof now!=='function')throw TypeError('RESEARCH_QUOTE_REPOSITORY_CONTEXT');
  const crypto=storage.crypto||window.crypto;
  if(!partition){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('order.application.quote/'+namespace));partition=[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');}
  if(!/^[a-f0-9]{64}$/.test(partition))throw TypeError('RESEARCH_QUOTE_REPOSITORY_PARTITION');
  const [regular,simple]=await (loadModule?Promise.all([loadModule('web/storage.mjs'),loadModule('web/simple-quote-contract.mjs')]):defaultModules());
  if(typeof regular.createBrowserStorage!=='function'||typeof simple.blankSimpleQuote!=='function')throw TypeError('REGULAR_QUOTE_STORAGE_REQUIRED');
  const prefix='order.app.'+namespace+':',localStorage=scopedStorage(storage.localStorage||window.localStorage,prefix),sessionStorage=scopedStorage(storage.sessionStorage||window.sessionStorage,prefix);
  const storageOptions=Object.freeze({...storage,localStorage,sessionStorage,locks:storage.locks||window.navigator.locks,crypto,now,partition,keyPrefix:'order_application_quote_v1_'});
  const stores=new Map(),mirrors=new Map();let disposed=false;
  const abort=()=>new window.DOMException('Aborted','AbortError');
  const check=signal=>{if(disposed||signal?.aborted)throw abort();};
  const clone=value=>window.structuredClone?window.structuredClone(value):JSON.parse(JSON.stringify(value));
  const getStore=(mode,mirror=false)=>{
    if(!MODES.includes(mode))throw TypeError('RESEARCH_QUOTE_MODE');
    const collection=mirror?mirrors:stores;
    if(!collection.has(mode))collection.set(mode,regular.createBrowserStorage({...storageOptions,...(mirror?{keyPrefix:'order_application_quote_sync_v1_'}:{}),...modeOptions(mode)}));
    return collection.get(mode);
  };
  const meaningful=data=>Boolean(data&&(data.lines?.length||data.locations?.length||data.allocations?.length||['housing','size','pack'].some(key=>data.bodyCheckpoint?.q1Selection?.[key])||data.simpleQuote&&JSON.stringify(simple.projectSimpleQuote(data.simpleQuote))!==JSON.stringify(simple.blankSimpleQuote())));
  async function read(mode,{signal}={}){
    check(signal);const result=await getStore(mode).load();check(signal);
    return {...result,mode,source:'regular-stored-payload',schemaVersion:regular.STORAGE_SCHEMA_VERSION,hasInput:result.ok&&meaningful(result.data),data:result.ok?clone(result.data):null};
  }
  async function request(path,body,signal){
    check(signal);const match=/^\/drafts\/(simple|detailed)$/.exec(path||'');
    if(!match)throw failure(501,'RESEARCH_DRAFT_ROUTE_UNSUPPORTED');
    const mode=match[1],store=getStore(mode,true),before=await store.load();check(signal);
    if(!before.ok)throw failure(503,'RESEARCH_DRAFT_'+before.status);
    const reply=result=>({mode,revision:result.revision,data:result.status==='EMPTY'?null:clone(result.data),updatedAt:null});
    if(body===undefined||body===null)return reply(before);
    if(!body||typeof body!=='object'||Array.isArray(body)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.requestKey!=='string'||!body.data)throw failure(422,'INVALID_DRAFT');
    const result=await store.commit(body.data,{expectedRevision:body.expectedRevision,expectedToken:before.versionToken,transactionId:body.requestKey,canCommit:()=>!disposed&&!signal?.aborted});
    check(signal);
    if(!result.ok)throw failure(result.status==='CONFLICT'?409:result.status==='INVALID_DATA'?422:503,result.status==='CONFLICT'?'REVISION_CONFLICT':'RESEARCH_DRAFT_'+result.status);
    return reply(result);
  }
  async function restore(mode,bridge,{expectedRevision,expectedToken,signal,isCurrent=()=>true}={}){
    if(typeof bridge?.restore!=='function')throw TypeError('REGULAR_QUOTE_RESTORE_REQUIRED');
    const record=await read(mode,{signal});
    if(!record.ok)return record;
    if(expectedRevision!==record.revision||expectedToken!==record.versionToken)return {ok:false,status:'CONFLICT'};
    if(!record.hasInput)return {ok:false,status:'EMPTY'};
    if(!isCurrent())return {ok:false,status:'CANCELLED'};
    return bridge.restore(record.data,{isCurrent:()=>!disposed&&!signal?.aborted&&isCurrent()});
  }
  return Object.freeze({namespace,partition,storageOptions,source:'regular-stored-payload',schemaVersion:regular.STORAGE_SCHEMA_VERSION,
    read,list:options=>Promise.all(MODES.map(mode=>read(mode,options))),request,restore,
    dispose(){disposed=true;},get disposed(){return disposed;}});
}
