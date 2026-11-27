// This adapter is serialized into the existing quote application. The existing
// app remains the sole owner of its transactional draft and validation gates.
export function createSavedBusinessBridge(deps){
 const {getState,guard,save,render,blankSite,addressFields,addressStatus,projectSimpleQuote,resetSimple,regionSelection}=deps;
 return Object.freeze({
  canOpen:()=>guard('saved-business-open'),
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
 const add=document.getElementById('add-site'),row=add?.closest('.add-row');
 if(!row)return;
 row.classList.add('r3-saved-business-actions');
 add.dataset.orderNewBusiness='';add.textContent='신규 사업장 추가';
 const shell=window.OrderModalShell,copy=window.OrderCopyDialog;
 if(!app.savedBusinessBridge||!shell||!copy||(window.ORDER_APP_CONTEXT?.authenticated??window.ORDER_APP_CONTEXT?.actor?.authenticated??true)===false)return;
 const endpoint=(window.ORDER_APP_CONTEXT?.endpoints?.role||'/api/ia/r3-role')+'/businesses';
 const trigger=document.createElement('button');trigger.type='button';trigger.dataset.orderSavedBusinessOpen='';trigger.textContent='저장된 사업장 추가';trigger.hidden=true;
 row.insertBefore(trigger,add);
 const manage=document.createElement('a');manage.className='ui-copy-action';manage.href=window.ORDER_APP_CONTEXT?.pages?.businesses||'/ia?view=businesses-r3';manage.target='_blank';manage.rel='noopener noreferrer';manage.textContent='사업장 관리';
 // Reuse the production copy presentation and transaction actions. Selection is
 // not a child-copy editor, so its dialog takes the canonical selection class.
 const dialog=copy.create({id:'saved-business-picker',title:'저장된 사업장',fields:'',targets:'',applyLabel:'불러오기',presentation:'contact'});
 dialog.className='q4-regular-dialog r3-saved-business-dialog';
 dialog.querySelector('.qa-copy-accordion-area').hidden=true;
 dialog.querySelector('[data-copy-preview]').hidden=true;
 dialog.querySelector('.qa-copy-target-heading').textContent='견적에 사용할 사업장';
 const list=dialog.querySelector('.qa-copy-targets'),status=dialog.querySelector('[role=status]');
 const close=dialog.querySelector('[data-copy-cancel]'),apply=dialog.querySelector('[data-copy-apply]');
 dialog.querySelector('.qa-copy-targets').after(manage);
 document.body.append(dialog);
 async function readBusinesses(){
  const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',redirect:'manual'});
  if(!response.ok)throw Error(response.status===401||response.status===403||response.type==='opaqueredirect'?'AUTH':'LOAD');
  const data=await response.json();
  if(!Array.isArray(data.businesses))throw Error('LOAD');
  return data.businesses;
 }
 const stage=add.closest('#section-q3');
 let availabilityRevision=0;
 async function refreshAvailability(){
  if(!row.isConnected||stage?.dataset.open!=='true')return;
  const revision=++availabilityRevision;
  try{const rows=await readBusinesses();if(row.isConnected&&revision===availabilityRevision)trigger.hidden=!rows.length;}
  catch{if(row.isConnected&&revision===availabilityRevision)trigger.hidden=true;}
 }
 if(stage){
  new MutationObserver(changes=>{if(changes.some(change=>change.oldValue!==stage.dataset.open))refreshAvailability();}).observe(stage,{attributes:true,attributeFilter:['data-open'],attributeOldValue:true});
  window.addEventListener('focus',refreshAvailability);
  refreshAvailability();
 }
 let records=[],pending=false,generation=0,active=false;
 const dismiss=()=>{generation++;active=false;return shell.close(dialog);};
 close.onclick=()=>shell.requestClose(dialog,'cancel');
 shell.bind(dialog,dismiss,{onExitIntent:()=>{generation++;active=false;}});
 const currentSession=id=>active&&id===generation&&dialog.open;
 const updateSelection=()=>{apply.disabled=pending||!list.querySelector('input:checked');};
 list.addEventListener('change',updateSelection);
 trigger.onclick=async()=>{
  if(trigger.hidden||pending||!app.savedBusinessBridge.canOpen?.())return;
  const current=++generation;active=true;records=[];list.replaceChildren();status.textContent='사업장을 불러오고 있습니다.';apply.disabled=true;
  shell.open(dialog,{variant:'copy',role:'selection',history:true,returnFocus:()=>trigger.hidden?add:trigger,initialFocus:()=>close});
  try{
   const rows=await readBusinesses();if(!currentSession(current))return;
   records=rows;trigger.hidden=!records.length;
   for(const record of records){
    const label=document.createElement('label');label.className='q4-check-row q4-check-row--multiline';
    const check=document.createElement('input');check.type='checkbox';check.value=record.id;
    const icon=document.createElement('span');icon.className='q4-check-icon';icon.setAttribute('aria-hidden','true');icon.textContent='✓';
    const text=document.createElement('span');text.className='q4-check-copy';
    const name=document.createElement('strong');name.textContent=record.profile.name;
    const address=document.createElement('span');address.className='q4-regular-muted';address.textContent=[record.profile.road,record.profile.detail].filter(Boolean).join(' ')||record.profile.region||'소재지 미입력';
    text.append(name,document.createElement('br'),address);label.append(check,icon,text);list.append(label);
   }
   status.textContent=records.length?(document.documentElement.dataset.r3QuoteMode==='simple'?'선택한 사업장의 수와 지역으로 바뀝니다. 기존 주문 방식과 희망일은 유지됩니다.':'견적에 사용할 사업장을 선택해 주세요. 이미 불러온 사업장은 최신 정보로 갱신하며, 납품 수량과 일정은 유지됩니다.'):'저장된 사업장이 없습니다. 사업장 관리에서 먼저 등록해 주세요.';
   updateSelection();
  }catch(error){if(currentSession(current))status.textContent=error.message==='AUTH'?'로그인 후 다시 불러와 주세요.':'사업장을 불러오지 못했습니다. 닫고 다시 시도해 주세요.';}
 };
 apply.onclick=async()=>{
  if(pending||!active)return;
  const ids=new Set([...list.querySelectorAll('input:checked')].map(x=>x.value));if(!ids.size){status.textContent='사업장을 하나 이상 선택해 주세요.';return;}
  pending=true;apply.disabled=true;trigger.disabled=true;
  const current=generation,isCurrent=()=>currentSession(current);
  try{const result=await app.savedBusinessBridge.load(records.filter(x=>ids.has(x.id)),{isCurrent});if(!isCurrent())return;if(result.ok)dismiss();else status.textContent=result.status==='EDIT_PENDING'?'작성 중인 입력을 저장하거나 취소한 후 다시 불러와 주세요.':'입력을 반영하지 못했습니다. 기존 입력을 확인한 후 다시 시도해 주세요.';}
  catch{if(isCurrent())status.textContent='입력을 반영하지 못했습니다. 다시 시도해 주세요.';}
  finally{pending=false;trigger.disabled=false;updateSelection();}
 };
 return {dialog,trigger};
}
