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
  let role = 'current', mode = ['board','dual'].includes(query.get('mode')) ? query.get('mode') : 'focus';
  const mobileChoices = [...byId('mobile-width').options].map(o => Number(o.value));
  const pcChoices = [...byId('desktop-width').options].map(o => Number(o.value));
  const initialWidth = Number(query.get('width'));
  let mobileWidth = mobileChoices.includes(initialWidth) ? initialWidth : 390;
  let pcWidth = pcChoices.includes(initialWidth) ? initialWidth : 1280;
  let renderKey = '', panel = 'review', previewEpoch = 0;
  const distinct = (rows, key) => [...new Map(rows.map(row => [row[key], row])).values()];
  function openRow(row, width) {
    if (!row) return;
    byId('lab').classList.remove('nav-open');
    if (width) byId('width').value = String(width);
    stage.scrollTop = 0;
    return h.select(row);
  }
  function sameScreen(rows, row) { return rows.filter(r => r.screen === row.screen); }
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
    const url = new URL(location.href); url.searchParams.set('mode',name);
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
    const counts = new Map();
    const add = (key, n) => counts.set(key,(counts.get(key)||0)+n);
    for (const [key, row] of legacy) {
      const id = key.split('/')[0];
      add(id,(row.comments||[]).filter(c => !c.deleted && c.status !== 'resolved').length);
    }
    for (const r of records.values()) if (r.kind === 'comment' && !['delete','resolve'].includes(r.action) && !h.isTest(r)) add(r.data.target.screen,1);
    return counts;
  }
  function nav(s, counts) {
    const term = byId('catalog-search').value.trim().toLocaleLowerCase();
    const catalog = byId('catalog');
    const fragment = document.createDocumentFragment();
    let lastGroup = '';
    const groups = new Map();
    for (const r of s.screens) {
      if (!groups.has(r.screen)) groups.set(r.screen,[]);
      groups.get(r.screen).push(r);
    }
    for (const family of groups.values()) {
      const row = family[0];
      if (role !== 'all' && (role === 'future' ? row.phase !== 'future' : row.phase === 'future' || role !== 'current' && row.role !== role)) continue;
      const found = term ? family.find(r => [r.id,r.label,r.group,r.stateLabel,r.description,...(r.routeIds||[])].join(' ').toLocaleLowerCase().includes(term)) : row;
      if (!found) continue;
      if (row.group !== lastGroup) { fragment.append(make('p','lab-group',row.group)); lastGroup = row.group; }
      const b = button('', 'lab-nav', () => openRow(found));
      b.dataset.module = row.screen;
      if (s.current?.screen === row.screen) { b.classList.add('active'); b.setAttribute('aria-current','page'); }
      const label = make('span','nav-label',row.label);
      if (row.phase === 'future') label.append(make('small','','향후'));
      b.append(label);
      if (counts.get(row.screen)) b.append(make('span','nav-comment-count',counts.get(row.screen)));
      b.append(make('span','nav-count',distinct(family,'state').length));
      fragment.append(b);
    }
    if (!fragment.childNodes.length) fragment.append(make('p','lab-no-results','맞는 화면이 없어요.'));
    catalog.replaceChildren(fragment);
    const total = [...counts.values()].reduce((a,b)=>a+b,0);
    if (byId('open-total')) byId('open-total').textContent = total;
    if (byId('state-total')) byId('state-total').textContent = groups.size+'개 화면군 · '+distinct(s.screens.map(r=>({key:r.screen+'/'+r.state})),'key').length+'개 상태';
    for (const b of all('.lab-role-filter [data-role]')) b.classList.toggle('active',b.dataset.role === role);
  }
  function chips(s, width) {
    const row = s.current, strip = byId('state-buttons'), nodes = [];
    for (const item of states(s.screens,row)) {
      const b = button('',item.state === row.state ? 'active' : '',()=>openRow(item));
      b.dataset.state = item.state;
      b.setAttribute('aria-pressed',String(item.state === row.state));
      const past = s.legacy.get(item.id+'/'+width);
      const info = h.info(item,width);
      if (past?.status === 'fix' || info.requested || info.approved) b.append(make('span','review-dot'+(info.approved?'':' fix')));
      b.append(document.createTextNode(item.stateLabel));
      const count = (past?.comments||[]).filter(c=>!c.deleted && c.status!=='resolved').length +
        (h.liveFor(item,width)||[]).filter(r=>r.kind==='comment' && !['resolve','delete'].includes(r.action) && !h.isTest(r)).length;
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
  function layout() {
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
    const key=[row.id,width,version,mode,mobileWidth,pcWidth].join('|');
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
    nav(s,rowCounts(s.screens,s.legacy,s.records));
    if (!s.current) return;
    const row=s.current,width=h.width(row);
    if (mobileChoices.includes(width)) mobileWidth=width;
    if (pcChoices.includes(width)) pcWidth=width;
    byId('mobile-width').value=String(mobileWidth);
    byId('desktop-width').value=String(pcWidth);
    byId('caption').textContent=row.label;
    byId('current-description').textContent = (row.routeIds?.length?row.routeIds.join(' / ')+' · ':'')+(row.phase==='future'?'향후 서비스 검토':row.description||row.group);
    byId('current-case').textContent=row.stateLabel;
    byId('prototype-badge').textContent=row.phase==='future'?'향후 검토 · 운영 미확정':'디자인 예시';
    chips(s,width);views(row,s.screens,width);
  }
  function historyLinks() {
    const wrap=byId('other-width-history'),s=h.snapshot();
    if(!wrap||!s.current) return;
    wrap.replaceChildren();
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
    if(e.defaultPrevented||e.altKey||e.metaKey||e.ctrlKey||e.shiftKey||e.target.closest?.('input,select,textarea,button,[contenteditable=true]'))return;
    if(e.key==='Escape'){byId('lab').classList.remove('nav-open');if(!byId('drawer').hidden)h.close();return;}
    if (!byId('drawer').hidden)return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(e.key==='ArrowLeft'?-1:1);}
    if(e.key.toLowerCase()==='g')setMode(mode==='board'?'focus':'board');
    if(e.key.toLowerCase()==='c')openTab('review');
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
  return {render,historyLinks,setTab,openTab,activeTab:()=>panel,focusForPoint:()=>{},setActiveMode:setMode};
}
