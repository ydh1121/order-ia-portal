export function runRolePage(labels,createEvidenceEditor){
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
  const menu=()=>query().get('menu')||'inbox';
  const qMap=id=>opts.quotes.find(q=>q.id===id);
  const status=s=>{$('status').textContent=s;};
  const error=e=>status(messages[e.message]||(navigator.onLine?'업무를 불러오지 못했습니다. 새로고침해 주세요.':'연결이 끊겼습니다. 연결 후 다시 저장해 주세요.'));
  async function api(path,body){
    const settings={cache:'no-store',credentials:'same-origin'};
    if(body)Object.assign(settings,{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':csrf},body:JSON.stringify(body)});
    const res=await fetch(path,settings);
    const data=await res.json();
    if(!res.ok)throw Object.assign(new Error(data.error),{status:res.status});
    return data;
  }
  function clear(){
    ++epoch;cipher=null;drafts={};clearTimeout(expiryTimer);dispose();dispose=()=>{};ready=false;csrf='';pending=null;grants=[];cases=[];next='';opts={quotes:[],products:[],businesses:[]};
    for(const id of ['role-menu','queue-list','list','detail','create','publication'])$(id).replaceChildren();
    $('create').hidden=true;$('filter-bar').hidden=true;$('more').hidden=true;$('r3-practice').hidden=true;
  }
  function historyChange(changes,replace=false){
    const url=new URL(location.href);
    for(const [k,v] of Object.entries(changes)){if(v)url.searchParams.set(k,v);else url.searchParams.delete(k);}
    if(url.href!==location.href)history[replace?'replaceState':'pushState'](null,'',url);
  }
  function go(changes){historyChange(changes);render();if(query().get('case'))showCase(query().get('case'));}
  const gName=g=>opts.businesses.find(x=>x.org_id===g.org_id&&x.site_id===g.site_id)?.businessName||g.site_id||g.org_id;
  function renderMenu(){
    const area=$('role-menu');area.replaceChildren();
    for(const [key,[title]] of Object.entries(menus)){
      if(!allowed(key))continue;
      const a=link(title,'/ia?view=roles-r3&menu='+key);
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
    const key=menu(),out=$('list'),related=$('queue-list');out.replaceChildren();related.replaceChildren();
    if(!allowed(key)){out.append(node('li','이 메뉴에 연결된 권한이 없습니다.'));return;}
    const term=(query().get('q')||'').trim().toLocaleLowerCase(),filter=query().get('filter')||'all';
    const contains=x=>String(x||'').toLocaleLowerCase().includes(term);
    if(key==='quotes'){
      for(const q of opts.quotes){
        if(![qTitle(q),q.supplierName,gName(q),name(q.deliveryState)].some(contains))continue;
        const li=node('li');li.append(node('strong',qTitle(q)),node('small',[gName(q),q.supplierName,money(q.total),q.deliveryState?name(q.deliveryState):null].filter(Boolean).join(' · ')));
        if(q.deliveryCase)li.append(button('납품 내역',()=>go({menu:'delivery',case:q.deliveryCase})));
        if(Date.parse(q.expires_at)>Date.now()){
          for(const [cmd,label] of [['consult','상담 예약'],['reprice','가격 재검토'],['delivery','납품 요청']]){
            if(cmd==='delivery'&&q.deliveryCase)continue;li.append(button(label,()=>go({menu:cmd,quote:q.id,case:null})));
          }
        }else li.append(node('small','견적 기한 만료'));
        related.append(li);
      }
      if(!related.childElementCount)related.append(node('li','이 사업장에서 확인할 수 있는 발급 견적이 없습니다.'));
      related.append(link('간편 견적','/ia?view=simple-r3'),link('상세 견적','/ia?view=detailed-r3'),link('내 사업장 견적 발급','/ia?view=pricing-r3#quote'));
    }else if(key==='activity'){
      for(const e of opts.activity||[]){
        if(![gName(e),name(e.kind),name(e.action),name(e.next_state),titleDate(e.created_at)].some(contains))continue;
        const c=cases.find(row=>row.id===e.case_id);
        if((filter==='todo'&&!c?.actions.length)||(filter==='done'&&!complete.has(e.next_state)))continue;
        const li=node('li');
        li.append(button(name(e.kind)+' · '+name(e.action),()=>go({case:e.case_id})),node('small',[name(e.next_state),gName(e),titleDate(e.created_at)].filter(Boolean).join(' · ')));
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
    const submit=node('button','작성 시작');submit.type='submit';form.append(submit);
    form.onsubmit=e=>{e.preventDefault();const v=new FormData(form),g=creators[Number(scope.value)],data={action:'create',caseId,expectedRevision:0,kind:v.get('kind'),orgId:g.org_id};
      if(g.site_id)data.siteId=g.site_id;
      for(const k of ['quoteId','productId'])if(v.has(k))data[k]=v.get(k);
      const ctx={};for(const k of ['businessName','industry','trade','openingDate','subject','memo','desiredDate'])if(v.get(k))ctx[k]=v.get(k).trim();
      const targets=v.getAll('targets');if(targets.length)ctx.targets=targets;
      if(Object.keys(ctx).length)data.context=ctx;remember();save(data,keyDraft);
    };
  }
  function publication(){
    const el=$('publication');el.replaceChildren();if(!opts.publication)return;
    const form=node('form'),cb=node('input');cb.type='checkbox';cb.checked=Boolean(opts.publication.enabled);
    const label=node('label','Order 메뉴 공개');label.prepend(cb);form.append(label);
    form.append(node('button','공개 설정 저장'));el.append(form);
    const current=opts.publication.revision,requestKey=crypto.randomUUID();
    form.onsubmit=async e=>{e.preventDefault();try{await api(endpoint+'/publication',{enabled:cb.checked,expectedRevision:current,requestKey});await load();status('공개 설정을 저장했습니다.');}catch(err){error(err);}};
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
    const [r,w]=await Promise.all([api(endpoint+'?context=1'+(append&&next?'&after='+encodeURIComponent(next):'')),append?Promise.resolve(opts):api(endpoint+'/workspace')]);
    if(start!==epoch)return;
    grants=r.grants;opts=w;cases=append?[...cases,...r.cases]:r.cases;next=r.next;ready=true;render();
  }
  async function save(data,keyDraft){
    if(loading)return;loading=true;
    const prior=pending||drafts.request;
    const request=prior&&JSON.stringify(prior.data)===JSON.stringify(data)?prior:{data,key:crypto.randomUUID()};pending=request;drafts.request=request;
    try{await persistDrafts();const result=await api(endpoint,{...data,requestKey:request.key});pending=null;delete drafts.request;if(keyDraft)delete drafts[keyDraft];await persistDrafts();historyChange({case:result.case.id});await load();await showCase(result.case.id);status('저장했습니다.');}
    catch(e){error(e);if(e.status===409 && data.action!=='create')$('status').append(button('최신 상태와 내 입력 비교',()=>showCase(data.caseId,data)));}
    finally{loading=false;}
  }
  async function showCase(caseId,conflicted){
    const start=epoch;dispose();const detail=$('detail');
    try{
      const r=await api(endpoint+'?context=1&id='+encodeURIComponent(caseId));if(start!==epoch||query().get('case')!==caseId)return;
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
      if(c.evidenceId||c.actions.includes('attach')){const holder=node('div');detail.append(holder);dispose=createEvidenceEditor({container:holder,caseId:c.id,kind:c.kind,csrf,evidenceId:c.evidenceId,readOnly:!c.actions.includes('attach'),onError:status,onReceipt:evidenceId=>save({caseId:c.id,action:'attach',expectedRevision:c.revision,evidenceId})});}
      const actions=c.actions.filter(a=>a!=='attach');
      if(!actions.length)return;
      const form=node('form'),act=field(form,'다음 처리','action',actions.map(a=>[a,name(a)])),extras=node('div');form.append(extras);
      const keyDraft='case:'+c.id+':'+c.revision,stored=drafts[keyDraft];
      const preferred=conflicted?.action||stored?.action?.[0];if(actions.includes(preferred))act.value=preferred;
      function inputs(){
        extras.replaceChildren();if(['supplement','reject','revoke','report-issue'].includes(act.value))field(extras,'사유','reason',['MISSING_EVIDENCE','SCOPE_MISMATCH','INVALID_DETAILS','DELIVERY_EXCEPTION','REVIEW_DECISION'].map(r=>[r,name(r)]));
        if(act.value==='link-requote'){const choices=opts.quotes.filter(q=>q.id!==c.quote_id&&q.org_id===c.org_id&&q.site_id===c.site_id&&q.issued_at>=c.updated_at&&Date.parse(q.expires_at)>Date.now());field(extras,'다시 발급한 견적','replacementQuoteId',choices.map(q=>[q.id,qTitle(q)]));if(!choices.length)extras.append(link('견적 다시 발급','/ia?view=pricing-r3#quote'));}
        const memo=field(extras,'처리 메모','memo',null,'textarea',false);if(conflicted?.context?.memo)memo.value=conflicted.context.memo;
        if(conflicted){extras.prepend(node('p','현재 상태와 보관한 입력을 확인한 뒤 다시 처리해 주세요.'));}
      }
      act.onchange=inputs;inputs();if(stored&&!conflicted)restore(form,stored);
      form.oninput=form.onchange=()=>{drafts[keyDraft]=values(form);persistDrafts();};form.append(node('button','선택한 처리 확인'));form.onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form)),memo=data.memo.trim();delete data.memo;const replacementQuoteId=data.replacementQuoteId;delete data.replacementQuoteId;if(memo||replacementQuoteId)data.context={...(memo?{memo}:{}),...(replacementQuoteId?{replacementQuoteId}:{})};save({...data,caseId:c.id,expectedRevision:c.revision},keyDraft);};detail.append(form);
    }catch(e){detail.replaceChildren();error(e);}
  }
  $('filters').onclick=e=>{if(e.target.dataset.filter)go({filter:e.target.dataset.filter});};
  $('query').oninput=e=>{historyChange({q:e.target.value},true);list();};
  $('more').onclick=()=>load(true).catch(error);
  $('refresh').onclick=()=>boot();
  window.addEventListener('popstate',()=>{render();if(query().get('case'))showCase(query().get('case'));});
  async function boot(){
    clear();status('업무를 불러오는 중입니다.');
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
