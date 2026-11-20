// Browser transport and panel renderer shared by the authenticated product and
// lab pages. Every completion comes from the domain API, never a QA timer.
export function installProductAdapter(context){
 window.ORDER_APP_CONTEXT=context;
 const endpoints={product:'/api/ia/product',role:'/api/ia/r3-role',price:'/api/ia/r3-price',...context.endpoints};
 let csrf='',selected=null,permissions=null,unread=0;
 const errorMessages={AUTHENTICATION_REQUIRED:'로그인이 필요해요.',ACCOUNT_WITHDRAWN:'탈퇴한 계정이에요.',NO_BUSINESS_MEMBERSHIP:'연결된 사업장 권한이 없어요.',REVISION_CONFLICT:'다른 창에서 먼저 변경됐어요. 작성 내용은 유지했으니 새 값을 확인해 주세요.',PAYMENT_PROVIDER_UNAVAILABLE:'카드 결제 연결이 준비되지 않았어요. 결제 완료로 처리하지 않았습니다.',RUN_NOT_ACTIVE:'종료된 실행이에요. 다른 실행을 선택해 주세요.',ACCESS_DENIED:'이 역할에서는 처리할 수 없어요.',ACTIVE_ORDERS_EXIST:'진행 중인 주문을 마무리한 후 탈퇴할 수 있어요.',QUOTE_INPUT_CHANGED:'입력한 상품이나 수량이 바뀌었어요. 견적을 다시 확인해 주세요.',QUOTE_EXPIRED_OR_CHANGED:'견적을 다시 확인해 주세요.'};
 const node=(tag,value,className)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(className)n.className=className;return n;};
 const key='order.product.selection.'+(context.runId||context.actor?.id||'signed');
 try{selected=sessionStorage.getItem(key);}catch{}
 async function refreshSession(){const response=await fetch(endpoints.product+'/session',{credentials:'same-origin',cache:'no-store',redirect:'manual'});if(!response.ok)throw Error('AUTHENTICATION_REQUIRED');const session=await response.json();csrf=session.csrf;document.dispatchEvent(new CustomEvent('ia-session-ready',{detail:session}));return session;}
 document.addEventListener('ia-session-updated',event=>{if(event.detail?.csrf)csrf=event.detail.csrf;});
 async function send(base,path,body,signal,retried=false,serialized=body?JSON.stringify(body):undefined){
  if(body)await ready;
  const response=await fetch(base+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'manual',signal,headers:body?{'Content-Type':'application/json','X-IA-CSRF':csrf}:{},body:serialized});
  let data;try{data=await response.json();}catch{data={error:response.status===403||response.redirected?'AUTHENTICATION_REQUIRED':'SERVICE_UNAVAILABLE'};}
  if(!response.ok){if(body&&!retried&&response.status===403&&data.error==='CSRF_DENIED'){await refreshSession();return send(base,path,body,signal,true,serialized);}const e=Object.assign(new Error(data.error||'SERVICE_UNAVAILABLE'),{status:response.status,data,userMessage:errorMessages[data.error]||'요청을 처리하지 못했어요. 입력을 보존했으니 다시 시도해 주세요.'});throw e;}
  if(body)window.parent?.postMessage({scope:'ORDER_PRODUCT_RUNTIME',type:'operation',runId:context.runId,persona:context.persona,documentId:context.documentId,path,method:'POST',revision:data.revision||data.item?.revision||data.saved?.revision||null,id:data.id||data.item?.id||null},location.origin);
  return data;
 }
 const ready=refreshSession();
 // Avoid an unhandled rejection while a disabled / guest panel is awaiting use.
 ready.catch(()=>{});
 const adapter={context,ready,request:(path,body,signal)=>send(endpoints.product,path,body,signal),roleRequest:(path,body,signal)=>send(endpoints.role,path,body,signal),priceRequest:(path,body,signal)=>send(endpoints.price,path,body,signal),message:error=>error.userMessage||errorMessages[error.message]||error.message,
  get selectedPurchaseId(){return selected;},set selectedPurchaseId(value){selected=value;try{if(value)sessionStorage.setItem(key,value);else sessionStorage.removeItem(key);}catch{};}
 };
 window.ORDER_APP_ADAPTER=adapter;
 const route=(screen,state='default')=>{
  const url=new URL(location.href);url.searchParams.set('view','product-r3');url.searchParams.set('screen',screen);url.searchParams.set('state',state);location.assign(url);
 };
 const formField=(label,name,value)=>{const holder=node('div');const U=window.QAUI;if(!U)throw Error('COMMON_UI_UNAVAILABLE');holder.innerHTML=U.field(label,name,'',{value:value||'',type:name==='phone'?'tel':'text',max:name==='name'?80:40,required:name==='name'});return [holder.firstElementChild,holder.querySelector('input')];};
 const button=(label,action,primary=false)=>{const holder=node('div'),U=window.QAUI;if(!U)throw Error('COMMON_UI_UNAVAILABLE');holder.innerHTML=U.button(U.esc(label),'product-panel-action',primary?'primary':'secondary');const b=holder.firstElementChild;b.onclick=action;return b;};
 const renderPanel=async({id,container,signal,push,setUnread})=>{
  const status=node('p','불러오는 중이에요.','muted');status.setAttribute('role','status');container.append(status);
  try{
   if(id==='notifications'){
    const {items}=await adapter.request('/notifications',null,signal);if(signal?.aborted)return;container.replaceChildren();
    if(!items.length)container.append(node('p','새 알림이 없어요.','muted'));unread=items.filter(i=>!i.readAt).length;setUnread?.(unread);
    for(const item of items){const card=node('article',undefined,'ops-panel');card.append(node('strong',item.title),node('p',item.body),node('small',item.createdAt));if(!item.readAt)card.append(button('읽음',async()=>{try{await adapter.request('/notifications',{id:item.id,action:'read',expectedRevision:item.revision,requestKey:crypto.randomUUID()});card.dataset.read='true';card.querySelector('button').remove();setUnread?.(--unread);}catch(error){status.textContent=adapter.message(error);container.append(status);}}));container.append(card);}return;
   }
   if(id.startsWith('profile')){
    const current=await adapter.request('/account',null,signal);if(signal?.aborted)return;permissions=current.capabilities;container.replaceChildren();
    if(id==='profile.connections'){container.append(node('p',current.profile.connections?.length?'연결된 계정':'연결된 간편 로그인 계정이 없어요.','muted'));return;}
    const form=node('form'),[nameWrap,name]=formField('이름','name',current.profile.name),[phoneWrap,phone]=formField('전화번호','phone',current.profile.phone);name.required=true;phone.type='tel';
    const email=node('p',current.profile.email,'muted'),save=button('저장',async()=>{window.QAUI.setFieldError(name,name.value.trim()?'':'이름을 입력해 주세요.');window.QAUI.setFieldError(phone,/^[-+() 0-9]*$/.test(phone.value)?'':'전화번호를 확인해 주세요.');if(!name.value.trim()||!/^[-+() 0-9]*$/.test(phone.value))return;save.disabled=true;try{const result=await adapter.request('/account',{action:'update',expectedRevision:current.revision,requestKey:crypto.randomUUID(),profile:{name:name.value,phone:phone.value}});current.revision=result.revision;status.textContent='저장했어요.';}catch(error){status.textContent=adapter.message(error);}finally{save.disabled=false;}},true);
    form.onsubmit=e=>{e.preventDefault();save.click();};form.append(email,nameWrap,phoneWrap,save,status);container.append(form);status.textContent='';return;
   }
   if(id==='manage.business'){
    const [{businesses},account]=await Promise.all([adapter.roleRequest('/businesses',null,signal),adapter.roleRequest('/account',null,signal).catch(()=>({members:[]}))]);if(signal?.aborted)return;container.replaceChildren();
    for(const business of businesses){const card=node('article',undefined,'ops-panel');card.append(node('strong',business.profile.name),node('p',[business.profile.road,business.profile.detail].filter(Boolean).join(' ')));container.append(card);}
    if(!businesses.length)container.append(node('p','등록된 사업장이 없어요.','muted'));
    container.append(button('사업장 관리',()=>{const u=new URL(location.href);u.searchParams.set('view','businesses-r3');location.assign(u);}));
    if(account.members?.length)container.append(button('구성원과 권한',()=>push?.('manage.business.members','구성원과 권한')));return;
   }
   if(id==='manage.business.members'){
    const account=await adapter.roleRequest('/account',null,signal);if(signal?.aborted)return;container.replaceChildren();
    for(const member of account.members||[])container.append(node('p',[member.self?'내 계정':member.actor_id||'구성원',member.role,member.org_id,member.site_id].filter(Boolean).join(' · ')));
    if(!account.members?.length)container.append(node('p','조회할 구성원이 없어요.','muted'));return;
   }
   const links={'manage.delivery':['납품 관리','admin-shipments'],'manage.payments':['결제·정산','store-purchase'],'manage.quotes':['내 견적·오더패스','delivery-request'],'manage.dashboard':['매출 현황','admin-analytics']};
   const destination=links[id];container.replaceChildren();if(destination)container.append(button(destination[0],()=>route(destination[1],destination[1]==='admin-analytics'?'business-sales':'default')));else container.append(node('p','연결할 업무를 선택해 주세요.','muted'));
  }catch(error){if(!signal?.aborted){status.textContent=adapter.message(error);if(!status.isConnected)container.append(status);}}
  finally{if(!signal?.aborted){const dispose=window.QAUI?.sharedMount?.(container,{mode:'product',reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches});signal?.addEventListener('abort',()=>dispose?.(),{once:true});}}
 };
 const brandContext={authenticated:context.actor?.authenticated!==false,renderPanel,canAccess:id=>id!=='manage.dashboard'||permissions?.dashboard===true,navigate:id=>{const mapping={'manage.delivery':'admin-shipments','manage.payments':'store-purchase','manage.quotes':'delivery-request','manage.business':'store-settings','manage.dashboard':'admin-analytics'};if(mapping[id])route(mapping[id]);}};
 window.ORDER_BRAND_ACCOUNT_CONTEXT=brandContext;
 if(brandContext.authenticated)ready.then(async()=>{
  const [account,notifications]=await Promise.all([adapter.request('/account'),adapter.request('/notifications')]);permissions=account.capabilities;unread=notifications.items.filter(i=>!i.readAt).length;brandContext.unread=unread;
  for(const brand of document.querySelectorAll('.obm-brand'))brand.__orderAccountMenu?.update({canAccess:brandContext.canAccess,unread});
 }).catch(()=>{});
 function keepLabLink(a){
  if(!a?.matches('a[href]')||!context.runId)return;
  const url=new URL(a.href,location.href);if(url.origin!==location.origin||!['/ia','/ia/','/login'].includes(url.pathname))return;
  const view=url.searchParams.get(url.pathname==='/login'?'returnView':'view');
  if(!['simple-r3','detailed-r3','pricing-r3','roles-r3','workflow-r3','businesses-r3','product-r3'].includes(view))return;
  url.searchParams.set('labRun',context.runId);url.searchParams.set('persona',context.persona);if(context.documentId)url.searchParams.set('qaDocument',context.documentId);if(a.href!==url.href)a.href=url.href;
 }
 if(context.runId){
  for(const a of document.querySelectorAll('a[href]'))keepLabLink(a);
  const links=new MutationObserver(changes=>{for(const change of changes){if(change.type==='attributes')keepLabLink(change.target);for(const added of change.addedNodes){if(added.nodeType!==1)continue;keepLabLink(added);for(const a of added.querySelectorAll('a[href]'))keepLabLink(a);}}});
  links.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
  for(const type of ['pointerdown','contextmenu','auxclick','click'])document.addEventListener(type,event=>keepLabLink(event.target.closest('a[href]')),true);
  window.addEventListener('pagehide',()=>links.disconnect(),{once:true});
 }
 return adapter;
}
