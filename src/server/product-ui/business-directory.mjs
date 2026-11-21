// Product-owned business directory form and client. Transport/session is injected.
export function bootBusinessDirectory(installSession,regions,options={}){
 const endpoint=window.ORDER_APP_CONTEXT?.endpoints?.role||'/api/ia/r3-role';
 const root=options.root||document,adapter=options.adapter,controller=new AbortController(),signal=controller.signal;
 const $=id=>root.querySelector('[data-business-ref="'+id+'"]')||root.querySelector('#'+id),form=$('business-form'),status=$('business-status');
 let alive=true;
 const requestApi=async(url,settings={})=>{
  if(adapter?.roleRequest){
   const path=url.slice(endpoint.length),body=settings.body?JSON.parse(settings.body):undefined;
   const data=await adapter.roleRequest(path,body,signal);return {ok:true,status:200,json:async()=>data};
  }
  return fetch(url,{credentials:'same-origin',redirect:'manual',signal,...settings});
 };
 let csrf='',draftId=crypto.randomUUID();
 const fields=['name','road','postal','detail','contactName','contactPhone','storePhone','email','dropoff'];
 let records=[],editing=null,pending=false,request=null;
 const ask=message=>{
  if(typeof options.ask==='function')return options.ask(message);
  const shell=window.OrderModalShell;if(!shell)return Promise.resolve(confirm(message));
  return new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='q4-regular-dialog ui-compact-confirm';dialog.setAttribute('aria-label',message);
   const panel=document.createElement('div');panel.className='q4-regular-panel';
   const head=document.createElement('header');head.className='q4-regular-head';const title=document.createElement('strong');title.textContent=message;head.append(title);
   const footer=document.createElement('footer');footer.className='q4-regular-actions ui-transaction-group';
   const cancel=document.createElement('button');cancel.type='button';cancel.className='ui-transaction-action';cancel.textContent='취소';
   const accept=document.createElement('button');accept.type='button';accept.className='ui-transaction-action ui-transaction-action--primary';accept.textContent='확인';
   footer.append(cancel,accept);panel.append(head,footer);dialog.append(panel);document.body.append(dialog);
   let settled=false;const finish=value=>{if(settled)return;settled=true;shell.close(dialog,{after:()=>{dialog.remove();resolve(value);}});};
   cancel.onclick=()=>shell.requestClose(dialog,'cancel');accept.onclick=()=>finish(true);shell.bind(dialog,()=>finish(false));shell.open(dialog,{variant:'compact',role:'confirm',history:true,returnFocus:document.activeElement,initialFocus:()=>cancel});
  });
 };
 const option=(value,label)=>{const el=document.createElement('option');el.value=value;el.textContent=label;return el;};
 $('region-root').append(...regions.listRegionRoots().map(r=>option(r.code,r.label)));
 function leaves(value=''){$('region-leaf').replaceChildren(option('','시·군·구 선택'));const root=$('region-root').value,items=regions.listRegionLeaves(root);$('region-leaf').append(...(items.length?items:[{code:root,label:root?$('region-root').selectedOptions[0].textContent:''}]).filter(r=>r.code).map(r=>option(r.code,r.label)));$('region-leaf').value=value;}
 $('region-root').onchange=()=>leaves();
 function edit(record){if(!alive)return;editing=record;draftId=record?.id||crypto.randomUUID();request=null;form.reset();for(const key of fields)$('business-'+key).value=record?.profile[key]||'';$('region-root').value=record?.profile.regionSelection?.rootCode||'';leaves(record?.profile.regionSelection?.leafCode||'');$('business-title').textContent=record?'사업장 수정':'사업장 등록';$('business-delete').hidden=!record;status.textContent='';$('business-name').focus();}
 function paint(){const list=$('business-list');list.replaceChildren();for(const record of records){const button=document.createElement('button');button.type='button';button.className='business-card btn secondary';const name=document.createElement('strong');name.textContent=record.profile.name;const address=document.createElement('span');address.textContent=[record.profile.road,record.profile.detail].filter(Boolean).join(' ')||record.profile.region||'소재지 미입력';button.append(name,address);button.onclick=async()=>{if(!pending&&(!dirty()||await ask('저장하지 않은 내용을 닫고 이 사업장을 열까요?')))edit(record);};list.append(button);}$('business-count').textContent=records.length+'개';if(!records.length){const empty=document.createElement('p');empty.textContent='등록된 사업장이 없습니다.';list.append(empty);}}
 function profile(){const p={...(editing?.profile||{})};for(const key of fields)p[key]=$('business-'+key).value.trim();const region=regions.regionSelection($('region-root').value,$('region-leaf').value);p.regionSelection=region;p.region=region?[region.rootLabel,region.leafLabel].filter(Boolean).join(' '):'';
  if(p.road!==editing?.profile.road||p.postal!==editing?.profile.postal){p.providerId='';p.addressProvider='';p.jibun='';}return p;
 }
 function dirty(){if(editing)return fields.some(key=>$('business-'+key).value.trim()!==(editing.profile[key]||''))||$('region-root').value!==(editing.profile.regionSelection?.rootCode||'')||$('region-leaf').value!==(editing.profile.regionSelection?.leafCode||'');return fields.some(key=>$('business-'+key).value.trim())||!!$('region-root').value;}
 async function load(){const response=await requestApi(endpoint+'/businesses',{cache:'no-store'});if(!response.ok)throw Error('LOAD');const data=await response.json();if(!alive)return;records=data.businesses;paint();}
 async function save(deleted=false){if(!alive||pending||!form.reportValidity())return;if(deleted&&!await ask('이 사업장을 저장 목록에서 삭제할까요? 기존 견적의 입력은 유지됩니다.'))return;if(!alive||pending)return;
  const data={id:editing?.id||draftId,expectedRevision:editing?.revision||0,deleted,profile:profile()},signature=JSON.stringify(data);
  if(!request||request.signature!==signature)request={signature,body:{...data,requestKey:crypto.randomUUID()}};
  const focused=form.contains(document.activeElement)?document.activeElement:null;let saved=false;
  pending=true;for(const el of form.elements)el.disabled=true;status.textContent='저장 중입니다.';
  try{const response=await requestApi(endpoint+'/businesses',{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':csrf},body:JSON.stringify(request.body)});if(!response.ok)throw Error(response.status===409?'CONFLICT':response.status===401||response.status===403?'AUTH':'SAVE');const result=await response.json();if(!alive)return;await load();if(!alive)return;edit(deleted?null:records.find(r=>r.id===result.id));saved=true;status.textContent=deleted?'목록에서 삭제했습니다.':'사업장을 저장했습니다.';
  }catch(error){if(!alive)return;status.textContent=['CONFLICT','REVISION_CONFLICT'].includes(error.message)?'다른 탭에서 사업장이 변경되었습니다. 입력은 유지했습니다. 목록을 새로 불러온 후 확인해 주세요.':['AUTH','AUTHENTICATION_REQUIRED','CSRF_DENIED'].includes(error.message)?'로그인 후 다시 저장해 주세요. 작성한 내용은 이 화면에 남아 있습니다.':'저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장해 주세요.';}finally{
   pending=false;if(alive){
    for(const el of form.elements)el.disabled=false;
    // Disabling the active control sends browser focus to body. Restore it
    // only after re-enabling, without taking focus from another destination.
    if(focused&&document.activeElement===document.body){const target=saved?$('business-name'):focused;if(target.isConnected&&!target.disabled)target.focus({preventScroll:true});}
   }
  }
 }
 form.onsubmit=event=>{event.preventDefault();void save();};$('business-delete').onclick=()=>save(true);
 $('business-add').onclick=async()=>{if(!pending&&(!dirty()||await ask('저장하지 않은 내용을 닫고 새 사업장을 등록할까요?')))edit(null);};
 $('business-refresh').onclick=async()=>{if(!alive||pending)return;try{await load();if(alive)status.textContent='목록을 새로 불러왔습니다. 작성 중인 입력은 유지했습니다.';}catch{if(alive)status.textContent='목록을 불러오지 못했습니다. 다시 시도해 주세요.';}};
 document.addEventListener('ia-session-restored',event=>{if(typeof event.detail?.csrf==='string')csrf=event.detail.csrf;},{signal});
 document.addEventListener('ia-session-expired',()=>{status.textContent='로그인이 만료되었습니다. 작성한 내용은 이 화면에 남아 있습니다.';},{signal});
 window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}},{signal});
 const ready=(async()=>{try{
  if(adapter){await adapter.ready;}else{const response=await requestApi(endpoint+'/session',{cache:'no-store'});if(!response.ok)throw Error('AUTH');const identity=await response.json();if(!alive)return;csrf=identity.csrf;if(identity.practiceAllowed)installSession();document.dispatchEvent(new CustomEvent('ia-session-ready',{detail:identity}));}
  if(alive)await load();
 }catch{if(alive)status.textContent='사업장을 불러오지 못했습니다. 로그인 상태를 확인해 주세요.';}})();
 const dispose=()=>{if(!alive)return;alive=false;controller.abort();form.onsubmit=null;for(const id of ['business-delete','business-add','business-refresh','region-root'])if($(id))$(id).onclick=$(id).onchange=null;};
 if(options.signal?.aborted)dispose();else options.signal?.addEventListener('abort',dispose,{once:true});
 return {dispose,ready,dirty:()=>alive&&dirty(),pending:()=>pending};
}

export function businessDirectoryPanelMarkup(){
 const fields=[['name','명칭',200,'text'],['road','소재지',4096,'text'],['postal','우편번호',5,'text'],['detail','상세 주소',4096,'text'],['contactName','담당자',100,'text'],['contactPhone','담당자 전화번호',80,'tel'],['storePhone','사업장 전화번호',80,'tel'],['email','이메일',254,'email'],['dropoff','물품 놓는 위치',4096,'text']];
 return `<main class="business-layout"><aside class="ops-panel"><h1>내 사업장 <small id="business-count"></small></h1><div class="business-tools"><button class="btn secondary" id="business-add" type="button">사업장 추가</button><button class="btn text" id="business-refresh" type="button">새로고침</button></div><div id="business-list"></div></aside><form class="ops-panel" id="business-form"><h2 id="business-title">사업장 등록</h2>${fields.map(([key,label,max,type])=>`<label class="field" for="business-${key}"><span>${label}</span><span class="input-shell"><input id="business-${key}" name="${key}" type="${type}" maxlength="${max}" ${key==='name'?'required':''} ${key==='postal'?'inputmode="numeric" pattern="[0-9]{5}"':''}></span></label>`).join('')}<div class="regions"><label class="ops-select-field">시·도<select id="region-root"><option value="">시·도 선택</option></select></label><label class="ops-select-field">시·군·구<select id="region-leaf"><option value="">시·군·구 선택</option></select></label></div><p class="note">저장한 사업장은 간편·상세 견적 Q3에서 불러올 수 있습니다. 상세 견적의 소재지는 주소 검색으로 확인해 주세요.</p><div class="business-tools"><button class="btn primary" type="submit">저장</button><button class="btn secondary" type="button" id="business-delete" hidden>삭제</button></div><p id="business-status" role="status"></p></form></main>`;
}
