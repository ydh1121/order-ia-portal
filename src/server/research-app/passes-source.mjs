import {browserFunction} from '../browser-source.mjs';

/** A partial tear is only a gesture preview. The stub can leave the ticket
 * only after the existing receipt request validates its acknowledgement. */
export function mountPassTearMotion(root,{signal,confirm,reduced=()=>false}){
  const document=root.ownerDocument,window=document.defaultView,media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const style=document.createElement('style');style.textContent=`.expanded-pass{position:relative}.expanded-pass .pass-perforation:has(.pass-cut){position:relative;display:grid;place-items:center;height:48px;margin-block:14px;border:0}.expanded-pass .pass-perforation:has(.pass-cut)::before{content:"";position:absolute;inset:50% 0 auto;border-top:1px dashed #b7c3d4}.expanded-pass .pass-perforation>.pass-cut{position:relative;width:auto;max-width:calc(100% - 36px);min-height:44px;padding:6px 14px;border-radius:24px;border:1px dashed #8c9db8;background:#f7f9fc;touch-action:pan-y;user-select:none;-webkit-user-select:none}.pass-tear-preview{position:absolute;pointer-events:none;z-index:6;overflow:visible}.pass-tear-preview>.ticket-detail{position:absolute!important;inset:0;margin:0!important;width:100%!important;height:100%!important;box-sizing:border-box;transform-origin:0 50%;pointer-events:none}`;root.prepend(style);
  style.textContent+='.passes-page .site-chips button{display:inline-flex;align-items:baseline;gap:.25em;min-width:0;max-width:100%}.passes-page .pass-site-name,.passes-page .pass-site-hint{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.passes-page .pass-site-hint{flex:none;max-width:52%}';
  let area=null,drag=null,preview=null,suppressClick=false;
  const moving=()=>!reduced()&&!media?.matches;
  function reset(){
    const item=preview;preview=null;if(!item)return;
    item.ticket.style.opacity=item.opacity;item.animation?.cancel();item.layer.remove();item.resolve?.();
  }
  function create(){
    if(preview)return preview;if(!area||!moving())return null;
    const ticket=area.querySelector('.ticket-detail'),cut=ticket?.querySelector('.pass-perforation'),box=ticket?.getBoundingClientRect(),parent=area.getBoundingClientRect();
    if(!box?.width||!box.height||!cut)return null;
    const scale=parent.width&&area.offsetWidth?parent.width/area.offsetWidth:1,width=box.width/scale,height=box.height/scale,split=(cut.getBoundingClientRect().top+cut.getBoundingClientRect().height/2-box.top)/scale;
    const layer=document.createElement('div');layer.className='pass-tear-preview';layer.setAttribute('aria-hidden','true');layer.inert=true;layer.dataset.phase='preview';
    Object.assign(layer.style,{left:(box.left-parent.left)/scale+'px',top:(box.top-parent.top)/scale+'px',width:width+'px',height:height+'px'});
    const halves=['upper','lower'].map(part=>{const clone=ticket.cloneNode(true);clone.dataset.passTearPart=part;clone.removeAttribute('id');for(const child of clone.querySelectorAll('[id]'))child.removeAttribute('id');clone.inert=true;layer.append(clone);return clone;});
    const item={ticket,layer,upper:halves[0],lower:halves[1],width,height,split,opacity:ticket.style.opacity,animation:null,resolve:null};preview=item;
    area.append(layer);ticket.style.opacity='0';return item;
  }
  function draw(progress,direction=1){
    const item=create();if(!item)return;progress=Math.max(0,Math.min(.88,progress));
    const edge=[];for(let x=0;x<item.width;x+=8)edge.push(x+'px '+(item.split+(x<progress*item.width?(Math.round(x/8)%2?3:-3):0))+'px');edge.push(item.width+'px '+item.split+'px');
    item.upper.style.clipPath='polygon(0 0,100% 0,'+edge.slice().reverse().join(',')+')';
    item.lower.style.clipPath='polygon('+edge.join(',')+',100% 100%,0 100%)';
    item.lower.style.transform='translate('+direction*progress*18+'px,'+progress*10+'px) rotate('+direction*progress*4+'deg)';item.layer.dataset.progress=String(progress);
  }
  function attach(next){
    reset();area=next;const cut=area.querySelector('[data-action="tear-ticket"]'),line=area.querySelector('.ticket-detail .pass-perforation');if(cut&&line)line.append(cut);
  }
  root.addEventListener('pointerdown',event=>{
    const cut=event.target.closest('[data-action="tear-ticket"]');if(!cut||cut.disabled||!event.isPrimary||event.button!==0)return;
    reset();drag={cut,id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};suppressClick=false;cut.setPointerCapture?.(event.pointerId);
  },{signal});
  root.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.abs(dy)>=24&&Math.abs(dy)>Math.abs(dx)){drag=null;reset();return;}
    if(Math.abs(dx)<3)return;drag.moved=true;event.preventDefault();draw(Math.abs(dx)/48,Math.sign(dx)||1);
  },{signal});
  root.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.id)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y,accepted=Math.abs(dx)>=48&&Math.abs(dy)<24;
    suppressClick=drag.moved;drag=null;if(accepted){draw(.82,Math.sign(dx)||1);confirm();}else reset();
  },{signal});
  root.addEventListener('pointercancel',()=>{suppressClick=Boolean(drag?.moved);drag=null;reset();},{signal});
  root.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='tear-ticket'){
      if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();return;}
      draw(.25);
    }else if(['cancel-tear','close-ticket'].includes(action))reset();
  },{capture:true,signal});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&area?.querySelector('.tear-confirm:not([hidden])'))reset();},{capture:true,signal});
  const stop=()=>{drag=null;reset();};window.addEventListener('resize',stop,{signal});
  signal.addEventListener('abort',()=>{stop();style.remove();},{once:true});
  function complete(){
    if(!moving()){reset();return Promise.resolve();}
    draw(.88);const item=preview;if(!item?.lower.animate){reset();return Promise.resolve();}
    item.layer.dataset.phase='acknowledged';
    return new Promise(resolve=>{
      item.resolve=resolve;item.animation=item.lower.animate([{transform:item.lower.style.transform,opacity:1},{transform:'translate(44px,110px) rotate(14deg)',opacity:0}],{duration:380,easing:'cubic-bezier(.22,.7,.3,1)',fill:'both'});
      item.animation.finished.then(()=>{if(preview===item)reset();else resolve();},()=>{if(preview===item)reset();else resolve();});
    });
  }
  return {attach,reset,complete};
}

/** Adapt the preserved renderer at its data and acknowledgement seams. All
 * deck, palette, cut confirmation and keyboard bodies remain the same. */
const once=(source,before,after)=>{if(source.split(before).length!==2)throw Error('RESEARCH_PASS_SOURCE_CHANGED:'+before.slice(0,80));return source.replace(before,after);};
export function researchPassesSource(source){
  source=once(source,'const passes=[','let passes=[');
  source=once(source,'const sites=[...new Set(passes.map(p=>p.site))];',`
const reviewPasses=passes;
const keyForSite=pass=>pass.siteKey||JSON.stringify([null,null,pass.site]);
function siteChoices(){
  const bySite=new Map(passes.map(pass=>[keyForSite(pass),pass]));
  const groups=new Map();
  for(const [key,pass] of bySite){
    if(!groups.has(pass.site))groups.set(pass.site,[]);
    groups.get(pass.site).push(key);
  }
  for(const group of groups.values())group.sort();
  return Array.from(bySite,([key,pass])=>{
    const group=groups.get(pass.site);
    let hint='';
    if(group.length>1||pass.site==='전체'){
      const uniqueHint=pass.siteHint&&group.filter(id=>bySite.get(id).siteHint===pass.siteHint).length===1;
      hint=uniqueHint?pass.siteHint:'사업장 '+(group.indexOf(key)+1);
    }
    return [key,pass.site,hint];
  });
}
let sites=siteChoices();`);
  source=once(source,"p.site===site","keyForSite(p)===site");
  source=once(source,'const dictionary=[...new Set(passes.flatMap','let dictionary=[...new Set(passes.flatMap');
  source=once(source,'const received=new Set();','const received=new Set(passes.filter(p=>p.received).map(p=>p.id));');
  // The old sample literals never contained markup. Service fields do, so
  // encode every interpolated display value before using the same renderer.
  for(const value of ['p.id','p.date','p.site','summary(p)','p.lines[0][1]','sku','qty','mode'])source=source.replaceAll('${'+value+'}','${esc('+value+')}');
  source=source.replaceAll("'+p.status+'","'+esc(p.status)+'");
  for(const value of ['p.id','p.site','summary(p)'])source=source.replaceAll("'+"+value+"+'","'+esc("+value+")+'");
  source=source.replaceAll('${p.lines.length>1?\'복합 주문\':p.lines[0][1]}','${p.lines.length>1?\'복합 주문\':esc(p.lines[0][1])}');
  source=once(source,"['전체',...sites].map((site,i)=>","[['전체','전체',''],...sites].map(([key,label,hint],i)=>");
  source=once(source,'data-site="${site}"','data-site="${esc(key)}" title="${esc(hint?label+\' · \'+hint:label)}"');
  source=once(source,'>${site}</button>','><span class="pass-site-name">${esc(label)}</span>${hint?`<span class="pass-site-hint"> · ${esc(hint)}</span>`:\'\'}</button>');
  source=once(source,"const terms=state==='results'?['특란']:state==='none'?['샘플카페','특란']:[];","const terms=state==='results'&&dictionary.length?[dictionary[0]]:[];");
  source=once(source,"s==='detail'?ticketDetail(passes[0])","s==='detail'&&passes.length?ticketDetail(passes[0])");
  // Consultation consumes the very same escaped detail function as passes and
  // search; attach it where the released drawer module is registered.
  source=once(source,"R.push({id:'drawer',group:","R.push({id:'drawer',renderPassDetail:ticketDetail,reviewConsultationPass:passes.find(row=>row.id==='b17'),group:");
  // Keep the pass silhouette visible while each card's own text geometry is
  // loading. The existing brand mark is the same one used by the empty pass.
  source=once(source,'aria-label="오더 패스 불러오는 중">${passes.map(passCard).join(\'\')}</div>',
    'aria-label="오더 패스 불러오는 중">${passes.map((pass,index)=>passCard(pass,index).replace(\'<div class="pass-perforation">\',\'<span class="loading-ticket-brand" aria-hidden="true">\'+brandDots()+\'</span><div class="pass-perforation">\')).join(\'\')}</div><style>.pass-loading .order-pass{position:relative}.pass-loading .order-pass[data-r3-skeleton=pending]>.loading-ticket-brand{opacity:1!important}.pass-loading .loading-ticket-brand{position:absolute;inset:0;display:grid;place-items:center;z-index:6;pointer-events:none}.pass-loading .loading-ticket-brand .pass-dots{display:flex;gap:5px}.pass-loading .loading-ticket-brand .pass-dots i{display:block;width:14px;height:14px;border-radius:50%;background:#d3d9e1}</style>');
  source=once(source,"if(s==='loading'&&stage){const skeleton=w.ORDER_COMMON_MOTION?.skeleton(stage);signal.addEventListener('abort',()=>skeleton?.destroy(),{once:true});return()=>controller.abort();}",
    "if(s==='loading'&&stage){const skeletons=[...stage.querySelectorAll('.order-pass')].map(card=>w.ORDER_COMMON_MOTION?.skeleton(card));signal.addEventListener('abort',()=>{for(const skeleton of skeletons)skeleton?.destroy();},{once:true});return()=>controller.abort();}");
  source=once(source,"root.addEventListener('click',e=>{\n    const b=e.target.closest('button'),card=e.target.closest('[data-pass-id]');","root.addEventListener('click',async e=>{\n    const b=e.target.closest('button'),card=e.target.closest('[data-pass-id]');");
  const cutStart=source.indexOf('  let cutStart;'),cutEnd=source.indexOf('  function close(){',cutStart);
  if(cutStart<0||cutEnd<0||source.indexOf('  let cutStart;',cutStart+1)!==-1)throw Error('RESEARCH_PASS_TEAR_SOURCE_CHANGED');
  source=source.slice(0,cutStart)+'  const tearMotion=('+browserFunction(mountPassTearMotion)+')(root,{signal,confirm:()=>toggleCut(true),reduced:()=>api.reduced?.()===true});\n'+source.slice(cutEnd);
  source=once(source,'    area.hidden=false;stage.hidden=true;area.querySelector(\'button\').focus();','    tearMotion.attach(area);area.hidden=false;stage.hidden=true;area.querySelector(\'button\').focus();');
  source=once(source,'  function close(){const area=root.querySelector(\'.expanded-pass\');','  function close(){tearMotion.reset();const area=root.querySelector(\'.expanded-pass\');');
  source=once(source,"if(api.mode==='product'){api.onUnavailable?.('confirm-tear');api.toast?.('아직 연결되지 않은 기능이에요.');return;}",`if(api.mode==='product'){
        if(!api.passReceipt){api.onUnavailable?.('confirm-tear');api.toast?.('아직 연결되지 않은 기능이에요.');return;}
        if(b.disabled)return;const pass=passById(selected),area=root.querySelector('.expanded-pass'),dialog=area.querySelector('.tear-confirm');
        let message=dialog.querySelector('[data-receipt-message]');if(!message){message=document.createElement('p');message.dataset.receiptMessage='';message.setAttribute('role','status');dialog.append(message);}message.textContent='';
        const locked=[...area.querySelectorAll('button')].map(button=>[button,button.disabled]);for(const [button] of locked)button.disabled=true;
        try{const item=await api.passReceipt(pass,b);if(signal.aborted)return;await tearMotion.complete();if(signal.aborted)return;pass.received=true;pass.canReceive=false;pass.revision=item.revision;pass.status='수령 확인';received.add(pass.id);current=0;renderStage(true);close();api.toast?.('수령 확인을 저장했어요.');}
        catch(error){tearMotion.reset();if(!signal.aborted&&error.name!=='AbortError')message.textContent=api.adapter?.message?.(error)||error.message||'수령 확인을 저장하지 못했어요. 다시 시도해 주세요.';}
        finally{if(!signal.aborted)for(const [button,disabled] of locked)button.disabled=disabled;}
        return;
      }`);
  const binding=`
for(const screen of ['passes','search']){
 const module=R.find(item=>item.id===screen),mount=module.mount;
 module.mount=function(root,state,api){
  if(!api.adapter)return mount.call(module,root,state,api);
  if(!w.ORDER_RESEARCH_PASSES)throw Error('RESEARCH_PASSES_INSTALLER_MISSING');
  return w.ORDER_RESEARCH_PASSES.mount(root,state,api,{screen,reviewPasses,render:value=>module.render(value,{variant:api.variant}),mount:(target,value,context)=>mount.call(module,target,value,context),setRows:rows=>{passes=rows;sites=siteChoices();dictionary=[...new Set(passes.flatMap(p=>[p.site,p.date,p.status,...p.lines.flatMap(([sku,,mode])=>[sku,mode])]))];}});
 };
}
`;
  return once(source,'// The account state names remain stable so archived comments still resolve.',binding+'\n// The account state names remain stable so archived comments still resolve.');
}
