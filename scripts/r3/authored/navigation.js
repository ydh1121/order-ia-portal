(function(w){
'use strict';
const U=w.QAUI,{esc,icon,button,head,states}=U,R=w.ORDER_DESIGN_MODULES;
const passes=[
  {id:'b17',date:'2026.11.17',site:'샘플베이커리',status:'검토 중',tone:'review',lines:[['특란 30구','1,200판','정기 주문'],['대란 30구','800판','소진 시 주문']]},
  {id:'c15',date:'2026.11.15',site:'샘플카페',status:'출고 확인',tone:'active',canReceive:true,lines:[['대란 30구','400판','소진 시 주문']]},
  {id:'r12',date:'2026.11.12',site:'샘플식당',status:'상담 예약',tone:'booked',lines:[['특란 30구','200판','1회 주문']]},
  {id:'b09',date:'2026.11.09',site:'샘플베이커리',status:'지난 견적',tone:'expired',lines:[['대란 30구','600판','정기 주문']]}
];
const sites=[...new Set(passes.map(p=>p.site))];
const passById=id=>passes.find(p=>p.id===id);
const summary=p=>p.lines.map(line=>line[0]).join(' · ');
const sample='<small class="nav-sample">샘플 오더 패스</small>';
const expireNotice=()=>'<aside class="expired-reminder" role="status">지난 견적은 가격이 달라질 수 있어요. 새 견적을 확인해 주세요.<button data-action="dismiss-expired">확인했어요</button></aside>';
function brandDots(){return '<span class="pass-dots" aria-hidden="true"><i></i><i></i><i></i></span>';}
function roleButton(menu,label){return button(label,'work-'+menu,'text');}
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
  return `<div class="row between results-label"><h2>${terms.length?'검색 결과':'최근 견적'}</h2><span class="muted small">${rows.length}개</span></div>${rows.map(quoteRow).join('')||'<p class="muted">이 태그를 모두 포함하는 오더 패스가 없어요.</p><button type="button" class="btn text" data-action="clear-tags">태그 지우기</button>'}`;
}
function palette(state){
  const terms=state==='results'?['특란']:state==='none'?['샘플카페','특란']:[];
  return `<section class="pass-search"><div class="search-input-wrap"><div class="tag-field"><div class="tag-list">${terms.map(tag).join('')}</div><input role="combobox" aria-label="오더 패스 검색 태그" aria-autocomplete="list" aria-expanded="${state==='suggestions'}" placeholder="${terms.length?'':'견적 검색'}" value="${state==='suggestions'?'특':''}"><button class="icon-btn" data-action="run-search" aria-label="검색 태그 선택">${icon('search',20)}</button></div><div class="tag-suggestions scrollbar-select t-dropdown ${state==='suggestions'?'is-open':''}" role="listbox" aria-label="검색 태그" ${state==='suggestions'?'':'inert'}>${(state==='suggestions'?dictionary.filter(t=>t.includes('특')):dictionary).map(t=>`<button role="option" data-suggestion="${esc(t)}">${esc(t)}</button>`).join('')}</div></div><div class="search-results" aria-live="polite">${results(terms,state==='none')}</div><div data-search-detail hidden></div></section>`;
}
function roleLinks(root,signal,api){
  root.addEventListener('click',event=>{
    const action=event.target.closest('button')?.dataset.action;
    if(action?.startsWith('work-'))api.select('role-work',action.slice(5));
  },{signal});
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
  function add(value){
    if(!dictionary.includes(value)||ids().includes(value))return;
    tagList.insertAdjacentHTML('beforeend',tag(value));
    w.ORDER_CUSTOMER_CONTROLS?.motion(tagList.lastElementChild,[{scale:'.78',opacity:0},{scale:'1.07',offset:.7},{scale:'1',opacity:1}],{duration:180});
    input.value='';refresh();show(false);input.focus();
  }
  function removeTag(chip){
    const ghost=chip.cloneNode(true),rect=chip.getBoundingClientRect();
    ghost.removeAttribute('data-tag');ghost.removeAttribute('aria-label');ghost.inert=true;ghost.setAttribute('aria-hidden','true');
    Object.assign(ghost.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',pointerEvents:'none'});
    document.body.append(ghost);chip.remove();refresh();input.focus();
    const fade=w.ORDER_CUSTOMER_CONTROLS?.motion(ghost,[{opacity:1,scale:'1'},{opacity:0,scale:'.7'}],{duration:125});
    if(fade){fade.onfinish=()=>ghost.remove();fade.oncancel=()=>ghost.remove();}else ghost.remove();
  }
  let composing=false;
  input.addEventListener('compositionstart',()=>{composing=true;show(false);},{signal});
  input.addEventListener('compositionend',()=>{composing=false;populate();},{signal});
  input.addEventListener('input',e=>{if(!composing&&!e.isComposing)populate();},{signal});
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.suggestion)add(b.dataset.suggestion);
    if(b.dataset.tag)removeTag(b);
    if(b.dataset.action==='clear-tags'){tagList.replaceChildren();input.value='';show(false);refresh();input.focus();}
    if(b.dataset.action==='run-search'){populate();input.focus();}
    if(b.dataset.detail){const p=passById(b.dataset.detail);if(!p)return;detail.innerHTML=ticketDetail(p)+roleButton('quotes','내 사업장의 견적')+button('목록으로','back-results','secondary');result.hidden=true;detail.hidden=false;detail.querySelector('button').focus();}
    if(b.dataset.action==='back-results'){refresh();input.focus();}
  },{signal});
  root.addEventListener('focusout', e=>{if(!e.relatedTarget || !root.querySelector('.search-input-wrap')?.contains(e.relatedTarget))show(false);},{signal});
  root.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229)return;
    const optionsList=[...suggest.querySelectorAll('button')];
    if(e.target===input&&e.key==='Backspace'&&!input.value&&ids().length){e.preventDefault();removeTag(tagList.lastElementChild);return;}
    if(e.target===input&&e.key==='Enter'){e.preventDefault();if(input.value.trim()){const first=options()[0];if(first)add(first);}return;}
    if(e.target===input&&e.key==='ArrowDown'){e.preventDefault();populate();suggest.querySelector('button')?.focus();return;}
    if(suggest.contains(e.target)&&['ArrowDown','ArrowUp'].includes(e.key)&&optionsList.length){e.preventDefault();optionsList[(optionsList.indexOf(e.target)+(e.key==='ArrowDown'?1:-1)+optionsList.length)%optionsList.length].focus();}
    if(e.key==='Escape'&&(suggest.contains(e.target)||e.target===input)){show(false);input.focus();}
  },{signal});
}
R.push({id:'passes',group:'내 견적·메뉴',label:'오더 패스',description:'사업장과 날짜별 오더 패스·태그 검색',width:'mobile',states:states([['grid','격자 보기'],['deck','카드 넘기기'],['empty','내역 없음'],['loading','불러오는 중'],['expired','만료 포함']]),
render(s,o={}){return `<div class="page passes-page">${head('내 오더 패스','',o)}${sample}${s==='empty'?`<div class="empty"><div class="nav-ticket empty-ticket"><span class="empty-ticket-brand">Order. ${brandDots()}</span>${button('최저가 알아보기','new-quote')}</div><h2>아직 저장된 견적이 없어요</h2></div>`:s==='loading'?`<div class="pass-skeleton" role="status" aria-label="오더 패스 불러오는 중">${[0,1].map(()=>`<div class="nav-ticket skeleton-ticket"><div class="skeleton-top">${brandDots()}<i></i></div><i class="skeleton-title"></i><i class="skeleton-summary"></i><div class="pass-perforation"></div><i class="skeleton-foot"></i></div>`).join('')}</div>`:`<details class="collection-search"><summary>${icon('search',18)} 오더 패스 검색</summary>${palette('empty')}</details>${collectionPicker()}<div class="pass-stage ${s==='deck'?'is-deck':''}">${passes.map(passCard).join('')}</div><div class="deck-controls" ${s==='deck'?'':'hidden'}>${button('이전','deck-prev','secondary')}<span class="deck-position" aria-live="polite"></span>${button('다음','deck-next','secondary')}</div><div class="expanded-pass" hidden></div>${expireNotice()}`}</div>`;},
mount(root,s,api){
  const controller=new AbortController(),signal=controller.signal,stage=root.querySelector('.pass-stage');
  wirePalette(root,signal);roleLinks(root,signal,api);
  const received=new Set();
  let view=s==='deck'?'deck':'grid',site='전체',sort='recent',current=0,dismissed=false,selected=null;
  function getRows(){
    return passes.filter(p=>site==='전체'||p.site===site).sort((a,b)=>{
      const grouped=Number(received.has(a.id))-Number(received.has(b.id));
      if(grouped)return grouped;
      if(sort==='site')return a.site.localeCompare(b.site,'ko')||b.date.localeCompare(a.date);
      return sort==='old'?a.date.localeCompare(b.date):b.date.localeCompare(a.date);
    });
  }
  function renderStage(rebuild){
    if(!stage)return;const rows=getRows();
    if(rebuild){
      const existing=new Map([...stage.children].map(card=>[card.dataset.passId,card]));
      rows.forEach((row,i)=>{
        let card=existing.get(row.id);
        if(!card){const hold=document.createElement('div');hold.innerHTML=passCard(row,i);card=hold.firstElementChild;}
        existing.delete(row.id);card.style.setProperty('--index',i);stage.append(card);
      });
      existing.forEach(card=>card.remove());
    }
    stage.classList.toggle('is-deck',view==='deck');let idx=0;
    for(const card of stage.children){const offset=(idx-current+rows.length)%rows.length;card.style.setProperty('--stack',offset);
      card.style.setProperty('--deck-turn',offset===0?'0deg':(offset%2===1?-2.5:1.7)+'deg');
      if(received.has(card.dataset.passId)){card.classList.add('ticket-received');card.querySelector('.pass-state').textContent='수령 확인';}card.style.zIndex=String(10-offset);card.inert=view==='deck'&&offset>0;idx++;}
    root.querySelector('.deck-controls').hidden=view!=='deck'||rows.length<2;
    root.querySelector('.deck-position').textContent=(current+1)+' / '+rows.length;
    root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(view===b.dataset.view)));
    root.querySelectorAll('[data-site]').forEach(b=>b.setAttribute('aria-pressed',String(site===b.dataset.site)));
    root.querySelector('.expired-reminder').hidden=dismissed||!rows.some(p=>p.tone==='expired');
  }
  function move(step){const count=getRows().length;current=(current+step+count)%count;renderStage(false);}
  function open(id){
    const p=passById(id);if(!p)return;selected=id;
    const area=root.querySelector('.expanded-pass');
    const cut=p.canReceive&&!received.has(id)?'<button type="button" data-action="tear-ticket" class="pass-cut">✂ 수령 확인하기<span>옆으로 당겨 절취</span></button>':'';
    area.innerHTML=ticketDetail(p)+cut+(received.has(id)?'<p role="status">수령 확인한 오더 패스</p>':'')+
      '<section class="tear-confirm" role="alertdialog" aria-label="납품 수령 확인" hidden><strong>납품이 완료됐나요?</strong><p>수령 확인 후 절취한 패스는 복원할 수 없어요.</p>'+
      button('취소','cancel-tear','secondary')+button('수령 확인','confirm-tear','primary')+'</section>'+
      roleButton('quotes','내 사업장의 견적')+roleButton('delivery','납품 상태 확인')+button('목록으로','close-ticket','secondary');
    area.hidden=false;stage.hidden=true;area.querySelector('button').focus();
  }
  function toggleCut(confirming){
    const area=root.querySelector('.expanded-pass'),dialog=area.querySelector('.tear-confirm');
    if(!dialog)return;
    dialog.hidden=!confirming;
    if(confirming)dialog.querySelector('button').focus();else area.querySelector('[data-action="tear-ticket"]')?.focus();
  }
  let cutStart;
  root.addEventListener('pointerdown',e=>{
    const cut=e.target.closest('[data-action="tear-ticket"]');if(!cut||!e.isPrimary)return;
    cutStart={x:e.clientX,y:e.clientY,id:e.pointerId};cut.setPointerCapture(e.pointerId);
  },{signal});
  root.addEventListener('pointerup',e=>{
    if(cutStart?.id===e.pointerId&&Math.abs(e.clientX-cutStart.x)>=48&&Math.abs(e.clientY-cutStart.y)<24)toggleCut(true);
    cutStart=null;
  },{signal});
  root.addEventListener('pointercancel',()=>{cutStart=null;},{signal});
  function close(){const area=root.querySelector('.expanded-pass');area.hidden=true;stage.hidden=false;stage.querySelector('[data-pass-id="'+selected+'"]')?.focus();}
  root.addEventListener('change',e=>{if(e.target.matches('[data-sort]')){sort=e.target.selectedOptions[0]?.dataset.option||'recent';current=0;if(stage.hidden)close();renderStage(true);}},{signal});
  root.addEventListener('click',e=>{
    const b=e.target.closest('button'),card=e.target.closest('[data-pass-id]');if(card)open(card.dataset.passId);
    if(!b)return;const a=b.dataset.action;if(a==='new-quote')api.select('q1','before');
    if(a==='dismiss-expired'){dismissed=true;renderStage(false);}
    if(a==='close-ticket')close();
    if(a==='tear-ticket')toggleCut(true);
    if(a==='cancel-tear')toggleCut(false);
    if(a==='confirm-tear'&&passById(selected)?.canReceive&&!received.has(selected)){
      if(api.mode==='product'){api.onUnavailable?.('confirm-tear');api.toast?.('아직 연결되지 않은 기능이에요.');return;}
      received.add(selected);current=0;renderStage(true);close();
      api.toast?.('샘플 패스를 수령 확인했어요.');
    }
    if(b.dataset.view||b.dataset.site){
      if(stage.hidden)close();view=b.dataset.view||view;
      if(b.dataset.site){site=b.dataset.site;current=0;}
      renderStage(Boolean(b.dataset.site));
    }
    if(a==='deck-prev')move(-1);if(a==='deck-next')move(1);
  },{signal});
  if(stage)w.ORDER_CUSTOMER_CONTROLS?.swipeDeck(stage,{
    enabled:()=>view==='deck',top:()=>stage.children[current],step:move,signal
  });
  root.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){const details=root.querySelector('.collection-search');if(details){e.preventDefault();details.open=true;details.querySelector('input').focus();}}if(e.key==='Escape'&&root.querySelector('.tear-confirm:not([hidden])')){e.preventDefault();toggleCut(false);return;}if(!stage?.contains(e.target))return;if(view==='deck'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);stage.children[current].focus();}else if(e.key==='Enter'&&e.target.matches('[data-pass-id]')){e.preventDefault();open(e.target.dataset.passId);}},{signal});
  renderStage(false);return()=>controller.abort();
}});
R.push({id:'search',group:'내 견적·메뉴',label:'견적 검색·태그',description:'오더 패스의 태그와 복합 주문 상세',width:'mobile',states:states([['empty','검색 전'],['suggestions','자동 추천'],['results','검색 결과'],['none','검색 없음'],['detail','견적 상세']]),render(s,o={}){return `<div class="page quote-search-page">${head(s==='detail'?'견적 상세':'견적 검색','',o)}${sample}${s==='detail'?ticketDetail(passes[0])+button('목록으로','search-back','secondary'):palette(s)}</div>`;},mount(root,s,api){const c=new AbortController();wirePalette(root,c.signal);roleLinks(root,c.signal,api);root.querySelector('[data-action="search-back"]')?.addEventListener('click',()=>api.select('search','empty'),{signal:c.signal});return()=>c.abort();}});

// The account state names remain stable so archived comments still resolve.
// Active pages receive the authenticated server/test-run context from the host.
R.push({
  id:'profile',group:'내 견적·메뉴',label:'프로필·알림 설정',description:'공통 로고 계정 메뉴와 알림 수신 설정',width:'mobile',
  states:states([['default','기본'],['menu','프로필 메뉴'],['notification','새 알림'],['empty','알림 없음'],['restricted','계정 전환']]),
  render(s,o={}){
    return '<div class="page profile-page">'+head('내 계정','',o)+'<div data-account-menu-host></div></div>';
  },
  mount(root,s,api){
    const context=api.brandAccount||w.ORDER_BRAND_ACCOUNT_CONTEXT||{},brand=root.querySelector('.brand');
    if(!brand||!w.mountBrandAccountMenu)return ()=>{};
    const menu=w.mountBrandAccountMenu(brand,{...context,authenticated:context.authenticated===true,animateInitial:context.consumeArrival?.()===true,reducedMotion:api.reduced});
    if(context.authenticated===true&&s!=='default')menu.open(['notification','empty'].includes(s)?'notifications':s==='restricted'?'profile':null);
    return ()=>menu.destroy();
  }
});

// This transient sample follows a reviewer through separate, sandboxed product frames.
function consultationSelection(root,state,signal){
  let channel,artifact;
  const current={passes:[],topics:[],memo:'',date:'',time:''};
  const publish=()=>{if(channel)parent.postMessage({scope:'ORDER_R3_FRAME',channel,artifact,type:'setConsultationFixture',payload:current},'*');};
  function summarize(){
    const el=root.querySelector('.consult-summary');if(!el)return;
    const labels=current.passes.map(passById).filter(Boolean).map(p=>p.site);
    const parts=[...labels,...current.topics,current.memo,current.date,current.time].filter(Boolean);
    el.textContent=parts.join(' · ');el.hidden=!parts.length;
  }
  function hydrate(data){
    Object.assign(current,data);
    for(const v of root.querySelectorAll('[name="consult-pass"]'))v.checked=current.passes.includes(v.dataset.id);
    for(const v of root.querySelectorAll('[name="topic"]'))v.checked=current.topics.includes(v.parentElement.textContent.trim());
    const memo=root.querySelector('.consult-memo textarea');if(memo)memo.value=current.memo;
    const date=root.querySelector('[data-action="choose-consult-date"] strong');if(date&&current.date)date.textContent=current.date;
    summarize();
  }
  addEventListener('message',e=>{
    const m=e.data;
    if(e.source!==parent||m?.scope!=='ORDER_R3_HOST'||m.type!=='consultationFixture')return;
    channel=m.channel;artifact=m.artifact;hydrate(m.payload);root.dataset.consultReady='true';
  },{signal});
  root.addEventListener('change',e=>{
    if(e.target.name==='consult-pass')current.passes=[...root.querySelectorAll('[name="consult-pass"]:checked')].map(x=>x.dataset.id);
    else if(e.target.name==='topic')current.topics=[...root.querySelectorAll('[name="topic"]:checked')].map(x=>x.parentElement.textContent.trim());
    else return;
    summarize();publish();
  },{signal});
  root.addEventListener('input',e=>{
    if(!e.target.matches('.consult-memo textarea'))return;
    current.memo=e.target.value;summarize();publish();
  },{signal});
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.day){current.date=b.dataset.day;publish();}
    if(b.dataset.action==='request-booking'){
      const hour=root.querySelector('[data-hour][aria-selected="true"]')?.textContent;
      const minute=root.querySelector('[data-minute][aria-selected="true"]')?.textContent;
      current.time=[hour,minute].filter(Boolean).join(' ');publish();
    }
    if(state==='closed'&&b.dataset.action==='open-drawer'&&!current.passes.length){
      e.stopImmediatePropagation();
      root.querySelector('[name="consult-pass"]')?.focus();
      root.querySelector('.consult-selection-message').textContent='상담할 오더 패스를 선택해 주세요.';
    }
  },{capture:true,signal});
}
R.push({id:'drawer',group:'공통 컴포넌트',label:'하단 패널·휠 선택',description:'정보 패널과 기능 패널의 높이, 드래그 닫기, 날짜·시간 휠을 확인합니다.',width:'mobile',states:states([['closed','닫힘'],['info','안내 패널'],['booking','상담 예약'],['wheel','시간 선택'],['saving','처리 중'],['done','완료 예시']]),render(s,o={}){return `<div class="drawer-scene"><div class="page">${head('납품 상담','',o)}${sample}<div class="consult-tickets">${passes.filter(p=>p.tone!=='expired').map(p=>'<article class="consult-ticket"><label><input type="checkbox" name="consult-pass" data-id="'+p.id+'"><span><strong>'+p.site+'</strong><small>'+summary(p)+' · '+(p.lines.length>1?'복합 주문':p.lines[0][2])+'</small></span></label><button type="button" class="btn text" aria-expanded="false" data-action="consult-ticket-detail">패스 상세</button><div class="consult-ticket-detail" hidden>'+ticketDetail(p)+'</div></article>').join('')}</div><div class="bottom-actions"><p class="consult-selection-message" role="status"></p>${button('상담 예약','open-drawer')}${roleButton('consult','내 상담 내역')}</div></div><div class="drawer-dim ${s==='closed'?'is-closed':''}" data-action="close-drawer"></div><section class="functional-drawer t-panel-slide" data-open="${s!=='closed'}" ${s==='closed'?'inert':''} role="dialog" aria-label="상담 예약 패널"><button class="drawer-handle" data-action="close-drawer" aria-label="패널 닫기"><i></i></button><button class="icon-btn drawer-close" data-action="close-drawer" aria-label="닫기">${icon('close')}</button><p class="consult-summary" hidden></p>${s==='info'?`<h1>어떤 상담을 받을까요?</h1><p class="muted">원하는 상담 항목을 골라 주세요.</p><fieldset class="consult-topics"><legend>상담 항목</legend>${['납품 일정','수량','가격 조건'].map(t=>'<label><input type="checkbox" name="topic"> '+t+'</label>').join('')}</fieldset><label class="consult-memo">요청 사항<textarea rows="3" maxlength="300"></textarea></label>${button('시간 선택하기','show-wheel','primary wide')}`:s==='done'?`<div class="empty"><div class="success-mark">${icon('check')}</div><h2>상담을 예약했어요</h2><p>샘플 화면이에요. 실제 상담은 내 상담 내역에서 요청할 수 있어요.</p></div>`:`<h1>편한 시간을 알려주세요</h1><div class="booking-day"><span class="small muted">선택한 날짜</span><strong>2026년 11월 19일 목요일</strong></div><div class="wheel-picker" aria-label="상담 시간 선택"><div class="wheel-highlight"></div><div class="wheel-column" role="listbox" aria-label="시"><div class="wheel-spacer"></div>${[10,11,12,13,14,15,16,17,18].map(n=>`<button role="option" aria-selected="${n===11}" data-hour="${n}" class="${n===11?'selected':''}">${String(n).padStart(2,'0')}시</button>`).join('')}<div class="wheel-spacer"></div></div><div class="wheel-column" role="listbox" aria-label="분"><div class="wheel-spacer"></div>${[0,10,20,30,40,50].map(n=>`<button role="option" aria-selected="${n===0}" data-minute="${n}" class="${n===0?'selected':''}">${String(n).padStart(2,'0')}분</button>`).join('')}<div class="wheel-spacer"></div></div></div><div class="sr-only selected-time" aria-live="polite">오전 11시 00분</div>${button(s==='saving'?'<span class="spinner" role="status" aria-label="예약 요청 중"></span>':'예약 요청','request-booking','primary wide',s==='saving'?'disabled':'')}`}</section></div>`;},mount(root,s,api){const c=new AbortController();roleLinks(root,c.signal,api);if(api.mode!=='product')consultationSelection(root,s,c.signal);let hour=11,minute=0,start=null;const sheet=root.querySelector('.functional-drawer'),handle=root.querySelector('.drawer-handle');const label=()=>{const buttons=root.querySelectorAll('[data-minute]');for(const b of buttons){b.disabled=hour===18&&Number(b.dataset.minute)>0;}if(hour===18&&minute!==0){minute=0;const first=root.querySelector('[data-minute="0"]');for(const b of buttons){b.classList.toggle('selected',b===first);b.setAttribute('aria-selected',String(b===first));}if(first)first.closest('.wheel-column').scrollTop=first.offsetTop-first.closest('.wheel-column').offsetTop-68;}root.querySelector('.selected-time').textContent=`${hour<12?'오전':'오후'} ${hour%12||12}시 ${String(minute).padStart(2,'0')}분`;};root.querySelectorAll('.wheel-column').forEach(col=>{const selected=col.querySelector('.selected');if(selected)col.scrollTop=selected.offsetTop-col.offsetTop-68;let timer;col.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{const items=[...col.querySelectorAll('button:not(:disabled)')];const nearest=items.reduce((a,b)=>Math.abs(a.offsetTop-col.offsetTop-col.scrollTop-68)<Math.abs(b.offsetTop-col.offsetTop-col.scrollTop-68)?a:b);items.forEach(b=>{b.classList.toggle('selected',b===nearest);b.setAttribute('aria-selected',String(b===nearest));});if(nearest.dataset.hour!==undefined)hour=+nearest.dataset.hour;else minute=+nearest.dataset.minute;label();},90);},{signal:c.signal});c.signal.addEventListener('abort',()=>clearTimeout(timer));});root.addEventListener('click',e=>{const b=e.target.closest('[data-action],.wheel-column button');if(!b)return;const a=b.dataset.action;
if(a==='consult-ticket-detail'){const line=b.closest('.consult-ticket');const detail=line.querySelector('.consult-ticket-detail');detail.hidden=!detail.hidden;b.setAttribute('aria-expanded',String(!detail.hidden));}
if(a==='open-drawer')api.select('drawer','info');if(a==='show-wheel')api.select('drawer','booking');if(a==='close-drawer')api.select('drawer','closed');if(a==='request-booking'){if(api.mode==='product'){api.onUnavailable?.('request-booking');api.toast?.('아직 연결되지 않은 기능이에요.');}else api.demoSuccess?.(b,()=>api.select('drawer','done'));}if(b.closest('.wheel-column')){const col=b.closest('.wheel-column');col.scrollTo({top:b.offsetTop-col.offsetTop-68,behavior:api.reduced?.()?'auto':'smooth'});}},{signal:c.signal});handle?.addEventListener('pointerdown',e=>{start=e.clientY;handle.setPointerCapture(e.pointerId);},{signal:c.signal});handle?.addEventListener('pointerup',e=>{if(start!==null&&e.clientY-start>45)api.select('drawer','closed');start=null;},{signal:c.signal});root.addEventListener('keydown',e=>{if(e.key==='Escape'&&s!=='closed')api.select('drawer','closed');},{signal:c.signal});return()=>c.abort();}});
})(window);
