(function(w){
'use strict';
const U=w.QAUI,{esc,icon,button,head,states}=U,R=w.ORDER_DESIGN_MODULES;
const passes=[
  {id:'b17',date:'2026.11.17',site:'샘플베이커리',status:'검토 중',tone:'review',lines:[['특란 30구','1,200판','정기 주문'],['대란 30구','800판','소진 시 주문']]},
  {id:'c15',date:'2026.11.15',site:'샘플카페',status:'납품 요청',tone:'active',lines:[['대란 30구','400판','소진 시 주문']]},
  {id:'r12',date:'2026.11.12',site:'샘플식당',status:'상담 예약',tone:'booked',lines:[['특란 30구','200판','1회 주문']]},
  {id:'b09',date:'2026.11.09',site:'샘플베이커리',status:'지난 견적',tone:'expired',lines:[['대란 30구','600판','정기 주문']]}
];
const sites=[...new Set(passes.map(p=>p.site))];
const passById=id=>passes.find(p=>p.id===id);
const summary=p=>p.lines.map(line=>line[0]).join(' · ');
const sample='<small class="nav-sample">샘플 오더 패스</small>';
const expireNotice=()=>'<aside class="expired-reminder" role="status">지난 견적은 가격이 달라질 수 있어요. 새 견적을 확인해 주세요.<button data-action="dismiss-expired">확인했어요</button></aside>';
function brandDots(){return '<span class="pass-dots" aria-hidden="true"><i></i><i></i><i></i></span>';}
function badge(p){return '<span class="pass-state tone-'+p.tone+'">'+p.status+'</span>';}
function passCard(p,index){return `<article class="order-pass nav-ticket tone-${p.tone}" data-pass-id="${p.id}" style="--index:${index}" tabindex="0"><div class="row between"><span class="pass-date">${p.date}</span>${badge(p)}</div><h2>${p.site}</h2><p>${summary(p)}</p><strong class="pass-quantity">${p.lines.length>1?'복합 주문':p.lines[0][1]}</strong><div class="pass-perforation"></div><div class="row between"><span>오더 패스</span><button class="icon-btn" data-action="pass-detail" aria-label="${p.site} ${p.date} 견적 보기">${icon('next',18)}</button></div></article>`;}
function ticketDetail(p){
  return `<article class="nav-ticket ticket-detail tone-${p.tone}"><div class="row between"><strong>오더 패스</strong>${badge(p)}</div><h2>${p.site}</h2><p>${p.date}</p><div class="pass-perforation"></div>${p.lines.map(([sku,qty,mode])=>`<div class="ticket-item"><strong>${sku}</strong><span>${qty}</span><small>${mode}</small></div>`).join('')}</article>`;
}
function collectionPicker(){return `<div class="pass-toolbar"><label>정렬 <select aria-label="오더 패스 정렬" data-sort><option data-option="recent">최근 날짜순</option><option data-option="old">이전 날짜순</option><option data-option="site">사업장순</option></select></label><div class="segmented pass-view"><button data-view="grid" aria-label="격자 보기">${icon('grid',18)}</button><button data-view="deck" aria-label="카드 넘기기">${icon('deck',18)}</button></div></div>${sites.length>1?`<div class="site-chips" aria-label="사업장 필터">${['전체',...sites].map((site,i)=>`<button data-site="${site}" aria-pressed="${i===0}">${site}</button>`).join('')}</div>`:''}`;}
const dictionary=[...new Set(passes.flatMap(p=>[p.site,p.date,p.status,...p.lines.flatMap(([sku,,mode])=>[sku.split(' ')[0],mode])]))];
const matches=(p,terms)=>terms.every(t=>[p.site,p.date,p.status,...p.lines.flat()].some(v=>v.includes(t)));
function tag(text){return `<button class="search-tag" data-tag="${esc(text)}" aria-label="${esc(text)} 태그 제거">${esc(text)} ${icon('close',14)}</button>`;}
function quoteRow(p){return `<button class="quote-search-row" data-detail="${p.id}"><span class="row-copy"><strong>${p.site}</strong><small>${summary(p)}</small></span><span class="row-end"><time>${p.date}</time>${icon('next',16)}</span></button>`;}
function results(terms,none=false){
  const rows=none?[]:passes.filter(p=>matches(p,terms));
  return `<div class="row between results-label"><h2>${terms.length?'검색 결과':'최근 견적'}</h2><span class="muted small">${rows.length}개</span></div>${rows.map(quoteRow).join('')||'<p class="muted">항목을 찾지 못했어요. 다른 태그를 선택해 주세요.</p>'}`;
}
function palette(state){
  const terms=state==='results'?['특란']:state==='none'?['샘플카페','특란']:[];
  return `<section class="pass-search"><div class="search-input-wrap"><div class="tag-field"><div class="tag-list">${terms.map(tag).join('')}</div><input role="combobox" aria-label="오더 패스 검색 태그" aria-autocomplete="list" aria-expanded="${state==='suggestions'}" placeholder="${terms.length?'':'견적 검색'}" value="${state==='suggestions'?'특':''}"><button class="icon-btn" data-action="run-search" aria-label="검색 태그 선택">${icon('search',20)}</button></div><div class="tag-suggestions scrollbar-select t-dropdown ${state==='suggestions'?'is-open':''}" role="listbox" aria-label="검색 태그" ${state==='suggestions'?'':'inert'}>${(state==='suggestions'?dictionary.filter(t=>t.includes('특')):dictionary).map(t=>`<button role="option" data-suggestion="${esc(t)}">${esc(t)}</button>`).join('')}</div></div><div class="search-results" aria-live="polite">${results(terms,state==='none')}</div><div data-search-detail hidden></div></section>`;
}
function wirePalette(root,signal){
  const input=root.querySelector('.tag-field input'),suggest=root.querySelector('.tag-suggestions');
  if(!input)return;
  const tagList=root.querySelector('.tag-list'),result=root.querySelector('.search-results'),detail=root.querySelector('[data-search-detail]');
  const ids=()=>[...tagList.querySelectorAll('[data-tag]')].map(b=>b.dataset.tag);
  suggest.id=U.uid('pass-suggestions');input.setAttribute('aria-controls',suggest.id);
  function show(open){suggest.classList.toggle('is-open',open);suggest.inert=!open;input.setAttribute('aria-expanded',String(open));}
  function options(){return dictionary.filter(t=>!ids().includes(t)&&t.includes(input.value.trim()));}
  function refresh(){input.placeholder=ids().length?'':'견적 검색';result.innerHTML=results(ids());detail.hidden=true;result.hidden=false;}
  function populate(){suggest.innerHTML=options().map(t=>`<button role="option" data-suggestion="${esc(t)}">${esc(t)}</button>`).join('');show(Boolean(options().length));}
  function add(value){if(!dictionary.includes(value)||ids().includes(value))return;tagList.insertAdjacentHTML('beforeend',tag(value));input.value='';refresh();show(false);input.focus();}
  input.addEventListener('input',populate,{signal});
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.suggestion)add(b.dataset.suggestion);
    if(b.dataset.tag){b.remove();refresh();input.focus();}
    if(b.dataset.action==='run-search'){populate();input.focus();}
    if(b.dataset.detail){const p=passById(b.dataset.detail);if(!p)return;detail.innerHTML=ticketDetail(p)+button('목록으로','back-results','secondary');result.hidden=true;detail.hidden=false;detail.querySelector('button').focus();}
    if(b.dataset.action==='back-results'){refresh();input.focus();}
  },{signal});
  root.addEventListener('focusout', e=>{if(!e.relatedTarget || !root.querySelector('.search-input-wrap')?.contains(e.relatedTarget))show(false);},{signal});
  root.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229)return;
    const optionsList=[...suggest.querySelectorAll('button')];
    if(e.target===input&&e.key==='Backspace'&&!input.value&&ids().length){e.preventDefault();tagList.lastElementChild.remove();refresh();return;}
    if(e.target===input&&e.key==='Enter'){e.preventDefault();if(input.value.trim()){const first=options()[0];if(first)add(first);}return;}
    if(e.target===input&&e.key==='ArrowDown'){e.preventDefault();populate();suggest.querySelector('button')?.focus();return;}
    if(suggest.contains(e.target)&&['ArrowDown','ArrowUp'].includes(e.key)&&optionsList.length){e.preventDefault();optionsList[(optionsList.indexOf(e.target)+(e.key==='ArrowDown'?1:-1)+optionsList.length)%optionsList.length].focus();}
    if(e.key==='Escape'&&(suggest.contains(e.target)||e.target===input)){show(false);input.focus();}
  },{signal});
}
R.push({id:'passes',group:'내 견적·메뉴',label:'오더 패스',description:'사업장과 날짜별 오더 패스·태그 검색',width:'mobile',states:states([['grid','격자 보기'],['deck','카드 넘기기'],['empty','내역 없음'],['loading','불러오는 중'],['expired','만료 포함']]),
render(s,o={}){return `<div class="page passes-page">${head('내 오더 패스','',o)}${sample}${s==='empty'?`<div class="empty"><div class="nav-ticket empty-ticket">${brandDots()}${button('최저가 알아보기','new-quote')}</div><h2>아직 저장된 견적이 없어요</h2></div>`:s==='loading'?`<div class="pass-skeleton" role="status" aria-label="오더 패스 불러오는 중">${[0,1].map(()=>`<div class="nav-ticket skeleton-ticket">${brandDots()}<i></i><i></i><div class="pass-perforation"></div></div>`).join('')}</div>`:`<details class="collection-search"><summary>${icon('search',18)} 오더 패스 검색</summary>${palette('empty')}</details>${collectionPicker()}<div class="pass-stage ${s==='deck'?'is-deck':''}">${passes.map(passCard).join('')}</div><div class="deck-controls" ${s==='deck'?'':'hidden'}>${button('이전','deck-prev','secondary')}<span class="deck-position" aria-live="polite"></span>${button('다음','deck-next','secondary')}</div><div class="expanded-pass" hidden></div>${expireNotice()}`}</div>`;},
mount(root,s,api){
  const controller=new AbortController(),signal=controller.signal,stage=root.querySelector('.pass-stage');wirePalette(root,signal);
  let view=s==='deck'?'deck':'grid',site='전체',sort='recent',current=0,start=null,didDrag=false,dismissed=false,selected=null;
  const getRows=()=>passes.filter(p=>site==='전체'||p.site===site).sort((a,b)=>sort==='site'?a.site.localeCompare(b.site,'ko')||b.date.localeCompare(a.date):sort==='old'?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
  function renderStage(rebuild){
    if(!stage)return;const rows=getRows();if(rebuild)stage.innerHTML=rows.map(passCard).join('');
    stage.classList.toggle('is-deck',view==='deck');let idx=0;
    for(const card of stage.children){const offset=(idx-current+rows.length)%rows.length;card.style.setProperty('--stack',offset);card.style.zIndex=String(10-offset);card.inert=view==='deck'&&offset>0;idx++;}
    root.querySelector('.deck-controls').hidden=view!=='deck'||rows.length<2;
    root.querySelector('.deck-position').textContent=(current+1)+' / '+rows.length;
    root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(view===b.dataset.view)));
    root.querySelectorAll('[data-site]').forEach(b=>b.setAttribute('aria-pressed',String(site===b.dataset.site)));
    root.querySelector('.expired-reminder').hidden=dismissed||!rows.some(p=>p.tone==='expired');
  }
  function move(step){const count=getRows().length;current=(current+step+count)%count;renderStage(false);}
  function open(id){const p=passById(id);if(!p)return;selected=id;const area=root.querySelector('.expanded-pass');area.innerHTML=ticketDetail(p)+button('목록으로','close-ticket','secondary');area.hidden=false;stage.hidden=true;area.querySelector('button').focus();}
  function close(){const area=root.querySelector('.expanded-pass');area.hidden=true;stage.hidden=false;stage.querySelector('[data-pass-id="'+selected+'"]')?.focus();}
  root.addEventListener('change',e=>{if(e.target.matches('[data-sort]')){sort=e.target.selectedOptions[0]?.dataset.option||'recent';current=0;if(stage.hidden)close();renderStage(true);}},{signal});
  root.addEventListener('click',e=>{
    const b=e.target.closest('button'),card=e.target.closest('[data-pass-id]');if(card&&!didDrag)open(card.dataset.passId);didDrag=false;
    if(!b)return;const a=b.dataset.action;if(a==='new-quote')api.select('q1','before');
    if(a==='dismiss-expired'){dismissed=true;renderStage(false);}
    if(a==='close-ticket')close();
    if(b.dataset.view||b.dataset.site){if(stage.hidden)close();view=b.dataset.view||view;site=b.dataset.site||site;current=0;renderStage(true);}
    if(a==='deck-prev')move(-1);if(a==='deck-next')move(1);
  },{signal});
  stage?.addEventListener('pointerdown',e=>{didDrag=false;if(view==='deck'&&!e.target.closest('button'))start=e.clientX;},{signal});
  stage?.addEventListener('pointerup',e=>{if(start!==null&&Math.abs(e.clientX-start)>40){didDrag=true;move(e.clientX<start?1:-1);}start=null;},{signal});
  stage?.addEventListener('pointercancel',()=>{start=null;didDrag=false;},{signal});
  root.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){const details=root.querySelector('.collection-search');if(details){e.preventDefault();details.open=true;details.querySelector('input').focus();}}if(!stage?.contains(e.target))return;if(view==='deck'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);stage.children[current].focus();}else if(e.key==='Enter'&&e.target.matches('[data-pass-id]')){e.preventDefault();open(e.target.dataset.passId);}},{signal});
  renderStage(false);return()=>controller.abort();
}});
R.push({id:'search',group:'내 견적·메뉴',label:'견적 검색·태그',description:'오더 패스의 태그와 복합 주문 상세',width:'mobile',states:states([['empty','검색 전'],['suggestions','자동 추천'],['results','검색 결과'],['none','검색 없음'],['detail','견적 상세']]),render(s,o={}){return `<div class="page quote-search-page">${head(s==='detail'?'견적 상세':'견적 검색','',o)}${sample}${s==='detail'?ticketDetail(passes[0])+button('목록으로','search-back','secondary'):palette(s)}</div>`;},mount(root,s,api){const c=new AbortController();wirePalette(root,c.signal);root.querySelector('[data-action="search-back"]')?.addEventListener('click',()=>api.select('search','empty'),{signal:c.signal});return()=>c.abort();}});

const noticeKinds = ['견적·납품 알림', '시세 변동 알림', '소식', '혜택'];
const panelNames = {home:'내 계정',business:'사업자 정보',people:'구성원과 권한',switch:'계정 전환',alerts:'알림'};
function accountPanel(name,s,settings){
  const top=name==='home'?'<h2>내 계정</h2>':button('뒤로','panel-home','text')+'<h2>'+panelNames[name]+'</h2>';
  const row=(key,title)=>button(title+icon('next',16),'panel-'+key,'menu-line');
  if(name==='home')return top+'<p>샘플베이커리 · 매장 관리자</p>'+row('alerts','알림')+row('business','사업자 정보')+row('people','구성원과 권한')+row('switch','계정 전환');
  if(name==='alerts')return top+'<p role="status">'+(s==='notification'?'매장에 새 견적이 도착했어요.':'새로운 알림이 없어요.')+'</p><h3>'+icon('bell',18)+' 알림 받기</h3>'+noticeKinds.map((title,i)=>'<button class="menu-line" role="switch" data-action="notice-'+i+'" aria-checked="'+settings[i]+'">'+title+'<span aria-hidden="true">'+(settings[i]?'켬':'끔')+'</span></button>').join('');
  if(name==='switch')return top+'<p>샘플베이커리 · 매장 관리자</p>'+button('사업장 선택','choose-site','secondary');
  if(name==='people')return top+'<p>샘플베이커리 · 관리자 1명</p>';
  return top+'<p>샘플베이커리</p>'+button('사업자 정보 확인','view-business','secondary');
}
R.push({
  id:'profile',group:'내 견적·메뉴',label:'프로필·알림 설정',description:'계정 패널과 알림 수신 설정',width:'mobile',
  states:states([['default','기본'],['menu','프로필 메뉴'],['notification','새 알림'],['empty','알림 없음'],['restricted','계정 전환']]),
  render(s,o={}){
    const panel=s==='restricted'?'switch':['notification','empty'].includes(s)?'alerts':'home';
    return '<div class="page profile-page">'+head('내 계정','',o)+'<div class="profile-picker"><button class="account-trigger" data-action="account-menu" aria-label="계정 메뉴" aria-expanded="'+(s!=='default')+'">'+brandDots()+'</button><section class="account-panel" aria-label="계정 메뉴" '+(s==='default'?'hidden':'')+'>'+accountPanel(panel,s,[true,false,false,false])+'</section></div></div>';
  },
  mount(root,s,api){
    const controller=new AbortController(),trigger=root.querySelector('.account-trigger'),panel=root.querySelector('.account-panel');
    const settings=[true,false,false,false];
    function close(){panel.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}
    root.addEventListener('click',e=>{
      const btn=e.target.closest('[data-action]');if(!btn)return;
      const action=btn.dataset.action;
      if(action==='account-menu'){if(!panel.hidden){close();return;} panel.hidden=false;trigger.setAttribute('aria-expanded','true');panel.innerHTML=accountPanel('home',s,settings);panel.querySelector('button').focus();}
      if(action.startsWith('panel-')){const key=action.slice(6);if(!Object.hasOwn(panelNames,key))return;panel.innerHTML=accountPanel(key,s,settings);panel.querySelector('button')?.focus();}
      if(action.startsWith('notice-')){const i=Number(action.slice(7));if(!Number.isInteger(i)||i<0||i>=settings.length)return;settings[i]=!settings[i];btn.setAttribute('aria-checked',String(settings[i]));btn.lastElementChild.textContent=settings[i]?'켬':'끔';}
      if(action==='choose-site')api.select('q3','closed');
      if(action==='view-business')api.select('business','filled');
    },{signal:controller.signal});
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();close();}},{signal:controller.signal});
    return ()=>controller.abort();
  }
});

R.push({id:'drawer',group:'공통 컴포넌트',label:'하단 패널·휠 선택',description:'정보 패널과 기능 패널의 높이, 드래그 닫기, 날짜·시간 휠을 확인합니다.',width:'mobile',states:states([['closed','닫힘'],['info','안내 패널'],['booking','상담 예약'],['wheel','시간 선택'],['saving','처리 중'],['done','완료 예시']]),render(s,o={}){return `<div class="drawer-scene"><div class="page">${head('납품 상담','',o)}${sample}<div class="consult-tickets">${passes.filter(p=>p.tone!=='expired').map(p=>'<label><input type=\"checkbox\" name=\"consult-pass\" data-id=\"'+p.id+'\"><span><strong>'+p.site+'</strong><small>'+summary(p)+'</small></span></label>').join('')}</div><div class="bottom-actions">${button('상담 예약','open-drawer')}</div></div><div class="drawer-dim ${s==='closed'?'is-closed':''}" data-action="close-drawer"></div><section class="functional-drawer t-panel-slide" data-open="${s!=='closed'}" ${s==='closed'?'inert':''} role="dialog" aria-label="상담 예약 패널"><button class="drawer-handle" data-action="close-drawer" aria-label="패널 닫기"><i></i></button><button class="icon-btn drawer-close" data-action="close-drawer" aria-label="닫기">${icon('close')}</button>${s==='info'?`<h1>어떤 상담을 받을까요?</h1><p class="muted">원하는 상담 항목을 골라 주세요.</p><fieldset class="consult-topics"><legend>상담 항목</legend>${['납품 일정','수량','가격 조건'].map(t=>'<label><input type="checkbox" name="topic"> '+t+'</label>').join('')}</fieldset><label class="consult-memo">요청 사항<textarea rows="3" maxlength="300"></textarea></label>${button('시간 선택하기','show-wheel','primary wide')}`:s==='done'?`<div class="empty"><div class="success-mark">${icon('check')}</div><h2>상담을 예약했어요</h2><p>예약시간 확정 후 담당자가 연락드릴 예정이에요.</p></div>`:`<h1>편한 시간을 알려주세요</h1><div class="booking-day"><span class="small muted">선택한 날짜</span><strong>2026년 11월 19일 목요일</strong></div><div class="wheel-picker" aria-label="상담 시간 선택"><div class="wheel-highlight"></div><div class="wheel-column" role="listbox" aria-label="시"><div class="wheel-spacer"></div>${[10,11,12,13,14,15,16,17,18].map(n=>`<button role="option" aria-selected="${n===11}" data-hour="${n}" class="${n===11?'selected':''}">${String(n).padStart(2,'0')}시</button>`).join('')}<div class="wheel-spacer"></div></div><div class="wheel-column" role="listbox" aria-label="분"><div class="wheel-spacer"></div>${[0,10,20,30,40,50].map(n=>`<button role="option" aria-selected="${n===0}" data-minute="${n}" class="${n===0?'selected':''}">${String(n).padStart(2,'0')}분</button>`).join('')}<div class="wheel-spacer"></div></div></div><div class="sr-only selected-time" aria-live="polite">오전 11시 00분</div>${button(s==='saving'?'<span class="spinner" role="status" aria-label="예약 요청 중"></span>':'예약 요청','request-booking','primary wide',s==='saving'?'disabled':'')}`}</section></div>`;},mount(root,s,api){const c=new AbortController();let hour=11,minute=0,start=null;const sheet=root.querySelector('.functional-drawer'),handle=root.querySelector('.drawer-handle');const label=()=>{const buttons=root.querySelectorAll('[data-minute]');for(const b of buttons){b.disabled=hour===18&&Number(b.dataset.minute)>0;}if(hour===18&&minute!==0){minute=0;const first=root.querySelector('[data-minute="0"]');for(const b of buttons){b.classList.toggle('selected',b===first);b.setAttribute('aria-selected',String(b===first));}if(first)first.closest('.wheel-column').scrollTop=first.offsetTop-first.closest('.wheel-column').offsetTop-68;}root.querySelector('.selected-time').textContent=`${hour<12?'오전':'오후'} ${hour%12||12}시 ${String(minute).padStart(2,'0')}분`;};root.querySelectorAll('.wheel-column').forEach(col=>{const selected=col.querySelector('.selected');if(selected)col.scrollTop=selected.offsetTop-col.offsetTop-68;let timer;col.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{const items=[...col.querySelectorAll('button:not(:disabled)')];const nearest=items.reduce((a,b)=>Math.abs(a.offsetTop-col.offsetTop-col.scrollTop-68)<Math.abs(b.offsetTop-col.offsetTop-col.scrollTop-68)?a:b);items.forEach(b=>{b.classList.toggle('selected',b===nearest);b.setAttribute('aria-selected',String(b===nearest));});if(nearest.dataset.hour!==undefined)hour=+nearest.dataset.hour;else minute=+nearest.dataset.minute;label();},90);},{signal:c.signal});c.signal.addEventListener('abort',()=>clearTimeout(timer));});root.addEventListener('click',e=>{const b=e.target.closest('[data-action],.wheel-column button');if(!b)return;const a=b.dataset.action;if(a==='open-drawer')api.select('drawer','info');if(a==='show-wheel')api.select('drawer','booking');if(a==='close-drawer')api.select('drawer','closed');if(a==='request-booking')api.demoSuccess(b,()=>api.select('drawer','done'));if(b.closest('.wheel-column')){const col=b.closest('.wheel-column');col.scrollTo({top:b.offsetTop-col.offsetTop-68,behavior:api.reduced?.()?'auto':'smooth'});}},{signal:c.signal});handle?.addEventListener('pointerdown',e=>{start=e.clientY;handle.setPointerCapture(e.pointerId);},{signal:c.signal});handle?.addEventListener('pointerup',e=>{if(start!==null&&e.clientY-start>45)api.select('drawer','closed');start=null;},{signal:c.signal});root.addEventListener('keydown',e=>{if(e.key==='Escape'&&s!=='closed')api.select('drawer','closed');},{signal:c.signal});return()=>c.abort();}});
})(window);
