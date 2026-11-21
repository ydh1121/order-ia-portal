// R1 review data only. The product renderer is shared; these records never leave
// the review frame and are neither commercial records nor server acknowledgements.
export const qaFixtureContract={
 format:'order-qa-fixture/v1',mode:'qa-fixture',sourceId:'r1-mvp-memory-v1',persistent:false,
 scenarios:['normal','loading','error','empty'],personas:['buyer','supplier','operator','guest'],
 options:['authenticated','persona','scenario','selectedPurchaseId','purchaseStatus','arrival','requests','data'],
 requestRuleKey:'<product|role> <GET|POST> <path>',
 dataKeys:['account','notifications','businesses','offers','purchases','revenue','emailTemplates','dashboard','dashboardLayout','policies','receipts','billing','cases','businessVerifications'],
 unsupported:'QA_FIXTURE_UNSUPPORTED',externalPayment:'PAYMENT_PROVIDER_UNAVAILABLE'
};

// Self-contained so the authenticated artifact renderer can serialize this
// function with the exact canonical installProductAdapter implementation.
export function installQaFixtureAdapter(session={},installProductAdapter){
 if(typeof installProductAdapter!=='function')throw Error('QA_PRODUCT_ADAPTER_REQUIRED');
 window.ORDER_APP_ADAPTER?.fixture?.dispose?.();
 const copy=value=>JSON.parse(JSON.stringify(value));
 const source={format:'order-qa-fixture/v1',id:'r1-mvp-memory-v1',kind:'dummy',persistent:false,storage:'frame-memory',commercial:false};
 const initial=session.fixture||{};
 const inferred=()=>{const screen=session.screen||'',state=session.state||'',guest=['login','signup','otp','password','terms'].includes(screen)&&!(screen==='login'&&state==='success'||screen==='otp'&&state==='verified')||screen==='onboarding'&&!state.startsWith('member-')||screen==='account-settings'&&state==='closed';return {authenticated:!guest,persona:guest?'guest':screen.startsWith('supplier-')?'supplier':screen.startsWith('admin-')||screen==='member-email-templates'||screen==='receipt'?'operator':'buyer'};};
 const identity=inferred(),controls={persona:initial.persona||identity.persona,authenticated:initial.authenticated??(initial.persona?initial.persona!=='guest':identity.authenticated),scenario:initial.scenario||'normal',requests:copy(initial.requests||{})};
 const controller=new AbortController(),pending=new Set(),memory=new Map(),replays=new Map(),quotes=new Map(),evidencePackets=new Map(),calls=[],operations=[];
 let disposed=false,sequence=0,adapter,brandContext,arrivalPending=Boolean(initial.arrival),selectionKey=[session.screen,session.state].join('/');
 const now='2026-11-20T00:00:00.000Z';
 const offer={id:'qa-offer-30',versionId:'qa-price-1',label:'QA 검토용 계란 · 30구',unitPrice:6000,minQuantity:30,shipmentOrigin:'QA 샘플 출고처',productId:'qa-egg-30',unit:'tray',supplierId:'qa-farm',grade:'large',packing:'packed'};
 const purchase=(id,status,quantity,channel='store')=>({id,revision:1,status,createdAt:now,updatedAt:now,offerId:offer.id,quoteId:'qa-quote-'+id,product:offer.label,quantity,trays:quantity,unitPrice:offer.unitPrice,total:quantity*offer.unitPrice,paid:['PAID','DISPATCHED','RECEIVED'].includes(status)?quantity*offer.unitPrice:0,refunded:0,cancelledTrays:0,paymentMethod:status==='AWAITING_CARD'?'card':'cash',channel,date:now.slice(0,10),targetId:channel==='campaign'?'qa-campaign':'qa-store',target:channel==='campaign'?'QA 공동구매':'QA 샘플 사업장',supplierId:offer.supplierId,shipmentOrigin:offer.shipmentOrigin,serviceDate:'2026-11-21',carrier:status==='DISPATCHED'?'farm':'',tracking:'',receiptId:['PAID','DISPATCHED','RECEIVED'].includes(status)?'qa-receipt-'+id:null});
 const data={
  account:{revision:1,state:'ACTIVE',profile:{name:'QA 검토 회원',phone:'010-0000-0000',email:'qa-member@example.invalid',connections:[]}},
  notifications:[{id:'qa-notice-1',revision:1,title:'QA 납품 안내',body:'화면 검토용 알림입니다.',createdAt:now,readAt:null},{id:'qa-notice-2',revision:1,title:'QA 주문 안내',body:'실제 주문이 아닌 검토용 데이터입니다.',createdAt:now,readAt:now}],
  businesses:[{id:'qa-business-01',revision:1,updatedAt:now,profile:{name:'QA 샘플 사업장',road:'QA 검토용 소재지',postal:'00000',detail:'샘플 상세 주소',contactName:'QA 담당자',contactPhone:'010-0000-0000',storePhone:'',email:'qa-store@example.invalid',dropoff:'검토용 입구',jibun:'',region:'',providerId:'',addressProvider:'',regionSelection:null}}],
  offers:[offer],purchases:[purchase('qa-order-cash','AWAITING_CASH',30),purchase('qa-order-paid','PAID',40),purchase('qa-order-shipped','DISPATCHED',35),purchase('qa-order-card','AWAITING_CARD',30),purchase('qa-order-campaign','PAID',60,'campaign')],
  revenue:{revision:1,data:{initialReferral:true,contributors:[{name:'QA 기여자',code:'QA-REF',rate:100}]}},
  emailTemplates:{revision:1,data:{templates:[{id:'welcome',subject:'QA 가입 안내',body:'회원 이메일 화면을 검토하는 더미 문구입니다.'},{id:'verification',subject:'QA 인증 안내',body:'실제 인증 메일을 발송하지 않습니다.'},{id:'withdrawal',subject:'QA 탈퇴 안내',body:'실제 회원 정보와 연결되지 않습니다.'}]}},
  dashboard:{title:'검토용 업무 현황',scopeLabel:'QA 샘플 사업장',unit:'건',periods:[7,30,90].map((count,index)=>({id:String(count),label:count+'일',total:[35,63,151][index],change:[12.5,-3.4,8.2][index],points:Array.from({length:7},(_,i)=>({label:'검토 '+(i+1)+'일',value:[[2,4,3,7,5,8,6],[8,3,10,6,12,9,15],[12,22,14,28,18,32,25]][index][i]}))})),segments:[{id:'store',label:'사업장',amount:6,color:'#728dff'},{id:'farm',label:'농장',amount:4,color:'#50b3a2'},{id:'campaign',label:'공동구매',amount:2,color:'#c89cdd'}]},
  dashboardLayout:{revision:0,data:{layout:['widget-0','widget-1','widget-2'].map(id=>({id,wide:false}))}},
  policies:Object.fromEntries(['required','privacy','optional'].map(id=>[id,{id,version:'qa-review-v1',status:'fixture',title:'검토용 '+({required:'이용 안내',privacy:'개인정보 안내',optional:'선택 안내'}[id]),sections:Array.from({length:8},(_,i)=>({id:'review-section-'+(i+1),title:(i+1)+'. 화면 검토 항목',paragraphs:['이 본문은 스크롤 목차와 확인 동작을 검토하기 위한 더미 문서입니다. 실제 약관이나 개인정보 처리방침이 아닙니다.','문서 길이와 현재 읽는 위치를 확인합니다. 실제 서비스의 권리와 의무는 별도로 게시된 정식 문서를 따라야 합니다.']}))}])),
  receipts:[],billing:[],businessVerifications:[],
  cases:[{id:'qa-reprice-case',kind:'reprice',org_id:'qa-store',site_id:'qa-site',quote_id:'qa-existing-quote',state:'DRAFT',revision:1,evidenceId:null,actions:['attach','cancel']}]
 };
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 const aborted=()=>new DOMException('QA fixture request aborted','AbortError');
 const check=signal=>{if(disposed||signal?.aborted)throw aborted();};
 const response=(value,status=200)=>({ok:status>=200&&status<300,status,redirected:false,json:async()=>copy({...value,fixture:source})});
 const capabilities=()=>({create:controls.authenticated&&controls.persona==='buyer',confirmCash:controls.authenticated&&controls.persona==='operator',dispatch:controls.authenticated&&['supplier','operator'].includes(controls.persona),receive:controls.authenticated&&controls.persona==='buyer',cancel:controls.authenticated&&['buyer','operator'].includes(controls.persona)});
 const account=()=>({...copy(data.account),capabilities:{dashboard:controls.authenticated&&controls.persona==='operator',accountSwitch:false}});
 const empty=()=>{data.notifications=[];data.businesses=[];data.offers=[];data.purchases=[];data.cases=[];data.receipts=[];data.billing=[];data.businessVerifications=[];data.dashboard={title:'검토용 업무 현황',scopeLabel:'QA',unit:'건',periods:[],segments:[]};data.account={revision:0,state:'ACTIVE',profile:{name:'',phone:'',email:'qa-member@example.invalid',connections:[]}};data.revenue={revision:0,data:{initialReferral:false,contributors:[]}};data.emailTemplates={revision:0,data:{templates:[]}};quotes.clear();};
 const applyData=next=>{for(const key of Object.keys(next||{})){if(!Object.hasOwn(data,key))fail('QA_FIXTURE_DATA_UNSUPPORTED');data[key]=copy(next[key]);}};
 if(controls.scenario==='empty')empty();
 applyData(initial.data);
 const context={mode:'qa-fixture',source,fixture:source,now,persona:controls.persona,actor:{id:'qa-fixture-'+controls.persona,authenticated:controls.authenticated},endpoints:{product:'/__qa_fixture/product',role:'/__qa_fixture/role',price:'/__qa_fixture/price'}};
 const actions=item=>{
  const c=capabilities();return [c.confirmCash&&item.status==='AWAITING_CASH'&&'confirm-cash',c.create&&item.status==='AWAITING_CARD'&&'card',c.dispatch&&item.status==='PAID'&&'dispatch',c.receive&&item.status==='DISPATCHED'&&'receive',c.cancel&&['AWAITING_CASH','AWAITING_CARD'].includes(item.status)&&'cancel','documents'].filter(Boolean);
 };
 const listed=item=>({...copy(item),actions:actions(item)});
 const purchases=()=>({items:data.purchases.map(listed),offers:capabilities().create?copy(data.offers):[],selectedPurchaseId:adapter?.selectedPurchaseId||null,capabilities:capabilities()});
 const revision=(body,current)=>{if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==current)fail('REVISION_CONFLICT',409);};
 const requireRole=roles=>{if(!roles.includes(controls.persona))fail('ACCESS_DENIED',403);};
 const requireMember=()=>{if(!controls.authenticated)fail('AUTHENTICATION_REQUIRED',401);if(data.account.state==='WITHDRAWN')fail('ACCOUNT_WITHDRAWN',403);};
 const nextId=prefix=>{let id;do{id=prefix+(++sequence);}while(quotes.has(id)||data.purchases.some(item=>item.id===id));return id;};
 function product(path,body){
  if(path==='/session'&&!body)return {csrf:'qa-fixture-csrf',role:controls.authenticated?controls.persona.toUpperCase():'GUEST',authenticated:controls.authenticated,email:data.account.profile.email};
  if(path==='/features'&&!body)return {orderMenu:true};
  if(path==='/account'&&!body)return account();
  if(path.startsWith('/policies/')&&!body){const policy=data.policies[path.slice(10)];if(!policy)fail('POLICY_NOT_PUBLISHED',404);return copy(policy);}
  requireMember();
  if(path==='/dashboard'&&!body){requireRole(['operator']);return copy(data.dashboard);}
  if(path==='/settings/dashboard-layout'){
   requireRole(['operator']);if(!body)return copy(data.dashboardLayout);revision(body,data.dashboardLayout.revision);const layout=body.data?.layout;
   if(!Array.isArray(layout)||layout.length!==3||new Set(layout.map(x=>x.id)).size!==3||layout.some(x=>!['widget-0','widget-1','widget-2'].includes(x.id)||typeof x.wide!=='boolean'))fail('INVALID_LAYOUT');
   data.dashboardLayout={revision:data.dashboardLayout.revision+1,data:{layout:copy(layout)}};return copy(data.dashboardLayout);
  }
  if(path==='/receipt-options'&&!body){requireRole(['operator','supplier']);return {items:data.purchases.filter(p=>p.paid>0).map(p=>({...copy(p),models:[controls.persona==='operator'?'order-to-business':'supplier-to-site']}))};}
  if(path==='/receipts'||path.startsWith('/receipts/')){
   if(!body){if(path==='/receipts')return {items:copy(data.receipts)};const item=data.receipts.find(r=>r.id===path.slice(10));if(!item)fail('NOT_FOUND',404);return {item:copy(item)};}
   requireRole(['operator','supplier']);revision(body,0);const p=data.purchases.find(p=>p.id===body.purchaseId);if(!p||!p.paid)fail('RECEIPT_PAYMENT_REQUIRED',409);if(body.model!==(controls.persona==='operator'?'order-to-business':'supplier-to-site')||!['site','supplier'].includes(body.recipient)||controls.persona==='supplier'&&body.recipient!=='site')fail('ACCESS_DENIED',403);
   const existing=data.receipts.find(r=>r.purchaseId===p.id&&r.model===body.model&&r.recipient.kind===body.recipient);if(existing)return {item:copy(existing),existing:true};
   const receiptId=nextId('qa-issued-receipt-'),item={id:receiptId,revision:1,status:'ISSUED',number:'QA-RCT-'+receiptId,model:body.model,purchaseId:p.id,sourceRevision:p.revision,issuedAt:now,issuer:{kind:controls.persona==='supplier'?'supplier':'order',orgId:controls.persona==='supplier'?'qa-farm':'qa-store',actorId:context.actor.id},recipient:{kind:body.recipient,orgId:body.recipient==='supplier'?'qa-farm':'qa-store',siteId:body.recipient==='site'?'qa-site':''},supplierId:'qa-farm',product:p.product,quantity:p.quantity,unitPrice:p.unitPrice,total:p.total,paid:p.paid,paymentMethod:p.paymentMethod,reference:'QA 검토용',documentDigest:'qa-fixture-immutable-'+receiptId};data.receipts.push(item);return {item:copy(item)};
  }
  if(path==='/billing/accounts'&&!body){requireRole(['operator','supplier']);return {accounts:controls.scenario==='empty'?[]:[{id:'qa-store:qa-site',orgId:'qa-store',siteId:'qa-site',label:'QA 샘플 사업장',supplierId:'qa-farm',issuerOrgId:controls.persona==='supplier'?'qa-farm':'qa-store'}]};}
  if(path==='/billing'||path.startsWith('/billing/')){
   requireRole(['operator','supplier']);if(!body){if(path==='/billing')return {items:copy(data.billing)};const item=data.billing.find(r=>r.id===path.slice(9));if(!item)fail('NOT_FOUND',404);return {item:copy(item)};}
   const old=data.billing.find(r=>r.id===body.id);revision(body,old?.revision||0);if(old?.status==='ISSUED')fail('DOCUMENT_IMMUTABLE',409);
   if(!['draft','issue'].includes(body.action)||body.accountId!=='qa-store:qa-site'||!Number.isSafeInteger(body.amount)||body.amount<1||body.amount>999999999||!body.subject?.trim()||!body.dueDate)fail('INVALID_BILLING');
   const item={id:body.id,revision:(old?.revision||0)+1,status:body.action==='issue'?'ISSUED':'DRAFT',accountId:body.accountId,issuer:{orgId:body.issuerOrgId,actorId:context.actor.id},recipient:{orgId:'qa-store',siteId:'qa-site'},target:'QA 샘플 사업장',supplierId:'qa-farm',amount:body.amount,subject:body.subject,memo:body.memo||'',dueDate:body.dueDate,currency:'KRW',paid:0,deliveryStatus:'NOT_SENT',createdAt:old?.createdAt||now,updatedAt:now,...(body.action==='issue'?{number:'QA-BILL-'+body.id,issuedAt:now,documentDigest:'qa-fixture-billing-'+body.id}:{})};data.billing=data.billing.filter(x=>x.id!==item.id);data.billing.push(item);return {item:copy(item)};
  }
  if(path==='/business-verifications'&&body){requireRole(['buyer']);revision(body,0);if(!data.cases.some(c=>c.id===body.caseId&&c.kind==='business')||!/^\d{10}$/.test(body.number)||!body.owner||!body.industry||!body.trade)fail('INVALID_BUSINESS');const item={id:nextId('qa-verification-'),revision:1,status:'VERIFIED',verified:true,caseId:body.caseId,actorId:context.actor.id,provider:'QA_FIXTURE',checkedAt:now};data.businessVerifications.push(item);return {item:copy(item)};}
  if(path==='/account'){
   revision(body,data.account.revision);
   if(body.action==='update'){
    if(typeof body.profile?.name!=='string'||!body.profile.name.trim()||body.profile.name.length>80||typeof body.profile.phone!=='string'||!/^[-+() 0-9]*$/.test(body.profile.phone)||body.profile.phone.length>40)fail('INVALID_PROFILE');
    data.account.profile={...data.account.profile,name:body.profile.name.trim(),phone:body.profile.phone.trim()};
   }else if(body.action==='withdraw'){
    if(body.phrase!=='회원탈퇴'||!['service','price','privacy','other'].includes(body.reason)||body.reason==='other'&&!body.note?.trim())fail('WITHDRAWAL_CONFIRMATION_REQUIRED');
    if(data.purchases.some(item=>!['RECEIVED','CANCELLED'].includes(item.status)))fail('ACTIVE_ORDERS_EXIST',409);
    data.account.state='WITHDRAWN';
   }else fail('QA_FIXTURE_UNSUPPORTED',501);
   data.account.revision++;return account();
  }
  if(path==='/notifications'){
   if(!body)return {items:copy(data.notifications)};
   if(body.action!=='read')fail('QA_FIXTURE_UNSUPPORTED',501);
   const item=data.notifications.find(item=>item.id===body.id);if(!item)fail('NOT_FOUND',404);revision(body,item.revision);item.readAt=now;item.revision++;return {id:item.id,revision:item.revision,readAt:item.readAt};
  }
  if(path==='/purchases'&&!body)return purchases();
  if(path==='/purchase-quote'&&body){
   requireRole(['buyer']);revision(body,0);const selected=data.offers.find(item=>item.id===body.offerId);if(!selected)fail('OFFER_UNAVAILABLE',409);
   if(!Number.isSafeInteger(body.quantity)||body.quantity<selected.minQuantity)fail('INVALID_PURCHASE');
   const quote={quoteId:nextId('qa-quote-'),offerId:selected.id,quantity:body.quantity,total:body.quantity*selected.unitPrice,unitPrice:selected.unitPrice,serviceDate:body.serviceDate||'2026-11-21',expiresAt:'2026-11-21T00:00:00.000Z'};quotes.set(quote.quoteId,quote);return copy(quote);
  }
  if(path==='/purchases'&&body){
   if(body.action==='create'){
    requireRole(['buyer']);revision(body,0);
    const quote=quotes.get(body.acceptedQuoteId),selected=data.offers.find(item=>item.id===body.offerId);
    if(!selected)fail('OFFER_UNAVAILABLE',409);if(!quote)fail('QUOTE_EXPIRED_OR_CHANGED',409);
    if(quote.offerId!==body.offerId||quote.quantity!==body.quantity||quote.serviceDate!==body.serviceDate)fail('QUOTE_INPUT_CHANGED',409);
    if(!['cash','card'].includes(body.paymentMethod)||!['store','farm','campaign'].includes(body.channel))fail('INVALID_PURCHASE');
    const item={...purchase(nextId('qa-purchase-'),body.paymentMethod==='card'?'AWAITING_CARD':'AWAITING_CASH',body.quantity,body.channel),offerId:selected.id,product:selected.label,quoteId:quote.quoteId,total:quote.total,unitPrice:quote.unitPrice,serviceDate:quote.serviceDate,paymentMethod:body.paymentMethod};data.purchases.unshift(item);return {item:listed(item)};
   }
   const item=data.purchases.find(item=>item.id===body.id);if(!item)fail('NOT_FOUND',404);revision(body,item.revision);
   if(!['confirm-cash','dispatch','receive','cancel','card'].includes(body.action))fail('QA_FIXTURE_UNSUPPORTED',501);
   if(!actions(item).includes(body.action))fail('ACCESS_DENIED',403);
   if(body.action==='card')fail('PAYMENT_PROVIDER_UNAVAILABLE',503);
   if(body.action==='confirm-cash'){
    if(typeof body.reference!=='string'||!body.reference.trim())fail('PAYMENT_CONFIRMATION_REQUIRED',409);
    item.status='PAID';item.paid=item.total;item.paymentReference=body.reference.trim();item.paymentConfirmedAt=now;item.receiptId='qa-receipt-'+item.id;
   }else if(body.action==='dispatch'){
    if(!['farm','parcel','freight','quick'].includes(body.carrier)||typeof body.tracking!=='string'||body.carrier==='parcel'&&!body.tracking.trim())fail('DISPATCH_CONDITIONS_REQUIRED',409);
    item.status='DISPATCHED';item.carrier=body.carrier;item.tracking=body.tracking;
   }else if(body.action==='receive')item.status='RECEIVED';
   else{item.status='CANCELLED';item.cancelledTrays=item.quantity;}
   item.revision++;item.updatedAt=now;return {item:listed(item)};
  }
  if(path==='/sales'&&!body){requireRole(['operator']);return purchases();}
  if(path.startsWith('/documents/')&&!body){
   const item=data.purchases.find(item=>item.id===path.slice(11));if(!item)fail('NOT_FOUND',404);
   return {purchaseId:item.id,quoteId:item.quoteId,receiptId:item.receiptId,quote:{number:item.quoteId,issuedAt:item.createdAt,product:item.product,quantity:item.quantity,unitPrice:item.unitPrice,total:item.total},receipt:item.receiptId?{number:item.receiptId,issuedAt:item.paymentConfirmedAt||now,paymentMethod:item.paymentMethod,paid:item.paid,reference:item.paymentReference||'QA 검토용'}:null};
  }
  if(path==='/revenue'||path==='/email-templates'){
   requireRole(['operator']);const key=path==='/revenue'?'revenue':'emailTemplates',current=data[key];if(!body)return copy(current);revision(body,current.revision);
   if(path==='/revenue'){
    const contributors=body.data?.contributors;if(!Array.isArray(contributors)||!contributors.length||contributors.some(item=>typeof item.name!=='string'||!item.name.trim()||!Number.isFinite(item.rate)||item.rate<0||item.rate>100)||contributors.reduce((n,item)=>n+Math.round(item.rate*100),0)!==10000)fail('RATES_MUST_TOTAL_100');
   }else if(!Array.isArray(body.data?.templates)||body.data.templates.some(item=>typeof item.id!=='string'||typeof item.subject!=='string'||typeof item.body!=='string'))fail('INVALID_INPUT');
   data[key]={revision:current.revision+1,data:copy(body.data)};return copy(data[key]);
  }
  fail('QA_FIXTURE_UNSUPPORTED',501);
 }
 function role(path,body){
  if(path==='/session'&&!body)return product(path,body);
  requireMember();
  if(path==='/workspace'&&!body)return {quotes:controls.scenario==='empty'?[]:[{id:'qa-existing-quote',org_id:'qa-store',site_id:'qa-site',productName:'QA 검토용 발급 견적',serviceDate:'2026-11-21',expires_at:'2027-12-31T00:00:00.000Z'}],businesses:[{org_id:'qa-store',site_id:'qa-site',businessName:'QA 샘플 사업장'}],products:[]};
  if(path===''||path==='/'){
   const grants=[{actor_id:context.actor.id,role:controls.persona.toUpperCase(),org_id:controls.persona==='supplier'?'qa-farm':'qa-store',site_id:controls.persona==='buyer'?'qa-site':'',active:1}];
   if(!body)return {grants,cases:copy(data.cases),next:null};
   requireRole(['buyer']);const old=data.cases.find(c=>c.id===body.caseId);revision(body,old?.revision||0);
   if(body.action==='create'){if(old||!['business','consult','reprice'].includes(body.kind)||body.orgId!=='qa-store'||body.siteId!=='qa-site')fail('INVALID_INPUT');const item={id:body.caseId,kind:body.kind,org_id:body.orgId,site_id:body.siteId,revision:1,state:'DRAFT',evidenceId:null,actions:['submit','manual','attach'],...(body.context===undefined?{}:{context:copy(body.context)})};data.cases.push(item);return {case:copy(item),committedRevision:1};}
   if(!old)fail('NOT_FOUND',404);if(body.action==='manual'&&old.kind==='business'&&old.state==='DRAFT')old.state='EVIDENCE_REQUIRED';else if(body.action==='submit'&&old.state==='DRAFT')old.state=old.kind==='consult'?'OPEN':'REVIEW';else if(body.action==='attach'&&['DRAFT','NEEDS_INFO','EVIDENCE_REQUIRED'].includes(old.state)){const evidence=evidencePackets.get(body.evidenceId);if(!evidence||evidence.caseId!==old.id)fail('EVIDENCE_REQUIRED');old.state='REVIEW';old.evidenceId=body.evidenceId;}else fail('TRANSITION_UNAVAILABLE',409);old.revision++;return {case:copy(old),committedRevision:old.revision};
  }
  if(path==='/account'&&!body)return {members:controls.scenario==='empty'?[]:[{self:true,actor_id:context.actor.id,org_id:controls.persona==='supplier'?'qa-farm':'qa-store',site_id:controls.persona==='buyer'?'qa-site':'',role:controls.persona.toUpperCase(),active:1}]};
  if(path==='/businesses'){
   if(!body)return {businesses:copy(data.businesses.filter(item=>!item.deleted))};
   if(typeof body.id!=='string'||typeof body.deleted!=='boolean'||typeof body.profile?.name!=='string'||!body.profile.name.trim())fail('INVALID_PROFILE');
   if(body.profile.postal&&!/^\d{5}$/.test(body.profile.postal)||body.profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.profile.email))fail('INVALID_PROFILE');
   const old=data.businesses.find(item=>item.id===body.id);revision(body,old?.revision||0);
   const item={id:body.id,revision:(old?.revision||0)+1,deleted:body.deleted,profile:copy(body.profile),updatedAt:now};data.businesses=data.businesses.filter(existing=>existing.id!==item.id);data.businesses.unshift(item);return {id:item.id,revision:item.revision,deleted:item.deleted,profile:copy(item.profile)};
  }
  fail('QA_FIXTURE_UNSUPPORTED',501);
 }
 function hold(signal){
  check(signal);return new Promise((resolve,reject)=>{
   const item={finish(error){pending.delete(item);signal?.removeEventListener('abort',cancel);error?reject(error):resolve();}};
   const cancel=()=>item.finish(aborted());pending.add(item);signal?.addEventListener('abort',cancel,{once:true});
  });
 }
 async function transport(input,settings={}){
  const signal=settings.signal;check(signal);
  const url=new URL(String(input),'https://qa-fixture.invalid'),match=/^\/__qa_fixture\/(product|role|price)(\/.*)?$/.exec(url.pathname),method=settings.method||'GET';
  if(url.origin!=='https://qa-fixture.invalid'||!match||!['GET','POST'].includes(method))return response({error:'QA_FIXTURE_UNSUPPORTED'},501);
  const [,domain,matchedPath]=match,path=matchedPath||'',call={domain,path,method};calls.push(call);
  try{
   const supported=domain==='product'&&(['/account','/notifications','/purchases','/revenue','/email-templates','/settings/dashboard-layout','/receipts','/billing','/business-verifications'].includes(path)||method==='GET'&&(['/session','/features','/sales','/dashboard','/receipt-options','/billing/accounts'].includes(path)||/^\/(documents|policies|receipts|billing)\/[^/]+$/.test(path))||method==='POST'&&path==='/purchase-quote')||domain==='role'&&(['','/','/businesses','/evidence'].includes(path)||method==='GET'&&['/session','/account','/workspace'].includes(path));
   if(!supported)fail('QA_FIXTURE_UNSUPPORTED',501);
   const binary=domain==='role'&&path==='/evidence';
   let body=null;if(method==='POST'&&!binary){try{body=JSON.parse(settings.body);}catch{fail('INVALID_INPUT');}if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.requestKey!=='string'||!body.requestKey)fail('INVALID_INPUT');}
   const rule=()=>controls.requests[domain+' '+method+' '+path]||{};
   if(path!=='/session'&&(rule().scenario||controls.scenario)==='loading')await hold(signal);
   else await Promise.resolve();
   check(signal);
   if(path!=='/session'&&(rule().scenario||controls.scenario)==='error')fail(rule().errorCode||'QA_FIXTURE_ERROR',rule().status||503);
   if(binary){
    requireMember();const caseId=url.searchParams.get('caseId'),item=data.cases.find(c=>c.id===caseId);if(!item)fail('NOT_FOUND',404);
    if(method==='GET'){const saved=evidencePackets.get(url.searchParams.get('id'));if(!saved||saved.caseId!==caseId)fail('NOT_FOUND',404);return {ok:true,status:200,headers:{get:key=>key.toLowerCase()==='content-type'?'application/vnd.order.masked-rasters':null},arrayBuffer:async()=>saved.bytes.slice().buffer};}
    if(!['DRAFT','NEEDS_INFO','EVIDENCE_REQUIRED'].includes(item.state))fail('CASE_NOT_ELIGIBLE',403);
    const bytes=settings.body;if(!(bytes instanceof Uint8Array)||bytes.length>8*1024*1024||bytes.length<7||![79,82,80,88,1].every((v,i)=>bytes[i]===v))fail('INVALID_MASKED_RASTER',422);
    const headers=settings.headers||{},requestKey=headers['Idempotency-Key'];if(!requestKey)fail('INVALID_KEY');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    const previous=[...evidencePackets].find(([,v])=>v.requestKey===requestKey);if(previous){if(previous[1].digest!==digest||previous[1].caseId!==caseId)fail('REQUEST_KEY_REUSED',409);return response({evidenceId:previous[0],pages:bytes[5],signatureBound:previous[1].signatureBound});}
    let signed=null;try{signed=JSON.parse(headers['X-Order-Submission']||'null');}catch{}
    if(item.kind==='reprice'&&(!signed||signed.consentVersion!=='masked-evidence-v1'||bytes[5]<2))fail('SIGNATURE_BINDING_REQUIRED',422);
    const evidenceId=nextId('qa-evidence-');evidencePackets.set(evidenceId,{caseId,requestKey,digest,bytes:bytes.slice(),signatureBound:Boolean(signed)});return response({evidenceId,pages:bytes[5],signatureBound:Boolean(signed)});
   }
   const fingerprint=body?JSON.stringify([domain,path,body]):null,requestKey=body?controls.persona+':'+body.requestKey:null,prior=requestKey&&replays.get(requestKey);
   if(prior){if(prior.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT',409);call.status=200;return response(prior.result);}
   const value=domain==='product'?product(path,body):domain==='role'?role(path,body):fail('QA_FIXTURE_UNSUPPORTED',501);
   if(requestKey)replays.set(requestKey,{fingerprint,result:copy(value)});call.status=200;return response(value);
  }catch(error){if(error.name==='AbortError')throw error;call.status=error.status||500;return response({error:error.status?error.message:'QA_FIXTURE_FAILURE'},call.status);}
 }
 const selectedForState=()=>{const screen=session.screen||'',state=session.state||'',id=state==='card'?'qa-order-card':state==='cash'?'qa-order-cash':screen==='delivery-request'?'qa-order-shipped':screen.includes('shipments')?'qa-order-paid':data.purchases[0]?.id;return data.purchases.some(item=>item.id===id)?id:data.purchases[0]?.id||null;};
 function configure(next={}){
  check();const previousAuth=controls.authenticated;
  const nextSelection=[session.screen,session.state].join('/');if(nextSelection!==selectionKey){selectionKey=nextSelection;const identity=inferred();if(next.persona===undefined)controls.persona=identity.persona;if(next.authenticated===undefined)controls.authenticated=identity.authenticated;}
  if(next.scenario!==undefined){if(!['normal','loading','error','empty'].includes(next.scenario))fail('QA_FIXTURE_SCENARIO_UNSUPPORTED');if(next.scenario==='empty'&&controls.scenario!=='empty')empty();controls.scenario=next.scenario;}
  if(next.persona!==undefined){if(!['buyer','supplier','operator','guest'].includes(next.persona))fail('QA_FIXTURE_PERSONA_UNSUPPORTED');controls.persona=next.persona;if(next.authenticated===undefined)controls.authenticated=next.persona!=='guest';}
  if(next.authenticated!==undefined)controls.authenticated=next.authenticated===true;
  if(next.requests!==undefined)controls.requests=copy(next.requests);
  applyData(next.data);context.persona=controls.persona;context.actor={id:'qa-fixture-'+controls.persona,authenticated:controls.authenticated};
  if(!previousAuth&&controls.authenticated||next.arrival===true)arrivalPending=true;if(!controls.authenticated)arrivalPending=false;
  if(Object.hasOwn(next,'selectedPurchaseId'))adapter.selectedPurchaseId=next.selectedPurchaseId;
  if(next.purchaseStatus!==undefined){if(!['AWAITING_CASH','AWAITING_CARD','PAID','DISPATCHED','RECEIVED','CANCELLED'].includes(next.purchaseStatus))fail('QA_FIXTURE_PURCHASE_STATE_UNSUPPORTED');const item=data.purchases.find(item=>item.id===adapter.selectedPurchaseId);if(item){item.status=next.purchaseStatus;item.paid=['PAID','DISPATCHED','RECEIVED'].includes(item.status)?item.total:0;item.receiptId=item.paid?'qa-receipt-'+item.id:null;}}
  if(brandContext){brandContext.authenticated=controls.authenticated;brandContext.unread=controls.authenticated?data.notifications.filter(item=>!item.readAt).length:0;}
  return {persona:controls.persona,authenticated:controls.authenticated,scenario:controls.scenario,source:copy(source)};
 }
 const fixture={source,configure,
  releasePending(next={scenario:'normal'}){configure(next);const count=pending.size;for(const request of [...pending])request.finish();return count;},
  inspect(){return {source:copy(source),controls:copy(controls),data:copy(data),calls:copy(calls),operations:copy(operations),pending:pending.size,disposed,selectedPurchaseId:adapter?.selectedPurchaseId||null};},
  dispose(){if(disposed)return;disposed=true;controller.abort();for(const request of [...pending])request.finish(aborted());memory.clear();}
 };
 adapter=installProductAdapter(context,{fetch:transport,signal:controller.signal,storage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)},
  navigate(screen,state='default'){check();window.dispatchEvent(new Event('order-qa-before-navigate'));window.parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type:'navigate',payload:{screen,state}},'*');},
  onOperation(operation){operations.push({...operation,scope:'ORDER_QA_FIXTURE',source:copy(source)});}
 });
 adapter.fixture=fixture;adapter.selectedPurchaseId=initial.selectedPurchaseId===undefined?selectedForState():initial.selectedPurchaseId;
 brandContext=window.ORDER_BRAND_ACCOUNT_CONTEXT;
 brandContext.canAccess=id=>id!=='manage.dashboard'||account().capabilities.dashboard;
 brandContext.consumeArrival=()=>{const value=arrivalPending;arrivalPending=false;return value;};
 configure(initial);
 window.addEventListener('pagehide',()=>fixture.dispose(),{once:true,signal:controller.signal});
 return adapter;
}
