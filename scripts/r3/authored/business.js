(function(w){
'use strict';
const U=w.QAUI,{esc,icon,button,field,head,states}=U;
const modules=w.ORDER_DESIGN_MODULES;
const MAX_FILE=10000000;
const MAX_TOTAL=20000000;
// Search suggestions are free-text helpers, not business verification.
// Sector groups: KSIC 11, https://mods.go.kr/boardDownload.es?bid=5106&list_no=444074&seq=2
// NTS registration examples: https://s.nts.go.kr/andong/na/ntt/selectNttInfo.do?bbsId=1028&mi=2201&nttSn=1354686
const sectors=["음식점업", "농업, 임업 및 어업", "광업", "제조업", "전기, 가스, 증기 및 공기조절 공급업", "수도, 하수 및 폐기물 처리, 원료 재생업", "건설업", "도매 및 소매업", "운수 및 창고업", "숙박 및 음식점업", "정보통신업", "금융 및 보험업", "부동산업", "전문, 과학 및 기술 서비스업", "사업시설 관리, 사업 지원 및 임대 서비스업", "공공행정, 국방 및 사회보장 행정", "교육 서비스업", "보건업 및 사회복지 서비스업", "예술, 스포츠 및 여가관련 서비스업", "협회 및 단체, 수리 및 기타 개인 서비스업", "가구 내 고용활동 및 달리 분류되지 않은 자가소비 생산활동", "국제 및 외국기관", "도매업", "소매업", "숙박업"];
const industries=["제과점업", "한식 일반 음식점업", "한식 면 요리 전문점", "한식 육류 요리 전문점", "한식 해산물 요리 전문점", "중식 음식점업", "일식 음식점업", "서양식 음식점업", "기타 외국식 음식점업", "커피 전문점", "기타 비알코올 음료점업", "동물카페", "치킨 전문점", "피자, 햄버거, 샌드위치 및 유사 음식점업", "김밥 및 기타 간이 음식점업", "간이 음식 포장 판매 전문점", "이동 음식점업", "생맥주 전문점", "기타 주점업", "이용업", "두발 미용업", "피부 미용업", "기타 미용업", "스크린인쇄업", "건설장비운영", "의류도매"];
const initials=s=>[...s].map(ch=>{const n=ch.charCodeAt(0)-44032;return n>=0&&n<=11171?'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]:ch;}).join('');
function suggested(list,value){const q=value.trim().replace(/\s/g,'');return list.filter(x=>!q||x.replace(/\s/g,'').includes(q)||initials(x).replace(/\s/g,'').includes(q)).slice(0,6);}
const busy=(label,action)=>button('<span class="spinner" aria-hidden="true"></span>',action,'primary wide','aria-busy="true" aria-label="'+label+'" disabled');
const openCaseButton=(purpose)=>button(purpose==='business'?'내 사업장 인증·보완':'내 증빙 가리기·제출','open-case-'+purpose,'text');
function linkCase(root,api,signal,purpose){
 root.addEventListener('click',event=>{if(event.target.closest('[data-action="open-case-'+purpose+'"]'))api.select('role-case',purpose);},{signal});
}
const required='<b class="required-star" aria-label="필수"> *</b>';
const visibleNote=(text,kind='error')=>'<p class="business-message '+kind+'" role="'+(kind==='error'?'alert':'status')+'">'+icon(kind==='error'?'alert':'file',18)+'<span>'+esc(text)+'</span></p>';
const docRow=(name='사업자등록증.pdf',state='selected')=>'<div class="document-row"><div class="document-icon">'+icon('file',24)+'</div><div class="row-copy"><strong>'+esc(name)+'</strong><small>'+({review:'확인 중',safe:'선택한 예시 파일',selected:'선택됨'}[state])+'</small></div></div>';
function uploadBox(multi=false){return '<label class="file-drop" role="button" tabindex="0" aria-label="'+(multi?'거래내역 증빙 여러 파일 선택':'사업자등록증 한 파일 선택')+'"><input type="file" name="document" hidden><span class="upload-symbol">'+icon('upload',26)+'</span><strong>'+(multi?'증빙 파일 선택':'사업자등록증 선택')+'</strong><span class="upload-desktop">여기로 끌어오거나 눌러서 선택하세요</span><small>PDF, JPG, PNG · 파일당 최대 10MB</small></label><div class="upload-live" aria-live="polite"></div>';}
function bindUpload(root,multi,c){
 const drop=root.querySelector('.file-drop'),input=root.querySelector('[type=file]'),live=root.querySelector('.upload-live');if(!drop||!input||!live)return;
 input.multiple=multi;input.accept='image/jpeg,image/png,application/pdf';let gen=0,accepted=[];
 const paint=()=>{live.replaceChildren();for(const [i,file] of accepted.entries()){const line=document.createElement('div');line.className='upload-item';line.innerHTML=docRow(file.name);const remove=document.createElement('button');remove.className='icon-btn';remove.type='button';remove.setAttribute('aria-label',file.name+' 삭제');remove.innerHTML=icon('close',18);remove.onclick=()=>{gen++;accepted.splice(i,1);paint();};line.append(remove);live.append(line);}root.dataset.fileSelected=String(accepted.length>0);};
 const fail=message=>{paint();const err=document.createElement('div');err.innerHTML=visibleNote(message);live.append(err);drop.setAttribute('aria-invalid','true');U.shake(drop);};
 const select=async files=>{const own=++gen;input.value='';if(!files.length)return;const next=multi?accepted.slice():[];if((!multi&&files.length!==1)||next.length+files.length>8){fail(multi?'최대 8개의 파일을 선택해 주세요.':'사업자등록증은 한 파일을 선택해 주세요.');return;}if([...next,...files].reduce((n,f)=>n+f.size,0)>MAX_TOTAL){fail('전체 파일 크기를 20MB 이하로 줄여 주세요.');return;}
   for(const file of files){if(c.signal.aborted||own!==gen)return;try{const result=await U.inspectFile(file);if(c.signal.aborted||own!==gen)return;if(!result.ok||!['image/png','image/jpeg','application/pdf'].includes(file.type)||file.size>MAX_FILE){fail((result.ok?'PDF, JPG, PNG 파일만 사용할 수 있어요.':result.reason)+' 파일을 다시 선택해 주세요.');return;}next.push({name:file.name,size:file.size});}catch{if(!c.signal.aborted&&own===gen)fail('파일을 열지 못했어요. 다시 선택해 주세요.');return;}}
   if(c.signal.aborted||own!==gen)return;accepted=next;drop.setAttribute('aria-invalid','false');drop.classList.remove('is-error','is-shaking');paint();};
 const on=(el,type,fn)=>el?.addEventListener(type,fn,{signal:c.signal});
 on(input,'change',()=>select([...input.files]));on(drop,'keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();input.click();}});for(const ev of ['dragenter','dragover'])on(drop,ev,e=>{e.preventDefault();drop.classList.add('is-over');});on(drop,'dragleave',()=>drop.classList.remove('is-over'));on(drop,'drop',e=>{e.preventDefault();drop.classList.remove('is-over');select([...e.dataTransfer.files]);});c.signal.addEventListener('abort',()=>{gen++;accepted=[];input.value='';},{once:true});
}
function dateParts(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function openingPicker(){
 return '<div class="opening-wheels" hidden><div class="drawer-dim opening-date-dim"></div><section class="functional-drawer opening-date-sheet t-panel-slide" data-open="false" role="dialog" aria-modal="true" aria-label="개업일 선택">'+
  '<button type="button" class="drawer-handle" data-action="opening-date-cancel" aria-label="개업일 선택 닫기"><i></i></button><h2>개업일 [<output class="opening-draft"></output>]</h2>'+
  '<div class="wheel-picker"><div class="wheel-highlight" aria-hidden="true"></div>'+[['year','연도'],['month','월'],['day','일']].map(([part,label])=>'<div class="wheel-column opening-'+part+'" role="listbox" tabindex="0" aria-label="'+label+'"></div>').join('')+'</div>'+
  '<div class="opening-date-actions">'+button('취소','opening-date-cancel','secondary')+button('완료','opening-date-apply','primary')+'</div></section></div>';
}
function mountDate(root,locked,c,api){
 const slot=root.querySelector('.opening-date'),control=slot.querySelector('button'),output=slot.querySelector('output'),panel=root.querySelector('.opening-wheels'),sheet=panel.querySelector('.opening-date-sheet');control.disabled=locked;
 const today=dateParts(),parts=['year','month','day'],units={year:'년',month:'월',day:'일'},columns={},timers=new Map(),background=new Map();
 const format=value=>value.year+'/'+String(value.month).padStart(2,'0')+'/'+String(value.day).padStart(2,'0');
 function normalize(value){const year=Math.max(1900,Math.min(today.year,Number(value.year)||today.year)),month=Math.max(1,Math.min(year===today.year?today.month:12,Number(value.month)||1)),max=year===today.year&&month===today.month?today.day:new Date(Date.UTC(year,month,0)).getUTCDate();return {year,month,day:Math.max(1,Math.min(max,Number(value.day)||1))};}
 const retained=/^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(output.textContent.trim());
 let committed=normalize(retained?{year:+retained[1],month:+retained[2],day:+retained[3]}:today),draft={...committed};
 const ranges=()=>({year:[1900,today.year],month:[1,draft.year===today.year?today.month:12],day:[1,draft.year===today.year&&draft.month===today.month?today.day:new Date(Date.UTC(draft.year,draft.month,0)).getUTCDate()]});
 const on=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal:c.signal});
 let dateId='order-opening-date',suffix=1;
 while(document.getElementById(dateId)&&document.getElementById(dateId)!==panel)dateId='order-opening-date-'+(++suffix);
 panel.id=dateId;control.setAttribute('aria-controls',panel.id);control.setAttribute('aria-haspopup','dialog');
 const clearPending=()=>{for(const timer of timers.values())clearTimeout(timer);timers.clear();};
 function paint(){
  draft=normalize(draft);const bounds=ranges();
  for(const part of parts){
   const col=columns[part],[lo,hi]=bounds[part];
   if(col.dataset.range!==lo+':'+hi){
    col.dataset.range=lo+':'+hi;
    col.innerHTML='<div class="wheel-spacer" aria-hidden="true"></div>'+Array.from({length:hi-lo+1},(_,i)=>'<button type="button" role="option" tabindex="-1" id="'+panel.id+'-'+part+'-'+(lo+i)+'" data-opening-value="'+(lo+i)+'">'+(lo+i)+units[part]+'</button>').join('')+'<div class="wheel-spacer" aria-hidden="true"></div>';
   }
   for(const item of col.querySelectorAll('[role=option]')){const selected=Number(item.dataset.openingValue)===draft[part];item.setAttribute('aria-selected',String(selected));if(selected)col.setAttribute('aria-activedescendant',item.id);}
   col.scrollTop=(draft[part]-lo)*44;
  }
  panel.querySelector('.opening-draft').textContent=format(draft);
 }
 function read(part){const col=columns[part],items=[...col.querySelectorAll('[role=option]')];return Number(items[Math.max(0,Math.min(items.length-1,Math.round(col.scrollTop/44)))]?.dataset.openingValue)||draft[part];}
 const visibleDate=()=>Object.fromEntries(parts.map(part=>[part,read(part)]));
 function settle(){if(panel.hidden||c.signal.aborted)return;clearPending();draft=normalize(visibleDate());paint();}
 function close({commit=false,focus=true}={}){
  if(panel.hidden)return;
  if(commit){draft=normalize(visibleDate());committed={...draft};output.textContent=format(committed);output.dispatchEvent(new Event('change',{bubbles:true}));}
  clearPending();draft={...committed};gesture?.deactivate();gesture?.reset();
  try{if(panel.hidePopover&&panel.matches(':popover-open'))panel.hidePopover();}catch{}
  panel.hidden=true;sheet.dataset.open='false';control.setAttribute('aria-expanded','false');
  for(const [element,inert] of background)element.inert=inert;background.clear();
  if(focus&&!c.signal.aborted)control.focus({preventScroll:true});
 }
 for(const part of parts){
  const col=columns[part]=panel.querySelector('.opening-'+part);
  on(col,'scroll',()=>{clearTimeout(timers.get(part));if(!panel.hidden)timers.set(part,setTimeout(settle,90));},{passive:true});
  on(col,'scrollend',settle);
  on(col,'click',e=>{const option=e.target.closest('[role=option]');if(!option)return;clearPending();draft=visibleDate();draft[part]=Number(option.dataset.openingValue);paint();col.focus({preventScroll:true});});
  on(col,'keydown',e=>{
   if(!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key))return;e.preventDefault();clearPending();
   draft=normalize(visibleDate());const [lo,hi]=ranges()[part],current=draft[part],amount={ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5}[e.key];
   draft[part]=e.key==='Home'?lo:e.key==='End'?hi:Math.max(lo,Math.min(hi,current+amount));paint();
  });
 }
 const gesture=w.ORDER_QA_SHEET?.(sheet,[sheet.querySelector('.drawer-handle')],{signal:c.signal,reduced:api.reduced,open:false,surface:panel.querySelector('.opening-date-dim'),close:()=>close()});
 output.textContent=format(committed);paint();
 on(control,'click',()=>{
  if(locked||!panel.hidden)return;draft={...committed};panel.hidden=false;sheet.dataset.open='true';control.setAttribute('aria-expanded','true');panel.setAttribute('popover','manual');
  try{if(panel.showPopover)panel.showPopover();else panel.removeAttribute('popover');}catch{panel.removeAttribute('popover');}
  for(const element of root.children)if(element!==panel&&!['STYLE','SCRIPT'].includes(element.tagName)){background.set(element,element.inert);element.inert=true;}
  gesture?.activate();gesture?.reset();paint();columns.year.focus({preventScroll:true});
 });
 on(panel,'click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(e.target.classList.contains('opening-date-dim')||action==='opening-date-cancel')close();if(action==='opening-date-apply')close({commit:true});});
 on(panel,'keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  if(e.key!=='Tab')return;const focusable=[...panel.querySelectorAll('button:not([tabindex="-1"]),[role=listbox]')];
  if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();focusable[0].focus();}
 });
 c.signal.addEventListener('abort',()=>{clearPending();close({focus:false});},{once:true});
}
function bindSuggest(input,list,c){
 const menu=document.createElement('div');menu.className='business-options';menu.id=U.uid('options');menu.setAttribute('role','listbox');menu.hidden=true;const field=input.closest('.field'),slot=document.createElement('div');slot.className='business-combobox';field.before(slot);slot.append(field,menu);input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',menu.id);let index=-1;
 function close(){menu.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
 function pick(v){input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus();}
 function refresh(){menu.replaceChildren();index=-1;for(const item of suggested(list,input.value)){const b=document.createElement('button');b.type='button';b.tabIndex=-1;b.textContent=item;b.id=U.uid('choice');b.setAttribute('role','option');b.onpointerdown=e=>e.preventDefault();b.onclick=()=>pick(item);menu.append(b);}menu.hidden=!menu.children.length;const rect=field.getBoundingClientRect();const below=Math.max(0,innerHeight-rect.bottom-8),above=Math.max(0,rect.top-8);const opensAbove=below<160&&above>below;menu.classList.toggle('opens-above',opensAbove);menu.style.maxHeight=Math.min(220,opensAbove?above:below)+'px';input.setAttribute('aria-expanded',String(!menu.hidden));input.removeAttribute('aria-activedescendant');}
 for(const ev of ['focus','input','compositionend'])input.addEventListener(ev,e=>{if(!e.isComposing)refresh();},{signal:c.signal});input.addEventListener('blur',close,{signal:c.signal});input.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='Escape'){close();return;}if(e.key==='Enter'&&!menu.hidden&&index>=0){e.preventDefault();pick(menu.children[index].textContent);return;}if(!['ArrowDown','ArrowUp'].includes(e.key)||!menu.children.length)return;e.preventDefault();if(menu.hidden)refresh();index=(index+(e.key==='ArrowDown'?1:-1)+menu.children.length)%menu.children.length;Array.from(menu.children).forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));input.setAttribute('aria-activedescendant',menu.children[index].id);},{signal:c.signal});close();
}
const bStates=states([['empty','입력 전'],['filled','입력됨'],['format','번호 형식 오류'],['checking','조회 중'],['mismatch','정보 불일치'],['unavailable','조회 불가'],['verified','검증 예시'],['document','등록증 누락']]);
modules.push({id:'business',group:'사업장·증빙',label:'사업자 정보 등록',description:'입력과 서류 보완을 확인합니다.',width:'mobile',states:bStates,render(s,o={}){
 const filled=['filled','checking','mismatch','verified','document'].includes(s);
 const text=(label,name,example,err='')=>field(label,name,label,{value:filled?example:'',required:true,error:err});
 return '<div class="page business-page">'+head('사업자 정보 등록','',o)+(s==='unavailable'?visibleNote('사업자 조회에 연결하지 못했어요. 사업자등록증을 첨부해 확인을 요청해 주세요.','info')+openCaseButton('business'):'<div class="business-fields">'+field('사업자등록번호','business-number','사업자등록번호',{value:filled?'123-45-67890':'',required:true,mode:'numeric',max:12,error:s==='format'?'사업자등록번호 10자리를 확인해 주세요.':s==='mismatch'?'사업자등록번호를 확인해 주세요.':''})+text('상호','business-name','오더 샘플베이커리',s==='mismatch'?'사업자등록증의 상호를 확인해 주세요.':'')+text('대표자명','owner-name','홍길동')+'<div class="opening-date"><button type="button" class="btn secondary" aria-expanded="false">개업일'+required+' <output></output></button></div>'+text('업태','business-sector','음식점업')+text('업종','business-type','제과점업')+'</div>'+(s==='verified'?'<div class="verification-mark" role="status" aria-label="사업자 정보 확인됨">'+icon('check',24)+'</div>'+openCaseButton('business'):s==='checking'?busy('사업자 정보 조회 중','verify-business'):button('인증하기','verify-business','primary wide')))+'<section class="document-section"><h2>사업자등록증'+required+'</h2>'+uploadBox()+(s==='document'?visibleNote('사업자등록증을 올려주세요.'):'')+'</section><div class="bottom-actions">'+button('다음','business-next','primary')+'</div></div>'+(s==='unavailable'?'':openingPicker());},
 mount(root,s,api){const c=new AbortController();linkCase(root,api,c.signal,'business');bindUpload(root,false,c);const n=root.querySelector('[name=business-number]'),locked=['checking','verified'].includes(s);if(n){mountDate(root,locked,c,api);for(const f of root.querySelectorAll('.business-fields input'))f.disabled=locked;if(!locked){bindSuggest(root.querySelector('[name=business-sector]'),sectors,c);bindSuggest(root.querySelector('[name=business-type]'),industries,c);}n.oninput=()=>{const v=n.value.replace(/\D/g,'').slice(0,10);n.value=v.length>5?v.slice(0,3)+'-'+v.slice(3,5)+'-'+v.slice(5):v.length>3?v.slice(0,3)+'-'+v.slice(3):v;};}
 root.addEventListener('click',e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(a==='verify-business'&&!locked){let first=null;for(const f of root.querySelectorAll('.business-fields input')){const bad=f===n?f.value.replace(/\D/g,'').length!==10:!f.value.trim();if(bad){U.setFieldError(f,f===n?'사업자등록번호 10자리를 확인해 주세요.':'필수 정보예요.');U.shake(f.closest('.field'));first??=f;}}if(first)return first.focus();api.select('business','checking');}if(a==='business-next'){if(root.dataset.fileSelected!=='true'){const drop=root.querySelector('.file-drop');drop.setAttribute('aria-invalid','true');U.shake(drop);drop.focus();return;}if(!['unavailable','verified','document'].includes(s)){api.toast('사업자 정보를 먼저 확인해 주세요.');return;}api.select('proof','empty');}},{signal:c.signal});return()=>c.abort();}});
const proofErrors={oversize:'파일당 10MB 이하로 줄여 다시 선택해 주세요.',format:'PDF, JPG, PNG 파일을 다시 선택해 주세요.',blocked:'이 파일은 차단됐어요. 다른 파일을 다시 올려주세요.',error:'파일을 올리지 못했어요. 다시 올려주세요.'};
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
const segments=text=>segmenter?Array.from(segmenter.segment(text),s=>s.segment):Array.from(text);
function limitMemo(value){let count=0,out='';for(const token of segments(value)){if(!/^\s+$/u.test(token)&&++count>500)break;out+=token;}return {value:out,count:Math.min(500,count)};}
const proofStates=states([['empty','파일 선택'],['selected','선택됨'],['oversize','10MB 초과'],['format','형식 오류'],['checking','안전 검사 중'],['blocked','차단됨'],['error','업로드 실패'],['ready','제출 준비']]);
modules.push({id:'proof',group:'사업장·증빙',label:'거래내역 증빙',description:'거래 자료와 개인정보 가림 처리 전후를 확인합니다.',width:'mobile',states:proofStates,render(s,o={}){return '<div class="page proof-page">'+head('거래내역 증빙','',o)+'<section class="proof-purpose"><h2>거래내역 증빙 시 주의사항</h2><ul><li>직전 1개월 정산서에서 가격과 수량, 거래일이 보이도록 올려주세요.</li><li>사업장을 제외한 제3자의 개인정보는 가려주세요.</li><li>보완을 위해 최근 3개월 내 자료를 추가로 요청할 수 있어요.</li></ul>'+openCaseButton('reprice')+'</section><div class="proof-upload">'+(proofErrors[s]?visibleNote(proofErrors[s]):'')+(['selected','checking','ready'].includes(s)?docRow('거래명세서 예시.pdf',s==='checking'?'review':'safe'):'')+uploadBox(true)+'</div>'+field('추가 요청 · 선택','document-memo','추가 요청',{multiline:true,rows:3})+'<div class="memo-meter"><progress max="500" value="0" aria-label="추가 요청 글자 수"></progress><output aria-live="polite">500자 남음</output></div><div class="bottom-actions">'+button('다음','proof-next','primary',s==='checking'?'disabled':'')+'</div></div>';},mount(root,s,api){const c=new AbortController();linkCase(root,api,c.signal,'reprice');bindUpload(root,true,c);const memo=root.querySelector('textarea'),meter=root.querySelector('progress'),label=root.querySelector('.memo-meter output');function update(){const l=limitMemo(memo.value);if(memo.value!==l.value)memo.value=l.value;meter.value=l.count;label.textContent=(500-l.count)+'자 남음';}memo.addEventListener('input',e=>{if(!e.isComposing)update();},{signal:c.signal});memo.addEventListener('compositionend',update,{signal:c.signal});if(['selected','ready'].includes(s))root.dataset.fileSelected='true';root.addEventListener('click',e=>{if(e.target.closest('[data-action=proof-next]')){if(root.dataset.fileSelected!=='true'){const drop=root.querySelector('.file-drop');drop.setAttribute('aria-invalid','true');U.shake(drop);drop.focus();return;}api.select('signature','empty');}},{signal:c.signal});return()=>c.abort();}});
const signStates=states([['empty','서명 전'],['drawn','서명 예시'],['missing','서명 누락'],['processing','제출 중'],['done','접수 예시']]);
const sampleNames=['사업자등록증 예시','거래명세서 예시'];
function drawSample(c,n){
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);const scale=c.width/360;ctx.save();ctx.scale(scale,scale);ctx.fillStyle='#1c2830';ctx.font='bold 22px sans-serif';ctx.fillText(sampleNames[n],22,48);ctx.font='14px sans-serif';ctx.fillText('검수용 합성 자료',22,80);ctx.strokeStyle='#a7afb5';
 for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(22,112+i*26);ctx.lineTo(335,112+i*26);ctx.stroke();}ctx.fillStyle='#161a1c';ctx.fillRect(94,139,112,15);ctx.restore();
}
function previewMount(root,c){
 const shell=root.querySelector('.document-viewer');if(!shell)return;const rows=Array.from(root.querySelectorAll('.document-thumb'));const pictures=rows.map((row,i)=>{const px=document.createElement('canvas');px.width=720;px.height=540;drawSample(px,i);return px;});
 const renderThumbs=()=>rows.forEach((row,i)=>{const t=row.querySelector('canvas');t.getContext('2d').drawImage(pictures[i],0,0,t.width,t.height);});
 let index=0,zoom=false,editing=false,start=null,opener=null;
 const view=shell.querySelector('canvas');const ctx=view.getContext('2d');const status=shell.querySelector('output');const edit=shell.querySelector('[data-action=preview-edit]');
 function load(){ctx.drawImage(pictures[index],0,0,view.width,view.height);status.textContent=sampleNames[index]+' · '+(index+1)+' / '+rows.length;view.setAttribute('aria-label',sampleNames[index]);}
 function move(amount){if(editing)return;index=(index+amount+rows.length)%rows.length;load();}
 function setEdit(flag){editing=flag;edit.textContent=flag?'가림 저장':'추가 가림';edit.setAttribute('aria-pressed',String(flag));shell.querySelector('.preview-mask-help').hidden=!flag;}
 const close=()=>{shell.hidden=true;start=null;if(opener)opener.focus();};
 rows.forEach((row,i)=>row.addEventListener('click',()=>{opener=row;index=i;zoom=false;setEdit(false);shell.querySelector('.document-viewport').classList.remove('is-zoomed');load();shell.hidden=false;shell.querySelector('button').focus();},{signal:c.signal}));
 shell.addEventListener('click',e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(a==='preview-close'){close();return;}if(a==='preview-next')move(1);if(a==='preview-prev')move(-1);if(a==='preview-zoom'){zoom=!zoom;shell.querySelector('.document-viewport').classList.toggle('is-zoomed',zoom);e.target.closest('button').setAttribute('aria-pressed',String(zoom));}if(a==='preview-edit'){if(editing){pictures[index].getContext('2d').drawImage(view,0,0);renderThumbs();}setEdit(!editing);}if(a==='preview-mask'&&editing){ctx.fillStyle='#000';ctx.fillRect(view.width*.08,view.height*.4,view.width*.84,view.height*.16);}},{signal:c.signal});
 const point=e=>{const r=view.getBoundingClientRect();return {x:(e.clientX-r.left)*view.width/r.width,y:(e.clientY-r.top)*view.height/r.height,client:e.clientX};};
 view.onpointerdown=e=>{if(e.button!==0)return;start=point(e);view.setPointerCapture(e.pointerId);};view.onpointercancel=()=>{start=null;};view.onpointerup=e=>{if(!start)return;const p=point(e);if(editing){ctx.fillStyle='#000';ctx.fillRect(Math.min(start.x,p.x),Math.min(start.y,p.y),Math.abs(start.x-p.x),Math.abs(start.y-p.y));}else if(!zoom&&Math.abs(p.client-start.client)>32)move(p.client<start.client?1:-1);start=null;};
 shell.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='ArrowRight')move(1);if(e.key==='ArrowLeft')move(-1);if(e.key==='Tab'){const buttons=Array.from(shell.querySelectorAll('button')).filter(b=>!b.closest('[hidden]'));if((e.shiftKey&&document.activeElement===buttons[0])||(!e.shiftKey&&document.activeElement===buttons.at(-1))){e.preventDefault();(e.shiftKey?buttons.at(-1):buttons[0]).focus();}}},{signal:c.signal});c.signal.addEventListener('abort',()=>{for(const px of pictures)px.width=px.height=0;view.width=view.height=0;},{once:true});renderThumbs();
}
function gallery(){return '<section class="signature-files"><h2>제출 자료</h2><div class="document-thumbs">'+sampleNames.map(n=>'<button class="document-thumb" type="button" aria-label="'+n+' 확대"><canvas width="120" height="90" aria-hidden="true"></canvas><span>'+n+'</span></button>').join('')+'</div></section><section class="document-viewer" role="dialog" aria-modal="true" aria-label="제출 자료 미리보기" hidden><div class="document-viewer-panel"><div class="row between"><output aria-live="polite"></output>'+button(icon('close',18),'preview-close','icon-btn','aria-label="닫기"')+'</div><div class="document-viewport"><canvas width="720" height="540"></canvas></div><div class="preview-mask-help" hidden>가릴 영역을 드래그하거나 가운데 행을 선택하세요. '+button('가운데 행 가리기','preview-mask','secondary')+'</div><div class="doc-controls">'+button('이전','preview-prev','text')+button('다음','preview-next','text')+button('확대','preview-zoom','text','aria-pressed="false"')+button('추가 가림','preview-edit','secondary','aria-pressed="false"')+'</div></div></section>';}
modules.push({id:'signature',group:'사업장·증빙',label:'서명·제출 확인',description:'합성 자료 미리보기와 서명을 로컬에서 검수합니다.',width:'mobile',states:signStates,render(s,o={}){if(s==='done')return '<div class="page signature-page receipt-page"><div class="receipt-content" role="status"><div class="success-mark">'+icon('check')+'</div><strong>검토를 요청했어요</strong><p>처리 상태와 보완 요청은 내 신청 내역에서 확인해 주세요.</p>'+openCaseButton('reprice')+'</div><div class="bottom-actions">'+button('확인','signature-home')+'</div></div>';
 return '<div class="page signature-page">'+head('서명이 필요해요','',o)+gallery()+openCaseButton('reprice')+'<div class="signature-label row between"><h2>서명</h2>'+button('다시 하기','clear-signature','text')+'</div><div class="signature-box"><svg class="signature-canvas" viewBox="0 0 342 190" aria-label="서명 입력" role="img"><path d="'+(s==='drawn'?'M68 110 Q80 36 95 105 T129 78 M99 64 L90 143 M140 113 Q160 35 171 106 Q180 133 207 66':'')+'" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"></path></svg><span class="signature-placeholder" '+(s==='drawn'?'hidden':'')+'>여기에 서명해 주세요</span></div><div class="signature-error" role="alert" '+(s==='missing'?'':'hidden')+'>'+icon('alert',18)+'<span>서명과 확인 동의가 필요해요.</span></div><label class="check-row"><input name="signature-consent" type="checkbox" '+(s==='drawn'?'checked':'')+'>제출 자료와 서명 내용을 확인했어요.</label><div class="bottom-actions">'+(s==='processing'?busy('제출 중','submit-signature'):button('제출하기','submit-signature','primary'))+'</div></div>';},
 mount(root,s,api){const c=new AbortController();linkCase(root,api,c.signal,'reprice');previewMount(root,c);const svg=root.querySelector('.signature-canvas'),path=svg?.querySelector('path'),placeholder=root.querySelector('.signature-placeholder'),error=root.querySelector('.signature-error'),consent=root.querySelector('[name=signature-consent]');let drawing=false,drawn=s==='drawn',d=path?.getAttribute('d')||'',pending=false;
 const point=e=>{const r=svg.getBoundingClientRect();return [(e.clientX-r.left)/r.width*342,(e.clientY-r.top)/r.height*190].map(v=>v.toFixed(1)).join(' ');};svg?.addEventListener('pointerdown',e=>{if(pending||e.button!==0)return;drawing=true;svg.setPointerCapture(e.pointerId);d+=' M'+point(e);path.setAttribute('d',d);placeholder.hidden=true;},{signal:c.signal});svg?.addEventListener('pointermove',e=>{if(drawing){d+=' L'+point(e);path.setAttribute('d',d);drawn=true;svg.removeAttribute('aria-invalid');if(consent.checked){error.hidden=true;consent.removeAttribute('aria-invalid');}}},{signal:c.signal});for(const ev of ['pointerup','pointercancel','lostpointercapture'])svg?.addEventListener(ev,()=>drawing=false,{signal:c.signal});consent?.addEventListener('change',()=>{if(consent.checked)consent.removeAttribute('aria-invalid');if(drawn&&consent.checked){error.hidden=true;svg.removeAttribute('aria-invalid');}},{signal:c.signal});
 root.addEventListener('click',async e=>{const b=e.target.closest('[data-action]'),a=b?.dataset.action;if(a==='clear-signature'&&!pending){d='';path.setAttribute('d','');placeholder.hidden=false;drawn=false;}if(a==='signature-home')api.select('proof','empty');if(a!=='submit-signature'||pending)return;if(!drawn||!consent.checked){error.hidden=false;error.querySelector('span').textContent=!drawn?'서명이 필요해요.':'제출 자료와 서명 내용을 확인해 주세요.';if(!consent.checked)consent.setAttribute('aria-invalid','true');if(!drawn){svg.setAttribute('aria-invalid','true');svg.setAttribute('tabindex','-1');svg.focus({preventScroll:true});}else consent.focus({preventScroll:true});error.animate?.([{transform:'translateX(0)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],{duration:api.reduced?.()?0:200});return;}
 pending=true;b.disabled=true;b.setAttribute('aria-busy','true');b.setAttribute('aria-label','제출 중');b.innerHTML='<span class="spinner" aria-hidden="true"></span>';if(!api.reduced?.()&&b.animate){const width=b.getBoundingClientRect().width;await b.animate([{width:width+'px',borderRadius:'14px'},{width:'48px',borderRadius:'24px'}],{duration:190,fill:'forwards'}).finished.catch(()=>{});if(c.signal.aborted)return;b.innerHTML=icon('check');await b.animate([{width:'48px',borderRadius:'24px'},{width:width+'px',borderRadius:'14px'}],{duration:190,fill:'forwards'}).finished.catch(()=>{});}if(!c.signal.aborted)api.select('signature','done');},{signal:c.signal});return()=>{d='';c.abort();};}});
w.QA_BUSINESS={docRow,uploadBox,suggested,limitMemo};
})(window);
