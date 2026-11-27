/** Presentation for the existing business/evidence contracts. The original
 * editor owns rasterization, masking, signature hashes, retries and disposal. */
export const researchWorkflowPolishCss=String.raw`
.research-workflow .wf-panel{border:0;padding:0;margin:16px auto}.research-workflow .wf-panel>h2{margin-bottom:24px}
.research-workflow .wf-panel.research-evidence-page{box-sizing:border-box;max-width:520px;width:100%;margin:0 auto;padding:24px;min-width:0;background:transparent;border-radius:0}.research-evidence-page>h2{font-size:28px;line-height:1.35;letter-spacing:-.7px;margin:8px 0 24px;font-weight:700}.research-evidence-page>.proof-purpose{padding:16px 18px;background:var(--surface,#f7f8fa);border-radius:16px;margin-bottom:24px}.research-evidence-page>.proof-purpose h3{font-size:15px;line-height:1.5;margin:0 0 8px}.research-evidence-page>.proof-purpose ul{padding-inline-start:18px;margin:0;font-size:14px;line-height:1.65}.research-evidence-page>.wf-field{margin:0 0 12px}.research-evidence-page .memo-meter{display:flex;gap:12px;align-items:center;justify-content:flex-end;margin:6px 0 24px;font-size:12px;color:var(--muted,#6b7684);font-variant-numeric:tabular-nums}.research-evidence-page .memo-meter progress{accent-color:var(--blue,#315de6);height:6px;width:80px}.research-evidence-page .memo-meter output{white-space:nowrap}.research-evidence-page>.wf-status{font-size:13px;color:var(--muted,#6b7684);margin:12px 0;overflow-wrap:anywhere}.research-evidence-page>.wf-status:empty{display:none}.research-evidence-page>.wf-button{width:100%;min-height:52px;margin:8px 0}
.research-evidence-settings{border:0;padding:0;margin:0;display:grid;gap:20px;min-width:0}.research-evidence-settings>legend{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.research-evidence-settings>p{font-size:13px;line-height:1.65;margin:0;color:var(--muted,#6b7684)}.research-evidence-settings>.research-evidence-pages{margin:0}.research-evidence-settings>label:not(.research-file-drop):not(.wf-field){display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.6}.research-evidence-settings>label>input[type=checkbox]{flex:none;width:18px;height:18px;margin:2px 0;accent-color:var(--blue,#315de6)}.research-evidence-settings>button{min-height:52px;border:0;border-radius:14px;padding:12px 20px;background:var(--blue,#315de6);color:white;font:inherit;font-size:15px;font-weight:600;line-height:1.4}.research-evidence-settings>button:disabled{opacity:.5}.research-evidence-settings>.wf-signature{border:0;padding:0;margin:4px 0}.research-evidence-settings>.wf-signature>legend{font-size:16px;font-weight:650;padding:0 0 10px}.research-evidence-settings .wf-signature>.wf-field,.research-evidence-settings .wf-signature>button.btn{margin-top:12px}.research-evidence-settings .wf-signature canvas{box-sizing:border-box;display:block;max-width:100%;border-radius:16px;background:var(--surface,#f7f8fa)}.research-file-drop .research-file-input{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%)}.research-file-drop:focus-within{outline:2px solid var(--blue,#315de6);outline-offset:3px}.research-file-drop>strong{font-size:16px;line-height:1.5}.research-workflow .business-message.info>span{white-space:pre-line}.research-workflow .opening-date>button{min-height:64px;font-size:15px;font-weight:400;line-height:24px;color:var(--muted,#6b7684)}.research-workflow .opening-date>button output{color:inherit;font:inherit}.research-business-number-mask{position:absolute;inset:0;box-sizing:border-box;pointer-events:none;white-space:pre;color:var(--muted,#8b95a1);overflow:hidden}.research-business-number-mask>[data-entered]{visibility:hidden}.research-workflow input[name=business-number]{font-variant-numeric:tabular-nums}
.research-workflow .wf-business-result{display:flex;align-items:center;gap:10px}.research-business-verified{display:flex;align-items:center;gap:12px;color:#18845a}.research-business-verified svg{width:32px;height:32px;flex:none}.research-business-manual{padding:18px;border-radius:16px;background:#f2f5fa;line-height:1.6}.research-business-manual p{margin:8px 0 0}
.research-workflow .research-field-error{display:flex;align-items:center;gap:6px;margin:8px 0;color:#b52e43;font-size:13px}.research-field-error svg{width:18px;height:18px;flex:none}.research-workflow .wf-signature[aria-invalid=true]{outline:none;border-color:#cfd5df;box-shadow:none}.research-workflow .wf-signature.is-shaking{animation:research-workflow-shake 280ms both}.research-workflow [data-workflow-invalid].is-shaking{animation:research-workflow-shake 280ms both}
@keyframes research-workflow-shake{0%,100%{transform:translateX(0);animation-timing-function:cubic-bezier(.22,1,.36,1)}28.57%{transform:translateX(6px);animation-timing-function:cubic-bezier(.22,1,.36,1)}57.14%{transform:translateX(-6px);animation-timing-function:cubic-bezier(.22,1,.36,1)}78.57%{transform:translateX(4px);animation-timing-function:cubic-bezier(.22,1,.36,1)}}
.research-file-drop{display:grid;gap:10px;padding:20px;border:1px dashed #b5bdcb;border-radius:18px;text-align:center;background:#fafbfc;cursor:pointer}.research-file-drop>svg{width:34px;height:34px;margin:auto;color:#365585;background:none}.research-file-drop input{max-width:100%;font:inherit}.research-file-drop[data-drag=true]{border-color:#355bba;background:#eef3ff}.research-file-drop small{font-weight:400;color:#6a7484}.research-file-drop .research-drop-desktop{display:none}@media(pointer:fine) and (hover:hover){.research-file-drop .research-drop-desktop{display:block}}
.research-evidence-pages{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.research-evidence-pages>section{width:150px;padding:12px;border:1px solid #e4e8ef;border-radius:14px;background:#fff}.research-evidence-pages h3{font-size:14px;margin:0 0 8px}.research-evidence-pages canvas{width:100%;max-height:160px;object-fit:contain;cursor:zoom-in}.research-evidence-pages details{display:none}.research-evidence-pages button{margin-top:8px;font:inherit;font-size:13px}
.research-evidence-pages:empty{display:none}.research-evidence-page .research-workflow-receipt{min-height:min(65svh,600px);align-content:center}
.ds .research-workflow .wf-panel.research-evidence-page{max-width:520px;min-height:calc(100svh - 78px);display:flex;flex-direction:column;gap:0}
.ds .research-workflow .wf-panel.research-evidence-page>h2{font-size:28px;line-height:1.35;letter-spacing:-.7px;margin:8px 0 24px;font-weight:700}
.research-evidence-editor{display:flex;flex:1;flex-direction:column;min-height:0}.research-evidence-editor>.research-evidence-settings{display:flex;flex:1;flex-direction:column;gap:20px}
.research-evidence-page .wf-status[data-error=false]{display:none}.ds .research-workflow .research-evidence-settings>.wf-field{margin:0;min-width:0}.research-evidence-settings>.memo-meter{margin:-14px 0 0}
.research-evidence-settings>button[data-evidence-submit],.research-evidence-settings>button.research-proof-next{margin-top:auto;width:100%}
.research-evidence-settings>.research-signature-gallery-label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 -12px}.research-signature-gallery-label h3{margin:0;font-size:16px;font-weight:650}.research-signature-gallery-label .btn{padding-inline:0}
.research-evidence-settings>.wf-signature.research-signature{display:grid;gap:8px;border:0;padding:0;margin:2px 0 0}.research-signature>legend{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%)}
.ds .research-workflow .research-signature>.signature-label{margin:0;display:flex;align-items:center;justify-content:space-between;gap:12px}.research-signature .signature-label h3{margin:0;font-size:16px;font-weight:650}.research-signature .signature-label>.btn{margin:0;padding-inline:0}
.research-signature-pad{position:relative;height:190px;border-radius:16px;background:#f2f4f6;overflow:hidden}.research-evidence-settings .research-signature-pad canvas{width:100%;height:190px;max-width:100%;border:0;border-radius:16px;background:#f2f4f6}.research-signature-pad>.wf-sign-placeholder{inset:0;display:grid;place-items:center;font-size:14px;text-align:center}
.research-signature-alternative{font-size:13px;color:var(--muted,#6b7684)}.research-signature-alternative>summary{cursor:pointer;min-height:32px;display:flex;align-items:center}.research-signature-alternative>.wf-field{margin-top:8px;color:var(--ink,#20272a)}
.signature-page .research-evidence-pages{gap:8px}.signature-page .research-evidence-pages>section{width:108px;padding:8px;border:0;border-radius:10px;background:var(--surface,#f2f4f6)}.signature-page .research-evidence-pages h3{font-size:12px;margin:0 0 6px}.signature-page .research-evidence-pages canvas{max-height:92px}
.research-evidence-page .research-workflow-receipt{flex:1;min-height:0;width:100%;box-sizing:border-box}
.research-evidence-page [hidden],.research-workflow .document-section[hidden],.research-workflow .business-fields[hidden],.research-business-number-mask[hidden]{display:none!important}
.research-evidence-viewer{box-sizing:border-box;width:min(920px,calc(100vw - 24px));max-height:calc(100dvh - 32px);border:1px solid #d9e0eb;border-radius:22px;padding:20px;background:white;color:#202b3c}.research-evidence-viewer::backdrop{background:#14233b70}.research-evidence-viewer .research-viewer-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}.research-evidence-viewer output{margin-right:auto}.research-evidence-viewer button{font:inherit;min-height:40px;border:1px solid #d6dce5;border-radius:12px;background:#f5f7fa;padding:8px 12px}.research-evidence-viewport{max-height:65dvh;overflow:auto;touch-action:pan-y}.research-evidence-viewport canvas{max-width:none!important;width:100%;height:auto!important;border:0!important}.research-evidence-viewport[data-zoom=true] canvas{width:180%}.research-evidence-viewer details{margin-top:16px}.research-evidence-viewer details input{max-width:80px;margin:8px}.research-evidence-viewer[data-editing=true] canvas{cursor:crosshair}
.research-workflow-receipt{text-align:center;display:grid;justify-items:center;gap:14px;padding:40px 20px}.research-workflow-receipt>svg{width:64px;height:64px;color:#218257}.research-workflow-receipt>p{margin:0;max-width:30em;line-height:1.6}.research-workflow-receipt .wf-status{font-size:13px;color:#6a7484}.research-business-verified svg{animation:research-workflow-check 400ms cubic-bezier(.22,1,.36,1)}@keyframes research-workflow-check{from{opacity:0;transform:translateY(12px) scale(.85)}to{opacity:1;transform:none}}
.research-evidence-viewer.t-modal{--modal-scale:.96;--modal-close-scale:.98;transform:scale(var(--modal-scale));opacity:0;pointer-events:none;transition:transform 250ms cubic-bezier(.22,1,.36,1),opacity 250ms cubic-bezier(.22,1,.36,1)}.research-evidence-viewer.t-modal.is-open{transform:scale(1);opacity:1;pointer-events:auto}.research-evidence-viewer.t-modal.is-closing{transform:scale(var(--modal-close-scale));opacity:0;pointer-events:none;transition-duration:150ms}
@media(prefers-reduced-motion:reduce){.research-workflow .is-shaking,.research-business-verified svg{animation:none!important}.research-evidence-viewer.t-modal{transition:none!important}}
`;

export function installResearchWorkflowPolish(win=window,{loadBusinessClasses:readClasses}={}){
  if(win.ORDER_RESEARCH_WORKFLOW_POLISH)return win.ORDER_RESEARCH_WORKFLOW_POLISH;
  const doc=win.document,workflow=win.ORDER_WORKFLOW_MOTION,editor=win.ORDER_EVIDENCE_EDITOR;
  if(!workflow||typeof editor!=='function'||typeof win.QAUI?.icon!=='function'||typeof win.QAUI?.field!=='function')throw Error('RESEARCH_WORKFLOW_DEPENDENCY_MISSING');
  const originals={mountBusiness:workflow.mountBusiness,mountEvidence:workflow.mountEvidence,signaturePad:workflow.signaturePad},active=new Set(),signaturePads=new WeakMap();
  const businessClasses={sectors:[],industries:[],rows:[]};let classesPromise;
  function loadBusinessClasses(){
    if(classesPromise)return classesPromise;
    classesPromise=(async()=>{
      let data;if(readClasses)data=await readClasses();else{
        const response=await win.fetch('/vendor/research/nts-industry-2025-edfa839b2a2d90fc.json',{credentials:'omit',cache:'force-cache'});if(!response.ok)throw Error('BUSINESS_CLASSIFICATION_UNAVAILABLE');
        const bytes=await response.arrayBuffer();if(bytes.byteLength>131072)throw Error('BUSINESS_CLASSIFICATION_INVALID');const hash=Array.from(new Uint8Array(await win.crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(hash!=='edfa839b2a2d90fc279aea102b447beccf1623dd04a440aaa3fa5381303fc1b4')throw Error('BUSINESS_CLASSIFICATION_INVALID');data=JSON.parse(new win.TextDecoder().decode(bytes));
      }
      if(data.format!=='order-business-classification/v1'||data.rows?.length!==1542||data.rows.some(row=>row.length!==3||!/^\d{6}$/.test(row[0])||row.slice(1).some(value=>typeof value!=='string'||!value)))throw Error('BUSINESS_CLASSIFICATION_INVALID');
      const sectors=['숙박 및 음식점업','도매 및 소매업','제조업','농업, 임업 및 어업'];
      const industryRank=value=>/제과점업/.test(value)?0:/한식 일반 음식점업/.test(value)?1:/빵류 제조업/.test(value)?2:/달걀|계란|조란|기타 비가공 식품 도매/.test(value)?3:/음식점|식료품|급식|빵류/.test(value)?4:5;
      businessClasses.rows=data.rows;businessClasses.sectors.splice(0,businessClasses.sectors.length,...[...new Set(data.rows.map(row=>row[1]))].sort((a,b)=>(sectors.indexOf(a)<0?sectors.length:sectors.indexOf(a))-(sectors.indexOf(b)<0?sectors.length:sectors.indexOf(b))));businessClasses.industries.splice(0,businessClasses.industries.length,...[...new Set(data.rows.map(row=>row[2]))].sort((a,b)=>industryRank(a)-industryRank(b)));return businessClasses;
    })().catch(error=>{classesPromise=null;throw error;});return classesPromise;
  }
  const style=doc.createElement('style');style.dataset.researchWorkflowPolish='';style.textContent=researchWorkflowPolishCss;doc.head.append(style);
  const el=(tag,text,className)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const icon=(type)=>{if(type==='alert'){const holder=doc.createElement('span');holder.innerHTML=win.QAUI.icon('alert',18);return holder.firstElementChild;}const n=doc.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('fill','none');n.setAttribute('stroke','currentColor');n.setAttribute('stroke-width','1.8');n.setAttribute('aria-hidden','true');n.innerHTML=type==='upload'?'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>':'<circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/>';return n;};
  const lifecycle=(signal)=>{const controller=new win.AbortController();let done=false;const work=[];const dispose=()=>{if(done)return;done=true;controller.abort();signal?.removeEventListener('abort',dispose);for(const fn of work.reverse())fn();active.delete(dispose);};active.add(dispose);signal?.addEventListener('abort',dispose,{once:true});if(signal?.aborted)dispose();return {signal:controller.signal,add:fn=>work.push(fn),dispose};};
  function error(field,message){
    if(!field)return;const target=field.closest('.wf-signature,.field')||field.parentElement;
    let note=target.querySelector('[data-workflow-error]');if(!note){note=el('p',undefined,'research-field-error');note.dataset.workflowError='';note.setAttribute('role','alert');target.append(note);}
    note.replaceChildren(icon('alert'),doc.createTextNode(message));field.setAttribute('aria-invalid','true');target.dataset.workflowInvalid='';target.classList.remove('is-shaking');void target.offsetWidth;target.classList.add('is-shaking');
  }
  function clearError(field){field.removeAttribute('aria-invalid');const target=field.closest('.wf-signature,.field')||field.parentElement;target.querySelector('[data-workflow-error]')?.remove();target.classList.remove('is-shaking');delete target.dataset.workflowInvalid;}
  function restoreMemoField(input){
    const wrap=input?.closest('.wf-field');if(!wrap||wrap.classList.contains('field'))return;
    // The shared field owns presentation; the original textarea keeps its
    // grapheme counter, draft value, composition listeners and submit closure.
    const template=doc.createElement('template');template.innerHTML=win.QAUI.field('추가 요청 · 선택','document-memo','추가 요청',{multiline:true,rows:3});
    const shared=template.content.firstElementChild,control=shared.querySelector('textarea'),caption=wrap.querySelector(':scope > span'),label=shared.querySelector('.sr-only[id]'),message=shared.querySelector('[data-field-message]');
    if(caption){caption.className=label.className;label.replaceWith(caption);}else label.id=input.id+'-label';
    message.id=input.id+'-message';input.setAttribute('aria-labelledby',caption?.id||label.id);input.setAttribute('aria-describedby',message.id);input.setAttribute('aria-invalid','false');input.placeholder=control.placeholder;input.autocomplete=control.autocomplete;input.rows=control.rows;
    control.replaceWith(input);wrap.className=shared.className+' wf-field';wrap.replaceChildren(...shared.childNodes);win.QAUI.syncField(input);
  }
  workflow.signaturePad=function(options){
    const pad=originals.signaturePad.call(this,{...options,width:342,height:190,background:'#f2f4f6'}),page=pad.page,life=lifecycle(options?.signal),element=pad.element;
    element.classList.add('research-signature');
    const canvas=element.querySelector('canvas'),placeholder=element.querySelector('.wf-sign-placeholder'),typed=element.querySelector('.wf-field'),clear=element.querySelector('button'),head=el('div',undefined,'signature-label row between'),box=el('div',undefined,'research-signature-pad'),alternative=el('details',undefined,'research-signature-alternative');
    clear.className='btn text';head.append(el('h3','서명'),clear);box.append(canvas,placeholder);alternative.append(el('summary','이름으로 서명'),typed);element.append(head,box,alternative);
    signaturePads.set(element,pad);element.addEventListener('input',()=>clearError(element),{signal:life.signal});canvas.addEventListener('pointerup',()=>{if(element.dataset.ink==='true')clearError(element);},{signal:life.signal});clear.addEventListener('click',()=>clearError(element),{signal:life.signal});
    pad.page=()=>{try{return page.call(pad);}catch(e){error(element,e.message);throw e;}};
    const destroy=pad.destroy;pad.destroy=()=>{signaturePads.delete(element);life.dispose();destroy.call(pad);};return pad;
  };
  workflow.mountBusiness=function(root,options={}){
    root.classList.add('research-workflow');const life=lifecycle(options.signal),api=options.api||{},adapter=api.adapter||win.ORDER_APP_ADAPTER,fields=root.querySelector('.business-fields'),verify=root.querySelector('[data-action=verify-business]');let outcome=null,manual,diagnostic;
    const upload=root.querySelector('.document-section'),next=root.querySelector('[data-action=business-next]'),uploadExample=Boolean(root.querySelector('.verification-mark,.document-section .business-message'));
    if(upload&&!uploadExample){upload.hidden=true;for(const input of upload.querySelectorAll('input'))input.disabled=true;}
    if(next)next.hidden=!uploadExample;
    for(const star of root.querySelectorAll('.required-star'))star.remove();
    const prompts={'business-name':'상호명을 입력해주세요','owner-name':'대표자명을 입력해주세요','business-sector':'업태를 입력해주세요','business-type':'업종을 입력해주세요'};
    for(const [name,prompt]of Object.entries(prompts)){
      const input=fields?.querySelector('[name="'+name+'"]');if(!input)continue;const placeholder=input.getAttribute('placeholder')||'';
      input.addEventListener('focus',()=>{input.placeholder=prompt;},{signal:life.signal});input.addEventListener('blur',()=>{input.placeholder=placeholder;},{signal:life.signal});
    }
    const number=fields?.querySelector('[name=business-number]');
    if(number){
      const shell=number.closest('.input-shell')||number.parentElement,mask=el('span',undefined,'research-business-number-mask'),entered=el('span'),remaining=el('span');entered.dataset.entered='';mask.setAttribute('aria-hidden','true');mask.append(entered,remaining);mask.hidden=true;shell.append(mask);const placeholder=number.placeholder;
      const sync=()=>{const focused=doc.activeElement===number&&!number.disabled;mask.hidden=!focused;number.placeholder=focused?'':placeholder;if(!focused)return;const css=win.getComputedStyle(number);for(const key of ['fontFamily','fontSize','fontWeight','fontVariantNumeric','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'])mask.style[key]=css[key];mask.style.borderStyle='solid';mask.style.borderColor='transparent';const digits=number.value.replace(/\D/g,'').slice(0,10),slots=digits.padEnd(10,'□'),formatted=slots.slice(0,3)+'-'+slots.slice(3,5)+'-'+slots.slice(5);entered.textContent=number.value;remaining.textContent=formatted.slice(number.value.length);};
      for(const type of ['focus','blur','input','compositionend'])number.addEventListener(type,event=>{if(event.isComposing){mask.hidden=true;return;}sync();},{signal:life.signal});win.addEventListener('resize',sync,{signal:life.signal});life.add(()=>mask.remove());
    }
    if(!fields){
      const text=root.querySelector('.business-message.info>span');if(text)text.textContent='사업자 조회에 연결하지 못했어요.\n잠시 후 다시 시도해 주세요.';
      root.querySelector('[data-action=open-case-business]')?.remove();
      const actions=root.querySelector('.bottom-actions');if(actions&&typeof api.select==='function'){const retry=el('button','다시 시도','btn primary');retry.type='button';retry.addEventListener('click',()=>api.select('business','empty'),{signal:life.signal});actions.append(retry);}
    }
    for(const input of fields?.querySelectorAll('[name="business-sector"],[name="business-type"]')||[])input.addEventListener('focus',()=>{
      let note=input.closest('.business-combobox,.field')?.querySelector('[data-business-classification]');if(!note){note=el('small','국세청 업종 목록을 불러오는 중이에요.');note.dataset.businessClassification='';input.closest('.business-combobox,.field')?.append(note);}
      loadBusinessClasses().then(()=>{if(life.signal.aborted)return;note.remove();if(doc.activeElement===input&&!input.disabled)input.dispatchEvent(new win.Event('input',{bubbles:true}));}).catch(()=>{if(!life.signal.aborted)note.textContent='업종 목록을 불러오지 못했어요. 등록증에 적힌 명칭을 직접 입력해 주세요.';});
    },{once:true,signal:life.signal});
    const proxy=Object.create(adapter||null);proxy.request=async(...args)=>{try{const result=await adapter.request(...args);if(args[0]==='/business-verifications')outcome=result.item?.verified?'verified':'mismatch';return result;}catch(e){if(args[0]==='/business-verifications'){diagnostic=e.data?.businessVerification;outcome=['BUSINESS_PROVIDER_UNAVAILABLE','BUSINESS_PROVIDER_RESPONSE_INVALID'].includes(e.message)?'provider':e.message==='BUSINESS_INFORMATION_MISMATCH'?'mismatch':'application';}throw e;}};
    if(verify)verify.addEventListener('click',e=>{
      for(const field of fields?.querySelectorAll('input')||[])clearError(field);
      const invalid=[['business-number','사업자등록번호 10자리를 확인해 주세요.',v=>v.replace(/\D/g,'').length===10],['business-name','상호를 입력해 주세요.'],['owner-name','대표자명을 입력해 주세요.'],['business-sector','업태를 입력해 주세요.'],['business-type','업종을 입력해 주세요.']].filter(([name,,check])=>{const field=root.querySelector('[name="'+name+'"]');return field&&!(check?check(field.value):field.value.trim());});
      if(invalid.length){e.preventDefault();e.stopImmediatePropagation();for(const [name,message] of invalid)error(root.querySelector('[name="'+name+'"]'),message);root.querySelector('[name="'+invalid[0][0]+'"]')?.focus();return;}
      outcome=null;if(fields){fields.hidden=false;fields.inert=false;for(const input of fields.querySelectorAll('input,button'))input.disabled=false;}manual?.remove();manual=null;
    },{capture:true,signal:life.signal});
    const motion=api.motion?Object.create(api.motion):null;if(motion)motion.run=(button,task,settings={})=>api.motion.run(button,task,{...settings,labels:{...settings.labels,success:'확인 완료'}});
    const base=originals.mountBusiness.call(this,root,{...options,signal:life.signal,api:{...api,adapter:proxy,...(motion?{motion}:{})}});
    let evidencePolish;
    root.querySelector('[data-action=business-next]')?.addEventListener('click',()=>win.queueMicrotask(()=>{if(root.querySelector('.wf-panel')){root.__orderSelectedFiles=[];evidencePolish??=polishEvidence(root,{kind:'business',api});}}),{signal:life.signal});
    const observer=new win.MutationObserver(()=>{
      // The evidence editor replaces the verified form inside this same root.
      if (!fields || !root.contains(fields)) { observer.disconnect(); return; }
      const status=root.querySelector('.wf-status');
      if(root.dataset.businessVerificationId&&fields){
        if(next){next.hidden=false;if(next.textContent!=='사업자등록증 제출')next.textContent='사업자등록증 제출';}
        fields.hidden=false;fields.inert=true;for(const input of fields.querySelectorAll('input,button'))if(!input.disabled)input.disabled=true;
        if(!root.querySelector('[data-business-confirmed]')){const success=el('div',undefined,'research-business-verified');success.dataset.businessConfirmed='';success.setAttribute('role','status');success.append(icon('check'),el('span','사업자 정보를 확인했어요. 등록증을 제출해 주세요.'));fields.after(success);if(status)status.textContent=adapter.fixture?'검토용 인증 응답입니다. 실제 국세청 인증이 아닙니다.':'확인한 정보는 사업자 정보 페이지에서 수정할 수 있어요.';}
        if(verify&&!verify.disabled)verify.disabled=true;
      }else if(outcome==='provider'&&status?.dataset.error==='true'&&fields&&!manual){
        if(next){next.hidden=false;if(next.textContent!=='등록증으로 확인 요청')next.textContent='등록증으로 확인 요청';}
        fields.hidden=true;fields.inert=true;for(const input of fields.querySelectorAll('input,button'))input.disabled=true;
        manual=el('section',undefined,'research-business-manual t-panel-slide');manual.setAttribute('role','status');manual.append(el('strong',diagnostic?.source==='configuration'?'사업자 조회 서비스의 연결 설정을 확인하고 있어요.':diagnostic?.source==='invalid-response'?'사업자 조회 기관의 응답을 확인하지 못했어요.':'사업자 조회 기관에 연결하지 못했어요.'),el('p','입력한 정보는 보관되어 있어요. 아래에 사업자등록증을 첨부하고 다음을 눌러 담당자 확인을 요청해 주세요.'));if(diagnostic?.alertQueued===true)manual.append(el('p','담당자의 알림 목록에 연결 확인 요청을 등록했어요.'));fields.after(manual);const entry=manual;win.requestAnimationFrame(()=>{if(!life.signal.aborted&&entry.isConnected)entry.dataset.open='true';});if(verify){verify.textContent='사업자 조회 다시 시도';verify.disabled=false;}
      }else if(outcome==='mismatch'&&status?.dataset.error==='true'&&!fields?.querySelector('[data-workflow-invalid]')){for(const input of fields?.querySelectorAll('[name="business-number"],[name="business-name"],[name="owner-name"]')||[])error(input,'등록증의 내용과 입력값을 다시 확인해 주세요.');}
    });observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-business-verification-id','disabled','data-error']});life.add(()=>observer.disconnect());life.add(()=>{evidencePolish?.();root.__orderSelectedFiles=[];base?.destroy?.();});return {destroy:life.dispose};
  };
  function evidenceReceipt(panel,kind,reviewOnly=false){
    if(panel.querySelector('.research-workflow-receipt'))return;const receipt=el('section',undefined,'research-workflow-receipt'),status=panel.querySelector('.wf-status');
    for(const child of panel.children)if(child!==status)child.hidden=true;
    receipt.append(icon('check'),el('p',kind==='business'?'사업자등록증을 접수했어요.':'거래내역 증빙과 서명을 접수했어요.'),el('p','최대 2영업일 이내에 검토 결과를 안내해 드릴게요.'));
    if(reviewOnly){receipt.dataset.reviewOnly='true';receipt.setAttribute('aria-label','검토용 접수 예시');if(status)status.hidden=true;}else if(status)receipt.append(status);panel.append(receipt);
  }
  function evidenceReviewState(panel,options,life){
    const {api,state}=options,screen=api?.screen,allowed=screen==='signature'?['empty','drawn','missing','processing','done']:screen==='proof'?['empty','selected','oversize','format','checking','blocked','error','ready']:[];
    // Only an explicitly selected review scenario may supply synthetic state.
    // No upload, attach, receipt or case mutation is used to draw these examples.
    if(api?.reviewScenario!==true||!allowed.includes(state)||api.adapter?.fixture?.inspect?.().source?.kind!=='dummy')return false;
    const settings=panel.querySelector('.research-evidence-settings'),file=settings?.querySelector('input[type=file]');if(!file)return false;
    panel.dataset.reviewScenario=screen+'/'+state;panel.dataset.reviewOnly='true';panel.dataset.reviewReady='false';
    const status=panel.querySelector('.wf-status'),save=settings.querySelector('[data-evidence-submit]'),finish=()=>{if(!life.signal.aborted)panel.dataset.reviewReady='true';};
    if(screen==='signature'){
      panel.querySelector('.proof-purpose')?.setAttribute('hidden','');panel.querySelector('[name=document-memo]')?.closest('.wf-field')?.setAttribute('hidden','');panel.querySelector('.memo-meter')?.setAttribute('hidden','');
      file.closest('label').hidden=true;
    }
    if(state==='done'){evidenceReceipt(panel,options.kind,true);finish();return true;}
    if(screen==='proof'&&state==='empty'){finish();return true;}
    if(screen==='proof'&&['blocked','error'].includes(state)){
      status.textContent=state==='blocked'?'이 파일은 차단됐어요. 다른 파일을 다시 올려주세요.':'파일을 올리지 못했어요. 다시 올려주세요.';status.dataset.error='true';file.setAttribute('aria-invalid','true');file.addEventListener('change',()=>file.removeAttribute('aria-invalid'),{once:true,signal:life.signal});finish();return true;
    }
    const pending=label=>{
      const control=screen==='proof'?settings.querySelector('.research-proof-next'):save;if(!control)return;file.disabled=true;
      if(api.motion)api.motion.run(control,()=>new Promise((resolve,reject)=>{const abort=()=>reject(new win.DOMException('Review scenario ended','AbortError'));if(life.signal.aborted)abort();else life.signal.addEventListener('abort',abort,{once:true});}),{labels:{pending:label}}).catch(()=>{});
      else{control.replaceChildren(el('span',undefined,'spinner'));control.setAttribute('aria-busy','true');control.setAttribute('aria-label',label);control.disabled=true;}
    };
    panel.addEventListener('research-evidence-loaded',()=>{
      if(life.signal.aborted)return;
      if(screen==='signature'){
        const element=settings.querySelector('.wf-signature'),pad=signaturePads.get(element),typed=element?.querySelector('input');
        if(state==='missing'){try{pad?.page();}catch{}}
        else if(['drawn','processing'].includes(state)&&typed){typed.value='검토 예시';typed.dispatchEvent(new win.Event('input',{bubbles:true}));pad?.page();const consent=settings.querySelector(':scope > label>input[type=checkbox]');if(consent)consent.checked=true;}
        if(state==='processing')pending('자료와 서명 제출 중');
      }else if(state==='checking'){status.textContent='파일을 안전하게 확인하고 있어요.';status.dataset.error='false';pending('파일 확인 중');}
      finish();
    },{once:true,signal:life.signal});
    const bytes=state==='oversize'?new Uint8Array(10_000_001):state==='format'?new Uint8Array([81,65]):Uint8Array.from(win.atob('iVBORw0KGgoAAAANSUhEUgAAAMAAAACQCAIAAADRMPOnAAACbklEQVR4nO3SsU0DURREUddJFVRDHcRUQEMIiQQCEkS2jHaMx+fohT9Yzd7L2/uHc3++y9W/wN30CchFJyAXnYBcdAJy0QnIRScgF52AXHQCctEJyEUnIBedgFx0hwN6eHxy33f1n/cfTkACEpCABHSLd/Wf9x9OQALqBuTczxOQi05ALjoBuegE5KITkItOQC46AbnoBOSiE5CLTkAuOgG56C6fEBAQEQERERARAREREBEBEREQEQERERARAREREBEBEREQkWMBPb+8unu4EwM69H7b6hoCKlldQ0Alq2sIqGR1DQGVrK4hoJLVNQRUsrqGgEpW1xBQyeoaAipZXUNAJatrCKhkdQ0BlayuIaCS1TUEVLK6hoBKVtcQUMnqGgIqWV1DQCWrawioZHUNAZWsriGgktU1BFSyusa5Abl7uBMDOvR+2+oaAipZXUNAJatrCKhkdQ0BlayuIaCS1TUEVLK6hoBKVtcQUMnqGgIqWV1DQCWrawioZHUNAZWsriGgktU1BFSyuoaASlbXEFDJ6hoCKlldQ0Alq2sIqGR1DQGVrK4hoJLVNQRUsrrGuQG5e7gTAzr0ftvqGgIqWV1DQCWrawioZHUNAZWsriGgktU1BFSyuoaASlbXEFDJ6hoCKlldQ0Alq2sIqGR1DQGVrK4hoJLVNQRUsrqGgEpW1xBQyeoaAipZXUNAJatrCKhkdQ0BlayuIaCS1TUEVLK6xrkBuXu4swKCXwREREBEBEREQEQERERARAREREBEBEREQEQERERARAREREBEBEREQEQERERARAREREBEBEREQEQERERARAREREBEvgDfXHnfLUcT/gAAAABJRU5ErkJggg=='),char=>char.charCodeAt(0));
    const sample=new win.File([bytes],state==='format'?'검토용 형식 오류.txt':'검토용 거래명세서.png',{type:state==='format'?'text/plain':'image/png'});
    if(typeof sample.arrayBuffer!=='function')Object.defineProperty(sample,'arrayBuffer',{value:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
    let restore;
    if(typeof win.DataTransfer==='function'){const transfer=new win.DataTransfer();transfer.items.add(sample);file.files=transfer.files;}
    else{const before=Object.getOwnPropertyDescriptor(file,'files');Object.defineProperty(file,'files',{value:[sample],configurable:true});restore=()=>before?Object.defineProperty(file,'files',before):delete file.files;}
    file.dispatchEvent(new win.Event('change',{bubbles:true}));restore?.();
    if(['oversize','format'].includes(state)){
      const errors=new win.MutationObserver(()=>{if(status.dataset.error==='true'){errors.disconnect();finish();}});errors.observe(status,{childList:true,attributes:true,attributeFilter:['data-error']});life.add(()=>errors.disconnect());if(status.dataset.error==='true'){errors.disconnect();finish();}
    }
    return true;
  }
  function polishEvidence(root,options){
    root.classList.add('research-workflow');const panel=root.querySelector('.wf-panel'),heading=panel?.querySelector('h2');if(!panel)return ()=>{};
    panel.classList.add('page','research-evidence-page',options.kind==='business'?'business-page':options.api?.screen==='signature'?'signature-page':'proof-page');
    if(heading&&options.kind!=='business')heading.textContent=options.api?.screen==='signature'?'서명이 필요해요':'거래내역 증빙';
    const select=panel.querySelector(':scope > .wf-field select'),start=panel.querySelector(':scope > .wf-button'),life=lifecycle(options.signal);let opened=false,reviewApplied=false,presentation;
    function preparePresentation(){
      if(presentation||options.kind==='business')return;
      const settings=panel.querySelector('.research-evidence-settings'),upload=settings?.querySelector('.research-file-drop'),pages=settings?.querySelector('.research-evidence-pages'),signature=settings?.querySelector('.wf-signature'),consent=settings?.querySelector(':scope > label>input[type=checkbox]')?.parentElement,save=settings?.querySelector('[data-evidence-submit]');
      if(!settings||!upload||!signature||!consent||!save)return;
      restoreMemoField(panel.querySelector('[name=document-memo]'));
      const purpose=panel.querySelector('.proof-purpose'),memo=panel.querySelector('[name=document-memo]')?.closest('.wf-field'),meter=panel.querySelector('.memo-meter'),hint=settings.querySelector(':scope > p'),galleryHead=el('div',undefined,'research-signature-gallery-label'),edit=el('button','자료 수정','btn text'),next=el('button','다음','btn primary research-proof-next');
      settings.parentElement.classList.add('research-evidence-editor');save.textContent='제출하기';save.classList.add('btn','primary');edit.type=next.type='button';galleryHead.append(el('h3','제출 자료'),edit);pages.before(galleryHead);
      consent.classList.add('check-row');for(const node of consent.childNodes)if(node.nodeType===3)node.textContent='제출 자료와 서명 내용을 확인했어요.';
      if(memo)signature.before(memo);if(meter)signature.before(meter);settings.append(next);
      let step=options.api?.screen==='signature'?'signature':'proof',hasDocuments=Boolean(pages.querySelector('canvas'));
      const render=()=>{
        if(pages.querySelector('canvas'))hasDocuments=true;const signing=step==='signature';
        panel.classList.toggle('signature-page',signing);panel.classList.toggle('proof-page',!signing);panel.dataset.evidenceStep=step;const title=signing?'서명이 필요해요':'거래내역 증빙';if(heading.textContent!==title)heading.textContent=title;
        for(const node of [purpose,memo,meter])if(node)node.hidden=signing;
        upload.hidden=signing&&hasDocuments;if(hint)hint.hidden=signing;galleryHead.hidden=!signing||!hasDocuments;signature.hidden=consent.hidden=save.hidden=!signing;next.hidden=signing;
      };
      const file=upload.querySelector('input'),confirmed=consent.querySelector('input');
      file.addEventListener('change',()=>{hasDocuments=false;const status=panel.querySelector('.wf-status');if(status.dataset.error==='true'){status.textContent='';status.dataset.error='false';}},{signal:life.signal});
      next.addEventListener('click',()=>{if(file.disabled)return;if(!hasDocuments){const status=panel.querySelector('.wf-status');status.textContent='증빙 파일을 선택해 주세요.';status.dataset.error='true';file.focus();return;}step='signature';render();heading.focus({preventScroll:true});panel.scrollIntoView?.({block:'start',behavior:'auto'});},{signal:life.signal});
      edit.addEventListener('click',()=>{if(file.disabled)return;step='proof';render();file.focus();},{signal:life.signal});
      confirmed.addEventListener('change',()=>clearError(signature),{signal:life.signal});
      save.addEventListener('click',event=>{
        if(file.disabled||save.disabled)return;
        const stop=()=>{event.preventDefault();event.stopImmediatePropagation();};
        if(!hasDocuments){stop();const status=panel.querySelector('.wf-status');status.textContent='증빙 파일을 선택해 주세요.';status.dataset.error='true';file.focus();return;}
        // The editor clears displayed pages after sealing/uploading. Its same-key
        // retries must reach the original handler without asking for a new pad.
        if(!pages.querySelector('canvas'))return;
        try{signaturePads.get(signature)?.page();}catch{stop();return;}
        if(!confirmed.checked){stop();error(signature,'제출 자료와 서명 내용을 확인하고 동의해 주세요.');}
      },{capture:true,signal:life.signal});
      heading.tabIndex=-1;presentation={render};render();
    }
    const enhance=()=>{
      const ready=Boolean(panel.querySelector('.research-evidence-settings')),status=panel.querySelector('.wf-status');
      if(ready&&start){start.hidden=true;start.disabled=true;if(select?.options.length===1)select.closest('.wf-field').hidden=true;}
      else if(!opened&&select?.options.length===1&&start&&!start.disabled&&['proof','signature'].includes(options.api?.screen)){opened=true;select.closest('.wf-field').hidden=true;start.click();start.hidden=true;start.disabled=true;}
      else if(opened&&!ready&&status?.dataset.error==='true'&&start){start.hidden=false;start.disabled=false;}
      if(ready){preparePresentation();presentation?.render();}
      if(ready&&!reviewApplied)reviewApplied=evidenceReviewState(panel,options,life);
      if(panel.dataset.success==='true')evidenceReceipt(panel,options.kind);
    };
    const observer=new win.MutationObserver(enhance);observer.observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['data-success','data-error']});life.add(()=>observer.disconnect());enhance();return life.dispose;
  }
  workflow.mountEvidence=function(root,options={}){const base=originals.mountEvidence.call(this,root,options),life=lifecycle(options.signal);life.add(polishEvidence(root,options));life.add(()=>base?.destroy?.());return {destroy:life.dispose};};
  win.ORDER_EVIDENCE_EDITOR=function(options){
    const {container}=options,life=lifecycle(),signal=life.signal;let selectedProblem='',current=null,position=0,zoom=false,editing=false,closing=0,disposed=false;
    const on=(node,type,fn,extra={})=>node.addEventListener(type,fn,{...extra,signal});
    const base=editor({...options,onError:message=>{options.onError?.(selectedProblem||(/파일/.test(message)?message+' 다른 파일을 다시 올려주세요.':message));}});
    container.classList.add('research-workflow');
    const file=container.querySelector('input[type=file]'),settings=container.querySelector('fieldset');
    if(settings){
      settings.classList.add('research-evidence-settings');
      const upload=file?.closest('label'),hint=settings.querySelector(':scope > p'),pages=settings.querySelector(':scope > div'),signature=settings.querySelector(':scope > .wf-signature'),consent=settings.querySelector(':scope > label>input[type=checkbox]')?.parentElement,save=[...settings.querySelectorAll(':scope > button')].find(button=>button.textContent==='가림 처리본 제출');
      if(save)save.dataset.evidenceSubmit='';
      pages?.classList.add('research-evidence-pages');
      for(const item of [upload,hint,pages,signature,consent,save])if(item)settings.append(item);
      const legend=signature?.querySelector('legend');if(legend)legend.textContent='서명';const clear=signature?.querySelector(':scope > .wf-button');if(clear){clear.classList.remove('wf-button');clear.classList.add('btn','text');}
    }
    const viewer=el('dialog',undefined,'research-evidence-viewer t-modal'),toolbar=el('div',undefined,'research-viewer-toolbar'),count=el('output'),viewport=el('div',undefined,'research-evidence-viewport'),controls=el('div');viewer.setAttribute('aria-label','첨부 자료 크게 보기');viewer.append(toolbar,viewport,controls);container.append(viewer);
    const button=(text,fn)=>{const b=el('button',text);b.type='button';on(b,'click',fn);return b;};
    const sections=()=>[...settings?.querySelectorAll(':scope > div > section')||[]].filter(section=>section.querySelector('canvas')||section===current?.section);
    function restore(){if(!current)return;current.section.append(current.canvas);if(current.details)current.section.append(current.details);current=null;viewport.replaceChildren();controls.replaceChildren();}
    function close(immediate=false){if(!viewer.open)return;win.clearTimeout(closing);viewer.classList.remove('is-open');viewer.classList.add('is-closing');const finish=()=>{restore();viewer.classList.remove('is-closing');if(viewer.close)viewer.close();else viewer.removeAttribute('open');};if(immediate||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches)finish();else closing=win.setTimeout(finish,150);}
    function show(index){const list=sections();if(!list.length)return;win.clearTimeout(closing);restore();position=(index+list.length)%list.length;const section=list[position],canvas=section.querySelector('canvas'),details=section.querySelector('details');if(!canvas?.width)return;current={section,canvas,details};editing=false;zoom=false;viewer.dataset.editing='false';viewport.dataset.zoom='false';viewport.append(canvas);if(details)controls.append(details);if(details)details.hidden=true;edit.disabled=options.readOnly||!details;edit.textContent='가림 편집';count.textContent=(position+1)+' / '+list.length;previous.disabled=next.disabled=list.length<2;if(!viewer.open){if(viewer.showModal)viewer.showModal();else viewer.setAttribute('open','');}viewer.classList.remove('is-closing');viewer.classList.add('is-open');}
    const previous=button('이전',()=>show(position-1)),next=button('다음',()=>show(position+1)),zoomButton=button('확대',()=>{zoom=!zoom;viewport.dataset.zoom=String(zoom);zoomButton.textContent=zoom?'축소':'확대';}),edit=button('가림 편집',()=>{if(!current?.details)return;editing=!editing;viewer.dataset.editing=String(editing);current.details.hidden=!editing;current.details.open=editing;edit.textContent=editing?'가림 저장':'가림 편집';}),dismiss=button('닫기',()=>close());toolbar.append(count,previous,next,zoomButton,edit,dismiss);
    on(viewer,'cancel',e=>{e.preventDefault();close();});on(viewer,'click',e=>{if(e.target===viewer)close();});on(viewer,'keydown',e=>{if(editing||/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='ArrowLeft'){e.preventDefault();show(position-1);}if(e.key==='ArrowRight'){e.preventDefault();show(position+1);}});
    let swipe;
    on(viewport,'pointerdown',e=>{if(editing)return;e.stopPropagation();swipe={x:e.clientX,y:e.clientY};},{capture:true});on(viewport,'pointerup',e=>{if(editing)return;e.stopPropagation();if(swipe&&Math.abs(e.clientX-swipe.x)>48&&Math.abs(e.clientY-swipe.y)<32)show(position+(e.clientX<swipe.x?1:-1));swipe=null;},{capture:true});
    if(file){const label=file.closest('label');label.classList.add('research-file-drop');file.classList.add('research-file-input');for(const node of [...label.childNodes])if(node.nodeType===3)node.remove();label.prepend(icon('upload'),el('strong',options.kind==='business'?'사업자등록증을 선택해 주세요':'증빙 파일을 선택해 주세요'));label.append(el('small',file.multiple?'PDF, JPG, PNG · 파일당 10MB · 최대 8쪽':'PDF, JPG, PNG · 파일당 10MB'),el('small','파일을 이곳에 끌어놓을 수도 있어요.','research-drop-desktop'));on(file,'change',()=>{close(true);const files=[...file.files||[]];selectedProblem=files.some(f=>!f.size||f.size>10_000_000)?'파일당 10MB 이하로 줄여 다시 올려주세요.':files.some(f=>!['application/pdf','image/png','image/jpeg'].includes(f.type))?'PDF, JPG 또는 PNG 파일을 다시 올려주세요.':'';},{capture:true});on(label,'dragover',e=>{if(!file.matches(':disabled')){e.preventDefault();label.dataset.drag='true';}});on(label,'dragleave',()=>delete label.dataset.drag);on(label,'drop',e=>{e.preventDefault();delete label.dataset.drag;if(file.matches(':disabled')||!e.dataTransfer?.files.length)return;if(!file.multiple&&e.dataTransfer.files.length>1){options.onError?.('사업자등록증은 한 파일만 선택해 주세요.');return;}file.files=e.dataTransfer.files;file.dispatchEvent(new win.Event('change',{bubbles:true}));});}
    function enhance(){for(const section of sections()){const canvas=section.querySelector('canvas');if(!canvas||canvas.dataset.researchPreview!==undefined)continue;canvas.dataset.researchPreview='';canvas.tabIndex=0;canvas.setAttribute('role','button');canvas.setAttribute('aria-haspopup','dialog');section.parentElement.classList.add('research-evidence-pages');const open=()=>show(sections().indexOf(section));on(canvas,'pointerdown',e=>{if(current?.canvas===canvas)return;e.preventDefault();e.stopImmediatePropagation();},{capture:true});on(canvas,'pointerup',e=>{if(current?.canvas===canvas)return;e.stopImmediatePropagation();},{capture:true});on(canvas,'click',()=>{if(current?.canvas!==canvas)open();});on(canvas,'keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});const preview=button('크게 보기',open);preview.className='btn text';section.append(preview);container.dispatchEvent(new win.CustomEvent('research-evidence-loaded',{bubbles:true}));}if(current&&(!current.canvas.width||!current.section.isConnected))close(true);}
    const observer=new win.MutationObserver(enhance);observer.observe(container,{subtree:true,childList:true,attributes:true,attributeFilter:['width','height']});enhance();on(container,'click',e=>{if(e.target.closest('button')&&!viewer.contains(e.target))close(true);},{capture:true});
    life.add(()=>{if(disposed)return;disposed=true;observer.disconnect();win.clearTimeout(closing);close(true);viewer.remove();base?.();});return life.dispose;
  };
  const result={businessClasses,loadBusinessClasses,destroy(){for(const dispose of [...active])dispose();businessClasses.rows=[];businessClasses.sectors.splice(0);businessClasses.industries.splice(0);Object.assign(workflow,originals);win.ORDER_EVIDENCE_EDITOR=editor;style.remove();delete win.ORDER_RESEARCH_WORKFLOW_POLISH;}};win.ORDER_RESEARCH_WORKFLOW_POLISH=result;return result;
}
