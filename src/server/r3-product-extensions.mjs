import {browserFunction} from './browser-source.mjs';
import {createSavedBusinessBridge,mountSavedBusinessPicker} from './r3-saved-business-client.mjs';
import {createQuoteDraftSync,mountQuoteDraftSync} from './r3-quote-draft-client.mjs';
import {extendBrandAccountSource} from './r3-brand-account-extension.mjs';

export const quoteExtension='r1-production-drafts-20261120-v2';
// Match one explicit factory export in the pinned product source. A changed base
// fails closed instead of silently attaching to an unreviewed implementation.
export function extendQuoteSource(path,source){
 const brand=extendBrandAccountSource(path,source);if(brand!==null)return brand;
 if(path==='web/main.mjs')return source+`\n(${browserFunction(mountSavedBusinessPicker)})(app);\n(${browserFunction(mountQuoteDraftSync)})(app,${browserFunction(createQuoteDraftSync)});\n`;
 if(path==='web/quote-mode-switch.mjs'){
  const marker='export function bindQuoteModeSwitch({simple,dialog,trigger,shell,source,guard,saveCurrent,detailedStore,navigate,preference}){';
  if(source.split(marker).length!==2)throw Error('QUOTE_MODE_EXTENSION_SOURCE_MISMATCH');
  return source.replace(marker,marker+`\n const localSaveCurrent=saveCurrent,localDetailedStore=detailedStore;\n saveCurrent=async active=>{const saved=await localSaveCurrent(active);if(!saved.ok||!active())return saved;return window.ORDER_QUOTE_DRAFT_SYNC?window.ORDER_QUOTE_DRAFT_SYNC.flush({isCurrent:active}):saved;};\n detailedStore=()=>{const local=localDetailedStore();return window.ORDER_QUOTE_DRAFT_SYNC?window.ORDER_QUOTE_DRAFT_SYNC.destinationStore(local):local;};\n`);
 }
 if(path!=='web/app.mjs')return source;
 const replacements=[
  ["const privateProduct=['simple','detailed'].includes(document.documentElement.dataset.r3QuoteMode);","const privateProduct=['simple','detailed'].includes(document.documentElement.dataset.r3QuoteMode)&&(window.ORDER_APP_CONTEXT?.authenticated??window.ORDER_APP_CONTEXT?.actor?.authenticated??true);"],
  ["fetch('/api/ia/r3-price/quote?id='+encodeURIComponent(id),","fetch((window.ORDER_APP_CONTEXT?.endpoints?.price||'/api/ia/r3-price')+'/quote?id='+encodeURIComponent(id),"],
  ["const target=new URL('/ia',location.origin);","const target=scopedQuoteURL('/ia');"],
  ["location.assign('/ia?view=pricing-r3&quote='+encodeURIComponent(issuedId())+'#quote');return;","const target=scopedQuoteURL('/ia');target.searchParams.set('view','pricing-r3');target.searchParams.set('quote',issuedId());target.hash='quote';location.assign(target.href);return;"]
 ];
 for(const [before,after] of replacements){if(source.split(before).length!==2)throw Error('QUOTE_CONTEXT_EXTENSION_SOURCE_MISMATCH');source=source.replace(before,after);}

 const marker='return Object.freeze({regularBridge:window.OrderRegularQ4Bridge,quoteService,simpleReview:window.OrderSimpleQuoteReview,quoteDocument,connectQ4';
 if(source.split(marker).length!==2)throw Error('QUOTE_EXTENSION_SOURCE_MISMATCH');
 const adapter=`function scopedQuoteURL(path){const target=new URL(path,location.origin),context=window.ORDER_APP_CONTEXT;if(context?.mode==='lab'&&context.runId){target.searchParams.set('labRun',context.runId);target.searchParams.set('persona',context.persona);if(context.documentId)target.searchParams.set('qaDocument',context.documentId);}return target;}
const quoteDraftBridge=Object.freeze({
 snapshot:()=>projectStoredPayload(bodyCheckpoint()),project:projectStoredPayload,
 hasInput:value=>!!value.simpleQuote&&JSON.stringify(projectSimpleQuote(value.simpleQuote))!==JSON.stringify(blankSimpleQuote()),
 canSave:()=>storageReady&&!storagePending&&!storageFailure&&!siteEditing&&!skuDraftActive()&&!deliveryDraft&&!q4AssignmentDraft&&!simpleUI?.hasDraft()&&!document.querySelector('dialog[open]'),
 async restore(value,{isCurrent=()=>true}={}){
  if(!isCurrent()||document.querySelector('dialog[open]')||!guardPendingEdits('server-draft-load'))return {ok:false,status:'EDIT_PENDING'};
  const before=checkpointSignature(bodyCheckpoint()),candidate=ensureMigration(projectStoredPayload(value));
  const result=await save(candidate,{errorId:'form-error',canCommit:()=>isCurrent()&&checkpointSignature(bodyCheckpoint())===before});
  if(result.ok){editing=empty();editorMode=S.lines.length?null:'initial';if(editorMode==='initial'&&S.bodyCheckpoint)editing={...empty(),...S.bodyCheckpoint.q1Selection};simpleUI?.resetLocal();render();}
  return result;
 }
});
const originalQuoteSave=save;save=(...args)=>originalQuoteSave(...args).then(result=>{if(result.ok)document.dispatchEvent(new CustomEvent('order-quote-committed'));return result;});
const savedBusinessBridge=(${browserFunction(createSavedBusinessBridge)})({getState:()=>S,guard:guardPendingEdits,save,render,blankSite,addressFields,addressStatus,projectSimpleQuote,resetSimple:()=>simpleUI?.resetLocal(),simpleMode,regionSelection});\n`;
 return `import {regionSelection} from './region-reference.mjs';\n`+source.replace(marker,adapter+marker.replace('regularBridge:','quoteDraftBridge,savedBusinessBridge,regularBridge:'));
}
