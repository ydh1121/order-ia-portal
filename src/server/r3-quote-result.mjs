import {mountQuoteResult,quoteResultScreenCss} from './order-engine/browser/quote-result-screen.mjs';
import {browserFunction} from './browser-source.mjs';
import * as productSources from './r3-product-sources.mjs';
// Only the verified buyer response may provide amounts. Pricing drafts, local form
// entries, issuer diagnostics and practice totals never participate in this view.
export function projectBuyerResult(snapshot, now = Date.now()) {
  if (!snapshot || typeof snapshot.id !== 'string') return {state:'unavailable'};
  const end = Date.parse(snapshot.expiresAt);
  if (!Number.isFinite(end)) return {state:'unavailable'};
  if (snapshot.status==='EXPIRED' || end<=now) return {state:'expired',end};
  const response=snapshot.response;
  if (snapshot.status!=='ISSUED' || response?.status!=='OK' || response.completion!=='COMPLETE' ||
      response.quotes?.length!==1) return {state:'unavailable'};
  const quote=response.quotes[0], total=quote?.total, issued=Date.parse(snapshot.issuedAt);
  function exact(value,signed=false) {
    if (!value || !Number.isInteger(value.scale) || value.scale<0 || value.scale>12 ||
        typeof value.minorUnits!=='string' || !/^-?\d{1,100}$/.test(value.minorUnits)) return null;
    const n=BigInt(value.minorUnits);
    if (!signed && n<0n) return null;
    const digits=(n<0n?-n:n).toString().padStart(value.scale+1,'0');
    const decimal=(n<0n?'-':'')+(value.scale?digits.slice(0,-value.scale)+'.'+digits.slice(-value.scale):digits);
    return decimal===value.decimal?n:null;
  }
  const proposed=exact(total);
  if (quote.currency!=='KRW' || proposed===null || !Number.isFinite(issued) || issued>=end) return {state:'unavailable'};
  const base={state:'offer',proposed:total.decimal,issued,end};
  const p=snapshot.presentation;
  for(const field of ['quantityLabel','productLabel'])if(typeof p?.[field]==='string'&&p[field].length<=100)base[field]=p[field];
  if (quote.comparisonEligibility!=='ELIGIBLE') return base;
  const current=quote.comparison?.current, difference=quote.comparison?.difference;
  const original=exact(current), delta=exact(difference,true);
  if (original===null || delta===null || current.scale!==total.scale ||
      difference.scale!==total.scale || delta!==original-proposed) return base;
  const greatest=original>proposed?original:proposed;
  const ratio=value=>greatest?Number(value*1000n/greatest)/10:0;
  const absolute=delta<0n?-delta:delta;
  const percent=den=>{if(!den)return undefined;const n=(absolute*10000n+den/2n)/den;return String(n/100n)+'.'+String(n%100n).padStart(2,'0');};
  const shown={savingRate:percent(original),currentPremium:percent(proposed)};
  if(Number.isSafeInteger(p?.annualCount)&&p.annualCount>0&&typeof p.annualSaving==='string'&&/^\d+(?:\.\d+)?$/.test(p.annualSaving)){
    shown.annualCount=p.annualCount;shown.annualSaving=p.annualSaving;
  }
  return {...base,...shown,state:delta>0n?'saving':delta<0n?'current-lower':'equal',
    current:current.decimal,difference:difference.decimal.replace(/^-/,''),
    currentRatio:ratio(original),proposedRatio:ratio(proposed)};
}


// Keep the quote id in the authenticated controller, outside the renderer and the exported QA data.
function createBuyerResult(host,project,readDetail,recompare,mount) {
  let id=null;
  let guide=true;
  const guideKey='order_result_graph_guide_v1';
  try{guide=localStorage.getItem(guideKey)!=='seen';}catch{}
  const view=mount(host,{
    guide,onGuideSeen(){try{localStorage.setItem(guideKey,'seen');}catch{}},
    async onDetail(){return project(await readDetail(id));},
    onAction(action){
      if((action==='consult'||action==='delivery')&&id){
        location.assign('/ia?'+new URLSearchParams({view:'roles-r3',menu:action,quote:id}));
      }else if(action==='verify')location.assign('/ia?view=roles-r3&menu=business');
      else recompare(action==='new'?'new':'same',id);
    }
  });
  return {
    clear(){id=null;view.clear();},gate(){id=null;view.gate();},empty(){id=null;view.empty();},
    show(snapshot,selected=null){id=snapshot?.id||null;view.show(project(snapshot),selected);}
  };
}
// The non-module controller receives the same verified brand dependency closure
// as the normal product's ESM renderer. It does not infer a login from a quote
// state, nor install a replacement drawing or a second global brand runtime.
const brandRuntime=typeof productSources.productBrandRuntime==='string'?productSources.productBrandRuntime:'throw new Error("PRODUCT_BRAND_FACTORY_NOT_SEALED");';
export const buyerResultClient='((mount,controller)=>{'+brandRuntime+'\nreturn (...args)=>controller(...args,(host,options)=>mount(host,{...options,brandFactory:OrderProductBrand}));})('+browserFunction(mountQuoteResult)+','+browserFunction(createBuyerResult)+')';
export const buyerResultCss=quoteResultScreenCss;
