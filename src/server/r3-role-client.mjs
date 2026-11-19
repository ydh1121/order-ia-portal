export function runRolePage(labels,createEvidenceEditor,createCustomerControls,mountAsyncMotion){
  let asyncMotion;
  const controls=createCustomerControls(),signedView={mode:'grid',selected:null,gesture:null,tags:[]};
  const $=id=>document.getElementById(id), name=x=>labels[x]||x;
  const endpoint='/api/ia/r3-role';
  const menus={
    inbox:['지금 할 일',['BUYER','SUPPLIER','OPERATOR']],
    quotes:['내 견적·오더패스',['BUYER']],
    business:['사업자 정보',['BUYER','OPERATOR']],
    consult:['상담 예약',['BUYER','OPERATOR']],
    reprice:['가격 재검토',['BUYER','OPERATOR']],
    delivery:['납품 관리',['BUYER','SUPPLIER','OPERATOR']],
    supply:['공급 참여',['SUPPLIER','OPERATOR']],
    catalog:['상품 심사',['SUPPLIER','OPERATOR']],
    review:['검토함',['OPERATOR']],
    settlement:['거래 문서·정산',['BUYER','SUPPLIER','OPERATOR']],
    activity:['알림',['BUYER','SUPPLIER','OPERATOR']]
  };
  const settlement=new Set(['RECEIVED','DOCUMENT_REVIEWED','SETTLEMENT_REVIEW','SETTLEMENT_REVIEWED']);
  const complete=new Set(['REJECTED','CANCELLED','CLOSED','SETTLEMENT_REVIEWED','APPROVED','VERIFIED','REVOKED','QUOTE_UPDATED']);
  const allowCreate={BUYER:['business','consult','reprice','delivery'],SUPPLIER:['supply','catalog']};
  const messages={NO_BUSINESS_MEMBERSHIP:'이 계정에 연결된 업무 권한이 없습니다.',ACCESS_DENIED:'이 업무에 접근할 수 없습니다.',IA_ACCESS_DENIED:'업무 계정으로 다시 로그인해 주세요.',CSRF_DENIED:'세션이 만료되었습니다. 다시 로그인해 주세요.',NOT_FOUND:'업무를 열 수 없습니다.',QUOTE_UNAVAILABLE:'유효한 견적을 선택해 주세요.',REVISION_CONFLICT:'다른 담당자가 먼저 처리했습니다.',REVISION_OR_CONDITION_CHANGED:'처리 조건이 변경되었습니다.',ACTION_NOT_ALLOWED:'현재 상태에서 처리할 수 없습니다.',CASE_EXISTS_OR_CHANGED:'이미 진행 중인 신청이 있습니다.',INVALID_INPUT:'입력한 내용을 확인해 주세요.'};
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const button=(label,fn)=>{const el=node('button',label);el.type='button';el.onclick=fn;return el;};
  const link=(text,href)=>{const a=node('a',text);a.href=href;return a;};
  const option=(el,value,text)=>el.append(new Option(text,value));
  const query=()=>new URL(location.href).searchParams;
  const titleDate=s=>(s||'').slice(0,10);
  const money=value=>typeof value==='string' && /^\d+(\.\d+)?$/.test(value)?value.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'원':'';
  const unit=u=>({tray:'판',pack:'팩',box:'상자',piece:'개'}[u]||u||'');
  const qTitle=q=>[q.productName||'발급 견적',q.lineCount>1?'외 '+(q.lineCount-1)+'항목':null,q.deliveryQty==null?null:q.deliveryQty+unit(q.unit),titleDate(q.serviceDate)||titleDate(q.issued_at)].filter(Boolean).join(' · ');
  let grants=[],cases=[],opts={quotes:[],products:[],businesses:[]},next='',csrf='',epoch=0,expiryTimer=0,dispose=()=>{},pending,loading=false,ready=false;
  const draftKey='order.r3.business.form.v1';
  let drafts={},cipher=null,changeNumber=0;
  const unpack=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
  const pack=bytes=>btoa(Array.from(bytes,c=>String.fromCharCode(c)).join(''));
  async function openDrafts(secret){
    if(!crypto.subtle)return;
    const start=epoch;
    const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('role-draft:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
    if(start!==epoch)return;
    cipher=key;
    try{const packet=JSON.parse(sessionStorage.getItem(draftKey));if(packet){
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unpack(packet.iv)},key,unpack(packet.data));
      if(start===epoch)drafts=JSON.parse(new TextDecoder().decode(plain));
    }}catch{if(start===epoch)sessionStorage.removeItem(draftKey);}
  }
  async function persistDrafts(){
    const seq=++changeNumber,key=cipher;if(!key)return;
    try{
      const iv=crypto.getRandomValues(new Uint8Array(12)),text=JSON.stringify(drafts);
      const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(text));
      if(seq===changeNumber)sessionStorage.setItem(draftKey,JSON.stringify({iv:pack(iv),data:pack(new Uint8Array(bytes))}));
    }catch{ /* Session storage may be unavailable. The current form remains in memory. */ }
  }
  function values(form){return Object.fromEntries([...new FormData(form).keys()].map(k=>[k,new FormData(form).getAll(k)]));}
  function restore(form,stored){
    for(const [key,values] of Object.entries(stored||{})){
      const input=form.elements.namedItem(key);if(!input||['kind','scope','action'].includes(key))continue;
      if(input.multiple){for(const o of input.options)o.selected=values.includes(o.value);}
      else if(input.tagName==='SELECT'){if([...input.options].some(o=>o.value===values[0]))input.value=values[0];}
      else input.value=values[0]||'';
    }
  }
  const activeRoles=()=>new Set(grants.map(g=>g.role));
  const allowed=key=>menus[key]?.[1].some(role=>activeRoles().has(role));
  function menu(){
    if(query().get('menu'))return query().get('menu');
    const roles=activeRoles();
    if(roles.has('BUYER'))return 'quotes';
    if(roles.has('SUPPLIER'))return 'delivery';
    return roles.has('OPERATOR')?'review':'inbox';
  }
  const qMap=id=>opts.quotes.find(q=>q.id===id);
  const status=s=>{$('status').textContent=s;};
  const error=e=>{if(e.name==='AbortError')return;status(messages[e.message]||(navigator.onLine?'업무를 불러오지 못했습니다. 새로고침해 주세요.':'연결이 끊겼습니다. 연결 후 다시 저장해 주세요.'));};
  async function api(path,body,signal){
    const settings={cache:'no-store',credentials:'same-origin',signal};
    if(body)Object.assign(settings,{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':csrf},body:JSON.stringify(body)});
    const res=await fetch(path,settings);
    const data=await res.json();
    if(!res.ok)throw Object.assign(new Error(data.error),{status:res.status});
    return data;
  }
  function clear(){
    ++epoch;signedView.gesture?.abort();panelView='';signedView.selected=null;signedView.tags=[];asyncMotion?.destroy();asyncMotion=null;cipher=null;drafts={};clearTimeout(expiryTimer);dispose();dispose=()=>{};ready=false;csrf='';pending=null;grants=[];cases=[];next='';opts={quotes:[],products:[],businesses:[]};
    for(const id of ['role-search-tags','role-menu','queue-list','list','detail','create','publication'])$(id).replaceChildren();
    $('account-trigger').hidden=true;$('account-panel').hidden=true;$('account-panel').replaceChildren();
    $('create').hidden=true;$('filter-bar').hidden=true;$('more').hidden=true;$('r3-practice').hidden=true;
  }
  function historyChange(changes,replace=false){
    const url=new URL(location.href);
    for(const [k,v] of Object.entries(changes)){if(v)url.searchParams.set(k,v);else url.searchParams.delete(k);}
    if(url.href!==location.href)history[replace?'replaceState':'pushState'](null,'',url);
  }
  function go(changes){historyChange(changes);render();if(query().get('case'))showCase(query().get('case'));}
  const gName=g=>opts.businesses.find(x=>x.org_id===g.org_id&&x.site_id===g.site_id)?.businessName||g.site_id||g.org_id;
  const eventKey=e=>e.case_id+':'+e.revision;
  function unreadActivity(){return (opts.activity||[]).filter(e=>!(drafts.readActivity||[]).includes(eventKey(e)));}
  function readActivity(e){
    const seen=new Set(drafts.readActivity||[]);seen.add(eventKey(e));
    drafts.readActivity=[...seen].slice(-256);persistDrafts();renderMenu();
  }
  function renderMenu(){
    const area=$('role-menu');area.replaceChildren();
    for(const [key,[title]] of Object.entries(menus)){
      if(key==='inbox'||!allowed(key))continue;
      const a=link(title,'/ia?view=roles-r3&menu='+key);
      if(key==='activity'){
        const count=unreadActivity().length;
        if(count){const badge=node('span',String(count));badge.className='role-badge';badge.setAttribute('aria-label','이 세션에서 열어보지 않은 알림 '+count+'개');a.append(badge);}
      }
      a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();go({menu:key,case:null,quote:null,filter:null,q:null});};
      if(menu()===key)a.setAttribute('aria-current','page');area.append(a);
    }
    if(grants.some(g=>g.role==='SUPPLIER'||g.role==='OPERATOR')){
      area.append(link('상품·단가표','/ia?view=pricing-r3#prices'),link('배송 조건','/ia?view=pricing-r3#shipping'));
    }
  }
  function filterRow(c,key){
    if(key==='settlement')return c.kind==='delivery'&&settlement.has(c.state);
    if(key==='inbox')return c.actions.length>0;
    if(key==='review')return grants.some(g=>g.role==='OPERATOR'&&g.org_id===c.org_id);
    if(key==='activity')return true;
    return key===c.kind;
  }
  function rowButton(c,note){
    const li=node('li'),b=button(name(c.kind)+' · '+name(c.state),()=>go({case:c.id}));
    b.dataset.anchor='case-'+c.id;
    li.append(b,node('small',[c.businessName||gName(c),titleDate(c.desiredDate||c.updated_at),note].filter(Boolean).join(' · ')));
    return li;
  }
  function list(){
    const key=menu(),out=$('list'),related=$('queue-list');signedView.gesture?.abort();out.replaceChildren();related.replaceChildren();
    $('query').removeAttribute('list');$('query').onkeydown=null;$('role-search-tags').replaceChildren();
    if(!allowed(key)){out.append(node('li','이 메뉴에 연결된 권한이 없습니다.'));return;}
    const term=(query().get('q')||'').trim().toLocaleLowerCase(),filter=query().get('filter')||'all';
    const contains=x=>String(x||'').toLocaleLowerCase().includes(term);
    const tagArea=$('role-search-tags');tagArea.replaceChildren();tagArea.hidden=key!=='quotes';
    if(key==='quotes'){
      const available=[...new Set(opts.quotes.flatMap(q=>[q.productName,q.supplierName,gName(q),q.deliveryState?name(q.deliveryState):null]).filter(Boolean))];
      const input=$('query');input.setAttribute('list','role-tag-options');const options=node('datalist');options.id='role-tag-options';
      for(const tag of available.filter(v=>!signedView.tags.includes(v))){const o=node('option');o.value=tag;options.append(o);}
      tagArea.append(options);
      for(const tag of signedView.tags){const chip=button(tag+' ×',()=>{signedView.tags=signedView.tags.filter(v=>v!==tag);list();input.focus();});chip.setAttribute('aria-label',tag+' 태그 제거');tagArea.append(chip);}
      input.onkeydown=e=>{
        if(e.isComposing||e.keyCode===229)return;
        if(e.key==='Enter'&&available.includes(input.value)&&!signedView.tags.includes(input.value)){
          e.preventDefault();signedView.tags.push(input.value);input.value='';historyChange({q:null},true);list();input.focus();
        }else if(e.key==='Backspace'&&!input.value&&signedView.tags.length){e.preventDefault();signedView.tags.pop();list();}
      };
      const tools=node('div'),deck=node('li'),cards=node('div'),pager=node('div');
      tools.className='signed-pass-tools';deck.className='signed-passes';cards.className='signed-pass-cards';pager.className='signed-pass-pager';
      const rows=[];
      for(const q of opts.quotes){
        const terms=[qTitle(q),q.supplierName,gName(q),name(q.deliveryState)];
        if(!terms.some(contains)||!signedView.tags.every(tag=>terms.some(v=>String(v||'').includes(tag))))continue;
        const li=node('article');li.tabIndex=0;li.dataset.ticket=q.id;li.className='signed-pass';
        const h=node('header');h.append(node('strong',qTitle(q)),node('small',q.deliveryState?name(q.deliveryState):'발급'));
        li.append(h,node('small',[gName(q),q.supplierName,money(q.total)].filter(Boolean).join(' · ')));
        li.append(node('hr'));
        li.append(link('견적 결과 보기','/ia?view=simple-r3&quote='+encodeURIComponent(q.id)+'#/result'));
        if(q.deliveryCase)li.append(button('납품 내역',()=>go({menu:'delivery',case:q.deliveryCase})));
        if(Date.parse(q.expires_at)>Date.now()){
          for(const [cmd,label] of [['consult','상담 예약'],['reprice','가격 재검토'],['delivery','납품 요청']]){
            if(cmd==='delivery'&&q.deliveryCase)continue;li.append(button(label,()=>go({menu:cmd,quote:q.id,case:null})));
          }
        }else li.append(node('small','견적 기한 만료'));
        rows.push(li);cards.append(li);
      }
      if(rows.length){
        related.append(deck);deck.append(tools,cards,pager);
        const grid=button('격자 보기',()=>view('grid')),stack=button('카드 넘기기',()=>view('deck'));
        tools.append(grid,stack);
        const counter=node('span');counter.setAttribute('aria-live','polite');
        const move=step=>{const i=Math.max(0,rows.findIndex(r=>r.dataset.ticket===signedView.selected));signedView.selected=rows[(i+step+rows.length)%rows.length].dataset.ticket;view(signedView.mode);};
        pager.append(button('이전',()=>move(-1)),counter,button('다음',()=>move(1)));
        function view(mode){
          signedView.mode=mode;
          const current=Math.max(0,rows.findIndex(r=>r.dataset.ticket===signedView.selected));
          signedView.selected=rows[current].dataset.ticket;
          cards.classList.toggle('deck',mode==='deck');grid.setAttribute('aria-pressed',String(mode==='grid'));stack.setAttribute('aria-pressed',String(mode==='deck'));
          rows.forEach((card,i)=>{const depth=(i-current+rows.length)%rows.length;card.inert=mode==='deck'&&depth!==0;card.style.setProperty('--depth',String(Math.min(3,depth)));card.style.zIndex=String(rows.length-depth);});
          counter.textContent=(current+1)+' / '+rows.length;pager.hidden=mode!=='deck'||rows.length<2;
        }
        view(signedView.mode);signedView.gesture=new AbortController();
        controls.swipeDeck(cards,{enabled:()=>signedView.mode==='deck'&&rows.length>1,top:()=>rows.find(el=>el.dataset.ticket===signedView.selected),step:move,signal:signedView.gesture.signal});
        cards.onkeydown=e=>{if(signedView.mode==='deck'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);rows.find(el=>el.dataset.ticket===signedView.selected).focus();}};
      }else related.append(node('li','이 사업장에서 확인할 수 있는 발급 견적이 없습니다.'));
      related.append(link('간편 견적','/ia?view=simple-r3'),link('상세 견적','/ia?view=detailed-r3'),link('내 사업장 견적 발급','/ia?view=pricing-r3#quote'));
    }else if(key==='activity'){
      for(const e of opts.activity||[]){
        if(![gName(e),name(e.kind),name(e.action),name(e.next_state),titleDate(e.created_at)].some(contains))continue;
        const c=cases.find(row=>row.id===e.case_id);
        if((filter==='todo'&&!c?.actions.length)||(filter==='done'&&!complete.has(e.next_state)))continue;
        const li=node('li');
        li.append(button(name(e.kind)+' · '+name(e.action),()=>{readActivity(e);go({case:e.case_id});}),node('small',[name(e.next_state),gName(e),titleDate(e.created_at)].filter(Boolean).join(' · ')));
        out.append(li);
      }
    }else{
      for(const c of [...cases].sort((a,b)=>b.updated_at.localeCompare(a.updated_at))){
        if(!filterRow(c,key)||filter==='todo'&&!c.actions.length||filter==='done'&&!complete.has(c.state))continue;
        if(![gName(c),c.businessName,name(c.kind),name(c.state),c.desiredDate,c.product_id].some(contains))continue;
        out.append(rowButton(c,c.actions.length?'처리 가능':'담당자 처리 중'));
      }
    }
    if(!out.childElementCount&&key!=='quotes')out.append(node('li','해당하는 업무가 없습니다.'));

    $('more').hidden=!next||['quotes','activity'].includes(key);
  }
  function field(parent,label,key,options,type='text',required=true){
    const l=node('label',label),input=node(options?'select':type==='textarea'?'textarea':'input');
    input.name=key;input.required=required;
    if(options)for(const [value,text] of options)option(input,value,text);else {if(input.tagName==='INPUT')input.type=type;input.maxLength=key==='memo'?500:100;}
    l.append(input);parent.append(l);return input;
  }
  function createForm(){
    const form=$('create');form.replaceChildren();form.hidden=true;
    const key=menu(),pre=qMap(query().get('quote'));const creators=grants.filter(g=>allowCreate[g.role]?.some(k=>key==='inbox'||k===key));
    if(!creators.length||!allowed(key))return;
    form.hidden=false;
    const scope=field(form,'업무 범위 · 사업장','scope',creators.map((g,i)=>[String(i),name(g.role)+' · '+gName(g)]));
    if(pre){const i=creators.findIndex(g=>g.org_id===pre.org_id&&g.site_id===pre.site_id);if(i>=0)scope.value=String(i);}
    const fields=node('div');form.append(fields);let caseId='';
    function populate(){
      fields.replaceChildren();const g=creators[Number(scope.value)],kinds=allowCreate[g.role].filter(k=>key==='inbox'||k===key);
      const kind=field(fields,'업무','kind',kinds.map(k=>[k,name(k)]));
      if(kinds.length===1)kind.parentElement.hidden=true;
      const rest=node('div');fields.append(rest);
      function extras(){
        caseId=crypto.randomUUID();rest.replaceChildren();const k=kind.value;
        const choices=opts.quotes.filter(q=>q.org_id===g.org_id&&q.site_id===g.site_id&&Date.parse(q.expires_at)>Date.now());
        if(k==='delivery'||k==='reprice'){
          const pick=field(rest,'발급 견적','quoteId',choices.filter(q=>k!=='delivery'||!q.deliveryCase).map(q=>[q.id,qTitle(q)]));if(pre)pick.value=pre.id;
          if(!pick.options.length)rest.append(link('먼저 견적 발급','/ia?view=pricing-r3#quote'));
        }
        if(k==='catalog')field(rest,'등록 상품','productId',opts.products.filter(p=>p.supplier_id===g.org_id).map(p=>[p.product_id,p.productName+' · '+p.originName]));
        if(key!=='inbox' && k==='business'){
          for(const [label,n] of [['상호','businessName'],['업태','industry'],['종목','trade']])field(rest,label,n);
          field(rest,'개업일','openingDate',null,'date');
        }
        if(k==='consult'){
          if(choices.length){const pick=field(rest,'상담할 견적·오더패스','targets',choices.map(q=>[q.id,qTitle(q)]),'text',false);pick.multiple=true;if(pre)pick.value=pre.id;}
          field(rest,'상담 항목','subject',[['납품 조건','납품 조건'],['상품 문의','상품 문의'],['견적 문의','견적 문의']]);
          field(rest,'희망 상담일','desiredDate',null,'date');field(rest,'문의 내용','memo',null,'textarea',false);
        }
        if(k==='delivery')field(rest,'희망 납품일','desiredDate',null,'date',false);
      }
      kind.onchange=extras;extras();
    }
    const keyDraft='new:'+key+':'+(pre?.id||''),stored=drafts[keyDraft];
    if(stored&&creators[stored.scope]?.org_id===stored.orgId&&creators[stored.scope]?.site_id===stored.siteId)scope.value=stored.scope;
    scope.onchange=populate;populate();
    if(stored&&String(scope.value)===stored.scope){
      const kind=form.elements.namedItem('kind');
      if([...kind.options].some(o=>o.value===stored.kind)){kind.value=stored.kind;kind.onchange();caseId=stored.caseId;restore(form,stored.fields);}
    }
    const remember=()=>{delete form.dataset.draftSaved;const g=creators[Number(scope.value)];drafts[keyDraft]={fields:values(form),caseId,scope:scope.value,orgId:g.org_id,siteId:g.site_id,kind:form.elements.namedItem('kind').value};const expected=JSON.stringify(drafts[keyDraft]);persistDrafts().then(()=>{if(expected===JSON.stringify(drafts[keyDraft]))form.dataset.draftSaved='1';});};
    form.oninput=remember;form.onchange=remember;
    const entryLabels={business:'사업자 정보 등록',supply:'공급 참여 신청서 작성',catalog:'심사할 상품 저장',consult:'상담 내용 저장',delivery:'납품 신청서 작성',reprice:'재검토 요청서 작성'};
    const submit=node('button',entryLabels[key]||'작성 시작');submit.type='submit';form.append(submit);
    form.onsubmit=e=>{e.preventDefault();const v=new FormData(form),g=creators[Number(scope.value)],data={action:'create',caseId,expectedRevision:0,kind:v.get('kind'),orgId:g.org_id};
      if(g.site_id)data.siteId=g.site_id;
      for(const k of ['quoteId','productId'])if(v.has(k))data[k]=v.get(k);
      const ctx={};for(const k of ['businessName','industry','trade','openingDate','subject','memo','desiredDate'])if(v.get(k))ctx[k]=v.get(k).trim();
      const targets=v.getAll('targets');if(targets.length)ctx.targets=targets;
      if(Object.keys(ctx).length)data.context=ctx;remember();save(data,keyDraft,submit);
    };
  }
  let panelRequest=0,panelView='';
  async function accountPanel(view='home',active=0){
    const box=$('account-panel'),at=epoch,request=++panelRequest;box.hidden=false;
    const state=await asyncMotion.reveal(box,({signal})=>api(endpoint+'/account',null,signal));if(at!==epoch||box.hidden||request!==panelRequest)return;
    const direction=!panelView||view===panelView?0:view==='home'?-1:1;
    const panel=controls.slidePanel(box,()=>{},direction);panelView=view;
    const top=node('header'),heading=node('h2',({home:'내 계정',business:'사업자 정보',people:'구성원과 권한'})[view]);
    const show=(next,scope=active)=>accountPanel(next,scope).catch(error);
    const close=()=>{box.hidden=true;panelView='';$('account-trigger').setAttribute('aria-expanded','false');$('account-trigger').focus();};
    top.append(heading,button('닫기',close));panel.append(top);
    if(view!=='home')panel.append(button('내 계정으로',()=>show('home')));
    const pick=field(panel,'사업장','business-scope',state.sites.map((site,i)=>[String(i),[site.info.businessName||gName(site),name(site.role)].join(' · ')]));
    pick.value=String(active);pick.onchange=()=>show(view,Number(pick.value));const site=state.sites[active];if(!site)return;
    if(view==='home'){
      panel.append(button('사업자 정보',()=>show('business')),button('구성원과 권한',()=>show('people')));
    }else if(view==='business'){
      const dl=node('dl');
      for(const [label,value] of [['상호',site.info.businessName],['업태',site.info.industry],['종목',site.info.trade],['개업일',site.info.openingDate],['확인 상태',({VERIFIED:'확인 완료',PENDING:'확인 대기',REVOKED:'취소됨'})[site.verification]]]){
        dl.append(node('dt',label),node('dd',value||'등록 전'));
      }
      panel.append(dl);
      if(site.role==='BUYER'){
        const form=node('form');
        for(const [label,key] of [['상호','businessName'],['업태','industry'],['종목','trade'],['개업일','openingDate']]){
          field(form,label,key,null,key==='openingDate'?'date':'text').value=site.info[key]||'';
        }
        const submit=node('button','사업자 정보 초안 저장');submit.type='submit';form.append(submit);panel.append(form);
        const id=crypto.randomUUID(),requestKey=crypto.randomUUID();
        form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;
          try{await asyncMotion.run(submit,({signal})=>api(endpoint,{action:'create',caseId:id,requestKey,orgId:site.org_id,siteId:site.site_id,kind:'business',expectedRevision:0,context:Object.fromEntries(new FormData(form))},signal));await accountPanel('business',active);status('사업자 정보 초안을 저장했습니다.');}
          catch(e){error(e);submit.disabled=false;}
        };
      }
    }else{
      const members=node('ul');for(const member of state.members.filter(m=>m.org_id===site.org_id&&(site.role==='OPERATOR'||m.site_id===site.site_id))){
        members.append(node('li',(member.self?'나':member.actor_id)+' · '+name(member.role)+(member.site_id?' · '+member.site_id:'')));
      }
      panel.append(members);
      const form=node('form');field(form,'신청 종류','purpose',[['INVITE','구성원 초대 요청'],['CHANGE','권한 변경 요청']]);
      field(form,'대상 이메일','contact',null,'email');
      const roleOptions=site.role==='OPERATOR'?[['BUYER','매장'],['SUPPLIER','공급처']]:[[site.role,name(site.role)]];
      field(form,'요청 권한','role',roleOptions);
      const submit=node('button','관리자에게 요청');submit.type='submit';form.append(submit);panel.append(form);
      const key=crypto.randomUUID();form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;
        try {await asyncMotion.run(submit,({signal})=>api(endpoint+'/account',{...Object.fromEntries(new FormData(form)),orgId:site.org_id,siteId:site.site_id,requestKey:key},signal));await accountPanel('people',active);status('요청을 저장했습니다. 권한 담당자의 확인이 필요합니다.');}
        catch(e){error(e);submit.disabled=false;}
      };
      const pending=state.requests.filter(r=>r.org_id===site.org_id&&(site.role==='OPERATOR'||r.site_id===site.site_id));
      if(pending.length){panel.append(node('h3','확인 대기'));const list=node('ul');for(const r of pending)list.append(node('li',[r.contact,name(r.requested_role),r.purpose==='INVITE'?'초대 요청':'권한 변경 요청'].join(' · ')));panel.append(list);}
    }
    heading.tabIndex=-1;heading.focus();
  }
  $('account-trigger').onclick=()=>{
    const panel=$('account-panel');
    if(!panel.hidden){panel.hidden=true;panelView='';$('account-trigger').setAttribute('aria-expanded','false');return;}
    $('account-trigger').setAttribute('aria-expanded','true');accountPanel().catch(error);
  };
  $('account-panel').onkeydown=e=>{if(e.key==='Escape')$('account-trigger').click();};
  function publication(){
    const el=$('publication');el.replaceChildren();if(!opts.publication)return;
    const form=node('form'),cb=node('input');cb.type='checkbox';cb.checked=Boolean(opts.publication.enabled);
    const label=node('label','Order 메뉴 공개');label.prepend(cb);form.append(label);
    const submit=node('button','공개 설정 저장');form.append(submit);el.append(form);
    const current=opts.publication.revision,requestKey=crypto.randomUUID();
    form.onsubmit=async e=>{e.preventDefault();try{await asyncMotion.run(submit,({signal})=>api(endpoint+'/publication',{enabled:cb.checked,expectedRevision:current,requestKey},signal));await load();status('공개 설정을 저장했습니다.');}catch(err){error(err);}};
  }
  function render(){
    if(!ready)return;
    renderMenu();$('section-title').textContent=menus[menu()]?.[0]||'내 업무';$('filter-bar').hidden=false;
    $('query').value=query().get('q')||'';
    for(const b of $('filters').querySelectorAll('button'))b.setAttribute('aria-pressed',String((query().get('filter')||'all')===b.dataset.filter));
    list();createForm();publication();
    if(!query().get('case')){dispose();$('detail').replaceChildren();}
  }
  async function load(append=false){
    const start=epoch;
    const [r,w]=await asyncMotion.reveal($('queue-list'),({signal})=>Promise.all([api(endpoint+'?context=1'+(append&&next?'&after='+encodeURIComponent(next):''),null,signal),append?Promise.resolve(opts):api(endpoint+'/workspace',null,signal)]));
    if(start!==epoch)return;
    grants=r.grants;$('account-trigger').hidden=!grants.length;opts=w;cases=append?[...cases,...r.cases]:r.cases;next=r.next;ready=true;render();
  }
  async function save(data,keyDraft,submit){
    if(loading)return;loading=true;
    const prior=pending||drafts.request;
    const request=prior&&JSON.stringify(prior.data)===JSON.stringify(data)?prior:{data,key:crypto.randomUUID()};pending=request;drafts.request=request;
    try{await persistDrafts();const result=await asyncMotion.run(submit,({signal})=>api(endpoint,{...data,requestKey:request.key},signal));pending=null;delete drafts.request;if(keyDraft)delete drafts[keyDraft];await persistDrafts();historyChange({case:result.case.id});await load();await showCase(result.case.id);status('저장했습니다.');return true;}
    catch(e){error(e);if(e.status===409 && data.action!=='create')$('status').append(button('최신 상태와 내 입력 비교',()=>showCase(data.caseId,data)));return false;}
    finally{loading=false;}
  }
  async function showCase(caseId,conflicted){
    const start=epoch;dispose();const detail=$('detail');
    try{
      const r=await asyncMotion.reveal(detail,({signal})=>api(endpoint+'?context=1&id='+encodeURIComponent(caseId),null,signal));if(start!==epoch||query().get('case')!==caseId)return;
      const c=r.case;detail.replaceChildren(node('h2',name(c.kind)+' · '+name(c.state)));
      detail.append(button('목록으로',()=>go({case:null})));
      const dl=node('dl');
      function item(title,value){if(value==null||value==='')return;dl.append(node('dt',title),node('dd',String(value)));}
      item('사업장·소속',r.notes?.find(n=>n.businessName)?.businessName||gName(c));const q=qMap(c.quote_id)||r.issued;
      if(q){item('견적',qTitle(q));item('견적 금액',money(q.total));}
      const ctx=Object.assign({},...(r.notes||[]));
      const replacement=r.targetQuotes?.find(q=>q.id===ctx.replacementQuoteId);if(replacement)item('새 견적',qTitle(replacement));
      for(const [k,l] of Object.entries({industry:'업태',trade:'종목',openingDate:'개업일',subject:'상담 항목',desiredDate:'희망일',memo:'최근 메모'}))item(l,ctx[k]);
      if(ctx.targets?.length){const display=ctx.targets.map(id=>qMap(id)||r.targetQuotes?.find(q=>q.id===id)).filter(Boolean).map(qTitle);item('상담 대상',display.length?display.join(' / '):ctx.targets.length+'건');}
      if(c.kind==='delivery'&&settlement.has(c.state)){item('거래 증빙',c.hasEvidence?'납품 건에 첨부됨':'공급처의 거래 증빙 제출 대기');item('외부 실행','세금 문서 발급·지급 내역 미연결');}
      detail.append(dl);
      const history=node('details');history.append(node('summary','처리 이력'));const events=node('ol');
      for(const e of r.events){const note=r.notes?.find(n=>n.revision===e.revision);events.append(node('li',[e.revision+'. '+name(e.action),name(e.next_state),e.reason_code&&name(e.reason_code),note?.memo,titleDate(e.created_at)].filter(Boolean).join(' · ')));}
      history.append(events);detail.append(history);
      if(c.evidenceId||c.actions.includes('attach')){const holder=node('div');detail.append(holder);dispose=createEvidenceEditor({container:holder,caseId:c.id,kind:c.kind,csrf,evidenceId:c.evidenceId,readOnly:!c.actions.includes('attach'),onError:status,onReceipt:(evidenceId,submit)=>save({caseId:c.id,action:'attach',expectedRevision:c.revision,evidenceId},null,submit)});}
      const actions=c.actions.filter(a=>a!=='attach');
      if(conflicted){
        const retained=node('section');retained.append(node('h3','저장하지 않은 내 입력'),node('p',name(conflicted.action)));
        for(const v of [conflicted.reason&&name(conflicted.reason),conflicted.context?.memo,conflicted.context?.desiredDate])if(v)retained.append(node('p',v));
        const latest=r.notes?.at(-1)?.memo;if(latest)retained.append(node('p','최근 저장된 메모 · '+latest));
        if(!actions.includes(conflicted.action))retained.append(node('p','다른 담당자가 이 단계를 마쳤습니다. 현재 가능한 다음 처리만 선택할 수 있습니다.'));
        detail.append(retained);
      }
      if(!actions.length)return;
      const kindLabels={
        business:{submit:'사업자 확인 요청',manual:'서류로 사업자 확인 요청',verify:'사업자 정보 확인 완료'},
        consult:{submit:'상담 예약 요청',respond:'상담 답변 보내기',followup:'추가 문의 보내기',resolve:'상담 종료'},
        supply:{submit:'공급 참여 심사 요청',approve:'공급 참여 승인'},
        catalog:{submit:'상품 심사 요청',approve:'상품 승인'},
        delivery:{submit:'납품 요청 보내기',accept:'납품 요청 수락',schedule:'납품 일정 등록',dispatch:'출고 기록',receive:'납품 수령 확인',reschedule:'납품 일정 변경'}
      };
      const storageKey='case:'+c.id+':'+c.revision;
      for(const action of actions){
        const title=kindLabels[c.kind]?.[action]||name(action);
        const section=node('details'),summary=node('summary',title),form=node('form');
        section.dataset.caseAction=action;section.append(summary,form);detail.append(section);
        const draftKey=storageKey+':'+action;
        const prior=drafts[draftKey]||(drafts[storageKey]?.action?.[0]===action?drafts[storageKey]:null);
        if(conflicted?.action===action||prior)section.open=true;
        if(['supplement','reject','revoke','report-issue'].includes(action)){
          field(form,'사유','reason',['MISSING_EVIDENCE','SCOPE_MISMATCH','INVALID_DETAILS','DELIVERY_EXCEPTION','REVIEW_DECISION'].map(reason=>[reason,name(reason)]));
        }
        if(action==='link-requote'){
          const choices=opts.quotes.filter(q=>q.id!==c.quote_id&&q.org_id===c.org_id&&q.site_id===c.site_id&&q.issued_at>=c.updated_at&&Date.parse(q.expires_at)>Date.now());
          field(form,'다시 발급한 견적','replacementQuoteId',choices.map(q=>[q.id,qTitle(q)]));
          if(!choices.length)form.append(link('견적 다시 발급','/ia?view=pricing-r3#quote'));
        }
        if(['schedule','reschedule'].includes(action)){
          const date=field(form,'납품 예정일','desiredDate',null,'date');date.value=ctx.desiredDate||'';
        }
        const memoLabel={respond:'답변 내용',followup:'추가 문의 내용',supplement:'보완 요청 사항','report-issue':'납품 이상 내용',dispatch:'출고 메모',receive:'수령 메모'}[action]||'메모';
        const memo=field(form,memoLabel,'memo',null,'textarea',['respond','followup'].includes(action));
        if(prior)restore(form,prior);
        if(conflicted?.action===action){
          if(conflicted.context?.memo)memo.value=conflicted.context.memo;
          form.prepend(node('p','최근 처리 내용과 내 입력을 확인한 뒤 저장해 주세요.'));
        }
        form.oninput=form.onchange=()=>{drafts[draftKey]=values(form);persistDrafts();};
        const saveAction=node('button',title);saveAction.type='submit';form.append(saveAction);
        form.onsubmit=e=>{
          e.preventDefault();
          const values=new FormData(form),data={action,caseId:c.id,expectedRevision:c.revision},context={};
          if(values.get('reason'))data.reason=values.get('reason');
          for(const key of ['memo','desiredDate','replacementQuoteId']){
            const val=values.get(key)?.trim();if(val)context[key]=val;
          }
          if(Object.keys(context).length)data.context=context;
          save(data,draftKey,saveAction);
        };
      }
    }catch(e){if(e.name!=='AbortError'){detail.replaceChildren();error(e);}}
  }
  $('filters').onclick=e=>{if(e.target.dataset.filter)go({filter:e.target.dataset.filter});};
  $('query').oninput=e=>{historyChange({q:e.target.value},true);list();};
  $('more').onclick=()=>load(true).catch(error);
  $('refresh').onclick=()=>boot();
  window.addEventListener('popstate',()=>{render();if(query().get('case'))showCase(query().get('case'));});
  async function boot(){
    clear();asyncMotion=mountAsyncMotion(document);status('업무를 불러오는 중입니다.');
    const start=epoch;
    try{const session=await api(endpoint+'/session');if(start!==epoch)return;csrf=session.csrf;await openDrafts(csrf);if(start!==epoch)return;
      $('r3-practice').hidden=session.practiceAllowed===false;
      $('home').href=session.practiceAllowed?'/ia/':'/ia?view=roles-r3';$('home').textContent=session.practiceAllowed?'IA 포털':'내 업무 홈';
      if(session.expiresAt)expiryTimer=setTimeout(()=>{++changeNumber;sessionStorage.removeItem(draftKey);clear();status('세션이 만료되었습니다. 다시 로그인해 주세요.');},Math.max(0,session.expiresAt*1000-Date.now()));
      await load();if(start!==epoch)return;status('');if(query().get('case'))await showCase(query().get('case'));
    }catch(e){if(start===epoch){const keepPractice=Boolean(csrf)&&!$('r3-practice').hidden;clear();$('r3-practice').hidden=!keepPractice;error(e);}}
  }
  window.addEventListener('pageshow',boot);window.addEventListener('pagehide',clear);
}
