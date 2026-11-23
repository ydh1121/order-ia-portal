/** Adapt the preserved renderer at its data and acknowledgement seams. All
 * deck, palette, cut confirmation and keyboard bodies remain the same. */
const once=(source,before,after)=>{if(source.split(before).length!==2)throw Error('RESEARCH_PASS_SOURCE_CHANGED:'+before.slice(0,80));return source.replace(before,after);};
export function researchPassesSource(source){
  source=once(source,'const passes=[','let passes=[');
  source=once(source,'const sites=[...new Set(passes.map(p=>p.site))];','let sites=[...new Set(passes.map(p=>p.site))];');
  source=once(source,'const dictionary=[...new Set(passes.flatMap','let dictionary=[...new Set(passes.flatMap');
  source=once(source,'const received=new Set();','const received=new Set(passes.filter(p=>p.received).map(p=>p.id));');
  // The old sample literals never contained markup. Service fields do, so
  // encode every interpolated display value before using the same renderer.
  for(const value of ['p.id','p.date','p.site','summary(p)','p.lines[0][1]','sku','qty','mode'])source=source.replaceAll('${'+value+'}','${esc('+value+')}');
  source=source.replaceAll("'+p.status+'","'+esc(p.status)+'");
  for(const value of ['p.id','p.site','summary(p)'])source=source.replaceAll("'+"+value+"+'","'+esc("+value+")+'");
  source=source.replaceAll('${p.lines.length>1?\'복합 주문\':p.lines[0][1]}','${p.lines.length>1?\'복합 주문\':esc(p.lines[0][1])}');
  source=source.replaceAll('data-site="${site}"','data-site="${esc(site)}"').replaceAll('>${site}</button>','>${esc(site)}</button>');
  source=once(source,"const terms=state==='results'?['특란']:state==='none'?['샘플카페','특란']:[];","const terms=state==='results'&&dictionary.length?[dictionary[0]]:[];");
  source=once(source,"s==='detail'?ticketDetail(passes[0])","s==='detail'&&passes.length?ticketDetail(passes[0])");
  source=once(source,"root.addEventListener('click',e=>{\n    const b=e.target.closest('button'),card=e.target.closest('[data-pass-id]');","root.addEventListener('click',async e=>{\n    const b=e.target.closest('button'),card=e.target.closest('[data-pass-id]');");
  source=once(source,"if(api.mode==='product'){api.onUnavailable?.('confirm-tear');api.toast?.('아직 연결되지 않은 기능이에요.');return;}",`if(api.mode==='product'){
        if(!api.passReceipt){api.onUnavailable?.('confirm-tear');api.toast?.('아직 연결되지 않은 기능이에요.');return;}
        if(b.disabled)return;const pass=passById(selected),area=root.querySelector('.expanded-pass'),dialog=area.querySelector('.tear-confirm');
        let message=dialog.querySelector('[data-receipt-message]');if(!message){message=document.createElement('p');message.dataset.receiptMessage='';message.setAttribute('role','status');dialog.append(message);}message.textContent='';
        const locked=[...area.querySelectorAll('button')].map(button=>[button,button.disabled]);for(const [button] of locked)button.disabled=true;
        try{const item=await api.passReceipt(pass,b);if(signal.aborted)return;pass.received=true;pass.canReceive=false;pass.revision=item.revision;pass.status='수령 확인';received.add(pass.id);current=0;renderStage(true);close();api.toast?.('수령 확인을 저장했어요.');}
        catch(error){if(!signal.aborted&&error.name!=='AbortError')message.textContent=api.adapter?.message?.(error)||error.message||'수령 확인을 저장하지 못했어요. 다시 시도해 주세요.';}
        finally{if(!signal.aborted)for(const [button,disabled] of locked)button.disabled=disabled;}
        return;
      }`);
  const binding=`
for(const screen of ['passes','search']){
 const module=R.find(item=>item.id===screen),mount=module.mount;
 module.mount=function(root,state,api){
  if(!api.adapter)return mount.call(module,root,state,api);
  if(!w.ORDER_RESEARCH_PASSES)throw Error('RESEARCH_PASSES_INSTALLER_MISSING');
  return w.ORDER_RESEARCH_PASSES.mount(root,state,api,{screen,render:value=>module.render(value,{variant:api.variant}),mount:(target,value,context)=>mount.call(module,target,value,context),setRows:rows=>{passes=rows;sites=[...new Set(passes.map(p=>p.site))];dictionary=[...new Set(passes.flatMap(p=>[p.site,p.date,p.status,...p.lines.flatMap(([sku,,mode])=>[sku,mode])]))];}});
 };
}
`;
  return once(source,'// The account state names remain stable so archived comments still resolve.',binding+'\n// The account state names remain stable so archived comments still resolve.');
}
