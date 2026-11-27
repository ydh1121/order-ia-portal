import {getProductUiBootstrap} from './product-ui/bootstrap.gen.mjs';
import {installQaSession} from './qa-session-client.mjs';
import {createPriceBookModel} from './r3-price-book-model.mjs';
import {mountPriceBook,priceBookMarkup,priceBookCss} from './r3-price-book-ui.mjs';
import {mountPriceShell,priceShellCss} from './r3-price-shell.mjs';
import {mountMagneticAction} from './order-engine/browser/magnetic-action.mjs';
import {quoteJellyRuntime} from './r3-product-sources.mjs';
import {browserFunction} from './browser-source.mjs';
import {mountAsyncMotion,asyncMotionCss,bindEditorMotion,editorMotionCss} from './r3-async-motion.mjs';
import {buyerResultCss,buyerResultClient,projectBuyerResult} from './r3-quote-result.mjs';
import {bloubScript,bloubMontages} from './r3-bloub.mjs';
import {createQuoteWait,mountWaitScene,waitMontages,waitSceneCss} from './r3-quote-wait.mjs';

import {createPriceMatrixModel} from './order-engine/calculation/price-matrix.mjs';
import {mountPriceMatrix,matrixMarkup,matrixCss} from './r3-matrix-editor.mjs';
import {mountCarrierEditor,carrierMarkup,carrierCss} from './r3-carrier-page.mjs';

function priceDesk(createWait,makeWaitScene,montages,makeResult,project,makeModel,mountMatrix,mountCarrier,mountMotion,bindEditors,makeShell,makeBook, mountBook,installSession) {
  const $=id=>document.getElementById(id);
  installSession();
  const state={csrf:'',scope:[],versions:[],country:[],regionVersion:'',current:null,pending:null,operation:false,dirty:false,practice:new URLSearchParams(location.search).get('practice')==='1'};
  const motion=mountMotion(document,{source:state.practice?'server-practice':'server'});
  const editorMotion=bindEditors($('price-workspace'));
  const priceShell=makeShell(document);
  window.addEventListener('pagehide',()=>{priceShell.destroy();editorMotion.destroy();motion.destroy();},{once:true});
  const number=v=>v===''?null:Number(v), say=t=>{$('notice').textContent=t;};
  const opts=(...v)=>[['','선택'],...v];
  const field=(group,key,label,value='',type='text',options=null)=>{
    const l=document.createElement('label'),e=document.createElement(options?'select':'input');l.append(document.createTextNode(label));
    if(options)for(const [v,title] of options)e.append(new Option(title,v));else e.type=type;
    e.dataset.field=key;e.value=value??'';l.append(e);group.append(l);return e;
  };
  const f=(id,key,label,type,options)=>field($(id),key,label,'',type,options);
  const read=group=>Object.fromEntries([...group.querySelectorAll(':scope > label [data-field]')].map(e=>[e.dataset.field,e.value]));
  const fill=(group,values)=>{for(const e of group.querySelectorAll(':scope > label [data-field]'))e.value=values[e.dataset.field]??'';};
  const matrix=mountMatrix($('matrix'),makeModel()), carrier=mountCarrier($('carrier-editor'),null);
  const day=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
  const midnight=value=>value?new Date(value+'T00:00:00+09:00').toISOString():null;
  const statusNames={DRAFT:'초안',SUBMITTED:'검토 중',APPROVED:'승인',RETURNED:'보완 요청',WITHDRAWN:'철회'};
  const actionNames={create:'초안 생성',edit:'수정',submit:'검토 요청',approve:'승인',return:'보완 요청',withdraw:'철회'};
  const scope=()=>state.scope[Number($('scope').value)];
  const dirty=()=>{state.dirty=true;};
  for(const id of ['pricing-fields','staff-settings-fields','price-content'])$(id).addEventListener('input',e=>{if(!['egg-shell','pack-size'].includes(e.target.id))dirty();});
  $('pricing-editor').addEventListener('click',e=>{if(e.target.closest('[data-mx=apply],[data-mx=copy],[data-mx=remove],[data-mx=add],#addRegion'))dirty();});
  window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
  const changeAllowed=()=>!state.dirty||window.confirm('저장하지 않은 수정 내용을 닫을까요?');
  const localized={GRANT_REQUIRED:'이 상품을 변경할 권한이 없습니다.',ACCESS_REQUIRED:'대상 공급처 또는 사업장의 권한을 확인해 주세요.',CONFLICT:'검토 상태가 바뀌었거나 승인 기간이 겹칩니다.',REVISION_CONFLICT:'다른 사용자가 먼저 수정했습니다. 내 입력은 그대로 유지됩니다.',IDEMPOTENCY_CONFLICT:'다른 내용으로 처리된 요청입니다.',SERVICE_UNAVAILABLE:'저장소에 연결할 수 없습니다. 입력을 유지했습니다.',PERFORMANCE_UNCONFIRMED:'전월 확정 실적이 필요합니다.',PERFORMANCE_LOOKUP_FAILED:'전월 실적을 조회할 수 없습니다.',SEVEN_DAY_GUARANTEE_UNRESOLVED:'공급 조건이 견적 유효기간 전에 끝납니다.',REGION_PRIORITY_CONFLICT:'겹치는 지역 규칙의 우선순위를 구분해 주세요.',CATALOG_REQUIRED:'운영자가 이 상품의 규격을 먼저 등록해야 합니다.',CATALOG_CHANGED:'상품 규격이 변경되었습니다. 최신 목록을 확인해 주세요.',PRICE_NOT_OFFERED:'선택한 구간과 규격을 판매하지 않습니다.',PRICE_NOT_SET:'선택한 구간과 규격의 단가가 미입력입니다.',PRICE_CONSULT:'선택한 조건의 단가는 별도 협의가 필요합니다.',PRICE_MATRIX_INVALID:'표에서 표시된 입력값을 확인해 주세요.',PERFORMANCE_POLICY_REQUIRED:'취소·반품 실적 처리 기준이 확정되어야 전월 실적 가격을 적용할 수 있습니다.',SUCCESSOR_NOT_EFFECTIVE:'예약된 가격표는 적용 시작일이 되거나 전판과 유효 기간이 겹치지 않을 때 승인해 주세요.',VERSION_REQUIRED:'먼저 가격표 초안을 저장해 주세요.'};
  async function api(path,body,signal){
    const res=await fetch((window.ORDER_APP_CONTEXT?.endpoints?.price||'/api/ia/r3-price')+(state.practice?'/practice/'+$('persona').value:'')+path,{signal,method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-IA-CSRF':state.csrf}:{},body:body?JSON.stringify(body):undefined});
    const data=await res.json();if(state.ownerSession&&(res.status===401||res.status===403&&['IA_ACCESS_DENIED','CSRF_DENIED','SESSION_DENIED','SESSION_EXPIRED','AUTHENTICATION_REQUIRED'].includes(data.error)))document.dispatchEvent(new CustomEvent('ia-session-invalid',{detail:{reason:'AUTHENTICATION_REQUIRED'}}));
    if(!res.ok){const error=new Error(data.error||'SERVICE_UNAVAILABLE');error.candidates=data.candidates;throw error;}return data;
  }
  const commit=(button,path,body)=>motion.run(button,({signal})=>api(path,body,signal),{
    requestId:body.requestKey||undefined,labels:{pending:'저장 중',success:'저장됨',error:'저장 실패'}
  });
  const freightReasons={OUT_OF_SCOPE:'지역·우편번호·계약 사용 범위 밖',EXPIRED:'계약 기간 밖',CLOSED:'배송 요일 또는 접수 마감 밖',
    PACKING_OR_CONTRACT_UNCONFIRMED:'포장·계란 수탁 또는 계약 조건 확인 필요',CAPACITY_UNAVAILABLE:'크기·중량·차량 적재 조건 미충족',
    VOLUME_OUT_OF_SCOPE:'회당 배송량 조건 밖',UNSET:'미설정',CONSULT:'별도 협의',UNAVAILABLE:'배송 불가',TAX_UNCONFIRMED:'세금 조건 미확인',SEPARATE_QUOTE:'별도 견적 필요'};
  const freightExcluded=candidates=>candidates.map(c=>c.name+' · '+(freightReasons[c.reason]||'조건 확인 필요')).join(' / ');
  Object.assign(localized,{FREIGHT_QUOTE_REQUIRED:'이번 납품에 적용할 확정 운임이 없습니다.',FREIGHT_MANUAL_INELIGIBLE:'직접 지정한 계약의 적용 조건과 사유를 확인해 주세요.',FREIGHT_SURCHARGE_OVERLAP:'같은 지역의 할증을 두 번 적용할 수 없습니다.',FREIGHT_SPLIT_NOT_ALLOWED:'이 정책은 같은 사업장·회차의 분할 출고를 허용하지 않습니다.'});
  function busy(active){
    state.operation=active;
    $('practice').disabled=active;
    for(const id of ['pricing-editor','staff-desk','price-registration','personal-panel','staffSettings','personalSettings'])$(id).inert=active;
    const saveButton=document.querySelector('[data-action="save"]');saveButton.disabled=active;
    for(const id of ['registerProduct','requestConnection','openPersonalDraft','savePersonalDraft']){
      $(id).disabled=active;
    }
  }
  const run=fn=>async()=>{if(state.operation)return;let invalidMatrix=false;busy(true);try{await fn();}catch(e){if(e.message==='PRICE_MATRIX_INVALID'){invalidMatrix=true;say('');return;}if(Array.isArray(e.candidates)){$('result').textContent='';$('freightResult').textContent=freightExcluded(e.candidates);}say(e instanceof TypeError?'연결이 끊겼습니다. 입력을 유지했습니다. 연결 후 다시 저장해 주세요.':localized[e.message]||'조건을 확인해 주세요. '+e.message);}finally{busy(false);if(invalidMatrix)$('matrix').querySelector('td:not([hidden]) input[aria-invalid=true]')?.focus();}};
  const selectOptions=(select,choices,selected)=>{select.replaceChildren(...choices.map(([v,title])=>new Option(title,v)));if(choices.some(([v])=>String(v)===String(selected)))select.value=String(selected);};
  const shellName=v=>v==='unspecified'?'번호 구분 없음':'난각번호 '+v;
  const elem=(id,key)=>$(id).querySelector('[data-field="'+key+'"]');
  const gradeChoice=(el,grades)=>{
    selectOptions(el,grades.flatMap(g=>[['raw','원란'],['packed','포장']].map(([key,text])=>[g.id+'/'+key,g.name+' · '+text])));
  };
  function addRegion(v={}) {
    const r=document.createElement('fieldset');r.dataset.id=v.id||crypto.randomUUID();
    let choices=state.country;if(v.prefix&&!choices.some(x=>x.value===v.prefix))choices=[{value:v.prefix,label:v.label},...choices];
    field(r,'prefix','배송 지역',v.prefix||'',null,opts(...choices.map(x=>[x.value,x.label])));
    field(r,'status','배송 조건',v.status||'UNSET',null,opts(['FEE','유료'],['FREE','무료'],['UNSET','미설정'],['CONSULT','협의'],['UNAVAILABLE','배송 불가']));
    for(const [key,label] of Object.entries({fee:'기본 배송비 (원)',minimumQty:'최소 납품량 (판)',freeQty:'무료 기준 (판)',freeAmount:'무료 기준 (원)',surcharge:'지역 추가요금 (원)',priority:'우선순위',zip:'특정 우편번호'}))field(r,key,label,v[key]??({minimumQty:1,priority:$('regions').children.length+1}[key]??''),key==='zip'?'text':'number');
    field(r,'cutoff','주문 마감',v.cutoff||'','time');
    const days=document.createElement('div');days.className='weekdays';
    ['일','월','화','수','목','금','토'].forEach((day,i)=>{const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=i;box.checked=(v.weekdays||[0,1,2,3,4,5,6]).includes(i);label.append(box,day);days.append(label);});
    const del=document.createElement('button');del.type='button';del.textContent='지역 삭제';del.onclick=()=>{r.remove();dirty();};r.append(days,del);$('regions').append(r);
  }
  function readRegions(){
    return [...$('regions').children].map(r=>{const v=read(r),sel=r.querySelector('[data-field=prefix]');return {...v,id:r.dataset.id,label:sel.selectedOptions[0]?.text||'',weekdays:[...r.querySelectorAll('.weekdays input:checked')].map(x=>Number(x.value)),minimumQty:number(v.minimumQty),priority:number(v.priority),fee:v.status==='FREE'?'0':v.status==='FEE'?v.fee:null,freeQty:number(v.freeQty),freeAmount:v.freeAmount||null,surcharge:v.surcharge||null,zip:v.zip||null,cutoff:v.cutoff||null};});
  }
  let registration=null, setupKey=null, connectionKey=null, activeTab='price';
  const query=new URL(location.href).searchParams;
  function switchTab(tab){
    activeTab=tab;
    $('priceTab').setAttribute('aria-pressed',String(tab==='price'));
    $('shippingTab').setAttribute('aria-pressed',String(tab==='shipping'));
    $('price-content').hidden=tab!=='price';$('shipping').hidden=tab!=='shipping';
    $('prices').hidden=tab!=='price';
    if(!state.practice){
      const url=new URL(location.href);
      if(tab==='shipping'||url.hash==='#shipping')url.hash=tab==='shipping'?'shipping':'';
      window.history.replaceState(null,'',url);
    }
  }
  $('priceTab').onclick=()=>switchTab('price');$('shippingTab').onclick=()=>switchTab('shipping');
  function setupOrganization(){
    const org=registration?.organizations.find(o=>o.supplierId===$('setupOrg').value);
    $('setupSupplier').value=org?.supplierName||'';$('setupSupplier').readOnly=Boolean(org?.supplierName);
    const share=$('supplierInvite');share.hidden=!org?.invitation;
    if(org?.invitation)share.href='/ia?view=pricing-r3&join='+encodeURIComponent(org.invitation);
  }
  $('setupOrg').onchange=setupOrganization;
  const states={PENDING:'연결 대기',LINKED:'가격표 연결됨',DECLINED:'연결 요청 반려',REVOKED:'가격표 연결 해제'};
  function renderRegistration(){
    const orgs=registration.organizations;
    const selected=$('setupOrg').value;
    selectOptions($('setupOrg'),orgs.map(org=>[org.supplierId,org.supplierName||((org.role==='OPERATOR'?'운영':'공급처')+' 소속'+(orgs.length>1?' · '+org.supplierId:''))]),selected);
    setupOrganization();$('productSetup').hidden=!orgs.length;
    $('price-registration').hidden=false;
    $('price-registration').open=Boolean(query.get('priceRequest'))||Boolean(query.get('join'));
    $('registrationTitle').textContent=orgs.length?'공급처·상품 등록':'공급처 연결';
    $('connectionForm').hidden=orgs.length>0&&!query.has('join');
    $('connectionStatus').replaceChildren();
    for(const row of registration.own){
      const li=document.createElement('li');li.textContent=row.company+' · '+states[row.state]+' ';
      if(row.state==='PENDING'){
        const link=document.createElement('a');link.href='/ia?view=pricing-r3&priceRequest='+encodeURIComponent(row.id);
        link.textContent='담당 운영자에게 공유할 요청 링크';li.append(link);
      }
      $('connectionStatus').append(li);
    }
    $('connectionReview').replaceChildren();
    for(const row of registration.review){
      const pending=row.state==='PENDING', options=state.scope.filter(s=>s.role==='OPERATOR'&&s.supplier_id===row.supplierId&&s.definition&&
        (pending||(s.origin_id===row.linkedOrigin&&s.product_id===row.linkedProduct)));
      if(!options.length)continue;
      const box=document.createElement('fieldset'),who=document.createElement('legend');
      who.textContent=row.applicant+' · '+row.company+' · '+states[row.state];box.append(who);
      const choice=field(box,'target','담당 상품','0',null,options.map((o,i)=>[String(i),o.definition.originName+' · '+o.definition.productName]));
      for(const [action,title] of pending?[['link','이 상품의 가격 작성 연결'],['decline','요청 반려']]:[['revoke','가격 작성 연결 해제']]){
        const btn=document.createElement('button');btn.type='button';btn.textContent=title;
        btn.disabled=action==='link'&&!row.verified;btn.onclick=run(async()=>{
          const chosen=options[Number(choice.value)];
          if(!window.confirm(row.applicant+' · '+chosen.definition.productName+' · '+title+'할까요?'))return;
          await api('/registration',{action,id:row.id,supplierId:chosen.supplier_id,originId:chosen.origin_id,productId:chosen.product_id});
          await registrationInfo();say('가격표 연결 상태를 저장했습니다.');
        });box.append(btn);
      }
      if(!row.verified){const note=document.createElement('p');note.textContent='담당자가 사업자 계정으로 로그인해 요청하면 상품을 연결할 수 있습니다.';box.append(note);}
      $('connectionReview').append(box);
    }
  }
  async function registrationInfo(){
    if(state.practice)return;
    registration=await api('/registration'+(query.has('priceRequest')?'?request='+encodeURIComponent(query.get('priceRequest')):''));
    renderRegistration();
  }
  const personal={active:false,revision:0,pending:null,remote:null,saved:null};
  const priceBookModel=makeBook(makeModel());
  const priceBook=mountBook($('personalBook'),priceBookModel,matrix,$('matrix'),dirty,choice=>{
    $('personalName').value=choice.name;$('personalShell').value=choice.shell||'';
    const p=choice.package,pack=choice.basePackSize;
    $('personalPack').value=pack==null?'':String(pack);$('personalPack').readOnly=Boolean(p);priceShell.sync();
  });
  $('personalShell').addEventListener('change',()=>{if(personal.active)priceBook.syncShell($('personalShell').value);});
  $('personalName').addEventListener('input',()=>{if(personal.active)priceBook.renameActive($('personalName').value.trim());});
  $('personalPack').addEventListener('input',()=>{if(personal.active)priceBook.setBasePackSize($('personalPack').value===''?null:Number($('personalPack').value));});
  document.addEventListener('ia-session-restored',event=>{if(event.detail?.csrf)state.csrf=event.detail.csrf;});
  const privateGrades=[['king','왕란'],['xl','특란'],['large','대란'],['medium','중란']].map(([id,name])=>({id,name}));
  const originalGrid=$('matrix').parentNode, nextToGrid=$('matrix').nextElementSibling;
  function ownDraftFields(){
    priceBook.renameActive($('personalName').value.trim());
    priceBook.setBasePackSize($('personalPack').value===''?null:Number($('personalPack').value));
    return {name:$('personalName').value.trim(),supplierName:$('personalSupplier').value.trim()||null,
      originName:$('personalOrigin').value.trim()||null,productName:$('personalProduct').value.trim()||null,
      shell:$('personalShell').value||null,packSize:$('personalPack').value===''?null:Number($('personalPack').value),
      minimumOrder:Number($('personalMinimum').value),matrix:matrix.read(),priceBook:priceBook.read()};
  }
  function showImportChoices(){
    const d=personal.saved;
    const importable=!d?.priceBook||priceBookModel.canImportSelected(d.priceBook);
    $('personalImportNotice').hidden=importable;
    const matches=scope=>scope.definition&&['supplierName','originName','productName'].every(k=>!d?.[k]||d[k]===scope.definition[k])
      &&(!d?.shell||scope.definition.shells.includes(d.shell))&&(d?.packSize==null||scope.definition.packSizes.includes(d.packSize));
    const options=importable?state.scope.map((s,i)=>[s,i]).filter(([s])=>matches(s)):[];
    selectOptions($('personalDest'),[['','등록 상품 선택'],...options.map(([s,i])=>[String(i),[s.definition.supplierName,s.definition.originName,s.definition.productName].join(' · ')])],'');
    $('personalImport').hidden=!d||!options.length;
    $('personalDest').onchange();
  }
  $('personalDest').onchange=()=>{
    const target=state.scope[Number($('personalDest').value)]?.definition;
    const shells=$('personalDest').value&&target?target.shells:[], packs=$('personalDest').value&&target?target.packSizes:[];
    const d=personal.saved;
    selectOptions($('personalImportShell'),[['','난각번호 선택'],...shells.filter(v=>!d?.shell||v===d.shell).map(v=>[v,shellName(v)])],d?.shell||'');
    selectOptions($('personalImportPack'),[['','판당 구수 선택'],...packs.filter(v=>d?.packSize==null||v===d.packSize).map(v=>[String(v),v+'구'])],d?.packSize==null?'':String(d.packSize));
  };
  function paintPersonal(receipt,retain=false){
    const d=receipt.draft||{};
    personal.active=true;personal.revision=receipt.revision;personal.saved=receipt.draft;personal.remote=null;personal.pending=null;
    $('personalConflict').hidden=true;$('personal-panel').hidden=false;$('openPersonalDraft').hidden=true;
    $('pricing-editor').hidden=true;$('staff-desk').hidden=true;$('personalBack').hidden=!state.scope.length&&!registration?.organizations.length;
    for(const [id,k] of Object.entries({personalName:'name',personalSupplier:'supplierName',personalOrigin:'originName',personalProduct:'productName',personalShell:'shell',personalPack:'packSize'}))$(id).value=d[k]??'';
    $('personalMinimum').value=d.minimumOrder??10;
    if($('matrix').parentNode!==$('personalGrid'))$('personalGrid').append($('matrix'));$('matrix').hidden=false;
    matrix.set(d.matrix||null,privateGrades,d.matrix||null,false,retain);
    priceBook.set({...d,matrix:d.matrix||matrix.read()});
    $('personalStatus').textContent=receipt.revision?'본인 입력 초안 · r'+receipt.revision+' · '+new Date(receipt.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'아직 저장하지 않은 본인 입력 초안';
    $('personalComparison').replaceChildren();showImportChoices();state.dirty=false;
  }
  function leavePersonal(){
    if(!personal.active)return;
    personal.active=false;personal.remote=null;personal.pending=null;priceBook.clear();$('personal-panel').hidden=true;
    originalGrid.insertBefore($('matrix'),nextToGrid);$('openPersonalDraft').hidden=false;
    $('pricing-editor').hidden=!state.scope.length;$('staff-desk').hidden=!state.scope.length;
  }
  async function openPersonal(){
    if(!changeAllowed())return;
    const receipt=await api('/personal-draft');paintPersonal(receipt);say('');
  }
  $('openPersonalDraft').onclick=run(openPersonal);
  $('personalBack').onclick=run(async()=>{
    if(!changeAllowed())return;
    const last=state.current?.id;leavePersonal();if(last)await open(last);else paint(null);
  });
  $('personal-panel').addEventListener('input',e=>{if(!e.target.closest('#personalImport'))dirty();});
  $('personal-panel').addEventListener('click',e=>{if(e.target.closest('[data-mx=apply],[data-mx=copy],[data-mx=remove],[data-mx=add],[data-mx=undo]'))dirty();});
  function renderConflict(latest){
    personal.remote=latest;$('personalConflict').hidden=false;
    const local=ownDraftFields(),remote=latest.draft,results=[];
    for(const [key,title] of [['name','초안 이름'],['supplierName','공급처'],['originName','출고장'],['productName','상품'],['shell','난각번호'],['packSize','판당 구수'],['minimumOrder','최소 주문량']]){
      if(local[key]!==remote[key])results.push(title+' · 내 입력 '+(local[key]??'미지정')+' / 서버 '+(remote[key]??'미지정'));
    }
    const diffMatrix=JSON.stringify(local.matrix)!==JSON.stringify(remote.matrix);
    if(diffMatrix)results.push('가격표 구간 또는 단가가 다릅니다.');
    if(JSON.stringify(local.priceBook)!==JSON.stringify(remote.priceBook))results.push('날짜별 버전 또는 분류가 다릅니다.');
    const list=$('personalComparison');list.replaceChildren();
    const summary=document.createElement('p');summary.textContent='서버 r'+latest.revision+' · '+(results.join(' / ')||'입력 내용이 같습니다.');list.append(summary);
    if(diffMatrix){
      const details=document.createElement('details'),caption=document.createElement('summary');caption.textContent='서버 가격표 보기';details.append(caption);
      const frame=document.createElement('div');frame.className='matrix-scroll';const table=document.createElement('table');table.className='price-matrix';
      const header=table.createTHead().insertRow();for(const label of ['시작','끝',...remote.matrix.grades.flatMap(g=>[g.name+' 원란',g.name+' 포장'])]){const th=document.createElement('th');th.textContent=label;header.append(th);}
      const body=table.createTBody();for(const row of remote.matrix.rows){const tr=body.insertRow();for(const v of [row.min,row.max??'이상',...row.cells])tr.insertCell().textContent=v===''?'미입력':v;}
      frame.append(table);details.append(frame);list.append(details);
    }
    say('다른 탭에서 먼저 저장했습니다. 내 입력과 서버 내용을 확인해 주세요.');
  }
  $('readPersonalRemote').onclick=()=>{if(personal.remote&&window.confirm('내 입력을 닫고 서버 초안을 열까요?'))paintPersonal(personal.remote);};
  $('keepPersonalLocal').onclick=()=>{
    if(!personal.remote)return;personal.revision=personal.remote.revision;personal.saved=personal.remote.draft;
    personal.remote=null;personal.pending=null;$('personalConflict').hidden=true;dirty();say('내 입력을 유지했습니다. 저장하면 다음 버전이 됩니다.');
  };
  $('savePersonalDraft').onclick=run(async()=>{
    if(!personal.active||!state.csrf)throw new Error('ACCESS_REQUIRED');
    if(!matrix.validate())throw new Error('PRICE_MATRIX_INVALID');
    const body={action:'save',expectedRevision:personal.revision,draft:ownDraftFields()};
    personal.pending=retryKey(personal.pending,body);
    try{
      const saved=await commit($('savePersonalDraft'),'/personal-draft',{...body,requestKey:personal.pending.key});
      // If the previous response was lost and a different tab already advanced, reopen the latest server revision.
      const latest=await api('/personal-draft');paintPersonal(latest.revision>=saved.revision?latest:saved,true);
      say('저장했습니다.');
    }catch(e){
      if(e.message==='REVISION_CONFLICT'){const latest=await api('/personal-draft');renderConflict(latest);return;}
      throw e;
    }
  });
  $('importPersonalDraft').onclick=run(async()=>{
    if(state.dirty){say('먼저 본인 초안을 저장한 뒤 가져와 주세요.');return;}
    const selection=$('personalDest').value,target=state.scope[Number(selection)];
    const shell=$('personalImportShell').value,pack=$('personalImportPack').value;
    if(!selection||!target||!shell||!pack)throw new Error('PERSONAL_SCOPE_MISMATCH');
    if(!window.confirm(target.definition.productName+'의 새 가격표에 단가를 가져올까요? 확인 후 별도로 저장할 수 있습니다.'))return;
    const source=await api('/personal-draft',{action:'prepare-import',expectedRevision:personal.revision,supplierId:target.supplier_id,originId:target.origin_id,productId:target.product_id,shell,packSize:Number(pack)});
    leavePersonal();$('scope').value=selection;rememberVersion(null);state.newId=crypto.randomUUID();state.predecessor=null;state.parent=null;paint(null);
    $('egg-shell').value=source.shell;$('pack-size').value=String(source.packSize);currentGroup={shell:source.shell,pack:String(source.packSize)};
    $('minimum').value=source.minimumOrder;matrix.set(source.matrix,target.definition.grades);$('history').replaceChildren();switchTab('price');dirty();
    say('단가를 가져왔습니다. 이 상품의 가격표에 반영하려면 초안 저장을 눌러 주세요.');
  });
  Object.assign(localized,{PERSONAL_FIELDS_REQUIRED:'초안 정보와 최소 주문량을 확인해 주세요.',PERSONAL_SCOPE_MISMATCH:'저장한 초안과 일치하는 등록 상품·난각번호·판당 구수를 선택해 주세요.',PERSONAL_PACKAGE_UNIT_MISMATCH:'이 포장 단가는 등록 상품에 바로 가져올 수 없습니다. 기존 원란·포장 표를 선택해 저장한 뒤 가져와 주세요.'});
  function retryKey(previous,body){
    const signature=JSON.stringify(body);
    return previous?.signature===signature?previous:{signature,key:crypto.randomUUID()};
  }
  $('registerProduct').onclick=run(async()=>{
    const body={action:'product',supplierId:$('setupOrg').value,supplierName:$('setupSupplier').value.trim(),originName:$('setupOrigin').value.trim(),
      productName:$('setupProduct').value.trim(),shell:$('setupShell').value,packSize:Number($('setupPack').value)};
    if(!body.supplierName||!body.originName||!body.productName||!body.shell||!Number.isSafeInteger(body.packSize)||body.packSize<1||body.packSize>360)throw new Error('REGISTRATION_FIELDS_REQUIRED');
    if(!changeAllowed())return;
    setupKey=retryKey(setupKey,body);
    const created=await commit($('registerProduct'),'/registration',{...body,requestKey:setupKey.key});leavePersonal();await desk();
    const i=state.scope.findIndex(s=>s.supplier_id===created.supplier_id&&s.origin_id===created.origin_id&&s.product_id===created.product_id);
    if(i<0)throw new Error('ACCESS_REQUIRED');
    $('scope').value=String(i);state.newId=crypto.randomUUID();state.predecessor=null;state.parent=null;
    const savedVersion=state.versions.find(v=>v.supplier_id===created.supplier_id&&v.origin_id===created.origin_id&&v.product_id===created.product_id&&v.status!=='WITHDRAWN');
    if(savedVersion)await open(savedVersion.id);else{paint(null);rememberVersion(null);$('history').replaceChildren();}
    await registrationInfo();$('price-registration').open=false;switchTab('price');setupKey=null;
    say(savedVersion?'등록된 가격표를 열었습니다.':'상품을 등록했습니다. 새 가격표에 단가를 입력해 주세요.');
    $('matrix').scrollIntoView({block:'nearest'});
  });
  $('requestConnection').onclick=run(async()=>{
    const body={action:'request',supplierName:$('requestCompany').value.trim(),invite:query.get('join')||null};
    if(!body.supplierName)throw new Error('REGISTRATION_FIELDS_REQUIRED');
    connectionKey=retryKey(connectionKey,body);await commit($('requestConnection'),'/registration',{...body,requestKey:connectionKey.key});
    await registrationInfo();connectionKey=null;say('연결 요청을 저장했습니다. 담당 운영자가 상품 연결을 확인합니다.');
  });
  Object.assign(localized,{QUOTE_INPUTS_REQUIRED:'승인 상품, 규격, 납품일과 1회 납품 수량을 확인해 주세요.',REGISTRATION_FIELDS_REQUIRED:'공급처·출고장·상품명과 직접 확인한 난각번호·판당 구수를 입력해 주세요.',CATALOG_INVALID:'상품명과 판매 규격을 확인해 주세요.',CATALOG_EXISTS:'같은 출고장과 상품이 다른 규격으로 등록돼 있습니다. 등록된 상품을 선택해 주세요.',SUPPLIER_NAME_CHANGED:'등록된 공급처 이름을 다시 확인해 주세요.',CONNECTION_UNAVAILABLE:'연결 요청 상태와 계정 권한을 다시 확인해 주세요.',INVITATION_INVALID:'공급처 이름과 담당자가 공유한 연결 주소를 다시 확인해 주세요.'});
  function catalogFields(s){
    const d=s?.definition||{};
    for(const key of ['supplierName','originName','productName'])$(key).value=d[key]||'';
    $('catalogGrades').value=(d.grades||[]).map(g=>g.name).join(', ');
    $('catalogPacks').value=(d.packSizes||[]).join(', ');
    for(const el of $('catalogShells').querySelectorAll('input'))el.checked=(d.shells||[]).includes(el.value);
    $('catalogSettings').hidden=s?.role!=='OPERATOR';$('catalogCode').textContent=s?[s.supplier_id,s.origin_id,s.product_id].join(' / '):'';
  }
  $('saveCatalog').onclick=run(async()=>{
    const s=scope();if(!s||s.role!=='OPERATOR')throw new Error('ACCESS_REQUIRED');
    const old=s.definition?.grades||[], names=$('catalogGrades').value.split(',').map(n=>n.trim()).filter(Boolean);
    const definition={supplierName:$('supplierName').value.trim(),originName:$('originName').value.trim(),productName:$('productName').value.trim(),grades:names.map(name=>old.find(g=>g.name===name)||{name,id:crypto.randomUUID()}),shells:[...$('catalogShells').querySelectorAll('input:checked')].map(x=>x.value),packSizes:$('catalogPacks').value.split(',').map(x=>Number(x.trim()))};
    const result=await commit($('saveCatalog'),'/catalog',{supplierId:s.supplier_id,originId:s.origin_id,productId:s.product_id,expectedRevision:s.catalogRevision||0,definition});s.definition=result.definition;s.catalogRevision=result.revision;await desk();paint(state.current);say('상품 표시 정보를 저장했습니다.');
  });
  function collect(){
    const s=scope(),p=state.current?.policy||state.parent?.policy||{},pr=read($('basis')),cost=read($('cost'));
    if(!s)throw new Error('ACCESS_REQUIRED');
    const isLegacy=Boolean(p.tiers&&!p.matrix);
    const prices=isLegacy?{tiers:p.tiers}: {matrix:{...matrix.read(),shell:$('egg-shell').value}};
    if(!isLegacy&&(!s.definition||!matrix.validate()))throw new Error(s.definition?'PRICE_MATRIX_INVALID':'CATALOG_REQUIRED');
    const delivery={ruleSetId:p.delivery?.ruleSetId||state.newId,regionVersion:p.delivery?.regionVersion||state.regionVersion,groupBasis:$('groupBasis').value,regions:readRegions()};
    const carrierPolicy=carrier.read();if(carrierPolicy)delivery.carrierPolicy=carrierPolicy;
    const keepDate=(old,input)=>old&&day(Date.parse(old))===input?old:midnight(input);
    return {...p,...prices,supplierId:s.supplier_id,originId:s.origin_id,productId:s.product_id,displayName:s.definition?.productName||p.displayName,
      policyId:p.policyId||state.newId,groupId:p.groupId||s.product_id,packaging:isLegacy?p.packaging:'s'+$('egg-shell').value+'.p'+$('pack-size').value,unit:isLegacy?p.unit:'tray',
      packSize:isLegacy?p.packSize:Number($('pack-size').value),minimumOrder:Number($('minimum').value),
      effectiveFrom:keepDate(p.effectiveFrom,$('start-date').value),effectiveTo:keepDate(p.effectiveTo,$('end-date').value),currency:'KRW',timeZone:'Asia/Seoul',
      performance:{...p.performance,...pr,defaultQty:number(pr.defaultQty)},rounding:cost.rounding,tax:{ruleId:p.tax?.ruleId||'krw-tax',type:cost.taxType,percent:cost.percent||null},discount:p.discount||{ruleId:'standard-none',type:'NONE'},delivery};
  }
  let currentScopeIndex='0',carrierCatalogKey='',carrierComparisonKey='';
  let currentGroup=null;
  const rememberVersion=id=>{
    const url=new URL(location.href);
    if(id)url.searchParams.set('priceVersion',id);else url.searchParams.delete('priceVersion');
    if(url.href!==location.href)window.history.replaceState(null,'',url);
  };
  function paint(v,previous=null,previousCarrier=null,retain=false){
    state.current=v;state.pending=null;state.conflict=null;state.previousRevision=null;$('replaceApproved').hidden=true;$('conflict').hidden=true;const p=v?.policy||{};
    if(v){const idx=state.scope.findIndex(s=>s.supplier_id===p.supplierId&&s.origin_id===p.originId&&s.product_id===p.productId);if(idx>=0)$('scope').value=String(idx);}
    currentScopeIndex=$('scope').value;const s=scope(),d=s?.definition,locked=Boolean(v&&!['DRAFT','RETURNED'].includes(v.status));
    catalogFields(s);const isLegacy=Boolean(v&&p.tiers&&!p.matrix);
    $('legacyTerms').hidden=!isLegacy;$('legacyTiers').textContent=isLegacy?p.tiers.map(t=>t.min+'~'+(t.max??'이상')+' · '+t.price+'원'+(t.packMode==='ADD'?' + '+t.packFee+'원':'')).join(' / '):'';
    selectOptions($('legacy-grade'),opts(...(d?.grades||[]).map(g=>[g.id,g.name])));$('legacy-packing').value='';
    $('matrix').hidden=isLegacy;$('requires-catalog').hidden=Boolean(d||isLegacy);
    selectOptions($('egg-shell'),(d?.shells||[]).map(n=>[n,shellName(n)]),p.matrix?.shell);
    selectOptions($('pack-size'),(d?.packSizes||[]).map(n=>[n,n+'구 / 판']),p.packSize);
    currentGroup={shell:$('egg-shell').value,pack:$('pack-size').value};
    matrix.set(p.matrix,d?.grades||[],previous||p.matrix||null,locked,retain);gradeChoice($('simGrade'),p.matrix?.grades||d?.grades||[]);
    $('minimum').value=p.minimumOrder??(state.practice?1:10);$('start-date').value=p.effectiveFrom?day(Date.parse(p.effectiveFrom)):day(Date.now());$('end-date').value=p.effectiveTo?day(Date.parse(p.effectiveTo)):'';
    fill($('basis'),{basis:'DELIVERY',fallback:'CONSULT',scope:'SITE',event:'DELIVERED',...p.performance});
    fill($('cost'),{rounding:p.rounding||'HALF_UP',taxType:p.tax?.type||'INCLUDED',percent:p.tax?.percent||''});
    $('groupBasis').value=p.delivery?.groupBasis||'SHIPMENT';$('regions').replaceChildren();for(const r of p.delivery?.regions||[])addRegion(r);const contract=p.delivery?.carrierPolicy||null,priorContract=previousCarrier??state.parent?.policy.delivery?.carrierPolicy;
    const priorKey=JSON.stringify(priorContract??null);
    if(!retain||carrierComparisonKey!==priorKey||JSON.stringify(carrier.read())!==JSON.stringify(contract))carrier.set(contract,priorContract);
    carrierComparisonKey=priorKey;
    $('current').textContent=v?(v.policy.displayName||s?.definition?.productName||'가격표')+' · '+statusNames[v.status]+' · r'+v.revision:'새 가격표';
    for (const [a,enabled] of Object.entries({save:!locked,submit:v&&!locked,return:v?.status==='SUBMITTED'&&s?.role==='OPERATOR',approve:v?.status==='SUBMITTED'&&s?.role==='OPERATOR',withdraw:v?.status==='APPROVED'&&s?.role==='OPERATOR'})){
      const b=document.querySelector('[data-action="'+a+'"]');b.hidden=!enabled;
    }
    $('next').disabled=!v;
    $('pricing-fields').disabled=locked;$('staff-settings-fields').disabled=locked;
    $('scope').disabled=Boolean(v);
    $('egg-shell').disabled=Boolean(v);$('pack-size').disabled=Boolean(v);
    state.dirty=false;
  }
  async function desk(){
    const d=await api('/desk'),sites=new Map();
    for(const s of d.scopes){const k=[s.supplier_id,s.origin_id,s.product_id].join('/');if(!sites.has(k)||s.role==='OPERATOR'||sites.get(k).role==='WRITER')sites.set(k,s);}
    const old=scope();state.scope=[...sites.values()];state.versions=d.versions;
    selectOptions($('scope'),state.scope.map((s,i)=>[i,s.definition?[s.definition.supplierName,s.definition.originName,s.definition.productName].join(' · '):'표시명 등록 대기 '+(i+1)]));
    const prior=old&&state.scope.findIndex(s=>s.supplier_id===old.supplier_id&&s.origin_id===old.origin_id&&s.product_id===old.product_id);if(prior>=0&&prior!=null)$('scope').value=prior;
    selectOptions($('versions'),[['','가격표 선택'],...d.versions.map(v=>[v.id,[v.name||'기존 가격표',v.shell&&shellName(v.shell),v.packSize&&v.packSize+'구',statusNames[v.status],'r'+v.revision].filter(Boolean).join(' · ')])]);
    state.country=d.freightPack?.regionChoices||[];state.regionVersion=d.freightPack?.regionVersion||'kr-legal-region-code-20261001-observed-20261112';const catalogKey=JSON.stringify(d.freightPack||null);if(catalogKey!==carrierCatalogKey){carrierCatalogKey=catalogKey;carrier.setCatalog(d.freightPack);}
    const r=elem('scenario','region');selectOptions(r,state.country.map(x=>[x.value,x.label]),r.value);
    $('pricing-editor').hidden=!d.scopes.length;$('staff-desk').hidden=!d.scopes.length;
    if(!d.scopes.length && !state.practice)say('처음 사용할 공급처와 상품을 등록하거나 담당 가격표의 연결을 요청해 주세요.');
  }
  async function open(id,retain=false){
    const data=await api('/version?id='+encodeURIComponent(id));state.parent=null;state.predecessor=data.version.predecessor;paint(data.version,data.previousMatrix,data.previousCarrierPolicy,retain);$('versions').value=id;rememberVersion(id);
    if(data.previousStatus==='APPROVED'&&data.version.status==='SUBMITTED'&&data.version.policy.matrix&&scope()?.role==='OPERATOR'){
      state.previousRevision=data.previousRevision;$('replaceApproved').hidden=false;
    }
    $('history').replaceChildren(...data.history.map(e=>{const li=document.createElement('li');li.textContent=[e.event_at,'r'+e.revision,actionNames[e.action],e.actor_id,e.reason].filter(Boolean).join(' · ');return li;}));
  }
  async function save(action,button,replace=false){
    if(!state.csrf)throw new Error('ACCESS_REQUIRED');const v=state.current;if(action!=='create'&&!v)throw new Error('VERSION_REQUIRED');
    if(!['create','edit'].includes(action)&&state.dirty){say('먼저 수정한 초안을 저장해 주세요.');return;}
    const body={id:v?.id||state.newId,action,expectedRevision:v?.revision||0,...(['create','edit'].includes(action)?{policy:collect(),predecessor:state.predecessor??null}:{}),reason:$('reason').value||null};
    if(replace){
      if(!$('reason').value.trim()){say('기존 가격표를 종료하는 사유를 입력해 주세요.');$('reason').focus();return;}
      body.replacePredecessorRevision=state.previousRevision;
    }
    const signature=JSON.stringify(body);if(state.pending?.signature!==signature)state.pending={signature,key:crypto.randomUUID()};
    try{const out=await commit(button,'/version',{...body,requestKey:state.pending.key});await desk();await open(out.id,true);say('저장했습니다. '+statusNames[out.status]+' · r'+out.revision);}
    catch(e){if(v&&['CONFLICT','REVISION_CONFLICT'].includes(e.message)){
      const latest=await api('/version?id='+encodeURIComponent(v.id));
      if(latest.version.revision!==v.revision){
        state.conflict=latest.version;$('conflict').hidden=false;$('remoteVersion').replaceChildren();
        const remote=latest.version.policy.matrix;
        if(remote){
          const table=document.createElement('table');table.className='price-matrix';const head=table.createTHead().insertRow();
          for(const name of ['시작','끝',...remote.grades.flatMap(g=>[g.name+' 원란',g.name+' 포장'])]){const th=document.createElement('th');th.textContent=name;head.append(th);}
          const tbody=table.createTBody();
          for(const row of remote.rows){const tr=tbody.insertRow();for(const v of [row.min,row.max??'이상',...row.cells])tr.insertCell().textContent=v===''?'미입력':v;}
          $('remoteVersion').append(table);
        }else $('remoteVersion').textContent=latest.version.policy.tiers.map(t=>t.min+'~'+(t.max??'이상')+' · '+t.price+'원').join(' / ');
        $('keepInput').hidden=!['DRAFT','RETURNED'].includes(latest.version.status);
      }
    }throw e;}
  }
  $('replaceApproved').onclick=run(()=>save('approve',$('replaceApproved'),true));
  $('keepInput').onclick=()=>{if(state.conflict){state.current=state.conflict;state.conflict=null;state.pending=null;$('conflict').hidden=true;state.dirty=true;say('서버 변경을 확인했습니다. 내 입력을 저장하려면 초안 저장을 눌러 주세요.');}};
  $('remoteInput').onclick=run(()=>state.conflict&&changeAllowed()?open(state.conflict.id):undefined);
  f('basis','basis','단가 구간 기준',null,[['DELIVERY','이번 1회 납품량'],['PREVIOUS_MONTH','전월 확정 실적']]);
  f('basis','fallback','신규·실적 0',null,[['CONSULT','협의'],['DELIVERY','이번 납품량'],['DEFAULT_TIER','지정 수량']]);f('basis','defaultQty','지정 기준 수량','number');
  f('basis','scope','실적 범위',null,[['SITE','사업장'],['BUSINESS','사업자'],['SUPPLIER','사업자·공급처'],['SKU','사업자·공급처·상품']]);f('basis','event','실적 인정',null,[['DELIVERED','납품 완료'],['ORDER_CONFIRMED','주문 확정']]);
  f('cost','taxType','세금',null,[['INCLUDED','포함'],['EXTRA_PERCENT','별도 세율']]);f('cost','percent','별도 세율 (%)','number');f('cost','rounding','원 단위 처리',null,[['HALF_UP','사사오입'],['HALF_EVEN','짝수 반올림'],['DOWN','버림'],['CEIL','올림'],['FLOOR','내림']]);
  f('scenario','serviceDate','납품일','date');f('scenario','quantity','이번 1회 납품량 (판)','number');f('scenario','region','도착 지역','text',[]);f('scenario','zip','우편번호','text');f('scenario','previous','전월 확정 수량 (판)','number');f('scenario','performanceStatus','전월 실적 상태',null,[['FINAL','확정'],['PENDING','집계 중'],['UNAVAILABLE','조회 실패']]);
  $('scope').onchange=()=>{if(!changeAllowed()){$('scope').value=currentScopeIndex;return;}state.parent=null;paint(null);};
  const changeGroup=run(async()=>{
    const shell=$('egg-shell').value,pack=$('pack-size').value,s=scope();
    if(!s||state.current)return;
    if(state.dirty&&!window.confirm('현재 입력을 닫고 선택한 가격표를 열까요?')){$('egg-shell').value=currentGroup.shell;$('pack-size').value=currentGroup.pack;return;}
    const v=state.versions.find(v=>v.supplier_id===s.supplier_id&&v.origin_id===s.origin_id&&v.product_id===s.product_id&&v.shell===shell&&String(v.packSize)===pack&&v.status!=='WITHDRAWN');
    if(v){await open(v.id);return;}
    state.newId=crypto.randomUUID();state.predecessor=null;state.parent=null;matrix.set(null,s.definition?.grades||[]);
    gradeChoice($('simGrade'),s.definition?.grades||[]);currentGroup={shell,pack};state.dirty=false;
  });
  $('egg-shell').onchange=changeGroup;$('pack-size').onchange=changeGroup;
  $('open').onclick=run(()=>{if($('versions').value&&changeAllowed())return open($('versions').value);});
  $('new').onclick=()=>{if(!changeAllowed())return;rememberVersion(null);state.newId=crypto.randomUUID();state.predecessor=null;state.parent=null;paint(null);$('history').replaceChildren();};
  $('next').onclick=()=>{if(!state.current||!changeAllowed())return;const old=state.current;rememberVersion(null);state.newId=crypto.randomUUID();state.parent=old;state.predecessor=old.id;paint({...old,status:'DRAFT'},old.policy.matrix);state.current=null;state.dirty=true;$('current').textContent='후속 가격표 · 이전 r'+old.revision;};
  $('addRegion').onclick=()=>addRegion();
  for(const b of document.querySelectorAll('[data-action]'))b.onclick=run(()=>save(b.dataset.action==='save'?(state.current?'edit':'create'):b.dataset.action,b));
  $('simulate').onclick=run(async()=>{
    $('result').textContent='';$('freightResult').replaceChildren();
    const v=state.current;if(!v)throw new Error('VERSION_REQUIRED');const p=v.policy,x=read($('scenario')),asOf=new Date().toISOString();
    const period=new Date(Date.parse(asOf)+9*3600000);period.setUTCDate(1);period.setUTCMonth(period.getUTCMonth()-1);
    const [grade,packing]=$('simGrade').value.split('/');
    const region=x.region?x.region.padEnd(10,'0'):null;
    const line={id:'item',shipmentId:'shipment',siteId:'site',versionId:v.id,productId:p.productId,unit:p.unit,grade,packing,serviceDate:x.serviceDate,deliveryQty:number(x.quantity),region,regionVersion:p.delivery.regionVersion,zip:x.zip||null};
    const result=await api('/simulate',{asOf,lines:[line],performanceByLine:{item:{status:x.performanceStatus,period:period.toISOString().slice(0,7),quantity:number(x.previous),finalizedAt:asOf}}});
    const s=result.issuer,fmt=v=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:4}).format(v);
    $('result').textContent='구간 기준 '+s.selected[0].tierBasisQty+'판 · 단가 '+fmt(s.selected[0].unitPrice)+'원 · 상품 '+fmt(s.merchandise)+'원 · 배송 '+fmt(s.shipping)+'원 · 세금 '+fmt(s.tax)+'원 · 합계 '+fmt(result.customer.quotes[0].total.decimal)+'원';
    const freightOutput=$('freightResult');freightOutput.replaceChildren();
    for(const shipment of s.freight||[]){
      const {chosen,load}=shipment,title=document.createElement('strong'),detail=document.createElement('p');
      title.textContent=chosen.name+' · '+({PARCEL:'택배',TRUCK:'용달',FREIGHT:'정기화물',DIRECT:'직배송'}[chosen.mode]||'배송')+' · '+fmt(chosen.total)+'원';
      detail.textContent=load.TRAYS+'판 / '+load.BOXES+'상자 / '+fmt(load.KG)+'kg · 기본 '+fmt(chosen.base)+'원 · 할증 '+fmt(chosen.surcharge)+'원 · 별도 부가세 '+fmt(chosen.vat)+'원';
      freightOutput.append(title,detail);
      if(chosen.extras.length){const li=document.createElement('p');li.textContent=chosen.extras.map(x=>x.label+' '+fmt(x.charge)+'원').join(' · ');freightOutput.append(li);}
      const why=document.createElement('p');
      why.textContent=({CHEAPEST:'적격 후보의 총운송비 비교',PRIORITY:'계약 우선순위',MANUAL:'직접 지정 · '+shipment.reason}[shipment.selection])
        +' · 최저 후보와 차액 '+fmt(shipment.difference)+'원';freightOutput.append(why);
      const compared=document.createElement('p');compared.textContent=shipment.candidates.map(c=>c.name+' '+fmt(c.total)+'원').join(' / ');freightOutput.append(compared);
      if(shipment.excluded.length){const skipped=document.createElement('small');skipped.textContent=freightExcluded(shipment.excluded);freightOutput.append(skipped);}
    }
    say('저장한 가격표로 계산했습니다.');
  });
  const buyerState={sites:[],offers:[],retry:null};
  let inputRevision=1,offerScope=0;
  const quoteWait=makeWaitScene($('quotePending'),montages,createWait,(phase,data)=>{
    $('quotePending').hidden=phase==='idle'||phase==='complete';
    $('quotePending').setAttribute('aria-busy',String(data.status==='pending'));
    $('retryQuote').hidden=!['error','offline'].includes(phase);
  });
  let retryButton=null;
  $('retryQuote').onclick=()=>retryButton?.click();
  const resultView=makeResult($('buyerResult'),project,id=>api('/quote?id='+encodeURIComponent(id)),(mode,id)=>{
    invalidateQuote();
    if(mode==='new'){
      $('quoteQty').value='';$('quoteDay').value='';$('offerSelect').selectedIndex=-1;updateBuyerGrade();$('offerSelect').focus();
    } else if(id)run(()=>restoreQuoteInputs(id))();else $('quoteQty').focus();
  });
  function invalidateQuote(){
    inputRevision++;quoteWait.stop();buyerState.retry=null;resultView.clear();
  }
  for(const id of ['buyerGrade','offerSelect','quoteQty','quoteDay','quoteHistory'])$(id).addEventListener('input',invalidateQuote);
  function clearQuote(){
    offerScope++;invalidateQuote();
    $('offerSelect').replaceChildren();$('quoteHistory').replaceChildren();resultView.clear();buyerState.offers=[];buyerState.retry=null;
  }
  function updateBuyerGrade(){
    const offer=$('offerSelect').value===''?null:buyerState.offers[Number($('offerSelect').value)];
    $('buyerGradeGroup').hidden=!offer?.gradeChoices?.length;
    gradeChoice($('buyerGrade'),offer?.gradeChoices||[]);
  }
  $('offerSelect').onchange=updateBuyerGrade;
  async function showOffers(){
    clearQuote();
    const site=buyerState.sites[Number($('buyerSite').value)];if($('buyerSite').value===''||!site || site.verification!=='VERIFIED'){resultView.gate();return;}
    const scope=offerScope;const d=await api('/offers?org='+encodeURIComponent(site.org_id)+'&site='+encodeURIComponent(site.site_id));if(scope!==offerScope)return;buyerState.offers=d.offers;if(!d.offers.length&&!d.quotes.length)resultView.empty();
    $('offerSelect').replaceChildren(...d.offers.map((o,i)=>new Option([o.displayName||'승인 상품',o.shell?shellName(o.shell):o.packaging,o.packSize+'구'].filter(Boolean).join(' · '),String(i))));
    updateBuyerGrade();
    $('quoteHistory').replaceChildren(...d.quotes.map(q=>new Option(q.id,q.id)));
  }
  async function buyerSites(){
    const d=await api('/sites');buyerState.sites=d.sites;$('quote').hidden=!d.sites.length;if(!d.sites.some(site=>site.verification==='VERIFIED'))resultView.gate();
    $('buyerSite').replaceChildren(new Option('사업장 선택',''),...d.sites.map((site,i)=>new Option(site.org_id+' · '+site.site_id+(site.verification==='VERIFIED'?'':' · 인증 필요'),String(i))));
  }
  async function restoreQuoteInputs(id){
    if(!id)return;
    const expectedScope=offerScope;
    const data=await api('/quote-inputs?id='+encodeURIComponent(id));
    if(expectedScope!==offerScope||document.hidden)return;
    const site=buyerState.sites.findIndex(s=>s.org_id===data.orgId&&s.site_id===data.siteId&&s.verification==='VERIFIED');
    if(site<0)throw new Error('ACCESS_REQUIRED');
    $('buyerSite').value=String(site);const nextScope=offerScope+1;
    await showOffers();
    if(nextScope!==offerScope||document.hidden)return;
    $('offerSelect').selectedIndex=-1;$('quoteQty').value='';$('quoteDay').value='';
    if(data.status!=='REVIEW_INPUTS'){
      updateBuyerGrade();say('이전 견적은 복수 품목이나 출고 조건을 포함합니다. 다시 비교할 품목과 조건을 직접 선택해 주세요.');
      $('offerSelect').focus();return;
    }
    const ix=buyerState.offers.findIndex(o=>o.id===data.offerId);
    $('offerSelect').selectedIndex=ix;updateBuyerGrade();
    if(ix>=0&&buyerState.offers[ix].gradeChoices?.length)$('buyerGrade').value=[data.grade,data.packing].join('/');
    if(Number.isSafeInteger(data.quantity)&&data.quantity>0)$('quoteQty').value=data.quantity;
    if(/^\d{4}-\d{2}-\d{2}$/.test(data.serviceDate)&&data.serviceDate>=day(Date.now()))$('quoteDay').value=data.serviceDate;
    const missing=[ix<0&&'승인 상품',ix>=0&&buyerState.offers[ix].gradeChoices?.length&&!$('buyerGrade').value&&'규격',
      !$('quoteQty').value&&'수량',!$('quoteDay').value&&'납품일'].filter(Boolean);
    say(missing.length?'새로 선택할 조건 · '+missing.join(', '):'이전 견적의 납품 조건을 불러왔습니다. 확인 후 새 견적을 발급해 주세요.');
    $('quote').scrollIntoView({block:'start'});(ix<0?$('offerSelect'):!$('quoteDay').value?$('quoteDay'):$('quoteQty')).focus({preventScroll:true});
  }
  $('buyerSite').onchange=async()=>{
    if($('buyerSite').value===''){clearQuote();return;}
    try{await showOffers();}catch(error){say(localized[error.message]||'승인 상품을 불러오지 못했습니다.');}
  };
  $('quoteIssue').onclick=run(async()=>{
    resultView.clear();
    const site=buyerState.sites[Number($('buyerSite').value)],offer=buyerState.offers[Number($('offerSelect').value)];
    if($('buyerSite').value===''||!site||site.verification!=='VERIFIED')throw new Error('ACCESS_REQUIRED');
    if($('offerSelect').value===''||!offer||(offer.gradeChoices?.length&&!$('buyerGrade').value)||!$('quoteDay').value||$('quoteDay').value<day(Date.now())||!Number.isSafeInteger(number($('quoteQty').value))||number($('quoteQty').value)<1)throw new Error('QUOTE_INPUTS_REQUIRED');
    const body={orgId:site.org_id,siteId:site.site_id,inputRevision,lines:[{id:'line',shipmentId:'first',productId:offer.product_id,versionId:offer.id,unit:offer.unit,serviceDate:$('quoteDay').value,deliveryQty:number($('quoteQty').value),grade:$('buyerGrade').value.split('/')[0]||undefined,packing:$('buyerGrade').value.split('/')[1]||undefined}]};
    const signature=JSON.stringify(body);if(buyerState.retry?.signature!==signature)buyerState.retry={signature,key:crypto.randomUUID()};
    retryButton=$('quoteIssue');
    const result=await quoteWait.request(signal=>api('/quote',{...body,requestKey:buyerState.retry.key},signal),[{kind:'egg',values:[offer.product_id]},{kind:'quantity',values:[String(body.lines[0].deliveryQty)+' '+offer.unit]},{kind:'delivery',values:[body.lines[0].serviceDate]}]);
    if(!result)return;resultView.show(result);$('quoteHistory').add(new Option(result.id,result.id));$('quoteHistory').value=result.id;
  });
  $('quoteRecall').onclick=run(async()=>{retryButton=$('quoteRecall');resultView.clear();const result=await quoteWait.request(signal=>api('/quote?id='+encodeURIComponent($('quoteHistory').value),undefined,signal),[]);if(result)resultView.show(result);});
  // Re-entering a restored page requires a fresh server grant before redisplay.
  window.addEventListener('pagehide',clearQuote);
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearQuote();$('buyerSite').value='';}});
  $('practice').hidden=!state.practice;
  $('switchPractice').href=state.practice?'/ia?view=pricing-r3':'/ia?view=pricing-r3&practice=1';
  $('switchPractice').textContent=state.practice?'가격표로 돌아가기':'연습 화면';
  $('startPractice').onclick=run(async()=>{await api('/start',{});await desk();paint(null);await buyerSites();say('연습 공간을 열었습니다.');});
  $('practiceSample').onclick=()=>{
    if(!state.practice||!scope()?.definition||state.current)return;
    const d=scope().definition;
    matrix.set({schema:1,grades:d.grades,rows:[{min:1,max:10,cells:d.grades.flatMap(()=>['25','+0'])},{min:11,max:null,cells:d.grades.flatMap(()=>['20','+0'])}]},d.grades);
    $('minimum').value=10;$('start-date').value=day(Date.now()-86400000);$('end-date').value='';
    state.regionVersion='review-region-v1';$('regions').replaceChildren();addRegion({id:'practice-local',prefix:'11',label:'서울특별시',minimumQty:10,priority:1,weekdays:[0,1,2,3,4,5,6],status:'FEE',fee:'5'});
    fill($('scenario'),{serviceDate:day(Date.now()+86400000),quantity:10,region:'11',performanceStatus:'FINAL'});gradeChoice($('simGrade'),d.grades);dirty();say('연습 단가와 배송비를 입력했습니다.');
  };
  $('persona').onchange=run(async()=>{rememberVersion(null);state.newId=crypto.randomUUID();state.predecessor=null;state.parent=null;state.current=null;clearQuote();$('history').replaceChildren();$('result').textContent='';await desk();paint(null);await buyerSites();});
  $('convertLegacy').onclick=()=>{
    const v=state.current||state.parent,d=scope()?.definition;
    if(!v||!v.policy.tiers||!d?.grades?.length){say('운영자에게 상품 규격 등록을 요청해 주세요.');return;}
    const grade=d.grades.find(g=>g.id===$('legacy-grade').value),packing=$('legacy-packing').value;
    if(!grade||(!packing&&v.policy.tiers.some(t=>t.packMode!=='ADD'))){say('옮길 규격과 기존 확정 단가의 종류를 선택해 주세요.');return;}
    const rows=v.policy.tiers.map(t=>({min:t.min,max:t.max,cells:t.packMode==='ADD'?[t.price,'+'+t.packFee]:packing==='raw'?[t.price,'']:['',t.price]}));
    state.newId=crypto.randomUUID();state.predecessor=null;
    const basePolicy={...v.policy,sourceVersion:v.id,tiers:undefined,matrix:{schema:1,grades:[grade],rows}};
    state.parent={...v,policy:basePolicy};rememberVersion(null);
    paint({...v,status:'DRAFT',policy:basePolicy},basePolicy.matrix);state.current=null;$('scope').disabled=false;$('egg-shell').disabled=false;$('pack-size').disabled=false;
    $('current').textContent='기존 단가에서 옮긴 새 가격표 · '+grade.name;dirty();
  };
  state.newId=crypto.randomUUID();paint(null);
  if(state.practice){$('versions-panel').open=true;$('review-actions').open=true;$('simulation-panel').open=true;}
  switchTab(location.hash==='#shipping'?'shipping':'price');
  run(()=>motion.reveal($('price-workspace'),async()=>{const me=await fetch((window.ORDER_APP_CONTEXT?.endpoints?.price||'/api/ia/r3-price')+'/session',{cache:'no-store'});if(me.ok){const session=await me.json();state.csrf=session.csrf;state.ownerSession=session.practiceAllowed===true;$('practice-entry').hidden=!session.practiceAllowed;if(session.practiceAllowed)document.dispatchEvent(new CustomEvent('ia-session-ready',{detail:session}));}
    await desk();const requested=new URLSearchParams(location.search).get('priceVersion');if(requested&&state.versions.some(v=>v.id===requested))await open(requested);else if(!state.practice&&!requested&&state.versions.length)await open(state.versions[0].id);else{rememberVersion(null);paint(null);}await buyerSites();await registrationInfo();
    if(!state.practice){$('openPersonalDraft').hidden=false;if(!requested&&!query.has('quote')&&location.hash!=='#quote')await openPersonal();}
    if(!state.practice&&query.has('quote'))await restoreQuoteInputs(query.get('quote'));if(location.hash){const target=document.getElementById(location.hash.slice(1));if(target&&!target.closest('[hidden]'))target.scrollIntoView();}},{labels:{pending:'가격표 불러오는 중',success:'가격표 불러옴',error:'가격표를 불러오지 못했습니다.'}}))();

}
export function renderR3PricePage(nonce) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>계란 가격표 | Order</title>
<style>*{box-sizing:border-box}body{margin:0 auto;padding:1rem;max-width:72rem;font:1rem/1.5 system-ui,sans-serif;color:#17202b}a{color:inherit}h1{font-size:1.75rem}section,details{padding:1rem 0;border-top:1px solid #ccd2da}[hidden]{display:none!important}#price-workspace{--r3-skeleton-size:min(19rem,46vh)}fieldset,.fields,.bar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end}fieldset{margin:.5rem 0;border:1px solid #ccd2da;padding:.75rem;min-width:0}label{display:grid;gap:.25rem;flex:1 1 10rem;min-width:0}input,select,button{font:inherit;min-height:44px;border:1px solid #a7b0bc;border-radius:.4rem;background:white;padding:.4rem .6rem;color:inherit}input,select{width:100%;max-width:100%;min-width:0}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid currentColor;outline-offset:2px}output{display:block;margin:.75rem 0;font-weight:600}summary{cursor:pointer;min-height:44px}li{overflow-wrap:anywhere}#quoteAvatar{width:8rem;height:8rem}#quoteAvatar>div{width:100%;height:100%}#quotePending[data-phase=error]{color:#a52b29}#quoteBanners{list-style:none;padding:0;display:grid;isolation:isolate}#quoteBanners li{grid-area:1/1;width:fit-content;max-width:100%;padding:.3rem .7rem;border:1px solid currentColor;border-radius:1rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:white}#quoteBanners li:nth-child(2){margin:.55rem 0 0 .65rem}#quoteBanners li:nth-child(3){margin:1.1rem 0 0 1.3rem}@media(prefers-reduced-motion:no-preference){#quotePending[data-phase=error]{animation:quote-notice .3s ease-out}@keyframes quote-notice{25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}}html{scrollbar-width:none}body{font-family:system-ui,sans-serif}button{background:#edf1f6;border:0;font-weight:600}button.primary{background:#2455ce;color:white}input,select{border:1px solid #cdd5e1;background:white}section{border-top:1px solid #e0e6ef}.desk-heading,.bar,.weekdays{display:flex;flex-wrap:wrap;gap:.625rem}.desk-heading a{line-height:44px;color:#354965}.editor-fields{display:block;min-width:0;border:0;margin:0;padding:0}.weekdays label{display:inline-flex;align-items:center;flex:none;gap:.25rem}.weekdays input{width:1rem;min-height:1rem}.fields label,.bar label{flex-basis:9rem}pre{overflow:auto;white-space:pre-wrap}.matrix-scroll,body,main{scrollbar-width:none}.price-toolbar{display:flex;align-items:center;justify-content:space-between;gap:.5rem;position:sticky;top:0;background:white;z-index:4;border-bottom:1px solid #d4dce5;padding:.45rem 0}.price-tabs{display:flex;gap:.25rem}.price-tabs button{background:transparent;color:#526074}.price-tabs button[aria-pressed=true]{color:#172b4a;background:#e8edf5}.desk-heading>span{font-weight:bold}#notice:empty{margin:0}#price-registration>summary{font-weight:650}#price-registration input:read-only{background:#f2f4f7}.subtle{color:#526074;font-size:.9rem}.price-title{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.price-title p{margin:0;color:#526074}.price-title h1{margin:.5rem 0}.product-setup{display:grid;gap:.75rem;margin-top:.5rem;padding-bottom:.5rem}.product-setup button{justify-self:start}.price-meta{margin:.5rem 0}.price-meta label{flex-basis:8rem}.desk-heading a{line-height:1.4}details:has(>summary){padding:.65rem 0}.desk-heading{align-items:center}.connection-list:empty{display:none}#practice-entry{font-size:.85rem}#practice-entry a{color:#657184}@media(max-width:680px){body{padding:.75rem}.price-title h1{font-size:1.5rem}.product-setup .fields{display:grid;grid-template-columns:1fr 1fr}.price-meta{display:grid;grid-template-columns:1fr 1fr}}
${matrixCss}${carrierCss}${buyerResultCss}${asyncMotionCss}${editorMotionCss}${waitSceneCss}${priceShellCss}${priceBookCss}${getProductUiBootstrap().css}</style></head><body>
<header class="price-app-header"><div class="price-app-heading"><a href="/ia/">IA 포털</a><span aria-hidden="true">/</span><h1>계란 가격표</h1></div><nav class="price-app-nav" aria-label="가격표 도구"><a href="/ia?view=qa-lab" target="_blank" rel="noopener">QA랩</a><details class="price-utilities"><summary>더 보기</summary><div><span id="practice-entry" hidden><a id="switchPractice" href="/ia?view=pricing-r3&amp;practice=1">연습 화면</a></span></div></details></nav></header><main class="price-desk">
<fieldset id="practice" hidden><legend>연습 공간</legend><label>검토 역할<select id="persona"><option value="supplier">공급처 작성자</option><option value="operator">운영 검토자</option><option value="buyer">인증 사업장 예시</option></select></label><button id="startPractice">내 연습 공간 열기</button><button id="practiceSample">합성 예시 불러오기</button></fieldset>
<output aria-live="polite" id="notice"></output>
<div id="price-workspace"><button type="button" id="openPersonalDraft" hidden>본인 입력 초안 열기</button>
<section id="personal-panel" hidden><div class="price-toolbar"><div class="price-book-title"><div class="price-book-name"><h2 id="personalTitle">새 가격표</h2><span class="price-scope-label" title="내 계정에 저장한 초안">내 초안</span></div><div id="personalSummary" class="price-summary"></div></div><div class="price-main-actions"><span id="priceSaveState" class="price-save-state" aria-live="polite"></span><button type="button" id="personalSettingsOpen" data-price-open="personalSettings">설정</button><button type="button" id="savePersonalDraft" class="primary">저장</button></div></div>
<dialog id="personalSettings" class="price-settings" aria-labelledby="personalSettingsTitle"><div class="t-panel-slide" data-open="false"><header class="price-settings-header"><h2 id="personalSettingsTitle">가격표 설정</h2><button type="button" data-price-close>닫기</button></header><div class="price-settings-body"><p class="subtle">내 계정에 저장한 초안이에요. 공급처에 연결한 뒤 납품 가격으로 사용할 수 있어요.</p>
<div class="fields price-meta"><label>초안 이름<input id="personalName" maxlength="80" placeholder="예: 11월 9일 참고 단가"></label><label>공급처<input id="personalSupplier" maxlength="80" placeholder="미지정"></label><label>출고장<input id="personalOrigin" maxlength="80" placeholder="미지정"></label><label>상품명<input id="personalProduct" maxlength="80" placeholder="미지정"></label><label>난각번호<select id="personalShell"><option value="">미지정</option><option value="1">1번</option><option value="2">2번</option><option value="3">3번</option><option value="4">4번</option><option value="unspecified">구분 없음</option></select></label><label>판당 구수<input id="personalPack" type="number" min="1" max="360" placeholder="미지정"></label><label>배송 최소 주문량 (판)<input id="personalMinimum" type="number" min="1" value="10"></label></div></div></div></dialog>
<output id="personalStatus" aria-live="polite"></output>${priceBookMarkup}
<div id="personalConflict" hidden><div id="personalComparison"></div><button type="button" id="readPersonalRemote">서버 초안 열기</button><button type="button" id="keepPersonalLocal">서버 내용 확인 후 내 입력 유지</button></div>
<p id="personalImportNotice" class="subtle" hidden>이 포장 단가는 등록 상품에 바로 가져올 수 없어요. 기존 원란·포장 표를 선택해 저장한 뒤 가져와 주세요.</p>
<details id="personalImport" hidden><summary>등록 상품 가격표로 가져오기</summary><div class="fields"><label>연결된 상품<select id="personalDest"></select></label><label>상품 난각번호<select id="personalImportShell"></select></label><label>상품 포장 단위<select id="personalImportPack"></select></label></div><button type="button" id="importPersonalDraft">등록 상품에 단가 가져오기</button></details>
<button id="personalBack" type="button" hidden>상품 관리로 돌아가기</button></section>
<details id="price-registration" hidden><summary id="registrationTitle">공급처·출고장·상품 등록</summary>
<div class="product-setup" id="productSetup" hidden><div class="fields"><label>등록할 소속<select id="setupOrg"></select></label><label>공급처명<input id="setupSupplier" maxlength="60"></label><label>출고장명<input id="setupOrigin" maxlength="60"></label><label>상품명<input id="setupProduct" maxlength="60"></label><label>판매 난각번호<select id="setupShell"><option value="">선택</option><option value="1">1번</option><option value="2">2번</option><option value="3">3번</option><option value="4">4번</option><option value="unspecified">구분 없음</option></select></label><label>판당 구수<input id="setupPack" inputmode="numeric" type="number" min="1" max="360"></label></div><button id="registerProduct" class="primary">상품 등록하고 가격 입력</button><a id="supplierInvite" hidden>공급처 담당자용 연결 주소</a></div>
<div id="connectionForm" hidden><p>담당 공급처에 상품 연결을 요청하면 이곳에서 진행 상태를 확인할 수 있습니다.</p><label>연결할 공급처 이름<input id="requestCompany" maxlength="60"></label><button id="requestConnection">담당 가격표 연결 요청</button></div><ul class="connection-list" id="connectionStatus" aria-live="polite"></ul><div id="connectionReview"></div></details>
<div id="staff-desk" class="price-toolbar" hidden><nav class="price-tabs" aria-label="가격표와 배송"><button type="button" id="priceTab" aria-pressed="true">계란 가격표</button><button type="button" id="shippingTab" aria-pressed="false">배송 정책</button></nav><div class="price-main-actions"><button type="button" data-price-open="staffSettings">설정</button><button class="primary" data-action="save">저장</button></div></div>
<div id="pricing-editor" hidden><p id="current"></p>
<details id="versions-panel"><summary>저장한 가격표 · 새 가격표</summary><div class="bar"><label>저장된 가격표<select id="versions"></select></label><button id="open">열기</button><button id="new">새 계란 가격표</button><button id="next">후속 버전</button></div></details>
<section id="prices"><div class="bar"><label>공급처 · 출고장 · 상품<select id="scope"></select></label></div>
<details id="catalogSettings" hidden><summary>상품 표시 정보 관리</summary><p>배정된 상품의 공급처명·거점명과 판매 규격을 등록합니다.</p><details><summary>배정 정보</summary><code id="catalogCode"></code></details><div class="fields"><label>공급처명<input id="supplierName" maxlength="60"></label><label>거점명<input id="originName" maxlength="60"></label><label>상품명<input id="productName" maxlength="60"></label><label>규격명 (쉼표로 구분)<input id="catalogGrades"></label><label>포장당 구수 (쉼표로 구분)<input id="catalogPacks"></label></div><fieldset class="weekdays" id="catalogShells"><legend>판매 난각번호</legend><label><input type="checkbox" value="1">1번</label><label><input type="checkbox" value="2">2번</label><label><input type="checkbox" value="3">3번</label><label><input type="checkbox" value="4">4번</label><label><input type="checkbox" value="unspecified">구분 없음</label></fieldset><button id="saveCatalog">상품 표시 정보 저장</button></details>
<p id="requires-catalog" hidden>이 상품에 등록된 규격이 없습니다. 운영자가 상품 표시 정보를 등록하면 가격표를 작성할 수 있습니다.</p></section>
<div id="legacyTerms" hidden><h3>기존 단가표</h3><p id="legacyTiers"></p><div class="fields"><label>옮길 규격<select id="legacy-grade"></select></label><label>기존 확정 단가의 종류<select id="legacy-packing"><option value="">선택</option><option value="raw">원란</option><option value="packed">포장</option></select></label></div><button type="button" id="convertLegacy">상품 규격표로 옮기기</button></div>
<dialog id="staffSettings" class="price-settings" aria-labelledby="staffSettingsTitle"><div class="t-panel-slide" data-open="false"><header class="price-settings-header"><h2 id="staffSettingsTitle">가격표 설정</h2><button type="button" data-price-close>닫기</button></header><div class="price-settings-body"><fieldset class="editor-fields" id="staff-settings-fields"><legend class="sr-only">가격표 설정 편집</legend><div class="fields price-meta"><label>난각번호<select id="egg-shell"></select></label><label>포장 단위<select id="pack-size"></select></label><label>최소 주문량 (판)<input id="minimum" type="number" min="1"></label><label>유효 시작일<input id="start-date" type="date"></label><label>종료일 (이날부터 미적용)<input id="end-date" type="date"></label></div>
<details><summary>고급 단가 정책</summary><div class="fields" id="basis"></div><p id="performanceNote">전월 실적은 확정된 취소·반품 집계 기준이 있는 경우에 적용됩니다.</p><div class="fields" id="cost"></div></details></fieldset></div></div></dialog>
<div id="price-content"><div id="matrix">${matrixMarkup}</div></div>
<fieldset class="editor-fields" id="pricing-fields"><legend class="sr-only">배송 조건 편집</legend>
<section id="shipping"><h2>배송 조건</h2>${carrierMarkup}<details><summary>지역별 직접 배송</summary><label>배송비 적용 기준<select id="groupBasis"><option value="SHIPMENT">출고 회차별</option><option value="SITE">납품일·사업장별</option><option value="PACK">포장 수량별</option></select></label><div id="regions"></div><button id="addRegion">지역 추가</button></details></section>
</fieldset>
<details id="review-actions"><summary>검토 요청·승인</summary><label>보완·철회 사유<input id="reason" maxlength="240"></label><div class="bar"><button data-action="submit">검토 요청</button><button data-action="return">보완 요청</button><button data-action="approve">승인</button><button data-action="withdraw">철회</button><button id="replaceApproved" hidden>기존 가격표 종료 후 승인</button></div></details><div id="conflict" hidden><p>다른 사용자가 저장한 가격표가 있습니다. 현재 입력과 서버 버전을 비교해 주세요.</p><details><summary>서버 버전 보기</summary><div id="remoteVersion" class="matrix-scroll"></div></details><button id="keepInput">서버 변경 확인 후 내 입력 유지</button><button id="remoteInput">서버 버전 열기</button></div>
<details id="simulation-panel"><summary>미리 계산</summary><div id="simulation"><label>단가 규격<select id="simGrade"></select></label><div class="fields" id="scenario"></div><button id="simulate">저장된 조건으로 계산</button><output id="result" aria-live="polite"></output><output id="freightResult" aria-live="polite"></output></div></details><details><summary>변경 이력</summary><ol id="history"></ol></details></div>
</div><section id="quote" hidden><h2>사업장 견적</h2><div class="fields"><label>사업장<select id="buyerSite"></select></label><label>승인 상품<select id="offerSelect"></select></label><label id="buyerGradeGroup" hidden>단가 규격<select id="buyerGrade"></select></label><label>이번 납품 수량<input inputmode="numeric" id="quoteQty"></label><label>납품일<input type="date" id="quoteDay"></label></div><button id="quoteIssue">견적 발급</button><div class="bar"><label>발급한 견적<select id="quoteHistory"></select></label><button id="quoteRecall">다시 보기</button></div><div id="quotePending" data-wait-scene hidden><div id="quoteBanners" data-banner-stack aria-hidden="true"></div><div id="quoteAvatar" data-wait-avatar aria-hidden="true"></div><p id="quoteWaitTitle" data-wait-copy aria-live="polite"></p><button type="button" id="retryQuote" hidden>다시 비교하기</button></div><div aria-live="polite" id="buyerResult"></div></section>
</main><script nonce="${nonce}">${getProductUiBootstrap().script}${bloubScript}
${quoteJellyRuntime}
window.OrderMagneticAction=(${browserFunction(mountMagneticAction)});
;(${browserFunction(priceDesk)})(${browserFunction(createQuoteWait)},${browserFunction(mountWaitScene)},${JSON.stringify({...bloubMontages,...waitMontages})},${buyerResultClient},${browserFunction(projectBuyerResult)},${browserFunction(createPriceMatrixModel)},${browserFunction(mountPriceMatrix)},${browserFunction(mountCarrierEditor)},${browserFunction(mountAsyncMotion)},${browserFunction(bindEditorMotion)},${browserFunction(mountPriceShell)},${browserFunction(createPriceBookModel)},${browserFunction(mountPriceBook)},${browserFunction(installQaSession)});</script></body></html>`;
}
