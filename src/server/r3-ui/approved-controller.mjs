// The approved QA 1.0 navigation and preview geometry. Review writes and the
// single active annotation channel stay with the authenticated R3 host.
export function bootApprovedShell(h) {
  const byId = id => document.getElementById(id);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (label, className, action) => {
    const b = make('button', className, label);
    b.type = 'button';
    b.onclick = action;
    return b;
  };
  const stage = byId('surface'), preview = byId('preview-list'), focus = byId('focus-unit');
  const query = new URL(location.href).searchParams;
  const previewMode=query.get('preview')||query.get('mode');
  let role = 'all', mode = ['board','dual'].includes(previewMode) ? previewMode : 'focus';
  const expandedGroups = {mvp:true,future:false};
  const mvpSections=[
    ['첫 화면·견적',['onboarding','q1','q2','q3','q4','quote-review','quote-wait','quote-result','saved-quote']],
    ['회원·사업장',['signup','login','otp','password','terms','profile','account-settings','session-access','business','store-settings','proof','signature']],
    ['구매·주문·납품',['store-purchase','delivery-request','passes','application-status','store-home','customer-orders','order-detail','delivery-schedule','trade-documents','consultation','help-center','search']],
    ['관리자 · 회원·상담·승인',['admin-access','admin-overview','admin-buyers','admin-business-review','admin-negotiations','admin-support','member-email-templates']],
    ['관리자 · 주문·출고·증빙',['admin-orders','admin-payments','admin-shipments','supplier-shipments','admin-quotes','admin-documents','admin-billing','receipt']],
    ['관리자 · 가격·매출·수익',['price-policy','admin-catalog','admin-price-approval','admin-analytics','admin-campaigns','admin-revenue-rules','admin-settlements','admin-policy','admin-audit']],
    ['컴포넌트·공통 자산',['component-library','common','drawer']]
  ];
  const mvpOrder=new Map(mvpSections.flatMap(([label,ids],section)=>ids.map((id,index)=>[id,{label,rank:section*100+index}])));
  let draggedScreen = '', renamingGroup = false;
  const mobileChoices = [...byId('mobile-width').options].map(o => Number(o.value));
  const pcChoices = [...byId('desktop-width').options].map(o => Number(o.value));
  const initialWidth = Number(query.get('width'));
  let mobileWidth = mobileChoices.includes(initialWidth) ? initialWidth : 390;
  let pcWidth = pcChoices.includes(initialWidth) ? initialWidth : 1280;
  let renderKey = '', panel = 'review', previewEpoch = 0;
  const distinct = (rows, key) => [...new Map(rows.map(row => [row[key], row])).values()];
  const calculatorScreens=new Set(['q1','q2','q3','q4']);
  const calculatorRow=row=>row.application&&calculatorScreens.has(row.screen);
  const quoteModeLabel=mode=>mode==='detailed'?'상세 견적':'간편 견적';
  const label = row => h.label?.(row)||row.label;
  function openRow(row, width) {
    if (!row) return;
    byId('lab').classList.remove('nav-open');
    if (width) byId('width').value = String(width);
    stage.scrollTop = 0;
    return h.select(row);
  }
  function sameScreen(rows, row) { return rows.filter(r => r.screen === row.screen).map(r=>r.application?{...r,mode:row.mode||'simple'}:r); }
  function states(rows, row) {
    const byState = new Map();
    for (const r of sameScreen(rows,row)) {
      if (!byState.has(r.state) || r.variant === row.variant) byState.set(r.state,r);
    }
    return [...byState.values()];
  }
  function setTab(name) {
    panel = name;
    for (const element of all('[data-drawer-tab]')) {
      const active = element.dataset.drawerTab === name;
      element.classList.toggle('active', active);
      element.setAttribute('aria-selected', String(active));
    }
    for (const element of all('[data-drawer-panel]')) element.hidden = element.dataset.drawerPanel !== name;
    for (const id of ['review','overview','settings']) {
      const el = byId('drawer-'+id);
      if (el) el.hidden = id !== name;
    }
  }
  function openTab(name) {
    if (name === 'review') h.notes();
    else { h.leaveEditor(); byId('drawer').hidden = false; }
    setTab(name);
    byId('lab').classList.remove('nav-open');
  }
  function go(delta) {
    const {screens, current} = h.snapshot();
    if (!current) return;
    const rows = states(screens,current);
    const i = rows.findIndex(row => row.state === current.state);
    return openRow(rows[(i+delta+rows.length)%rows.length]);
  }
  function setMode(name) {
    if (name === mode) return;
    mode = name;
    const url = new URL(location.href); url.searchParams.set('preview',name);
    if(['focus','board','dual'].includes(url.searchParams.get('mode')))url.searchParams.delete('mode');
    history.replaceState(null,'',url);
    renderKey = '';
    const {current} = h.snapshot();
    if (current) {
      const width = h.width(current);
      if (mode === 'dual' && width !== mobileWidth && width !== pcWidth) {
        openRow(current, current.defaultWidth >= 768 ? pcWidth : mobileWidth);
        return;
      }
      render();
    }
  }
  function rowCounts(rows, legacy, records) {
    return h.feedbackCounts?.(rows)||new Map();
  }
  function nav(s) {
    const term = byId('catalog-search').value.trim().toLocaleLowerCase();
    const catalog = byId('catalog');
    if(renamingGroup)return;
    const fragment = document.createDocumentFragment();
    const groups = new Map();
    for (const original of s.screens) {
      const r=original.application?{...original,mode:'simple'}:original;
      if (!groups.has(r.screen)) groups.set(r.screen,[]);
      groups.get(r.screen).push(r);
    }
    // These are review entries for the existing mode-bound artifacts, not new
    // product screens or copied comments. Each button carries its mode through
    // state chips, board previews, URL restoration and the review channel.
    const families=[...groups.values()].flatMap(family=>calculatorRow(family[0])
      ? ['simple','detailed'].map(quoteMode=>family.map(row=>({...row,mode:quoteMode}))) : [family]);
    const counts=rowCounts(families.flat(),s.legacy,s.records);
    const rank=row=>{
      const original=mvpOrder.get(row.screen)?.rank??10000;
      if(calculatorRow(row))return original+(row.mode==='detailed'?4:0);
      return original>4&&original<100?original+4:original;
    };
    const layout=s.navigation?.layout||{groups:[{id:'mvp',name:'1차 MVP'},{id:'future',name:'정식 - 향후 검토'}],assignments:{}};
    const groupFor=id=>layout.assignments[id]||(groups.get(id)?.[0].phase==='future'?'future':'mvp');
    const move=(screen,group)=>{
      if(!h.saveNavigation||s.navigationPending||!s.navigationReady||!groups.has(screen)||groupFor(screen)===group)return;
      expandedGroups[group]=true;
      h.saveNavigation({...layout,assignments:{...layout.assignments,[screen]:group}});
    };
    for(const section of layout.groups){
      if(role==='current'&&section.id!=='mvp'||role==='future'&&section.id!=='future')continue;
      const matches=families.filter(f=>groupFor(f[0].screen)===section.id).map(family=>({family,found:term?family.find(r=>[r.id,label(r),r.group,calculatorRow(r)?quoteModeLabel(r.mode):'',r.stateLabel,r.description,...(r.routeIds||[])].join(' ').toLocaleLowerCase().includes(term)):family[0]})).filter(({family,found})=>found&&(['all','current','future'].includes(role)||family[0].role===role));
      if(section.id==='mvp')matches.sort((a,b)=>rank(a.family[0])-rank(b.family[0]));
      if(term&&!matches.length)continue;
      const details=make('details','lab-nav-section');details.dataset.navGroup=section.id;
      details.open=Boolean(term)||expandedGroups[section.id];
      details.ontoggle=()=>{if(!term)expandedGroups[section.id]=details.open;};
      const summary=make('summary','lab-nav-heading');summary.title='두 번 클릭 또는 F2: 이름 변경 · 화면을 끌어 놓아 이동';
      summary.append(make('span','',section.name),make('span','nav-count',matches.length));
      const rename=()=>{
        if(!h.saveNavigation||!s.navigationReady||s.navigationPending||renamingGroup)return;
        renamingGroup=true;const input=make('input');input.value=section.name;input.maxLength=48;input.setAttribute('aria-label','아코디언 이름');
        summary.replaceChildren(input);input.focus();input.select();let done=false;
        const finish=save=>{if(done)return;done=true;renamingGroup=false;const name=input.value.trim();
          if(save&&name&&name!==section.name)h.saveNavigation({...layout,groups:layout.groups.map(g=>g.id===section.id?{...g,name}:g)});else render();};
        input.onclick=e=>e.stopPropagation();input.ondblclick=e=>e.stopPropagation();
        input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish(true);}if(e.key==='Escape'){e.preventDefault();finish(false);}};
        input.onblur=()=>finish(true);
      };
      summary.ondblclick=e=>{e.preventDefault();rename();};
      summary.onkeydown=e=>{if(e.key==='F2'){e.preventDefault();rename();}};
      details.ondragover=e=>{if(draggedScreen){e.preventDefault();details.classList.add('drag-over');}};
      details.ondragleave=e=>{if(!details.contains(e.relatedTarget))details.classList.remove('drag-over');};
      details.ondrop=e=>{e.preventDefault();details.classList.remove('drag-over');if(draggedScreen)move(draggedScreen,section.id);draggedScreen='';};
      details.append(summary);let lastGroup='';
      for(const {family,found} of matches){
        const row=family[0];
        const groupLabel=calculatorRow(row)?quoteModeLabel(row.mode):section.id==='mvp'?mvpOrder.get(row.screen)?.label||row.group:row.group;
        if(groupLabel!==lastGroup){details.append(make('p','lab-group',groupLabel));lastGroup=groupLabel;}
        const wrap=make('div','lab-nav-item'), b=button('','lab-nav',()=>openRow(found));
        b.dataset.module=row.screen;if(calculatorRow(row))b.dataset.quoteMode=row.mode;b.draggable=Boolean(s.navigationReady&&!s.navigationPending);
        b.ondragstart=e=>{draggedScreen=row.screen;e.dataTransfer.setData('text/plain',row.screen);e.dataTransfer.effectAllowed='move';};
        b.ondragend=()=>{draggedScreen='';for(const d of all('.drag-over',catalog))d.classList.remove('drag-over');};
        const next=section.id==='mvp'?'future':'mvp',nextName=layout.groups.find(g=>g.id===next).name;
        b.onkeydown=e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();move(row.screen,e.key==='ArrowLeft'?'mvp':'future');}};
        b.title='Alt+←: 1차 MVP · Alt+→: 향후 검토';
        if(s.current?.screen===row.screen&&(!calculatorRow(row)||(s.current.mode||'simple')===row.mode)){b.classList.add('active');b.setAttribute('aria-current','page');}
        b.append(make('span','nav-label',label(row)));
        const familyCount=rowCounts(family,s.legacy,s.records).get(row.screen)||0;
        if(familyCount)b.append(make('span','nav-comment-count',familyCount));
        b.append(make('span','nav-count',distinct(family,'state').length));wrap.append(b);
        const transfer=button('↔','lab-nav-move',()=>move(row.screen,next));transfer.title=nextName+'로 이동';transfer.setAttribute('aria-label',label(row)+' · '+nextName+'로 이동');transfer.dataset.moveModule=row.screen;transfer.disabled=!s.navigationReady||s.navigationPending;
        wrap.append(transfer);details.append(wrap);
      }
      if(!matches.length)details.append(make('p','lab-no-results','화면을 여기에 끌어 놓으세요.'));
      fragment.append(details);
    }
    if (!fragment.childNodes.length) fragment.append(make('p','lab-no-results','맞는 화면이 없어요.'));
    catalog.replaceChildren(fragment);
    const total = [...counts.values()].reduce((a,b)=>a+b,0);
    if (byId('open-total')) byId('open-total').textContent = total;
    if (byId('state-total')) byId('state-total').textContent = families.length+'개 화면군 · '+distinct(families.flat().map(r=>({key:r.screen+'/'+r.state+'/'+(r.mode||'simple')})),'key').length+'개 상태';
    for (const b of all('.lab-role-filter [data-role]')) b.classList.toggle('active',b.dataset.role === role);
  }
  function chips(s, width) {
    const row = s.current, strip = byId('state-buttons'), nodes = [];
    for (const item of states(s.screens,row)) {
      const b = button('',item.state === row.state ? 'active' : '',()=>openRow(item));
      b.dataset.state = item.state;
      b.setAttribute('aria-pressed',String(item.state === row.state));
      const info = h.info(item,width);
      const count = (h.feedbackFor?.(item,width)||[]).filter(entry=>entry.actionable).length;
      if (count || info.requested || info.approved) b.append(make('span','review-dot'+(info.approved&&!count?'':' fix')));
      b.append(document.createTextNode(item.stateLabel));
      if (count) b.append(make('small','',count));
      nodes.push(b);
    }
    const options = sameScreen(s.screens,row).filter(r=>r.state===row.state);
    if (options.length>1) {
      nodes.push(make('span','lab-state-separator'));
      const group = make('div','lab-variant');
      for (const opt of options) {
        const b = button(opt.variantLabel||opt.variant,opt.variant===row.variant?'active':'',()=>openRow(opt));
        b.dataset.variant=opt.variant; group.append(b);
      }
      nodes.push(group);
    }
    strip.replaceChildren(...nodes);
  }
  function positionDrawer() {
    const toolbarBottom=document.querySelector('.lab-topbar')?.getBoundingClientRect().bottom;
    if(toolbarBottom>0)byId('drawer').style.top=toolbarBottom+'px';
  }
  function layout() {
    positionDrawer();
    const available=Math.max(200,stage.clientWidth-(window.innerWidth<=680?20:48));
    for (const unit of all('.preview-unit:not([hidden])',preview)) {
      const width=Number(unit.dataset.width), height=Number(unit.dataset.height);
      const max = mode==='board' ? (width>=768?550:290) : mode==='dual'? Math.max(260,(available-24)/2):available;
      const scale=Math.max(.18, mode==='board'||byId('scale-fit').checked ? Math.min(max/width,1) : 1);
      const bound=unit.querySelector('.preview-bound'), canvas=unit.querySelector('.preview-canvas');
      unit.style.width=bound.style.width=width*scale+'px'; bound.style.height=height*scale+'px';
      canvas.style.width=width+'px'; canvas.style.height=height+'px';canvas.style.transform='scale('+scale+')';
    }
  }
  function card(row,width,board,epoch) {
    const unit=make('section','preview-unit '+(width>=768?'desktop':'mobile'));
    const caption=make('div','preview-caption'), bound=make('div','preview-bound'),canvas=make('div','preview-canvas');
    unit.dataset.width=width;unit.dataset.height=width>=768?900:844;unit.dataset.state=row.state;unit.dataset.module=row.screen;
    caption.append(make('strong','',board?row.stateLabel:width>=768?'PC':'모바일'));
    const control=button(board?'이 상태 열기':width+'px',board?'board-open':'viewport-review',()=>{
      if (board) setMode('focus');
      openRow(row,width);
    });
    if (board) control.dataset.openState=row.state; else control.dataset.reviewViewport=width;
    caption.append(control);
    const frame=make('iframe');
    frame.setAttribute('sandbox','allow-scripts');frame.title=row.label+' · '+row.stateLabel+' · '+width+'px';
    if (board) {frame.inert=true; frame.tabIndex=-1;}
    canvas.append(frame);bound.append(canvas);unit.append(caption,bound);
    h.loadPreview(row,width,frame,board).catch(()=>{if(epoch===previewEpoch && unit.isConnected)canvas.replaceChildren(make('p','','미리보기를 불러오지 못했습니다.'));});
    return unit;
  }
  function views(row,rows,width) {
    const version=byId('version').value;
    const key=[row.id,width,version,mode,row.mode||'simple',mobileWidth,pcWidth].join('|');
    if (renderKey===key) return;
    renderKey=key; const epoch=++previewEpoch;
    for (const old of all('.preview-unit',preview)) if (old!==focus) old.remove();
    stage.dataset.mode=mode;
    for (const b of all('.lab-mode button')) {b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));}
    preview.style.gridTemplateColumns=mode==='board' && width>=768?'repeat(auto-fill,minmax(min(100%,500px),1fr))':'';
    focus.hidden=mode==='board';
    focus.dataset.width=width;focus.dataset.height=width>=768?900:844;focus.dataset.state=row.state;focus.dataset.module=row.screen;
    focus.classList.toggle('desktop',width>=768);focus.classList.toggle('mobile',width<768);
    focus.querySelector('.preview-caption').replaceChildren(make('strong','',width>=768?'PC':'모바일'));
    const b=button(width+'px','viewport-review active',()=>openTab('review'));
    b.dataset.reviewViewport=width;focus.querySelector('.preview-caption').append(b);
    if (mode==='board') for (const item of states(rows,row)) preview.append(card(item,width,true,epoch));
    if (mode==='dual') {
      const other=width>=768?mobileWidth:pcWidth;
      const slot=card(row,other,false,epoch); if(width>=768)preview.insertBefore(slot,focus);else preview.append(slot);
    }
    layout();
  }
  function render() {
    const s=h.snapshot();
    positionDrawer();
    nav(s);
    if (!s.current) return;
    const row=s.current,width=h.width(row),future=(s.navigation?.layout?.assignments[row.screen]||(row.phase==='future'?'future':'mvp'))==='future';
    if(byId('business-candidates'))byId('business-candidates').hidden=!['business','store-settings','q3'].includes(row.screen);
    if(byId('consult-candidates'))byId('consult-candidates').hidden=!['consultation','drawer','admin-support'].includes(row.screen);
    if (mobileChoices.includes(width)) mobileWidth=width;
    if (pcChoices.includes(width)) pcWidth=width;
    byId('mobile-width').value=String(mobileWidth);
    byId('desktop-width').value=String(pcWidth);
    byId('caption').textContent=label(row);
    byId('current-description').textContent = (row.routeIds?.length?row.routeIds.join(' / ')+' · ':'')+(future?'향후 서비스 검토 · ':'')+(row.description||row.group);
    byId('current-case').textContent=row.stateLabel;
    byId('prototype-badge').textContent=future?'향후 검토 · 운영 미확정':'디자인 예시';
    chips(s,width);views(row,s.screens,width);
  }
  function historyLinks() {
    const wrap=byId('other-width-history'),s=h.snapshot();
    if(!wrap||!s.current) return;
    wrap.replaceChildren();
    if(s.current.mode==='detailed')return;
    for (const key of s.legacy.keys()) {
      const cut=key.lastIndexOf('/'), other=Number(key.slice(cut+1));
      if(key.slice(0,cut)!==s.current.id || other===h.width(s.current))continue;
      const past=s.legacy.get(key);
      wrap.append(button(other+'px 이전 검토 보기 · '+(past?.comments||[]).filter(x=>!x.deleted).length+'개 의견','review-btn',async()=>{await openRow(s.current,other);openTab('review');}));
    }
  }
  byId('open').onclick=()=>{byId('lab').classList.toggle('nav-open');if(byId('lab').classList.contains('nav-open'))byId('catalog-search').focus();};
  byId('catalog-search').oninput=render;
  byId('overview-button').onclick=()=>{openTab('overview');render();};
  for (const b of all('.lab-role-filter button')) b.onclick=()=>{role=b.dataset.role;render();};
  for (const b of all('.lab-mode button')) b.onclick=()=>setMode(b.dataset.mode);
  for (const b of all('[data-drawer-tab]')) b.onclick=()=>openTab(b.dataset.drawerTab);
  for (const b of all('.lab-bottomline [data-lab-action]')) b.onclick=()=>{const a=b.dataset.labAction;if(a==='replay')openRow(h.snapshot().current);else go(a==='prev'?-1:1);};
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented||e.isComposing||e.altKey||e.metaKey||e.ctrlKey||e.shiftKey||document.querySelector('dialog[open]'))return;
    if(e.key==='Escape'){
      if(!byId('pick-cancel').hidden)byId('pick-cancel').click();
      else if(!byId('drawer').hidden)h.close();
      else byId('lab').classList.remove('nav-open');
      return;
    }
    if(e.target.closest?.('input,select,textarea,[contenteditable=true]'))return;
    if (!byId('drawer').hidden)return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(e.key==='ArrowLeft'?-1:1);}
    if(e.key.toLowerCase()==='g')setMode(mode==='board'?'focus':'board');
    if(e.key.toLowerCase()==='c')byId('new').click();
  });
  for (const [id,mobile] of [['mobile-width',true],['desktop-width',false]]) {
    byId(id).onchange=()=>{
      const width=Number(byId(id).value);
      if (mobile) mobileWidth=width; else pcWidth=width;
      const row=h.snapshot().current;
      if (row) openRow(row,width);
    };
  }
  byId('scale-fit').onchange=layout;
  byId('motion-enabled').onchange=()=>{
    renderKey='';
    const row=h.snapshot().current;
    if (row) openRow(row);
  };
  const live=byId('live');
  let toastTimer;
  new MutationObserver(()=>{
    clearTimeout(toastTimer);
    live.classList.toggle('is-visible',Boolean(live.textContent));
    toastTimer=setTimeout(()=>live.classList.remove('is-visible'),2500);
  }).observe(live,{childList:true,subtree:true,characterData:true});
  new ResizeObserver(layout).observe(stage);
  setTab('review');
  return {render,historyLinks,setTab,openTab,activeTab:()=>panel,reviewWidths:()=>mode==='dual'?[mobileWidth,pcWidth]:[],focusForPoint:()=>{},setActiveMode:setMode};
}
