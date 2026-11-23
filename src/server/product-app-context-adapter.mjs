import {browserFunction} from './browser-source.mjs';
import {installProductAdapter} from './product-app-adapter.mjs';

// Extend the sealed product adapter at installation time; keep its transport,
// profile fields, permission checks and ordinary panel renderer as the owners.
function installWithAccountContext(installBase, context, options={}) {
  const transport=options.fetch||((...args)=>fetch(...args));
  const product=context.endpoints?.product||'/api/ia/product';
  let revision=null, currentAccount=null, loading=null;
  async function scopedFetch(input,settings={}) {
    const readingAccount=input===product+'/account'&&!settings.body;
    if(settings.body&&input!==product+'/account-context'&&context.actor?.authenticated){
      if(revision===null){
        loading??=scopedFetch(product+'/account',{credentials:'same-origin',cache:'no-store',redirect:'manual'}).finally(()=>{loading=null;});
        const account=await loading;
        if(!account.ok)throw Error('ACCOUNT_CONTEXT_UNAVAILABLE');
      }
      if(revision)settings={...settings,headers:{...settings.headers,'X-Order-Context-Revision':String(revision)}};
    }
    const response=await transport(input,settings);
    if(readingAccount&&response.ok){
      // The real response body belongs to the original adapter. The review
      // transport returns a fresh data copy on every json() call.
      const data=await (response.clone?.()||response).json();
      currentAccount=data;
      if(revision===null)revision=Number.isSafeInteger(data.context?.revision)?data.context.revision:0;
    }
    return response;
  }
  const adapter=installBase(context,{...options,fetch:scopedFetch});
  const baseMessage=adapter.message;
  adapter.message=error=>error?.message==='ACCOUNT_CONTEXT_CHANGED'?
    '다른 창에서 작업할 사업장을 변경했어요. 입력을 보관한 뒤 새로고침해 주세요.':baseMessage(error);
  adapter.mountAccountSwitcher=(container,account,signal,beforeSwitch=()=>true)=>{
    const state=account?.context;
    if(!account?.capabilities?.accountSwitch||!Array.isArray(state?.options)||!state.options.length)return;
    const doc=container.ownerDocument;
    const section=doc.createElement('section'),label=doc.createElement('label'),select=doc.createElement('select');
    const status=doc.createElement('p');status.setAttribute('role','status');label.textContent='작업할 조직·사업장';label.append(select);
    const placeholder=doc.createElement('option');placeholder.value='';placeholder.textContent='사업장을 선택해 주세요';placeholder.disabled=true;select.append(placeholder);
    for(const [index,item] of state.options.entries()){
      const option=doc.createElement('option');option.textContent=[item.orgId,item.siteId].filter(Boolean).join(' · ');option.value=String(index);select.append(option);
    }
    const index=state.options.findIndex(item=>item.orgId===state.selected?.orgId&&item.siteId===state.selected?.siteId);
    select.value=index<0?'':String(index);
    const holder=doc.createElement('div');holder.innerHTML=window.QAUI.button('계정 전환','switch-account-context','secondary');
    const change=holder.firstElementChild;change.type='button';change.disabled=true;
    section.append(label,change,status);container.prepend(section);
    let retry=null;
    select.addEventListener('change',()=>{change.disabled=select.value===''||Number(select.value)===index;retry=null;});
    change.addEventListener('click',async()=>{
      const chosen=state.options[Number(select.value)];if(!chosen||change.disabled||signal?.aborted)return;
      if(!beforeSwitch()){status.textContent='편집 중인 내용을 먼저 저장하거나 닫아 주세요.';return;}
      change.disabled=true;select.disabled=true;status.textContent='사업장을 변경하고 있어요.';
      retry??={action:'switch',expectedRevision:state.revision,requestKey:crypto.randomUUID(),orgId:chosen.orgId,siteId:chosen.siteId};
      try{
        const result=await adapter.request('/account-context',retry,signal);
        if(signal?.aborted)return;
        if(result.selected?.orgId!==chosen.orgId||result.selected?.siteId!==chosen.siteId||result.revision!==retry.expectedRevision+1)throw Error('ACCOUNT_CONTEXT_CHANGED');
        adapter.selectedPurchaseId=null;
        // All controls in the old document retain the revision they edited.
        status.textContent='사업장을 변경했어요.';location.reload();
      }catch(error){if(!signal?.aborted){status.textContent=adapter.message(error);select.disabled=false;change.disabled=false;}}
    });
  };
  const brand=window.ORDER_BRAND_ACCOUNT_CONTEXT,render=brand.renderPanel;
  brand.renderPanel=async args=>{
    const result=await render(args);
    if(args.id==='profile.account'&&!args.signal?.aborted){
      const inputs=[...args.container.querySelectorAll('input:not([readonly])')],initial=inputs.map(input=>input.value);
      adapter.mountAccountSwitcher(args.container,currentAccount,args.signal,()=>inputs.every((input,i)=>input.value===initial[i]));
    }
    return result;
  };
  return adapter;
}

export function productAccountAdapterSource() {
  return '('+browserFunction(installWithAccountContext)+').bind(null,'+browserFunction(installProductAdapter)+')';
}

// The original product page renderer embeds one adapter in its nonce-bearing
// bootstrap. Replace just that installation expression before serving the page.
export function attachProductAccountContext(html) {
  const original=browserFunction(installProductAdapter),index=html.indexOf(original);
  if(index<0||html.indexOf(original,index+original.length)!==-1)throw Error('PRODUCT_ADAPTER_BOOTSTRAP_CHANGED');
  return html.slice(0,index)+productAccountAdapterSource()+html.slice(index+original.length);
}
