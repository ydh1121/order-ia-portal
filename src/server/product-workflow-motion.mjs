// Product interactions adapted from Kokonut UI (MIT), commit
// 655ec61161aff87721e4c60c3cc4dc3329f3e80e. See MOTION_SOURCES.md.
// Server acknowledgements, never animation timers, determine completion.
export const productWorkflowMotionCss=`
.wf-panel{max-width:760px;margin:20px auto;padding:24px;border:1px solid #dce1e9;border-radius:22px;background:#fff;color:#20242c;min-width:0}.wf-panel h2{font-size:22px;margin:0 0 8px}.wf-panel p{line-height:1.6}.wf-form{display:grid;gap:16px}.wf-field{display:grid;gap:7px;font-size:14px;font-weight:600}.wf-field input,.wf-field select,.wf-field textarea{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #ccd3df;border-radius:12px;padding:11px;background:#fff;color:inherit;font:inherit}.wf-actions{display:flex;flex-wrap:wrap;gap:10px}.wf-button{min-height:44px;padding:11px 18px;border:1px solid #cbd3df;border-radius:13px;background:#fff;color:#243047;font:inherit;cursor:pointer}.wf-button.primary{background:#263c72;color:white;border-color:#263c72}.wf-button:disabled{opacity:.55;cursor:default}.wf-status{min-height:1.5em;font-size:14px;white-space:pre-line;overflow-wrap:anywhere}.wf-status[data-error=true]{color:#a52e3f}.wf-panel [aria-invalid=true]{outline:2px solid #b43646;outline-offset:2px}.wf-amount{display:flex;justify-content:center;align-items:baseline;position:relative;min-height:80px;font-size:clamp(28px,7vw,48px);font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.025em;overflow:visible}.wf-amount span{display:inline-block;min-width:.16em}.wf-amount small{margin-left:8px;font-size:18px}.wf-number-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.wf-number-pad button{font-size:23px;min-height:52px;border:0;background:#f4f6f9;border-radius:13px}.wf-printer{position:relative;max-width:380px;margin:24px auto;isolation:isolate;padding:16px 12px 12px}.wf-printer:before{content:'';position:absolute;inset:0 0 auto;height:22px;background:#222b3c;border:7px solid #e1e5ec;border-radius:14px;z-index:2;box-shadow:0 2px 5px #0002}.wf-paper{position:relative;background:#fffdf8;border:1px solid #e2dfd5;padding:30px 22px 22px;box-shadow:0 10px 25px #2534491c;transform-origin:50% 0;touch-action:pan-x;cursor:grab;clip-path:polygon(0 0,100% 0,100% 98%,96% 100%,92% 98%,88% 100%,84% 98%,80% 100%,76% 98%,72% 100%,68% 98%,64% 100%,60% 98%,56% 100%,52% 98%,48% 100%,44% 98%,40% 100%,36% 98%,32% 100%,28% 98%,24% 100%,20% 98%,16% 100%,12% 98%,8% 100%,4% 98%,0 100%)}.wf-paper h3{text-align:center;font-size:19px}.wf-paper dl{display:grid;grid-template-columns:auto 1fr;gap:12px;font-size:13px}.wf-paper dd{margin:0;text-align:right;overflow-wrap:anywhere}.wf-paper code{display:block;font-size:10px;word-break:break-all;color:#66707e}.wf-signature{position:relative;border:1px solid #cfd5df;border-radius:16px;padding:14px;min-width:0}.wf-signature canvas{display:block;width:100%;height:150px;background:#fff;touch-action:none;border-radius:12px;cursor:crosshair}.wf-sign-placeholder{position:absolute;top:65px;left:28px;color:#8c95a5;pointer-events:none;transition:opacity .2s,filter .2s}.wf-signature[data-ink=true] .wf-sign-placeholder{opacity:0;filter:blur(2px)}.wf-business-result{padding:12px 14px;border-radius:12px;background:#edf4f2}.wf-business-result[data-success=false]{background:#fff1e7}.wf-working{animation:wf-spin .75s linear infinite;display:inline-block}.wf-panel [data-success=true]{animation:wf-check .45s ease-out}@keyframes wf-spin{to{rotate:360deg}}@keyframes wf-check{from{opacity:.3;scale:.9}70%{scale:1.04}to{opacity:1;scale:1}}@media(max-width:480px){.wf-panel{padding:17px;margin:12px 0;border-radius:18px}}@media(prefers-reduced-motion:reduce){.wf-working,.wf-panel [data-success=true]{animation:none}.wf-sign-placeholder{transition:none}}@media print{body:has(.wf-paper) *{visibility:hidden!important}.wf-paper,.wf-paper *{visibility:visible!important}.wf-paper{position:absolute;left:0;top:0;width:80mm;box-shadow:none;clip-path:none;transform:none!important}}
`;

export function installProductWorkflowMotion(win=window){
 const doc=win.document,instances=new WeakMap(),digits=new WeakMap();
 const node=(tag,text,className)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
 const button=(text,primary=false)=>{const e=node('button',text,'wf-button'+(primary?' primary':''));e.type='button';e.dataset.label=text;return e;};
 let fieldSequence=0;
 const field=(label,type='text')=>{
  const wrap=node('label',undefined,'wf-field'),caption=node('span',label),input=node(type==='select'?'select':type==='textarea'?'textarea':'input');
  let id;do{id='wf-field-'+(++fieldSequence);}while(doc.getElementById(id)||doc.getElementById(id+'-label'));
  caption.id=id+'-label';input.id=id;wrap.htmlFor=id;input.setAttribute('aria-labelledby',caption.id);
  if(input.tagName==='INPUT')input.type=type;wrap.append(caption,input);return {wrap,input};
 };
 const reduced=()=>win.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const spring=(from,to,{stiffness=520,damping=30,mass=.8,steps=60}={})=>{let value=from,velocity=0;const frames=[];for(let i=0;i<steps;i++){for(let j=0;j<4;j++){velocity+=((to-value)*stiffness-velocity*damping)/mass/240;value+=velocity/240;}frames.push(value);}frames.push(to);return frames;};
 const animate=(element,keyframes,options={})=>{if(reduced()||!element.animate)return null;return element.animate(keyframes,{duration:450,easing:'linear',...options});};
 function amountDigits(element,value){
  const text=Number(value||0).toLocaleString('ko-KR'),old=digits.get(element)||new Map(),positions=new Map([...old].map(([key,el])=>[key,el.getBoundingClientRect()])),next=new Map();
  let place=0;const tokens=[...text].reverse().map(ch=>({ch,key:ch===','?'comma-'+place:'digit-'+place++})).reverse();
  for(const {ch,key} of tokens){let e=old.get(key);const changed=!e||e.textContent!==ch;if(!e)e=node('span');e.textContent=ch;e.dataset.place=key;next.set(key,e);element.append(e);if(changed){for(const a of e.getAnimations?.()||[])a.cancel();animate(e,spring(-22,0).map((y,i)=>({transform:`translateY(${y}px)`,opacity:Math.min(1,i/8),filter:`blur(${Math.max(0,2-i/5)}px)`})));}}
  for(const [key,e] of old){if(next.has(key))continue;const r=positions.get(key),parent=element.getBoundingClientRect();e.style.cssText=`position:absolute;left:${r.left-parent.left}px;top:${r.top-parent.top}px`;const a=animate(e,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(18px)'}],{duration:140,easing:'ease-out'});if(a)a.finished.catch(()=>{}).then(()=>e.remove());else e.remove();}
  for(const [key,e] of next){const before=positions.get(key);if(!before)continue;const dx=before.left-e.getBoundingClientRect().left;if(Math.abs(dx)>.5)animate(e,spring(dx,0,{stiffness:500,damping:40}).map(x=>({translate:x+'px 0'})));}
  digits.set(element,next);element.setAttribute('aria-label',text+'원');
 }
 function signaturePad({title='제출 서명',locked=()=>false,signal,width=360,height=100,background='#fff',color='#203c6b'}={}){
  const controller=new win.AbortController(),on=(el,type,fn)=>el.addEventListener(type,fn,{signal:controller.signal}),element=node('fieldset',undefined,'wf-signature'),canvas=node('canvas'),ctx=canvas.getContext('2d'),typed=field('또는 이름 입력으로 서명'),placeholder=node('span','여기에 서명해 주세요','wf-sign-placeholder'),clear=button('다시 하기');
  canvas.width=width;canvas.height=height;canvas.tabIndex=0;canvas.setAttribute('aria-label','서명 그리기');typed.input.maxLength=40;typed.input.autocomplete='off';element.append(node('legend',title),canvas,placeholder,typed.wrap,clear);
  let active=false,activePointer=null,ink=false,raf=0,last=0,target={x:0,y:0},tip={x:0,y:0,vx:0,vy:0,width:2.2},pressure=1;
  const stop=()=>{win.cancelAnimationFrame(raf);raf=0;last=0;};
  const erase=()=>{ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ink=false;element.dataset.ink='false';};
  const release=(captured=true)=>{const pointer=activePointer;active=false;activePointer=null;if(captured&&pointer!==null&&canvas.hasPointerCapture?.(pointer))canvas.releasePointerCapture(pointer);};
  const reset=()=>{if(locked())return;stop();release();typed.input.value='';erase();};reset();
  const line=(x1,y1,x2,y2,weight)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=weight;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.stroke();ink=true;element.dataset.ink='true';};
  const step=dt=>{const px=tip.x,py=tip.y;tip.vx+=((target.x-tip.x)*2600-tip.vx*78)*dt;tip.vy+=((target.y-tip.y)*2600-tip.vy*78)*dt;tip.x+=tip.vx*dt;tip.y+=tip.vy*dt;const speed=Math.hypot(tip.vx,tip.vy);tip.width+=((3.6-2.5*Math.min(1,speed/1800))*pressure-tip.width)*.08;if(Math.hypot(tip.x-px,tip.y-py)>.01)line(px,py,tip.x,tip.y,tip.width);};
  const frame=time=>{let remaining=Math.min(.035,last?(time-last)/1000:1/60);last=time;while(remaining>0){const dt=Math.min(remaining,1/240);step(dt);remaining-=dt;}if(active)raf=win.requestAnimationFrame(frame);else stop();};
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(width,(e.clientX-r.left)*width/r.width)),y:Math.max(0,Math.min(height,(e.clientY-r.top)*height/r.height))};};
  const finish=(captured=true)=>{if(!active)return;stop();for(let i=0;i<80;i++)step(1/240);release(captured);};
  const track=e=>{target=point(e);pressure=e.pointerType==='pen'&&e.pressure>0?.45+e.pressure*.9:1;step(1/240);};
  on(canvas,'pointerdown',e=>{if(locked()||active||e.button!==0)return;e.preventDefault();stop();if(typed.input.value){typed.input.value='';erase();}active=true;activePointer=e.pointerId;target=point(e);tip={...target,vx:0,vy:0,width:2.2};track(e);line(tip.x,tip.y,tip.x+.01,tip.y,tip.width);canvas.setPointerCapture(e.pointerId);raf=win.requestAnimationFrame(frame);});
  on(canvas,'pointermove',e=>{if(!active||e.pointerId!==activePointer)return;for(const sample of e.getCoalescedEvents?.()||[])track(sample);track(e);});
  // A fast pen/touch stroke belongs to this surface. Native pointerup already
  // releases capture. Cancelling the touch pan keeps the next tap actionable.
  canvas.addEventListener('touchmove',e=>{if(e.cancelable)e.preventDefault();},{passive:false,signal:controller.signal});
  on(canvas,'pointerup',e=>{if(e.pointerId===activePointer){track(e);finish(false);}});
  for(const type of ['pointercancel','lostpointercapture'])on(canvas,type,e=>{if(e.pointerId===activePointer)finish(false);});
  on(typed.input,'input',()=>{if(locked())return;finish();erase();const name=typed.input.value.trim();if(name){ctx.fillStyle=color;ctx.font='24px sans-serif';ctx.fillText(name,10,height/2+10,width-20);ink=true;element.dataset.ink='true';}});on(clear,'click',reset);
  let submissionCanvas=null;
  const submission=()=>{
   // evidenceSignatureBinding owns the immutable 360×100 signed-page format.
   // A larger drawing surface must keep its stroke proportions when exported.
   if(width===360&&height===100)return canvas;
   submissionCanvas??=node('canvas');submissionCanvas.width=360;submissionCanvas.height=100;
   const context=submissionCanvas.getContext('2d'),scale=Math.min(360/width,100/height),w=width*scale,h=height*scale;
   context.fillStyle='#fff';context.fillRect(0,0,360,100);
   context.drawImage(canvas,0,0,width,height,(360-w)/2,(100-h)/2,w,h);
   return submissionCanvas;
  };
  const destroy=()=>{stop();controller.abort();canvas.width=canvas.height=0;if(submissionCanvas)submissionCanvas.width=submissionCanvas.height=0;};signal?.addEventListener('abort',destroy,{once:true});
  return {element,reset,destroy,restoreDrawing(paint){if(locked())return;reset();paint(ctx);ink=true;element.dataset.ink='true';},page(){finish();if(!ink)throw Error('자료를 확인한 뒤 서명해 주세요.');return submission();}};
 }
 function receiptPaper(container,item,{signal}={}){
  container.replaceChildren();const printer=node('div',undefined,'wf-printer'),paper=node('article',undefined,'wf-paper');paper.tabIndex=0;paper.setAttribute('aria-label','발급 영수증');paper.append(node('h3','영수증'),node('p',item.number));const list=node('dl');
  for(const [label,value] of [['발급 모델',item.model==='supplier-to-site'?'공급사 → 사업장':'오더 → '+(item.recipient?.kind==='supplier'?'공급사':'사업장')],['받는 곳',item.recipient?.siteId||item.recipient?.orgId],['품목',item.product],['수량',item.quantity],['결제 금액',Number(item.paid).toLocaleString('ko-KR')+'원'],['발급 시각',new Date(item.issuedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})]])list.append(node('dt',label),node('dd',String(value??'—')));
  paper.append(list,node('code',item.documentDigest));printer.append(paper);container.append(printer);let grab=null,animation=animate(paper,[{transform:'translateY(-88%) scaleY(.92)',opacity:0},{offset:.12,opacity:1},{offset:.7,transform:'translateY(5px) scaleY(1.01)',opacity:1},{transform:'none',opacity:1}],{duration:1000,easing:'cubic-bezier(.23,1,.32,1)'});
  const on=(type,fn)=>paper.addEventListener(type,fn,signal?{signal}:undefined);
  on('pointerdown',e=>{if(grab||e.button!==0)return;e.preventDefault();animation?.cancel();grab={id:e.pointerId,x:e.clientX,y:e.clientY};paper.setPointerCapture(e.pointerId);});
  on('pointermove',e=>{if(!grab||e.pointerId!==grab.id)return;const dy=Math.max(0,e.clientY-grab.y),y=90*(1-Math.exp(-dy/150)),angle=Math.max(-8,Math.min(8,(e.clientX-grab.x)/20));paper.style.transform=`translateY(${y}px) rotate(${angle}deg)`;});
  const release=e=>{if(!grab||e.pointerId!==grab.id)return;grab=null;const start=win.getComputedStyle(paper).transform;paper.style.transform='';animation=animate(paper,[{transform:start},{offset:.48,transform:'translateY(-5px) rotate(-1.2deg)'},{offset:.75,transform:'translateY(2px) rotate(.4deg)'},{transform:'none'}],{duration:650,easing:'ease-out'});};for(const type of ['pointerup','pointercancel','lostpointercapture'])on(type,release);signal?.addEventListener('abort',()=>{grab=null;animation?.cancel();},{once:true});
 }
 function mount(root,{screen,state,adapter=win.ORDER_APP_ADAPTER,api={},signal}={}){
  if(instances.has(root))return instances.get(root);
  if(!['receipt','admin-billing'].includes(screen))return {destroy(){},handlesAction(){return false;}};
  const ctl=new win.AbortController(),panel=node('section',undefined,'wf-panel'),status=node('p','','wf-status');status.setAttribute('role','status');
  const target=root.querySelector('.qa-main,.qa-admin-main,.ops-main,.qa-receipt-page,.page')||root;const kept=[...target.childNodes];target.replaceChildren(panel);
  const on=(e,type,fn)=>e.addEventListener(type,fn,{signal:ctl.signal});const tell=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
  let running=false;
  async function run(b,task,labels={}){
   if(running||b.disabled)return null;running=true;delete b.dataset.success;
   const original=b.dataset.label||b.textContent;b.textContent=original;
   const controls=[...panel.querySelectorAll('button,input,select,textarea')].map(element=>[element,element.disabled]);for(const [element] of controls)element.disabled=true;
   if(!api.motion){b.setAttribute('aria-busy','true');b.textContent='◌ '+(labels.pending||'처리 중');}
   try{const result=api.motion?await api.motion.run(b,({signal:own})=>task(win.AbortSignal.any?win.AbortSignal.any([own,ctl.signal]):ctl.signal),{labels}):await task(ctl.signal);if(ctl.signal.aborted)return null;if(!api.motion){b.textContent='✓ '+(labels.success||'완료');b.dataset.success='true';}return result;}
   catch(e){if(!ctl.signal.aborted){tell(adapter?.message?.(e)||e.message,true);if(!api.motion)b.textContent=original;}return null;}
   finally{running=false;if(!ctl.signal.aborted){for(const [element,disabled] of controls)element.disabled=disabled;if(!api.motion)b.setAttribute('aria-busy','false');}}
  }
  const request=(path,body=null,signal=ctl.signal)=>{if(!adapter)throw Error('업무 연결을 확인해 주세요.');return adapter.request(path,body,signal);};
  const result={destroy(){ctl.abort();if(panel.parentNode===target)target.replaceChildren(...kept);instances.delete(root);},handlesAction:a=>['issue-receipt','retry-receipt','save-receipt','submit-billing','new-billing','billing-back','clear-amount'].includes(a)};instances.set(root,result);signal?.addEventListener('abort',result.destroy,{once:true});
  if(screen==='receipt'){
   panel.append(node('h2','영수증 발급'),node('p','결제 내역을 선택해 영수증을 발급하고, 같은 발급번호로 다시 열 수 있어요.'));
   const form=node('div',undefined,'wf-form'),purchase=field('결제 내역','select'),model=field('발급 주체','select'),recipient=field('받는 곳','select'),issue=button('영수증 발급',true),printed=node('div'),saved=field('발급한 영수증','select'),reopen=button('다시 열기'),print=button('인쇄');let items=[],issued=[],pending=null;
   issue.disabled=true;reopen.disabled=true;print.disabled=true;
   function choose(){model.input.replaceChildren();const item=items.find(p=>p.id===purchase.input.value);for(const value of item?.models||[]){const option=node('option',value==='supplier-to-site'?'공급사 → 사업장':'오더 → 공급사·사업장');option.value=value;model.input.append(option);}chooseRecipient();}
   function chooseRecipient(){recipient.input.replaceChildren();for(const value of model.input.value==='supplier-to-site'?['site']:['site','supplier']){const option=node('option',value==='site'?'사업장':'공급사');option.value=value;recipient.input.append(option);}pending=null;issue.disabled=!model.input.value;}
   const show=item=>{receiptPaper(printed,item,{signal:ctl.signal});print.disabled=false;tell('발급번호 '+item.number+' · 발급 내용을 저장했어요.');};
   async function loadSaved(){const data=await request('/receipts');if(ctl.signal.aborted)return;issued=data.items||[];saved.input.replaceChildren();for(const item of issued){const option=node('option',item.number);option.value=item.id;saved.input.append(option);}reopen.disabled=!issued.length;}
   on(purchase.input,'change',choose);on(model.input,'change',chooseRecipient);on(recipient.input,'change',()=>pending=null);
   on(issue,'click',async()=>{pending??={action:'issue',purchaseId:purchase.input.value,model:model.input.value,recipient:recipient.input.value,expectedRevision:0,requestKey:win.crypto.randomUUID()};const command={...pending};const result=await run(issue,signal=>request('/receipts',command,signal),{pending:'발급 중',success:'발급 완료',error:'발급 실패'});if(result){show(result.item);pending=null;await loadSaved().catch(()=>{});}});
   on(reopen,'click',async()=>{const result=await run(reopen,signal=>request('/receipts/'+saved.input.value,null,signal),{pending:'불러오는 중',success:'불러왔어요'});if(result)show(result.item);});on(print,'click',()=>win.print());
   form.append(purchase.wrap,model.wrap,recipient.wrap,issue);const actions=node('div',undefined,'wf-actions');actions.append(reopen,print);panel.append(form,status,printed,saved.wrap,actions);
   Promise.all([request('/receipt-options'),loadSaved()]).then(([data])=>{if(ctl.signal.aborted)return;items=data.items||[];purchase.input.replaceChildren();for(const p of items){const option=node('option',(p.product||p.id)+' · '+Number(p.paid).toLocaleString('ko-KR')+'원');option.value=p.id;purchase.input.append(option);}choose();if(!items.length)tell('발급할 결제 완료 내역이 없어요.');}).catch(e=>tell(adapter.message(e),true));
  }else{
   panel.append(node('h2','별도 청구'),node('p','청구할 계정과 금액을 확인하고 청구서를 발급해 주세요.'));
   const form=node('div',undefined,'wf-form'),account=field('청구 계정','select'),subject=field('청구 내용'),amount=field('금액 직접 입력'),display=node('div',undefined,'wf-amount'),keys=node('div',undefined,'wf-number-pad'),memo=field('메모 · 선택','textarea'),due=field('납부 기한','date'),draft=button('임시 저장'),issue=button('청구서 발급',true),saved=field('저장한 청구서','select'),open=button('불러오기'),fresh=button('새 청구');let accounts=[],record={id:win.crypto.randomUUID(),revision:0},pending=null,documents=[];
   subject.input.maxLength=160;amount.input.inputMode='numeric';amount.input.maxLength=9;memo.input.maxLength=2000;due.input.value=new Date(Date.now()+9*3600000+7*86400000).toISOString().slice(0,10);amountDigits(display,'');display.setAttribute('aria-hidden','true');
   const changed=()=>{pending=null;delete draft.dataset.success;delete issue.dataset.success;draft.textContent='임시 저장';issue.textContent='청구서 발급';};
   on(amount.input,'input',()=>{amount.input.value=amount.input.value.replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,9);amountDigits(display,amount.input.value);changed();});
   for(const value of ['1','2','3','4','5','6','7','8','9','초기화','0','삭제']){const b=button(value);on(b,'click',()=>{amount.input.value=value==='초기화'?'':value==='삭제'?amount.input.value.slice(0,-1):(amount.input.value+value).slice(0,9);amount.input.dispatchEvent(new win.Event('input',{bubbles:true}));});keys.append(b);}
   for(const input of [account.input,subject.input,memo.input,due.input])on(input,'input',changed);
   function payload(action){const target=accounts[Number(account.input.value)];if(!target||!Number(amount.input.value)||!subject.input.value.trim()||!due.input.value){for(const input of [account.input,subject.input,amount.input,due.input])input.setAttribute('aria-invalid',String(!input.value));tell('청구 계정, 내용, 금액과 납부 기한을 확인해 주세요.',true);return null;}return {action,id:record.id,expectedRevision:record.revision,accountId:target.id,issuerOrgId:target.issuerOrgId,amount:Number(amount.input.value),subject:subject.input.value,memo:memo.input.value,dueDate:due.input.value};}
   async function list(){const data=await request('/billing');if(ctl.signal.aborted)return;documents=data.items||[];saved.input.replaceChildren();for(const item of documents){const option=node('option',(item.status==='ISSUED'?item.number:'임시 저장')+' · '+item.subject);option.value=item.id;saved.input.append(option);}open.disabled=!documents.length;}
   async function save(action,b){if(running||b.disabled)return;const data=payload(action);if(!data)return;if(!pending||pending.action!==action)pending={...data,requestKey:win.crypto.randomUUID()};const command={...pending};const result=await run(b,signal=>request('/billing',command,signal),{pending:action==='issue'?'발급 중':'저장 중',success:action==='issue'?'발급 완료':'저장 완료',error:'다시 시도해 주세요'});if(!result)return;record=result.item;pending=null;tell(record.status==='ISSUED'?'청구번호 '+record.number+' · 청구서를 발급했어요. 발송과 결제는 아직 진행하지 않았어요.':'임시 저장했어요.');if(record.status==='ISSUED')for(const e of [...form.querySelectorAll('input,select,textarea,button')])e.disabled=true;await list().catch(()=>{});}
   on(draft,'click',()=>save('draft',draft));on(issue,'click',()=>save('issue',issue));on(open,'click',()=>{const item=documents.find(i=>i.id===saved.input.value);if(!item)return;record=item;pending=null;account.input.value=String(accounts.findIndex(a=>a.id===item.accountId&&a.issuerOrgId===item.issuer.orgId));subject.input.value=item.subject;amount.input.value=String(item.amount);amountDigits(display,item.amount);memo.input.value=item.memo||'';due.input.value=item.dueDate;for(const e of form.querySelectorAll('input,select,textarea,button'))e.disabled=item.status==='ISSUED';tell(item.status==='ISSUED'?'발급된 청구서는 내용을 변경할 수 없어요. 새 청구를 만들 수 있습니다.':'임시 저장한 내용을 불러왔어요.');});
   on(fresh,'click',()=>{record={id:win.crypto.randomUUID(),revision:0};pending=null;subject.input.value='';amount.input.value='';amountDigits(display,'');memo.input.value='';for(const e of form.querySelectorAll('input,select,textarea,button'))e.disabled=false;changed();tell('');});
   const actions=node('div',undefined,'wf-actions');actions.append(draft,issue);form.append(account.wrap,subject.wrap,display,amount.wrap,keys,due.wrap,memo.wrap,actions);const savedActions=node('div',undefined,'wf-actions');savedActions.append(open,fresh);panel.append(form,status,saved.wrap,savedActions);
   Promise.all([request('/billing/accounts'),list()]).then(([data])=>{if(ctl.signal.aborted)return;accounts=data.accounts||[];account.input.replaceChildren();accounts.forEach((a,i)=>{const o=node('option',a.label+' · '+a.issuerOrgId);o.value=String(i);account.input.append(o);});if(!accounts.length){issue.disabled=draft.disabled=true;tell('청구 가능한 거래 계정이 없어요.');}}).catch(e=>tell(adapter.message(e),true));
  }
  return result;
 }
 function mountEvidence(root,{api={},kind='reprice',caseRecord,signal,initialFiles=[]}={}){
  const adapter=api.adapter||win.ORDER_APP_ADAPTER,ctl=new win.AbortController(),panel=node('section',undefined,'wf-panel'),status=node('p','','wf-status'),select=field('신청 내역','select'),start=button('자료와 서명 준비',true),editor=node('div');status.setAttribute('role','status');panel.append(node('h2',kind==='business'?'사업자등록증 제출':'거래내역 증빙과 서명'));const memo=field('추가 요청 · 선택','textarea'),meter=node('progress'),remaining=node('output','500자 남음');memo.input.name='document-memo';meter.max=500;meter.value=0;meter.setAttribute('aria-label','추가 요청 글자 수');remaining.setAttribute('aria-live','polite');const memoMeter=node('div',undefined,'memo-meter');memoMeter.append(meter,remaining);
  const memoSegmenter=typeof win.Intl.Segmenter==='function'?new win.Intl.Segmenter('ko',{granularity:'grapheme'}):null;
  const countMemo=()=>{
   const text=memo.input.value;
   let count=0,end=0;
   for(const item of memoSegmenter?memoSegmenter.segment(text):text){
    const grapheme=memoSegmenter?item.segment:item;
    if(!/^\s+$/u.test(grapheme)){
     if(count===500)break;
     count++;
    }
    end+=grapheme.length;
   }
   if(end<text.length)memo.input.value=text.slice(0,end);
   meter.value=count;
   remaining.textContent=(500-count)+'자 남음';
  };
  memo.input.addEventListener('input',e=>{if(!e.isComposing)countMemo();},{signal:ctl.signal});memo.input.addEventListener('compositionend',countMemo,{signal:ctl.signal});
  if(kind==='reprice'){const purpose=node('section',undefined,'proof-purpose');purpose.append(node('h3','거래내역 증빙 시 주의사항'));const list=node('ul');for(const text of ['직전 1개월 정산서에서 가격과 수량, 거래일이 보이도록 올려주세요.','사업장을 제외한 제3자의 개인정보는 가려주세요.','보완을 위해 최근 3개월 내 자료를 추가로 요청할 수 있어요.','제출할 자료는 확인 용도로만 사용해요.'])list.append(node('li',text));purpose.append(list);panel.append(purpose,memo.wrap,memoMeter);}panel.append(select.wrap,start,status,editor);root.replaceChildren(panel);let current=caseRecord,items=[],disposeEditor;
  const say=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
  const open=async()=>{if(!current)current=items.find(c=>c.id===select.input.value);if(!current)return say('신청 내역을 선택해 주세요.',true);try{
   if(kind==='business'&&current.state==='DRAFT')current=await adapter.workflows.transition(current,'manual',{},ctl.signal);
   if(!win.ORDER_EVIDENCE_EDITOR)throw Error('증빙 편집기를 불러오지 못했어요.');disposeEditor?.();editor.replaceChildren();const options=await adapter.workflows.evidenceOptions();if(ctl.signal.aborted)return;
   const openedCase=current,readOnly=!['DRAFT','NEEDS_INFO','EVIDENCE_REQUIRED'].includes(current.state);
   panel.dataset.evidenceReadOnly=String(readOnly);
   panel.dataset.evidenceBusiness=openedCase.context?.businessName||'';
   if(!panel.dataset.evidenceBusiness&&kind==='reprice'&&adapter.roleRequest)adapter.roleRequest('/workspace',null,ctl.signal).then(workspace=>{
    if(ctl.signal.aborted||current!==openedCase)return;
    const business=workspace.businesses?.find(site=>site.org_id===openedCase.org_id&&site.site_id===openedCase.site_id);
    if(business?.businessName)panel.dataset.evidenceBusiness=business.businessName;
   }).catch(()=>{});
   disposeEditor=win.ORDER_EVIDENCE_EDITOR({container:editor,caseId:current.id,kind,...options,motion:api.motion,initialFiles,evidenceId:current.evidenceId,readOnly,onError:message=>say(message,true),onReceipt:async(evidenceId,b)=>{
    const save=async()=>{current=await adapter.workflows.transition(current,'attach',{evidenceId,...(kind==='reprice'&&memo.input.value.trim()?{context:{memo:memo.input.value}}:{})},ctl.signal);return current;};try{await save();say('자료와 서명을 접수했어요. 신청번호 '+current.id+' · 검토 중');panel.dataset.success='true';return true;}catch(e){say(adapter.message(e),true);return false;}
   }});say('자료를 확인하고 개인정보를 가린 뒤 제출해 주세요.');
  }catch(e){say(adapter?.message?.(e)||e.message,true);}};
  start.addEventListener('click',open,{signal:ctl.signal});select.input.addEventListener('change',()=>{current=null;},{signal:ctl.signal});
  if(current){select.wrap.hidden=true;open();}else adapter.workflows.list({signal:ctl.signal}).then(data=>{if(ctl.signal.aborted)return;items=(data.cases||[]).filter(c=>c.kind===kind);for(const item of items){const option=node('option',item.id+' · '+item.state);option.value=item.id;select.input.append(option);}if(!items.length){start.disabled=true;say('제출할 신청 내역이 없어요. 발급 견적에서 증빙 제출을 시작해 주세요.');const go=button('내 견적·신청 내역');go.onclick=()=>api.select?.('role-case',kind);panel.append(go);}}).catch(e=>say(adapter.message(e),true));
  const destroy=()=>{ctl.abort();disposeEditor?.();memo.input.value='';};signal?.addEventListener('abort',destroy,{once:true});return {destroy};
 }
 function mountBusiness(root,{api={},signal}={}){
  const adapter=api.adapter||win.ORDER_APP_ADAPTER,ctl=new win.AbortController(),verify=root.querySelector('[data-action=verify-business]'),next=root.querySelector('[data-action=business-next]'),result=node('p','','wf-status');result.setAttribute('role','status');verify?.after(result);let busy=false,record=null,pending=null,verified=false,manualAllowed=false;
  const say=(value,error=false)=>{result.textContent=value;result.dataset.error=String(error);};
  const invalidate=()=>{verified=false;manualAllowed=false;record=null;pending=null;delete root.dataset.businessVerificationId;result.textContent='';result.classList.remove('wf-business-result');delete result.dataset.success;root.querySelector('.verification-mark')?.remove();};
  for(const input of root.querySelectorAll('.business-fields input'))input.addEventListener('input',invalidate,{signal:ctl.signal});root.querySelector('.opening-date output')?.addEventListener('change',invalidate,{signal:ctl.signal});
  verify?.addEventListener('click',async e=>{e.preventDefault();if(busy)return;const get=name=>root.querySelector('[name="'+name+'"]')?.value.trim()||'',date=root.querySelector('.opening-date output')?.textContent.replaceAll('/','-');const input={number:get('business-number').replace(/\D/g,''),name:get('business-name'),owner:get('owner-name'),industry:get('business-sector'),trade:get('business-type'),openingDate:date};if(input.number.length!==10||!input.name||!input.owner||!input.industry||!input.trade||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){say('필수 사업자 정보를 모두 확인해 주세요.',true);return;}
   busy=true;const lockedControls=[...root.querySelectorAll('input,button,select,textarea')].map(element=>[element,element.disabled]);for(const [element] of lockedControls)element.disabled=true;if(!api.motion)verify.setAttribute('aria-busy','true');try{const task=async({signal:requestSignal=ctl.signal}={})=>{record=await adapter.workflows.createBusiness(input,{signal:requestSignal});pending??={action:'verify',caseId:record.id,...input,openingDate:input.openingDate.replaceAll('-',''),requestKey:win.crypto.randomUUID(),expectedRevision:0};const data=await adapter.request('/business-verifications',pending,requestSignal);if(!data.item?.verified)throw Object.assign(Error('BUSINESS_INFORMATION_MISMATCH'),{userMessage:'국세청 등록 정보와 일치하지 않거나 계속사업자가 아니에요. 입력 내용을 확인해 주세요.'});return data;};const data=api.motion?await api.motion.run(verify,task,{labels:{pending:'조회 중',success:'정보 일치',error:'확인 필요'}}):await task();if(!ctl.signal.aborted){verified=true;result.classList.add('wf-business-result');result.dataset.success='true';say(adapter.fixture?'검토용 인증 결과예요. 실제 국세청 조회가 아니며 등록증 제출 동작을 계속 확인할 수 있어요.':'국세청 등록 정보와 일치해요. 사업자등록증도 제출해 주세요.');root.dataset.businessVerificationId=data.item.id;}}
   catch(e){manualAllowed=Boolean(record)&&['BUSINESS_PROVIDER_UNAVAILABLE','BUSINESS_PROVIDER_RESPONSE_INVALID','BUSINESS_INFORMATION_MISMATCH'].includes(e.message);if(!ctl.signal.aborted)say(adapter?.message?.(e)||e.message,true);}finally{busy=false;if(!ctl.signal.aborted){for(const [element,disabled] of lockedControls)element.disabled=disabled;if(!api.motion)verify.setAttribute('aria-busy','false');}}
  },{signal:ctl.signal});
  next?.addEventListener('click',async e=>{e.preventDefault();if(busy)return;if(!record)return say('사업자 정보를 먼저 입력하고 인증하기를 눌러 주세요.',true);if(!verified&&!manualAllowed)return say('사업자 정보를 확인해 주세요.',true);mountEvidence(root,{api,kind:'business',caseRecord:record,signal:ctl.signal,initialFiles:root.__orderSelectedFiles||[]});},{signal:ctl.signal});
  const destroy=()=>ctl.abort();signal?.addEventListener('abort',destroy,{once:true});return {destroy};
 }
 const contract={mount,mountEvidence,mountBusiness,signaturePad,amountDigits,receiptPaper};win.ORDER_WORKFLOW_MOTION=contract;return contract;
}
