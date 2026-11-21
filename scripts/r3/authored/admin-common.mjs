// Interaction selectors and layout follow the approved R2 navigation, quotes-admin and
// operations-flows modules. Read only projected DOM values; renderer-only fixture
// data (including masked amounts) must never enter the replay or an export.
export function mountReviewControls(root,state,api) {
  const abort=new AbortController();
  const on=(node,event,fn)=>node?.addEventListener(event,fn,{signal:abort.signal});
  const one=selector=>root.querySelector(selector);
  const all=selector=>Array.from(root.querySelectorAll(selector));
  const route=(target,next)=>api.select(target||api.screen,next||'');
  const panel=one('.qa-admin,.ops-page');
  const registry=window.ORDER_DESIGN_MODULES.find(item=>item.id===api.screen);
  const states=new Set(registry.states);
  const exportButton=one('[data-qa-action=save-receipt],[data-qa-action=export-quotes]');
  if(exportButton)exportButton.textContent=api.screen==='receipt'?'검수용 영수증 예시 HTML 저장':'검수용 견적 목록 HTML 저장';
  const nav=one('.qa-admin-nav,.ops-sidebar nav');
  const style=document.createElement('style');
  style.textContent=`
    #order-single .inline-field-state,#order-single .qa-field-error{display:none!important}
    .qa-stat strong,.qa-donut strong,.ops-chart-output,.qa-chart-tip{font-variant-numeric:tabular-nums}
    .ops-sidebar nav{position:relative;isolation:isolate}.ops-nav-indicator{position:absolute;top:0;left:0;right:0;background:#eef2fc;border-radius:8px;z-index:-1;pointer-events:none;transition:transform .2s ease-out,height .2s,opacity .15s}
    .ops-depth[aria-expanded=true] svg:last-child,.qa-submenu-trigger[aria-expanded=true] .qa-nav-depth{rotate:90deg}
    .qa-submenu-trigger:not(:disabled):hover .qa-nav-depth,.ops-depth:not(:disabled):hover svg:last-child{translate:2px 0}
    .qa-admin-submenu,.ops-subnav{overflow:hidden}.qa-cost-day[aria-pressed=true] .qa-bar-pair{outline:2px solid #315de6;outline-offset:2px}
    .qa-donut{transition:filter .2s}.qa-donut.is-selected{filter:saturate(1.35)}
    .qa-widget-grid>.qa-widget-expanded{grid-column:1/-1}.qa-widget-edit{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.qa-widget-edit [hidden]{display:none}
    @media(prefers-reduced-motion:reduce){.ops-nav-indicator,.qa-donut{transition:none}}
  `; root.ownerDocument.head.append(style);
  root.dataset.motionRuntime='admin-common';
  const adapter=api.adapter||window.ORDER_APP_ADAPTER;
  const productMotion=window.ORDER_ADMIN_MOTION,restorations=[];
  // The dashboard's visual source is shared with signed product routes. The QA
  // adapter alone owns example responses; masked renderer totals are not reused.
  if(productMotion&&api.screen==='admin-overview'&&state==='normal'){
    const old=one('.qa-widget-grid');
    if(old){const replacement=document.createElement('div');replacement.innerHTML=productMotion.renderDashboard(api.dashboardData||{});old.replaceWith(replacement);restorations.push(()=>replacement.replaceWith(old));const stats=one('.qa-stats');if(stats){const hidden=stats.hidden;stats.hidden=true;restorations.push(()=>{stats.hidden=hidden;});}}
  }
  const review=Boolean(adapter?.fixture)||api.mode!=='product';
  const quickActions=api.quickActions||[['admin-quotes','견적 관리'],['profile','내 계정'],['admin-inquiries','문의 관리']].flatMap(([id,label])=>{
    const module=window.ORDER_DESIGN_MODULES.find(item=>item.id===id);return module?[{id,label,run:()=>route(id,module.states[0])}]:[];
  });
  const saveLayout=async(payload,{signal})=>{
    if(review){
      if(typeof api.saveReviewLayout!=='function'||typeof api.demoSuccess!=='function')throw Error('LAYOUT_UNAVAILABLE');
      const save=root.querySelector('[data-layout=save]');let applied=false;
      await api.demoSuccess(save,()=>{if(signal.aborted)return;api.saveReviewLayout(payload.layout.map(item=>({index:Number(item.id.slice(7)),wide:item.wide})));applied=true;});
      if(!applied)throw Error('LAYOUT_NOT_SAVED');
      return {revision:payload.revision+1,data:{layout:payload.layout}};
    }
    if(!adapter?.request)throw Error('LAYOUT_UNAVAILABLE');
    return adapter.request('/settings/dashboard-layout',{expectedRevision:payload.revision,requestKey:payload.requestKey,data:{layout:payload.layout}},signal);
  };
  const motion=productMotion?.mount(root,{screen:api.screen,reduced:api.reduced,data:api.dashboardData||{},actions:quickActions,
    ...(review?{}:{loadLayout:({signal})=>adapter.request('/settings/dashboard-layout',null,signal)}),saveLayout});
  const workflow=window.ORDER_WORKFLOW_MOTION?.mount(root,{screen:api.screen,state,adapter,reduced:api.reduced,api});
  on(root,'r3-widget-layout',e=>{
    const entries=e.detail?.layout;
    if(!motion||!Array.isArray(entries)||entries.length!==3||!entries.every(item=>item&&[0,1,2].includes(item.index)&&typeof item.wide==='boolean'))return;
    motion.restoreLayout({layout:entries.map(item=>({id:'widget-'+item.index,wide:item.wide}))});
  });
  if(motion&&adapter?.request&&['admin-overview','admin-analytics'].includes(api.screen)&&state!=='loading'){
    Promise.resolve(adapter.request('/dashboard',null,abort.signal)).then(data=>{if(!abort.signal.aborted)motion.updateData(data);}).catch(()=>{if(!abort.signal.aborted){const scope=one('.pm-data-scope');if(scope)scope.textContent='현황을 불러오지 못했습니다. 다시 시도해 주세요.';}});
  }
  const fieldError=input=>{window.QAUI.setFieldError(input,'입력값을 확인해 주세요.');window.QAUI.shake(input.closest('.input-shell')||input);input.focus();};
  function validate(form){
    if(!form)return true;
    const invalid=[...form.querySelectorAll('input[required],select[required],textarea[required]')].find(input=>!input.checkValidity()||!(input.type==='checkbox'?input.checked:input.value.trim()));
    if(invalid)fieldError(invalid);
    return !invalid;
  }
  const commonOptions=one('.common-options'),trigger=one('[data-action=toggle-options]');
  function setOptions(open,focus=false){
    if(!commonOptions)return;
    commonOptions.classList.toggle('is-open',open);commonOptions.inert=!open;trigger.setAttribute('aria-expanded',String(open));if(focus)trigger.focus();
  }
  on(document,'pointerdown',e=>{if(commonOptions&&!e.target.closest('.common-dropdown'))setOptions(false);});
  if(nav&&!motion){
    let indicator=nav.querySelector('.qa-nav-hover');
    if(!indicator){indicator=document.createElement('span');indicator.className='ops-nav-indicator';indicator.setAttribute('aria-hidden','true');nav.prepend(indicator);}
    indicator.style.opacity='0';
    const move=e=>{const b=e.target.closest('.qa-admin-nav-item,.ops-nav');if(!b||!nav.contains(b))return;indicator.style.height=b.offsetHeight+'px';indicator.style.transform='translateY('+(b.getBoundingClientRect().top-nav.getBoundingClientRect().top+nav.scrollTop)+'px)';indicator.style.opacity='1';};
    on(nav,'pointerover',move);on(nav,'focusin',move);
    on(nav,'pointerleave',()=>{indicator.style.opacity='0';});on(nav,'focusout',e=>{if(!nav.contains(e.relatedTarget))indicator.style.opacity='0';});
  }
  const donut=one('.qa-donut'),donutNumber=donut?.querySelector('strong'),donutLabel=donut?.querySelector('span');
  const total=donutNumber?.textContent,originalLabel=donutLabel?.textContent;
  const chartTip=one('.qa-chart-tip'),days=all('.qa-cost-day'),funnel=all('.ops-funnel button');
  function selectMetric(b){
    if(b.closest('.qa-donut-legend')){
      donutNumber.textContent=b.querySelector('strong').textContent;donutLabel.textContent=b.querySelector('span').textContent;donut.classList.add('is-selected');
    }else if(b.classList.contains('qa-cost-day')){
      // The costs were masked at materialization. Never restore the original sample amounts.
      days.forEach(d=>d.setAttribute('aria-pressed',String(d===b)));chartTip.hidden=false;chartTip.textContent=b.lastElementChild.textContent+' · 납품 비용 미제공';
    }else if(b.closest('.ops-funnel')){
      funnel.forEach(d=>d.setAttribute('aria-pressed',String(d===b)));one('.ops-chart-output').textContent=b.querySelector('span').textContent+' '+b.querySelector('strong').textContent+'건';
    }
  }
  for(const b of [...all('.qa-donut-legend button'),...days,...funnel]){
    for(const event of ['pointerenter','focus','click'])on(b,event,()=>selectMetric(b));
    const reset=()=>{if(b.closest('.qa-donut-legend')){donutNumber.textContent=total;donutLabel.textContent=originalLabel;donut.classList.remove('is-selected');}if(days.includes(b)){chartTip.hidden=true;b.setAttribute('aria-pressed','false');}};
    on(b,'pointerleave',reset);on(b,'blur',reset);
  }
  const chartSelect=one('.qa-cost-widget select'),dayLabels=days.map(b=>b.lastElementChild.textContent);
  on(chartSelect,'change',()=>days.forEach((b,i)=>{b.lastElementChild.textContent=chartSelect.selectedIndex?String(parseInt(dayLabels[i],10)-7)+'일':dayLabels[i];}));
  const rows=all('.ops-table tbody tr,.qa-admin-main table tbody tr');
  const query=one('[type=search],[name=operationsSearch]');
  const filter=one('select[name=status],.qa-list-tools select');
  function filterRows(){
    const term=(query?.value||'').trim().toLocaleLowerCase(),status=filter?.selectedIndex?filter.selectedOptions[0].textContent:'';
    let hits=0;for(const tr of rows){const text=tr.textContent.toLocaleLowerCase();tr.hidden=!text.includes(term)||Boolean(status&&!text.includes(status));if(!tr.hidden)hits++;}
    const empty=one('.ops-filter-empty');if(empty)empty.hidden=hits>0;
  }
  on(query,'input',filterRows);on(filter,'change',filterRows);
  const amount=one('[name=billing-amount]'),account=one('.qa-amount-pad select'),billingSummary=all('.qa-billing-summary dd');
  function updateAmount(){if(!amount)return;amount.value=amount.value.replace(/\D/g,'').slice(0,9);if(billingSummary[0])billingSummary[0].textContent=account?.selectedOptions[0]?.textContent||'—';if(billingSummary[1])billingSummary[1].textContent=amount.value?Number(amount.value).toLocaleString('ko-KR')+'원':'—';}
  on(amount,'input',updateAmount);on(account,'change',updateAmount);
  const grid=one('.qa-widget-grid');
  if(grid&&!motion){
    const tools=document.createElement('div');tools.className='qa-widget-edit';
    const make=(name,action)=>{const b=document.createElement('button');b.type='button';b.className='btn text';b.textContent=name;b.dataset.layout=action;return b;};
    const edit=make('위젯 배치','edit'),controls=document.createElement('span'),list=document.createElement('select');
    list.setAttribute('aria-label','배치를 바꿀 위젯');const widgets=[...grid.children];for(const [index,card] of widgets.entries())list.add(new Option(card.querySelector('h2')?.textContent||String(index+1),index));
    const back=make('앞으로','back'),forward=make('뒤로','forward'),size=make('너비 변경','size'),save=make('배치 적용','save'),cancel=make('취소','cancel');
    controls.hidden=true;controls.append(list,back,forward,size,save,cancel);tools.append(edit,controls);grid.before(tools);
    let saved=[];
    const scoped=api.screen==='admin-overview'&&state==='normal'&&widgets.length===3;
    const layout=()=>[...grid.children].map(card=>({index:widgets.indexOf(card),wide:card.classList.contains('qa-widget-expanded')}));
    on(root,'r3-widget-layout',e=>{
      const entries=e.detail?.layout;
      if(!scoped||!Array.isArray(entries)||entries.length!==3||!entries.every(item=>item&&Object.keys(item).length===2&&[0,1,2].includes(item.index)&&typeof item.wide==='boolean')||new Set(entries.map(item=>item.index)).size!==3)return;
      for(const entry of entries){const card=widgets[entry.index];grid.append(card);card.classList.toggle('qa-widget-expanded',entry.wide);}
    });
    function finish(){controls.hidden=true;edit.hidden=false;edit.focus();}
    on(tools,'click',e=>{const action=e.target.closest('[data-layout]')?.dataset.layout;if(!action)return;
      const card=widgets[Number(list.value)];
      if(action==='edit'){saved=[...grid.children].map(c=>[c,c.classList.contains('qa-widget-expanded')]);edit.hidden=true;controls.hidden=false;list.focus();}
      if(action==='back'&&card.previousElementSibling)grid.insertBefore(card,card.previousElementSibling);
      if(action==='forward'&&card.nextElementSibling)grid.insertBefore(card.nextElementSibling,card);
      if(action==='size')card.classList.toggle('qa-widget-expanded');
      if(action==='cancel'){for(const [c,wide] of saved){grid.append(c);c.classList.toggle('qa-widget-expanded',wide);}finish();}
      if(action==='save')api.demoSuccess(save,()=>{if(scoped)api.saveReviewLayout(layout());finish();});
    });
  }
  if(!motion&&state!=='loading'&&!api.reduced())for(const card of all('.qa-stat,.qa-donut,.ops-metric'))card.animate?.([{opacity:.35,translate:'0 4px'},{opacity:1,translate:'0 0'}],{duration:260,easing:'ease-out'});
  const defaultNext={'admin-overview':'normal','admin-billing':'draft','admin-quotes':'list','receipt':'before'};
  const outcome={'review-approve':'approval-requested','confirm-payment':'list','approve-price':'list','submit-entity':'detail','submit-zone':'detail','submit-order':'detail','submit-invite':'list','submit-reply':'closed','submit-capacity':'week','run-simulation':'normal','review-policy':'published','submit-policy':'normal','submit-billing':'complete','issue-receipt':'complete','retry-receipt':'complete','submit-performance':'reviewing','approve-performance':'approved','review-ad':'approved'};
  const simulated=new Set([...Object.keys(outcome),'save-draft','save-negotiation','confirm-ledger','submit-dispute','confirm-dispatch','submit-price-review','hold-payment','issue-document','request-signature','mark-quote']);
  function actionClick(e){
    const b=e.target.closest('button');if(!b||b.disabled)return;
    const a=b.dataset.action||b.dataset.qaAction;
    if(workflow?.handlesAction(a))return;
    const target=b.dataset.opRoute||b.dataset.mfGo||(a==='admin-route'&&b.dataset.target);
    if(target){const next=b.dataset.mfState||b.dataset.opNext||defaultNext[target];route(target,next);return;}
    if(a==='save-demo'){api.demoSuccess(b);return;}
    if(a==='load-demo'){const region=one('.t-skel');region.classList.remove('is-revealed');api.demoSuccess(b,()=>region.classList.add('is-revealed'),{region}).then(ok=>{if(!ok)region.classList.add('is-revealed');});return;}
    if(a==='error-demo'){fieldError(one('[name=demo-name]'));return;}
    if(a==='resize-demo'){const card=one('.demo-resize');const compact=card.classList.toggle('is-compact');card.style.height=compact?'112px':'222px';return;}
    if(a==='toggle-options'){setOptions(trigger.getAttribute('aria-expanded')!=='true');return;}
    if(b.hasAttribute('data-option')){trigger.textContent=b.dataset.option;setOptions(false,true);return;}
    if(b.matches('.t-toggle')){const next=b.getAttribute('aria-checked')!=='true';b.dataset.on=String(next);b.setAttribute('aria-checked',String(next));b.classList.add('is-init');return;}
    if(['collapse','collapse-sidebar'].includes(a)){const compact=panel.classList.toggle(a==='collapse'?'collapsed':'is-collapsed');b.setAttribute('aria-expanded',String(!compact));b.setAttribute('aria-label',compact?'메뉴 펼치기':'메뉴 접기');return;}
    if(['submenu','toggle-submenu'].includes(a)){if(motion?.toggleDepth(b))return;const sub=one('.ops-subnav,#qa-admin-submenu');if(!sub)return;const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));sub.inert=!open;sub.setAttribute('aria-hidden',String(!open));sub.classList.toggle('is-open',open);if(sub.classList.contains('ops-subnav')){sub.hidden=!open;if(open&&!api.reduced())sub.animate?.([{opacity:0,translate:'0 -4px'},{opacity:1,translate:'0 0'}],{duration:180});}return;}
    if(a==='copy-summary'){api.toast(all('.qa-stat').map(n=>n.textContent.trim()).join(' / '));return;}
    if(['export-quotes','save-receipt'].includes(a)){api.downloadReviewDocument();return;}
    if(a==='issue-receipt'){
      const paper=one('.qa-receipt'),heading=one('.qa-receipt-heading h1'),message=one('.qa-receipt-heading [role=status]');
      paper.dataset.state='issuing';heading.textContent='검수용 영수증을 준비하고 있어요';message.textContent='';
      api.demoSuccess(b,()=>route('receipt','complete')).then(ok=>{
        if(!ok&&root.isConnected){paper.dataset.state='error';heading.textContent='검수용 영수증을 준비하지 못했어요';message.textContent='다시 시도할 수 있어요.';}
      });return;
    }
    if(a==='billing-back'){route('admin-billing','draft');return;}
    if(a==='new-billing'){route('admin-billing','draft');return;}
    if(a==='close-detail'){route('admin-quotes','list');return;}
    if(a==='pause-order'||a==='resume-order'||a==='revoke-review'){const next={'pause-order':'paused','resume-order':'detail','revoke-review':'revoked'}[a];if(states.has(next))api.demoSuccess(b,()=>route(null,next));return;}
    if(a==='document'){
      const dialog=document.createElement('dialog'),head=document.createElement('h2'),summary=document.createElement('p'),close=document.createElement('button');
      head.textContent='검수용 문서 미리보기';summary.textContent=b.closest('tr')?.innerText||one('.ops-panel h2')?.textContent||'검토 자료';close.textContent='닫기';close.type='button';
      dialog.append(head,summary,close);root.append(dialog);dialog.setAttribute('aria-label',head.textContent);dialog.showModal();close.focus();on(close,'click',()=>dialog.close());on(dialog,'close',()=>{dialog.remove();b.focus();});return;
    }
    if(a==='detail'||a==='quote-detail'){if(states.has('detail'))route(null,'detail');return;}
    if(a==='clear-search'&&query){query.value='';if(filter)filter.selectedIndex=0;filterRows();return;}
    if(a==='show-receipt'){route('receipt','before');return;}
    if(a==='clear-amount'||b.closest('.qa-number-pad')){
      const input=one('[name=billing-amount]');if(!input)return;const key=b.textContent.trim();input.value=a==='clear-amount'?'':key==='삭제'?input.value.slice(0,-1):(input.value+key).replace(/\D/g,'').slice(0,9);input.dispatchEvent(new Event('input',{bubbles:true}));return;
    }
    if(['retry','retry-overview','back','admin-back'].includes(a)){route(a==='back'||a==='admin-back'?'admin-overview':null,a==='back'||a==='admin-back'?'normal':registry.states[0]);return;}
    if(a==='staff-login'){if(validate(b.closest('form')))api.demoSuccess(b,()=>state==='code'?route('admin-overview','normal'):route(null,'code'));return;}
    if(simulated.has(a)){
      if(a==='submit-billing'&&!Number(one('[name=billing-amount]')?.value)){fieldError(one('[name=billing-amount]'));return;}
      if(!validate(b.closest('form')))return;
      const checks=all('.ops-review-checks input,[name=payment-check]');
      if(['approve-price','confirm-payment','review-approve'].includes(a)&&checks.some(input=>!input.checked)){checks.find(input=>!input.checked)?.focus();return;}
      api.demoSuccess(b,states.has(outcome[a])?()=>route(null,outcome[a]):undefined);return;
    }
    if(states.has(a))route(null,a);
  }
  on(root,'click',actionClick);
  on(root,'keydown',e=>{
    if(e.key==='Escape'&&commonOptions?.classList.contains('is-open')){e.preventDefault();setOptions(false,true);}
    if(e.key==='ArrowDown'&&e.target===trigger){e.preventDefault();setOptions(true);commonOptions.querySelector('button')?.focus();}
    if(commonOptions?.contains(e.target)&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();(e.key==='ArrowDown'?e.target.nextElementSibling:e.target.previousElementSibling)?.focus();}
  });
  return ()=>{abort.abort();workflow?.destroy?.();motion?.destroy();for(const restore of restorations.reverse())restore();style.remove();};
}
