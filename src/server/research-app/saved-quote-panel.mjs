/** Current regular drafts, one per quote mode. Issued quotations and a version
 * history are separate domain features and are not invented by this panel. */
export function mountResearchSavedQuotePanel({container,repository,onOpenDraft,signal}={}){
  if(!container?.ownerDocument||typeof repository?.list!=='function'||typeof onOpenDraft!=='function')throw TypeError('RESEARCH_SAVED_QUOTE_CONTEXT');
  const document=container.ownerDocument,window=document.defaultView,controller=new window.AbortController();
  const root=document.createElement('section');root.className='product-panel-body research-saved-quote-panel';root.dataset.draftSource='regular-stored-payload';
  const title=document.createElement('h2');title.textContent='최근 작성 견적';
  const description=document.createElement('p');description.className='muted';description.textContent='간편 견적과 상세 견적에 마지막으로 저장한 내용을 이어서 작성할 수 있어요.';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const list=document.createElement('div');list.className='research-saved-quote-list';
  const retry=document.createElement('button');retry.type='button';retry.className='btn secondary';retry.textContent='다시 불러오기';retry.hidden=true;
  root.append(title,description,status,list,retry);
  let disposed=false,busy=false,revision=0;
  const alive=()=>!disposed&&!controller.signal.aborted&&root.parentNode===container;
  function dispose(){if(disposed)return;disposed=true;revision++;controller.abort();signal?.removeEventListener('abort',dispose);root.remove();}
  dispose.dirty=()=>false;dispose.pending=()=>busy;dispose.inspect=()=>({disposed,pending:busy,source:repository.source,rows:list.children.length});
  if(signal?.aborted){disposed=true;dispose.ready=Promise.resolve(false);return dispose;}
  signal?.addEventListener('abort',dispose,{once:true});container.replaceChildren(root);
  async function refresh(){
    const current=++revision;status.textContent='저장한 내용을 불러오고 있어요.';retry.hidden=true;
    try{
      const records=await repository.list({signal:controller.signal});if(!alive()||current!==revision)return false;
      list.replaceChildren();status.textContent=records.some(record=>record.hasInput)?'':'저장된 견적이 아직 없어요. 새 견적을 시작해 보세요.';
      for(const record of records){
        const card=document.createElement('article');card.className='ops-panel';card.dataset.quoteDraftMode=record.mode;
        const name=document.createElement('h3');name.textContent=record.mode==='simple'?'간편 견적':'상세 견적';
        const detail=document.createElement('p');detail.className='muted';
        const count=record.data?.lines?.length||0,sites=record.data?.locations?.length||0;
        detail.textContent=!record.ok?'저장한 내용을 읽지 못했어요. 기존 입력은 유지됩니다.':!record.hasInput?'아직 작성한 내용이 없어요.':count?['품목 '+count+'개',sites?'사업장 '+sites+'곳':null].filter(Boolean).join(' · '):'작성 중인 입력이 저장돼 있어요.';
        const open=document.createElement('button');open.type='button';open.className='btn primary';open.dataset.openQuoteDraft=record.mode;open.textContent=record.hasInput?'이어서 작성하기':'새로 시작하기';open.disabled=!record.ok;
        open.addEventListener('click',async()=>{
          if(!alive()||busy)return;busy=true;for(const button of list.querySelectorAll('button'))button.disabled=true;
          try{const result=await onOpenDraft(record);if(!alive())return;if(result?.ok===false){status.textContent=result.status==='CONFLICT'?'저장한 내용이 바뀌었어요. 다시 불러온 뒤 확인해 주세요.':result.status==='EDIT_PENDING'?'작성 중인 입력을 먼저 저장하거나 취소해 주세요.':'견적을 열지 못했어요. 현재 입력은 유지됩니다.';retry.hidden=false;}}
          catch(error){if(alive()&&error.name!=='AbortError'){status.textContent='견적을 열지 못했어요. 다시 시도해 주세요.';retry.hidden=false;}}
          finally{busy=false;if(alive())for(const button of list.querySelectorAll('button'))button.disabled=button.closest('[data-quote-draft-mode]').dataset.unavailable==='true';}
        },{signal:controller.signal});
        card.dataset.unavailable=String(!record.ok);card.append(name,detail,open);list.append(card);if(!record.ok)retry.hidden=false;
      }
      return true;
    }catch(error){if(alive()&&current===revision&&error.name!=='AbortError'){status.textContent='저장한 내용을 불러오지 못했어요. 다시 시도해 주세요.';retry.hidden=false;}return false;}
  }
  retry.addEventListener('click',()=>{if(!busy)void refresh();},{signal:controller.signal});
  dispose.refresh=refresh;dispose.ready=refresh();return dispose;
}
