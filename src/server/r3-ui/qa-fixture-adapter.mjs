// R1 review data only. The product renderer is shared; these records never leave
// the review frame and are neither commercial records nor server acknowledgements.
export const qaFixtureContract={
 format:'order-qa-fixture/v1',mode:'qa-fixture',sourceId:'r1-mvp-memory-v1',persistent:false,
 scenarios:['normal','loading','error','empty'],personas:['buyer','supplier','operator','guest'],
 options:['authenticated','persona','scenario','selectedPurchaseId','purchaseStatus','arrival','requests','data'],
 requestRuleKey:'<product|role> <GET|POST> <path>',
 dataKeys:['account','notifications','businesses','offers','purchases','revenue','emailTemplates'],
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
 const inferred=()=>{const screen=session.screen||'',state=session.state||'',guest=['login','signup','otp','password','terms'].includes(screen)&&!(screen==='login'&&state==='success'||screen==='otp'&&state==='verified')||screen==='onboarding'&&!state.startsWith('member-')||screen==='account-settings'&&state==='closed';return {authenticated:!guest,persona:guest?'guest':screen.startsWith('supplier-')?'supplier':screen.startsWith('admin-')||screen==='member-email-templates'?'operator':'buyer'};};
 const identity=inferred(),controls={persona:initial.persona||identity.persona,authenticated:initial.authenticated??(initial.persona?initial.persona!=='guest':identity.authenticated),scenario:initial.scenario||'normal',requests:copy(initial.requests||{})};
 const controller=new AbortController(),pending=new Set(),memory=new Map(),replays=new Map(),quotes=new Map(),calls=[],operations=[];
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
  emailTemplates:{revision:1,data:{templates:[{id:'welcome',subject:'QA 가입 안내',body:'회원 이메일 화면을 검토하는 더미 문구입니다.'},{id:'verification',subject:'QA 인증 안내',body:'실제 인증 메일을 발송하지 않습니다.'},{id:'withdrawal',subject:'QA 탈퇴 안내',body:'실제 회원 정보와 연결되지 않습니다.'}]}}
 };
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 const aborted=()=>new DOMException('QA fixture request aborted','AbortError');
 const check=signal=>{if(disposed||signal?.aborted)throw aborted();};
 const response=(value,status=200)=>({ok:status>=200&&status<300,status,redirected:false,json:async()=>copy({...value,fixture:source})});
 const capabilities=()=>({create:controls.authenticated&&controls.persona==='buyer',confirmCash:controls.authenticated&&controls.persona==='operator',dispatch:controls.authenticated&&['supplier','operator'].includes(controls.persona),receive:controls.authenticated&&controls.persona==='buyer',cancel:controls.authenticated&&['buyer','operator'].includes(controls.persona)});
 const account=()=>({...copy(data.account),capabilities:{dashboard:controls.authenticated&&controls.persona==='operator',accountSwitch:false}});
 const empty=()=>{data.notifications=[];data.businesses=[];data.offers=[];data.purchases=[];data.account={revision:0,state:'ACTIVE',profile:{name:'',phone:'',email:'qa-member@example.invalid',connections:[]}};data.revenue={revision:0,data:{initialReferral:false,contributors:[]}};data.emailTemplates={revision:0,data:{templates:[]}};quotes.clear();};
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
  requireMember();
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
  const url=new URL(String(input),'https://qa-fixture.invalid'),match=/^\/__qa_fixture\/(product|role|price)(\/.*)$/.exec(url.pathname),method=settings.method||'GET';
  if(url.origin!=='https://qa-fixture.invalid'||!match||!['GET','POST'].includes(method))return response({error:'QA_FIXTURE_UNSUPPORTED'},501);
  const [,domain,path]=match,call={domain,path,method};calls.push(call);
  try{
   const supported=domain==='product'&&(['/account','/notifications','/purchases','/revenue','/email-templates'].includes(path)||method==='GET'&&(['/session','/features','/sales'].includes(path)||/^\/documents\/[^/]+$/.test(path))||method==='POST'&&path==='/purchase-quote')||domain==='role'&&(path==='/businesses'||method==='GET'&&['/session','/account'].includes(path));
   if(!supported)fail('QA_FIXTURE_UNSUPPORTED',501);
   let body=null;if(method==='POST'){try{body=JSON.parse(settings.body);}catch{fail('INVALID_INPUT');}if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.requestKey!=='string'||!body.requestKey)fail('INVALID_INPUT');}
   const rule=()=>controls.requests[domain+' '+method+' '+path]||{};
   if(path!=='/session'&&(rule().scenario||controls.scenario)==='loading')await hold(signal);
   else await Promise.resolve();
   check(signal);
   if(path!=='/session'&&(rule().scenario||controls.scenario)==='error')fail(rule().errorCode||'QA_FIXTURE_ERROR',rule().status||503);
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
