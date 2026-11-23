const units={tray:'판',pack:'팩',box:'상자',piece:'개'};
const statuses={AWAITING_CASH:['입금 대기','review'],AWAITING_CARD:['결제 대기','review'],PAID:['결제 완료','active'],DISPATCHED:['배송 중','active'],RECEIVED:['수령 확인','active'],CANCELLED:['취소','expired']};
const quantity=(value,unit)=>Number.isFinite(Number(value))?Number(value).toLocaleString('ko-KR')+(units[unit]||'판'):'수량 확인';
const day=value=>String(value||'').slice(0,10).replaceAll('-','.');

/** Public display fields only. Neither an expired quote nor a role label can
 * grant receipt rights; those come from the current purchase actions. */
export function researchPassRows(purchases={},workspace={},now=Date.now()){
  const rows=[],ordered=new Set(),businesses=workspace.businesses||[];
  for(const item of purchases.items||[]){
    if(!item?.id)continue;const [status,tone]=statuses[item.status]||['상태 확인','review'];ordered.add(item.quoteId);
    // The purchase contract currently exposes a local site key, not its org.
    // A shared key across authorized organizations cannot identify one name.
    const candidates=businesses.filter(b=>b.site_id===item.targetId),business=candidates.length===1?candidates[0]:null,name=business?.businessName||item.target||item.targetId||'내 사업장';
    const lines=(Array.isArray(item.lines)&&item.lines.length?item.lines:[{productName:item.product,quantity:item.quantity,unit:item.unit||'tray',serviceDate:item.serviceDate}]).map(line=>[String(line.productName||line.product||'주문 품목'),quantity(line.quantity,line.unit),line.serviceDate?'납품 '+day(line.serviceDate):'주문 내역']);
    rows.push({id:String(item.id),purchaseId:String(item.id),revision:item.revision,date:day(item.date||item.createdAt),site:String(name),status,tone,lines,received:item.status==='RECEIVED',canReceive:item.status==='DISPATCHED'&&Array.isArray(item.actions)&&item.actions.includes('receive'),quoteId:item.quoteId||null});
  }
  for(const quote of workspace.quotes||[]){
    if(!quote?.id||ordered.has(quote.id))continue;
    const expired=Boolean(quote.expires_at)&&Date.parse(quote.expires_at)<=now,business=businesses.find(b=>b.org_id===quote.org_id&&b.site_id===quote.site_id);
    const lines=(Array.isArray(quote.lines)&&quote.lines.length?quote.lines:[{productName:quote.productName,quantity:quote.deliveryQty,unit:quote.unit,serviceDate:quote.serviceDate}]).map(line=>[String(line.productName||'발급 견적'),quantity(line.quantity,line.unit),line.serviceDate?'납품 '+day(line.serviceDate):'발급 견적']);
    rows.push({id:'quote:'+quote.id,quoteId:quote.id,date:day(quote.issued_at||quote.serviceDate),site:String(business?.businessName||quote.businessName||quote.site_id||'내 사업장'),status:expired?'지난 견적':quote.deliveryState?'납품 요청':'발급 견적',tone:expired?'expired':quote.deliveryState?'booked':'review',lines,received:false,canReceive:false});
  }
  return rows;
}

export function installResearchPasses(win=window){
  if(win.ORDER_RESEARCH_PASSES)return win.ORDER_RESEARCH_PASSES;
  const active=new Set();
  function mount(root,state,api,renderer){
    const document=root.ownerDocument,controller=new win.AbortController(),signal=controller.signal,adapter=api.adapter,pending=new Map();let disposeRuntime,disposed=false,generation=0;
    const dispose=()=>{if(disposed)return;disposed=true;generation++;controller.abort();api.signal?.removeEventListener('abort',dispose);disposeRuntime?.();active.delete(dispose);};active.add(dispose);api.signal?.addEventListener('abort',dispose,{once:true});
    const live=()=>!disposed&&!signal.aborted;
    const paint=(state,rows)=>{
      disposeRuntime?.();renderer.setRows(rows);const styles=[...root.querySelectorAll(':scope > style')];root.innerHTML=renderer.render(state);root.prepend(...styles);
      // This application/panel has one retained header. Repainting data cannot
      // introduce a second brand or a static sample label.
      for(const element of root.querySelectorAll('.page-head,.brand,.nav-sample'))element.remove();
      disposeRuntime=renderer.mount(root,state,{...api,signal,passReceipt:receive});
      root.dataset.passDataSource=adapter.fixture?'qa-fixture':'service';
    };
    async function receive(pass,button){
      if(!live()||!pass.canReceive||!pass.purchaseId||!Number.isSafeInteger(pass.revision))throw Error('수령 확인 가능한 주문을 다시 불러와 주세요.');
      const key=pass.purchaseId+':'+pass.revision;let command=pending.get(key);
      if(!command){command={action:'receive',id:pass.purchaseId,expectedRevision:pass.revision,requestKey:win.crypto.randomUUID()};pending.set(key,command);}
      const request=async({signal:motionSignal=signal}={})=>{
        const result=await adapter.request('/purchases',command,win.AbortSignal.any?win.AbortSignal.any([signal,motionSignal]):signal);
        if(!live()||motionSignal.aborted)throw new win.DOMException('Aborted','AbortError');
        const item=result?.item;
        if(item?.id!==command.id||item.status!=='RECEIVED'||!Number.isSafeInteger(item.revision)||item.revision!==command.expectedRevision+1)throw Error('수령 결과를 확인하지 못했어요. 다시 시도해 주세요.');
        return item;
      };
      const item=api.motion?.run?await api.motion.run(button,request,{labels:{pending:'수령 확인 중',success:'수령 확인',error:'다시 시도'}}):await request();
      if(!live())throw new win.DOMException('Aborted','AbortError');
      pending.delete(key);return item;
    }
    async function load(){
      const own=++generation;
      const placeholders=Array.from({length:3},(_,i)=>({id:'loading-'+i,date:'0000.00.00',site:'사업장 견적',status:'불러오는 중',tone:'review',lines:[['주문 품목','000판','납품일']]}));
      paint(renderer.screen==='passes'?'loading':'empty',placeholders);
      const stage=root.querySelector('.pass-stage,.pass-search');stage?.setAttribute('aria-busy','true');
      let loading;if(renderer.screen==='search')loading=win.ORDER_COMMON_MOTION?.skeleton(stage);
      try{
        const [purchases,workspace]=await Promise.all([adapter.request('/purchases',null,signal),typeof adapter.roleRequest==='function'?adapter.roleRequest('/workspace',null,signal):Promise.resolve({quotes:[],businesses:[]})]);
        if(!live()||own!==generation)return;loading?.destroy();const rows=researchPassRows(purchases,workspace);
        const actual=renderer.screen==='passes'?(rows.length?(state==='deck'?'deck':'grid'):'empty'):(state==='detail'&&!rows.length?'empty':state);
        paint(actual,rows);root.dataset.passDataState='ready';
      }catch(error){
        if(!live()||own!==generation)return;loading?.destroy();disposeRuntime?.();disposeRuntime=null;root.dataset.passDataState='error';
        const notice=document.createElement('p');notice.setAttribute('role','alert');notice.textContent=adapter.message?.(error)||'오더 패스를 불러오지 못했어요.';
        const retry=document.createElement('button');retry.type='button';retry.className='btn secondary';retry.textContent='다시 불러오기';retry.addEventListener('click',load,{signal});const styles=[...root.querySelectorAll(':scope > style')];root.replaceChildren(...styles,notice,retry);
      }finally{loading?.destroy();}
    }
    if(api.signal?.aborted){dispose();return dispose;}const ready=load();dispose.ready=ready;return dispose;
  }
  const installed={mount,destroy(){for(const dispose of [...active])dispose();delete win.ORDER_RESEARCH_PASSES;}};win.ORDER_RESEARCH_PASSES=installed;return installed;
}
