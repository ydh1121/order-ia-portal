import {buyerResultCss,createBuyerResult,projectBuyerResult} from './r3-quote-result.mjs';
import {bloubScript,bloubMontages} from './r3-bloub.mjs';
import {createQuoteWait} from './r3-quote-wait.mjs';

function priceDesk(createWait,montages,makeResult,project) {
  const $=id=>document.getElementById(id);
  const state={csrf:'',scope:[],current:null,pending:null,operation:false,practice:new URLSearchParams(location.search).get('practice')==='1'};
  const number=v=>v===''?null:Number(v);
  const field=(group,key,label,value='',type='text',options=null)=>{
    const l=document.createElement('label'),e=document.createElement(options?'select':'input');l.append(document.createTextNode(label));
    if(options)for(const [v,title] of options)e.append(new Option(title,v));else e.type=type;
    e.dataset.field=key;e.value=value??'';l.append(e);group.append(l);return e;
  };
  const opts=(...v)=>[['','선택'],...v];
  const f=(id,key,label,options=null)=>field($(id),key,label,'','text',options);
  const read=group=>Object.fromEntries([...group.querySelectorAll(':scope > label [data-field]')].map(e=>[e.dataset.field,e.value]));
  const fill=(group,values)=>{for(const e of group.querySelectorAll(':scope > label [data-field]'))e.value=values[e.dataset.field]??'';};
  const row=(target,create)=>{
    const r=document.createElement('fieldset');create(r);const del=document.createElement('button');del.type='button';del.textContent='행 삭제';del.onclick=()=>r.remove();r.append(del);$(target).append(r);
  };
  const addTier=(v={})=>row('tiers',r=>{
    field(r,'min','시작 수량',v.min,'number');field(r,'max','끝 수량 (빈칸은 상한 없음)',v.max,'number');
    field(r,'price','단가 (원)',v.price);field(r,'packMode','포장 값',v.packMode,'text',opts(['FINAL','포장 포함 단가'],['ADD','별도 포장비 가산']));field(r,'packFee','포장 가산액 (원)',v.packFee);
  });
  const addRegion=(v={})=>row('regions',r=>{
    for(const [k,title] of Object.entries({id:'규칙 ID',prefix:'행정구역 코드 (2·5·10자리)',label:'지역명',zip:'우편번호 예외',priority:'우선순위',minimumQty:'최소 납품 수량',weekdays:'요일 (일 0, 월 1 … 토 6)',cutoff:'당일 마감 (HH:MM)'}))field(r,k,title,Array.isArray(v[k])?v[k].join(','):v[k]);
    field(r,'status','배송 조건',v.status,'text',opts(['FEE','유료'],['FREE','무료'],['UNSET','미설정'],['CONSULT','협의'],['UNAVAILABLE','배송 불가']));
    for(const [k,title] of Object.entries({fee:'기본 배송비 (원)',freeQty:'무료 수량 기준',freeAmount:'무료 금액 기준 (원)',surcharge:'지역 추가 요금 (원)'}))field(r,k,title,v[k]);
  });
  const say=t=>{$('notice').textContent=t;};
  async function api(path,body,signal){
    const res=await fetch('/api/ia/r3-price'+(state.practice?'/practice/'+$('persona').value:'')+path,{signal,method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-IA-CSRF':state.csrf}:{},body:body?JSON.stringify(body):undefined});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'SERVICE_UNAVAILABLE');return data;
  }
  const localized={GRANT_REQUIRED:'이 공급 조건을 변경할 권한이 없습니다.',ACCESS_REQUIRED:'대상 공급처 또는 사업장의 권한을 확인해 주세요.',CONFLICT:'같은 버전이 변경되었거나 승인 기간이 겹칩니다. 입력을 복사한 뒤 버전을 다시 열어 주세요.',REVISION_CONFLICT:'다른 변경이 먼저 저장되었습니다. 현재 입력을 보관한 뒤 버전을 다시 열어 주세요.',IDEMPOTENCY_CONFLICT:'다른 내용으로 이미 처리된 요청입니다.',SERVICE_UNAVAILABLE:'저장소에 연결할 수 없습니다. 입력을 유지했습니다.',PERFORMANCE_UNCONFIRMED:'확정된 전월 실적이 필요합니다.',SEVEN_DAY_GUARANTEE_UNRESOLVED:'공급 조건이 견적 유효기간 전에 끝납니다.',REGION_PRIORITY_CONFLICT:'겹치는 지역 규칙의 우선순위를 구분해 주세요.',TIER_COVERAGE_INVALID:'수량 1부터 구간을 빈틈없이 이어 주세요.'};
  const run=fn=>async()=>{if(state.operation)return;state.operation=true;try{await fn();}catch(e){say(localized[e.message]||'입력값과 처리 조건을 확인해 주세요. '+e.message);}finally{state.operation=false;}};
  const iso=v=>v?new Date(v).toISOString():null;
  function collect(){
    const product=read($('product')),pr=read($('basis')),cost=read($('cost')),dest=read($('delivery')),scope=state.scope[Number($('scope').value)];
    if(!scope)throw new Error('ACCESS_REQUIRED');
    const tiers=[...$('tiers').children].map(r=>{const v=read(r);return {min:number(v.min),max:number(v.max),price:v.price,packMode:v.packMode,packFee:v.packFee||null};});
    const regions=[...$('regions').children].map(r=>{const v=read(r);return {...v,weekdays:v.weekdays.trim()?v.weekdays.split(',').map(n=>Number(n.trim())):[],minimumQty:number(v.minimumQty),priority:number(v.priority),fee:v.status==='FREE'?'0':v.fee||null,freeQty:number(v.freeQty),freeAmount:v.freeAmount||null,surcharge:v.surcharge||null,zip:v.zip||null,cutoff:v.cutoff||null};});
    return {...product,supplierId:scope.supplier_id,originId:scope.origin_id,productId:scope.product_id,packSize:number(product.packSize),minimumOrder:number(product.minimumOrder),effectiveFrom:iso(product.effectiveFrom),effectiveTo:iso(product.effectiveTo),currency:'KRW',timeZone:'Asia/Seoul',performance:{...pr,defaultQty:number(pr.defaultQty)},rounding:cost.rounding,tax:{ruleId:cost.taxId,type:cost.taxType,percent:cost.percent||null},discount:{ruleId:cost.discountId,type:cost.discountType},tiers,delivery:{...dest,regions}};
  }
  function paint(v){
    state.current=v;state.pending=null;const p=v?.policy||{};
    if(v){const idx=state.scope.findIndex(s=>s.supplier_id===p.supplierId&&s.origin_id===p.originId&&s.product_id===p.productId);if(idx>=0)$('scope').value=String(idx);}
    fill($('product'),p);fill($('basis'),p.performance||{});fill($('cost'),{rounding:p.rounding,taxId:p.tax?.ruleId,taxType:p.tax?.type,percent:p.tax?.percent,discountType:p.discount?.type,discountId:p.discount?.ruleId});fill($('delivery'),p.delivery||{});
    $('tiers').replaceChildren();$('regions').replaceChildren();for(const r of p.tiers||[{}])addTier(r);for(const r of p.delivery?.regions||[{}])addRegion(r);
    $('current').textContent=v?v.id+' · '+v.status+' · r'+v.revision:'새 정책 버전';
  }
  async function desk(){
    const d=await api('/desk');state.scope=d.scopes;
    $('scope').replaceChildren(...d.scopes.map((r,i)=>new Option([r.supplier_id,r.origin_id,r.product_id,r.role].join(' · '),String(i))));
    $('versions').replaceChildren(new Option('저장된 버전 선택',''),...d.versions.map(v=>new Option(v.id+' · '+v.status+' · r'+v.revision,v.id)));
    if(!d.scopes.length)say('배정된 공급처·상품이 없습니다.');
  }
  async function open(id){
    const data=await api('/version?id='+encodeURIComponent(id));paint(data.version);$('versions').value=id;
    $('history').replaceChildren(...data.history.map(e=>{const li=document.createElement('li');li.textContent=[e.event_at,'r'+e.revision,e.action,e.reason].filter(Boolean).join(' · ');return li;}));
  }
  async function save(action){
    if(!state.csrf)throw new Error('ACCESS_REQUIRED');
    const v=state.current;
    if(action!=='create'&&!v)throw new Error('VERSION_REQUIRED');
    const body={id:v?.id||state.newId,action,expectedRevision:v?.revision||0,...(['create','edit'].includes(action)?{policy:collect(),predecessor:state.predecessor??null}:{}),reason:$('reason').value||null};
    const signature=JSON.stringify(body);
    if(state.pending?.signature!==signature)state.pending={signature,key:crypto.randomUUID()};
    const out=await api('/version',{...body,requestKey:state.pending.key});
    await desk();await open(out.id);say('저장했습니다. '+out.status+' · r'+out.revision);
  }
  for(const [k,t] of Object.entries({policyId:'정책 ID',groupId:'상품군 ID',packaging:'포장 종류',unit:'주문 단위',packSize:'포장당 구수',minimumOrder:'최소 주문 수량',effectiveFrom:'시작 시각 (시간대 포함)',effectiveTo:'종료 시각 (선택)'}))f('product',k,t);
  f('basis','basis','수량 구간 기준',opts(['DELIVERY','이번 납품량'],['PREVIOUS_MONTH','전월 확정 실적']));
  f('basis','fallback','신규·실적 0 처리',opts(['DELIVERY','이번 납품량'],['DEFAULT_TIER','지정 기준 수량'],['CONSULT','협의']));f('basis','defaultQty','지정 기준 수량');
  f('basis','scope','실적 범위',opts(['BUSINESS','사업자'],['SITE','사업장'],['SUPPLIER','사업자·공급처'],['SKU','사업자·공급처·SKU'],['BUNDLE','사업자·공급처·묶음']));
  f('basis','event','실적 인정 사건',opts(['ORDER_CONFIRMED','주문 확정'],['DELIVERED','납품 완료']));
  for(const [k,t] of Object.entries({bundleId:'묶음 ID',adjustmentRuleId:'취소·반품 반영 규칙 ID',aggregationVersion:'실적 산정 버전'}))f('basis',k,t);
  f('cost','taxType','세금',opts(['INCLUDED','포함'],['EXTRA_PERCENT','별도 비율']));f('cost','percent','별도 세율 (%)');f('cost','taxId','세금 규칙 ID');
  f('cost','discountType','할인',opts(['NONE','할인 없음']));f('cost','discountId','할인 규칙 ID');
  f('cost','rounding','총금액 원 단위 처리',opts(['HALF_UP','사사오입'],['HALF_EVEN','짝수 반올림'],['DOWN','버림'],['CEIL','올림'],['FLOOR','내림']));
  f('delivery','ruleSetId','배송 규칙 ID');f('delivery','regionVersion','지역 코드 버전');
  f('delivery','groupBasis','기본 요금 기준',opts(['SHIPMENT','출고·회차'],['SITE','날짜·사업장'],['PACK','포장 수량']));
  $('addTier').onclick=()=>addTier();$('addRegion').onclick=()=>addRegion();
  $('open').onclick=run(()=>open($('versions').value));
  $('new').onclick=()=>{state.newId=crypto.randomUUID();state.predecessor=null;paint(null);$('history').replaceChildren();};
  $('next').onclick=()=>{if(!state.current)return;const old=state.current;state.predecessor=old.id;state.newId=crypto.randomUUID();state.current=null;state.pending=null;$('current').textContent='후속 버전 · '+old.id;};
  for(const b of document.querySelectorAll('[data-action]'))b.onclick=run(()=>save(b.dataset.action==='save'?state.current?'edit':'create':b.dataset.action));
  $('simulate').onclick=run(async()=>{
    const v=state.current;if(!v)throw new Error('VERSION_REQUIRED');
    const p=v.policy,x=read($('scenario')),asOf=iso(x.asOf)||new Date().toISOString();
    const period=new Date(Date.parse(asOf)+9*3600000);period.setUTCDate(1);period.setUTCMonth(period.getUTCMonth()-1);
    const line={id:'item',shipmentId:'shipment',siteId:'site',versionId:v.id,productId:p.productId,unit:p.unit,serviceDate:x.serviceDate,deliveryQty:number(x.quantity),region:x.region,regionVersion:p.delivery.regionVersion,zip:x.zip||null};
    const result=await api('/simulate',{asOf,lines:[line],performanceByLine:{item:{status:x.performanceStatus,period:period.toISOString().slice(0,7),quantity:number(x.previous),finalizedAt:asOf}}});
    const s=result.issuer;const format=v=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:4}).format(v);
    $('result').textContent='구간 기준 '+s.selected[0].tierBasisQty+p.unit+' · 상품 '+format(s.merchandise)+'원 · 배송 '+format(s.shipping)+'원 · 세금 '+format(s.tax)+'원 · 합계 '+format(result.customer.quotes[0].total.decimal)+'원';say('예시 조건으로 계산했습니다.');
  });
  for(const [k,t] of Object.entries({asOf:'조회 시각 (선택)',serviceDate:'납품일 (YYYY-MM-DD)',quantity:'이번 납품량',region:'배송지 행정구역 코드',zip:'우편번호',previous:'전월 인정 수량'}))f('scenario',k,t);
  f('scenario','performanceStatus','실적 상태',opts(['FINAL','확정'],['PENDING','집계 중'],['UNAVAILABLE','조회 실패']));
  const buyerState={sites:[],offers:[],retry:null};
  let waitPlayer=null,motionGeneration=0,previousPhase='',inputRevision=1,offerScope=0;
  const quoteWait=createWait({paint(phase,banners){
    const host=$('quotePending'),slot=$('quoteAvatar');
    host.hidden=phase==='idle'||phase==='complete';
    host.dataset.phase=phase;
    $('quoteBanners').replaceChildren(...banners.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('quoteWaitTitle').textContent=phase==='error'?'견적을 불러오지 못했습니다.':'납품가를 확인하고 있어요';
    if(phase===previousPhase)return;
    previousPhase=phase;const gen=++motionGeneration;waitPlayer?.destroy();waitPlayer=null;slot.replaceChildren();
    if(!montages[phase])return;
    const mount=document.createElement('div');slot.append(mount);
    window.BloubR4.mountBloub(mount,montages[phase],{autoplay:false,ariaLabel:'계란 애니메이션'}).then(player=>{
      if(gen!==motionGeneration){player.destroy();return;}
      waitPlayer=player;
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)player.seek(phase==='entry'?3.5:0);
      else player.play();
    }).catch(()=>{if(gen===motionGeneration)slot.replaceChildren();});
  }});
  const resultView=makeResult($('buyerResult'),project,id=>api('/quote?id='+encodeURIComponent(id)),()=>$('quoteQty').focus());
  function invalidateQuote(){
    inputRevision++;quoteWait.stop();buyerState.retry=null;resultView.clear();
  }
  for(const id of ['offerSelect','quoteQty','quoteDay','quoteHistory'])$(id).addEventListener('input',invalidateQuote);
  window.addEventListener('offline',()=>{
    if (!['entry','comparing'].includes(previousPhase)) return;
    quoteWait.stop('error');
    // Keep the request key, as the server may have issued the quote before disconnect.
  });
  function clearQuote(){
    offerScope++;invalidateQuote();
    $('offerSelect').replaceChildren();$('quoteHistory').replaceChildren();resultView.clear();buyerState.offers=[];buyerState.retry=null;
  }
  async function showOffers(){
    clearQuote();
    const site=buyerState.sites[Number($('buyerSite').value)];if(!site || site.verification!=='VERIFIED'){resultView.gate();return;}
    const scope=offerScope;const d=await api('/offers?org='+encodeURIComponent(site.org_id)+'&site='+encodeURIComponent(site.site_id));if(scope!==offerScope)return;buyerState.offers=d.offers;if(!d.offers.length&&!d.quotes.length)resultView.empty();
    $('offerSelect').replaceChildren(...d.offers.map((o,i)=>new Option([o.product_id,o.packaging,o.unit].join(' · '),String(i))));
    $('quoteHistory').replaceChildren(...d.quotes.map(q=>new Option(q.id,q.id)));
  }
  async function buyerSites(){
    const d=await api('/sites');buyerState.sites=d.sites;if(!d.sites.some(site=>site.verification==='VERIFIED'))resultView.gate();
    $('buyerSite').replaceChildren(new Option('사업장 선택',''),...d.sites.map((site,i)=>new Option(site.org_id+' · '+site.site_id+(site.verification==='VERIFIED'?'':' · 인증 필요'),String(i))));
  }
  $('buyerSite').onchange=async()=>{
    if($('buyerSite').value===''){clearQuote();return;}
    try{await showOffers();}catch(error){say(localized[error.message]||'승인 상품을 불러오지 못했습니다.');}
  };
  $('quoteIssue').onclick=run(async()=>{
    resultView.clear();
    const site=buyerState.sites[Number($('buyerSite').value)],offer=buyerState.offers[Number($('offerSelect').value)];
    if($('buyerSite').value===''||!site||!offer||site.verification!=='VERIFIED')throw new Error('ACCESS_REQUIRED');
    const body={orgId:site.org_id,siteId:site.site_id,inputRevision,lines:[{id:'line',shipmentId:'first',productId:offer.product_id,versionId:offer.id,unit:offer.unit,serviceDate:$('quoteDay').value,deliveryQty:number($('quoteQty').value)}]};
    const signature=JSON.stringify(body);if(buyerState.retry?.signature!==signature)buyerState.retry={signature,key:crypto.randomUUID()};
    const result=await quoteWait.request(signal=>api('/quote',{...body,requestKey:buyerState.retry.key},signal),[offer.product_id,String(body.lines[0].deliveryQty)+' '+offer.unit,body.lines[0].serviceDate]);
    if(!result)return;resultView.show(result);$('quoteHistory').add(new Option(result.id,result.id));$('quoteHistory').value=result.id;
  });
  $('quoteRecall').onclick=run(async()=>{resultView.clear();const result=await quoteWait.request(signal=>api('/quote?id='+encodeURIComponent($('quoteHistory').value),undefined,signal),[]);if(result)resultView.show(result);});
  // Re-entering a restored page requires a fresh server grant before redisplay.
  window.addEventListener('pagehide',clearQuote);
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearQuote();$('buyerSite').value='';}});
  $('practice').hidden=!state.practice;
  $('switchPractice').href=state.practice?'/ia?view=pricing-r3':'/ia?view=pricing-r3&practice=1';
  $('switchPractice').textContent=state.practice?'업무 화면으로':'합성 역할 체험';
  $('startPractice').onclick=run(async()=>{await api('/start',{});await desk();await buyerSites();say('연습 공간을 열었습니다. 지역 버전 review-region-v1, 배송지 코드 1100000000을 사용할 수 있습니다.');});
  $('practiceSample').onclick=()=>{
    if(!state.practice || !state.scope.length || state.current)return;
    const day=new Date(),start=new Date(day.valueOf()-86400000),delivery=new Date(day.valueOf()+86400000);
    fill($('product'),{policyId:'practice',groupId:'egg',packaging:'practice-carton',unit:'pack',packSize:12,minimumOrder:10,effectiveFrom:start.toISOString()});
    fill($('basis'),{basis:'DELIVERY'});fill($('cost'),{taxType:'INCLUDED',taxId:'example-included',discountType:'NONE',discountId:'example-none',rounding:'HALF_UP'});
    fill($('delivery'),{ruleSetId:'practice-fee',regionVersion:'review-region-v1',groupBasis:'SHIPMENT'});
    $('tiers').replaceChildren();addTier({min:1,max:10,price:'25',packMode:'FINAL'});addTier({min:11,max:null,price:'20',packMode:'FINAL'});
    $('regions').replaceChildren();addRegion({id:'sample',prefix:'11',label:'연습 지역',priority:1,minimumQty:10,weekdays:[0,1,2,3,4,5,6],status:'FEE',fee:'5'});
    fill($('scenario'),{serviceDate:delivery.toISOString().slice(0,10),quantity:10,region:'1100000000'});say('합성 예시를 입력했습니다. 초안을 저장하면 연습 공간에 반영됩니다.');
  };
  $('persona').onchange=run(async()=>{state.newId=crypto.randomUUID();state.predecessor=null;paint(null);clearQuote();$('history').replaceChildren();$('result').textContent='';await desk();await buyerSites();});
  state.newId=crypto.randomUUID();paint(null);
  run(async()=>{const me=await fetch('/api/ia/auth/me',{cache:'no-store'});if(me.ok)state.csrf=(await me.json()).csrf;await desk();await buyerSites();})();
}
export function renderR3PricePage(nonce) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>가격·배송 조건 | Order</title>
<style>*{box-sizing:border-box}body{margin:0 auto;padding:1rem;max-width:72rem;font:1rem/1.5 system-ui,sans-serif;color:#17202b}a{color:inherit}h1{font-size:1.75rem}section,details{padding:1rem 0;border-top:1px solid #ccd2da}[hidden]{display:none!important}fieldset,.fields,.bar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end}fieldset{margin:.5rem 0;border:1px solid #ccd2da;padding:.75rem;min-width:0}label{display:grid;gap:.25rem;flex:1 1 10rem;min-width:0}input,select,button{font:inherit;min-height:44px;border:1px solid #a7b0bc;border-radius:.4rem;background:white;padding:.4rem .6rem;color:inherit}input,select{width:100%;max-width:100%;min-width:0}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid currentColor;outline-offset:2px}output{display:block;margin:.75rem 0;font-weight:600}summary{cursor:pointer;min-height:44px}li{overflow-wrap:anywhere}#quoteAvatar{width:8rem;height:8rem}#quoteAvatar>div{width:100%;height:100%}#quotePending[data-phase=error] #quoteAvatar{display:none}#quotePending[data-phase=error]{color:#a52b29}#quoteBanners{list-style:none;padding:0;display:grid;isolation:isolate}#quoteBanners li{grid-area:1/1;width:fit-content;max-width:100%;padding:.3rem .7rem;border:1px solid currentColor;border-radius:1rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:white}#quoteBanners li:nth-child(2){margin:.55rem 0 0 .65rem}#quoteBanners li:nth-child(3){margin:1.1rem 0 0 1.3rem}@media(prefers-reduced-motion:no-preference){#quotePending[data-phase=error]{animation:quote-notice .3s ease-out}@keyframes quote-notice{25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}}${buyerResultCss}</style></head><body>
<a href="/ia?view=qa-lab">QA랩으로</a><h1>가격·배송 조건</h1><p><a id="switchPractice" href="/ia?view=pricing-r3&amp;practice=1">합성 역할 체험</a></p><fieldset id="practice" hidden><legend>비공개 합성 QA · 실제 사업장과 분리된 연습 데이터</legend><label>검토 역할<select id="persona"><option value="supplier">공급처 작성자</option><option value="operator">운영 검토자</option><option value="buyer">인증 사업장 예시</option></select></label><button id="startPractice">내 연습 공간 열기</button><button id="practiceSample">합성 예시 불러오기</button></fieldset><div class="bar"><label>정책 버전<select id="versions"></select></label><button id="open">열기</button><button id="new">새 정책</button><button id="next">후속 버전</button></div><p id="current"></p><output aria-live="polite" id="notice"></output>
<section><h2>상품과 유효기간</h2><label>공급처 · 거점 · 상품<select id="scope"></select></label><div class="fields" id="product"></div></section>
<section><h2>수량별 가격</h2><div class="fields" id="basis"></div><div id="tiers"></div><button id="addTier">구간 추가</button></section>
<details><summary>세금과 반올림</summary><div class="fields" id="cost"></div></details>
<section><h2>지역 배송 조건</h2><div class="fields" id="delivery"></div><div id="regions"></div><button id="addRegion">지역 추가</button></section>
<section><h2>저장·검토</h2><label>보완·철회 사유<input id="reason" maxlength="240"></label><div class="bar"><button data-action="save">초안 저장</button><button data-action="submit">검토 요청</button><button data-action="return">보완 요청</button><button data-action="approve">승인</button><button data-action="withdraw">철회</button></div></section>
<section><h2>미리 계산</h2><div class="fields" id="scenario"></div><button id="simulate">저장된 조건으로 계산</button><output id="result" aria-live="polite"></output></section><section id="quote"><h2>사업장 견적</h2><div class="fields"><label>사업장<select id="buyerSite"></select></label><label>승인 상품<select id="offerSelect"></select></label><label>이번 납품 수량<input inputmode="numeric" id="quoteQty"></label><label>납품일<input type="date" id="quoteDay"></label></div><button id="quoteIssue">견적 발급</button><div class="bar"><label>발급한 견적<select id="quoteHistory"></select></label><button id="quoteRecall">다시 보기</button></div><div id="quotePending" role="status" hidden><strong id="quoteWaitTitle"></strong><div id="quoteAvatar" aria-hidden="true"></div><ul id="quoteBanners"></ul></div><div aria-live="polite" id="buyerResult"></div></section><details><summary>변경 이력</summary><ol id="history"></ol></details>
<script nonce="${nonce}">${bloubScript}
;(${priceDesk.toString()})(${createQuoteWait.toString()},${JSON.stringify(bloubMontages)},${createBuyerResult.toString()},${projectBuyerResult.toString()});</script></body></html>`;
}
