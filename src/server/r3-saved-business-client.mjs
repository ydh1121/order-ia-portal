// This adapter is serialized into the existing quote application. The existing
// app remains the sole owner of its transactional draft and validation gates.
export function createSavedBusinessBridge(deps){
 const {getState,guard,save,render,blankSite,addressFields,addressStatus,projectSimpleQuote,resetSimple,regionSelection}=deps;
 return Object.freeze({
  async load(records,{isCurrent=()=>true}={}){
   if(!Array.isArray(records)||records.length<1||records.length>200||new Set(records.map(x=>x.id)).size!==records.length||records.some(x=>!x?.profile||typeof x.id!=='string'))return {ok:false,status:'INVALID_SELECTION'};
   if(!isCurrent()||!guard('saved-business-load'))return {ok:false,status:'EDIT_PENDING'};
   const original=JSON.stringify(getState()),candidate=structuredClone(getState());
   if(deps.simpleMode){
    const rows=records.map(row=>{const raw=row.profile.regionSelection,s=raw&&regionSelection(raw.rootCode,raw.leafCode);return {id:'saved-'+row.id,region:s?[s.rootLabel,s.leafLabel].filter(Boolean).join(' '):row.profile.region||'',regionSelection:s||null};});
    const value={...candidate.simpleQuote,siteCount:String(rows.length),siteCountConfirmed:true,legacySiteCount:null,regionsDiffer:rows.length>1,sharedRegion:rows[0].region,sharedRegionSelection:rows[0].regionSelection,sites:rows};
    candidate.simpleQuote=projectSimpleQuote(value);
   }else{
    for(const row of records){
     const id='saved-'+row.id,index=candidate.locations.findIndex(site=>site.id===id);
     const p=row.profile,site={...(index<0?blankSite():candidate.locations[index]),id,name:p.name,...addressFields(p),contactPhone:p.contactPhone||'',storePhone:p.storePhone||'',email:p.email||''};
     site.addressState=addressStatus(site).state;site.basicInfoDraft=true;
     if(index<0)candidate.locations.push(site);else candidate.locations[index]=site;
    }
   }
   const result=await save(candidate,{errorId:'err-q3',canCommit:()=>isCurrent()&&JSON.stringify(getState())===original});
   if(result.ok){if(deps.simpleMode)resetSimple();render();}
   return result;
  }
 });
}

export function mountSavedBusinessPicker(app){
 const anchor=document.getElementById('q3-sites');if(!anchor||!app.savedBusinessBridge)return;
 const row=document.createElement('div');row.className='add-row';row.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin:12px 0';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='ui-copy-action';trigger.textContent='저장된 사업장 불러오기';
 const manage=document.createElement('a');manage.className='ui-copy-action';manage.href='/ia?view=businesses-r3';manage.target='_blank';manage.rel='noopener noreferrer';manage.textContent='사업장 관리';
 row.append(trigger,manage);anchor.before(row);
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','saved-business-title');dialog.style.cssText='border:0;border-radius:22px;padding:24px;width:min(520px,calc(100vw - 32px));max-height:80dvh;box-sizing:border-box;box-shadow:0 20px 70px #0003';
 const title=document.createElement('h2');title.id='saved-business-title';title.textContent='저장된 사업장';
 const list=document.createElement('div');list.style.cssText='display:grid;gap:10px;max-height:45dvh;overflow:auto';
 const status=document.createElement('p');status.setAttribute('role','status');
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:12px;justify-content:flex-end;margin-top:18px';
 const close=document.createElement('button');close.type='button';close.className='ui-copy-action';close.textContent='취소';
 const apply=document.createElement('button');apply.type='button';apply.className='ui-copy-action';apply.textContent='불러오기';
 actions.append(close,apply);dialog.append(title,list,status,actions);document.body.append(dialog);
 let records=[],pending=false,generation=0;
 const dismiss=()=>{generation++;dialog.close();trigger.focus();};close.onclick=dismiss;dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
 trigger.onclick=async()=>{
  const current=++generation;records=[];list.replaceChildren();status.textContent='사업장을 불러오고 있습니다.';apply.disabled=true;dialog.showModal();
  try{const response=await fetch('/api/ia/r3-role/businesses',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error(response.status===401||response.status===403?'AUTH':'LOAD');const data=await response.json();if(current!==generation||!dialog.open)return;records=data.businesses;
   for(const record of records){const label=document.createElement('label');label.style.cssText='display:flex;gap:12px;align-items:start;padding:14px;border:1px solid #ddd;border-radius:12px';const check=document.createElement('input');check.type='checkbox';check.value=record.id;const copy=document.createElement('span');const name=document.createElement('strong');name.textContent=record.profile.name;const address=document.createElement('span');address.style.display='block';address.textContent=[record.profile.road,record.profile.detail].filter(Boolean).join(' ')||record.profile.region||'소재지 미입력';copy.append(name,address);label.append(check,copy);list.append(label);}
   status.textContent=records.length?(document.documentElement.dataset.r3QuoteMode==='simple'?'선택한 사업장의 수와 지역으로 바뀝니다. 기존 주문 방식과 희망일은 유지됩니다.':'견적에 사용할 사업장을 선택해 주세요. 이미 불러온 사업장은 최신 정보로 갱신하며, 납품 수량과 일정은 유지됩니다.'):'저장된 사업장이 없습니다. 사업장 관리에서 먼저 등록해 주세요.';apply.disabled=!records.length;
  }catch(error){if(current===generation)status.textContent=error.message==='AUTH'?'로그인 후 다시 불러와 주세요.':'사업장을 불러오지 못했습니다. 닫고 다시 시도해 주세요.';}
 };
 apply.onclick=async()=>{if(pending)return;const ids=new Set([...list.querySelectorAll('input:checked')].map(x=>x.value));if(!ids.size){status.textContent='사업장을 하나 이상 선택해 주세요.';return;}pending=true;apply.disabled=true;trigger.disabled=true;const current=generation,isCurrent=()=>current===generation&&dialog.open;
  try{const result=await app.savedBusinessBridge.load(records.filter(x=>ids.has(x.id)),{isCurrent});if(!isCurrent())return;if(result.ok)dismiss();else status.textContent=result.status==='EDIT_PENDING'?'작성 중인 입력을 저장하거나 취소한 후 다시 불러와 주세요.':'입력을 반영하지 못했습니다. 기존 입력을 확인한 후 다시 시도해 주세요.';}catch{if(isCurrent())status.textContent='입력을 반영하지 못했습니다. 다시 시도해 주세요.';}finally{pending=false;apply.disabled=false;trigger.disabled=false;}
 };
}
