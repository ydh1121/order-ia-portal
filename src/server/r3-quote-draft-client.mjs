// R1 3806e136: one current server draft per mode. The canonical quote app still
// owns local validation, edit cancellation and atomic confirmed input commits.
// This adapter syncs only that app's projected body checkpoint, never dialog
// fields or prototype data, and never resolves a revision conflict silently.
export function createQuoteDraftSync({mode,request,bridge,readMeta=()=>null,writeMeta=()=>{},onState=()=>{}}){
 const clone=value=>structuredClone(value),path='/drafts/'+mode;
 const project=value=>bridge.project(clone(value));
 const signature=value=>{const d=project(value);delete d.allocationRevision;return JSON.stringify(d);};
 const meaningful=value=>Boolean(value.lines?.length||value.locations?.length||value.allocations?.length||['housing','size','pack'].some(key=>value.bodyCheckpoint?.q1Selection?.[key])||bridge.hasInput?.(value));
 let revision=null,synced=null,blocked=false,pending=null,remote=null,ready=null,tail=Promise.resolve(),state='loading';
 const publish=(next,extra={})=>{state=next;onState({state:next,revision,blocked,pending:!!pending,...extra});};
 const result=(ok,status,extra={})=>({ok,status,...extra});
 const validate=value=>{if(!value||!Number.isSafeInteger(value.revision)||value.revision<0||value.mode&&value.mode!==mode)throw Error('INVALID_DRAFT_RESPONSE');return {...value,data:value.data==null?null:project(value.data)};};
 const remember=value=>{synced=signature(value);try{writeMeta({revision,signature:synced});}catch{}};
 async function start(){
  if(ready)return ready;
  ready=(async()=>{
   publish('loading');
   try{
    const before=signature(bridge.snapshot());
    remote=validate(await request(path));revision=remote.revision;
    const current=bridge.snapshot(),currentSignature=signature(current);
    if(remote.data==null){if(!meaningful(current))synced=currentSignature;publish('ready');return result(true,'READY');}
    const remoteSignature=signature(remote.data);
    if(currentSignature===remoteSignature){remember(remote.data);publish('saved');return result(true,'SAVED');}
    const meta=readMeta();
    if(before!==currentSignature||meaningful(current)&&meta?.signature!==currentSignature){blocked=true;publish('conflict');return result(false,'CONFLICT');}
    const restored=await bridge.restore(remote.data,{isCurrent:()=>signature(bridge.snapshot())===currentSignature});
    if(!restored.ok){blocked=true;publish('conflict');return result(false,'CONFLICT');}
    remember(bridge.snapshot());publish('saved');return result(true,'SAVED');
   }catch(error){publish('failed',{error});return result(false,'UNAVAILABLE');}
  })();
  return ready;
 }
 async function saveLatest({isCurrent=()=>true}={}){
  await start();
  if(!isCurrent())return result(false,'CANCELLED');
  if(revision===null){publish('failed');return result(false,'UNAVAILABLE');}
  if(blocked)return result(false,'CONFLICT');
  // Resolve an uncertain response with the same command before attempting a
  // newer value. A retry never silently reuses a key for different input.
  for(let writes=0;writes<4;writes++){
   if(!isCurrent())return result(false,'CANCELLED');
   let data;try{data=project(bridge.snapshot());}catch(error){publish('invalid',{error});return result(false,'INVALID_DATA');}
   const key=signature(data);
   if(!pending&&key===synced){publish('saved');return result(true,'SAVED',{revision});}
   if(!pending)pending={key,body:{expectedRevision:revision,requestKey:crypto.randomUUID(),data}};
   publish('saving');
   try{
    const reply=validate(await request(path,pending.body));
    if(reply.revision!==pending.body.expectedRevision+1||reply.data==null||signature(reply.data)!==pending.key)throw Error('INVALID_DRAFT_ACK');
    revision=reply.revision;remote=reply;remember(reply.data);pending=null;
    if(signature(bridge.snapshot())===synced){publish('saved');return result(true,'SAVED',{revision});}
   }catch(error){
    if(error.status===409){blocked=true;publish('conflict',{error});return result(false,'CONFLICT');}
    publish('failed',{error});return result(false,'UNAVAILABLE');
   }
  }
  publish('ready');return result(false,'INPUT_CHANGED');
 }
 function flush(options){const next=tail.then(()=>saveLatest(options),()=>saveLatest(options));tail=next.catch(()=>{});return next;}
 async function retry(){
  if(revision===null){ready=null;await start();}
  return flush();
 }
 async function choose(which){
  if(!['local','server'].includes(which))return result(false,'INVALID_CHOICE');
  const initial=signature(bridge.snapshot());publish('loading');
  try{
   const latest=validate(await request(path));
   if(signature(bridge.snapshot())!==initial){publish('conflict');return result(false,'INPUT_CHANGED');}
   if(which==='server'&&latest.data){const loaded=await bridge.restore(latest.data,{isCurrent:()=>signature(bridge.snapshot())===initial});if(!loaded.ok){publish('conflict');return loaded;}}
   revision=latest.revision;remote=latest;pending=null;blocked=false;ready=Promise.resolve(result(true,'READY'));
   if(which==='server'&&latest.data){remember(bridge.snapshot());publish('saved');return result(true,'SAVED');}
   synced=null;return flush();
  }catch(error){publish(blocked?'conflict':'failed',{error});return result(false,'UNAVAILABLE');}
 }
 // Mode copying keeps the original local writer and its cancellation gate. Its
 // optimistic token includes both stores; neither an intervening local edit nor
 // another server tab is mistaken for the snapshot confirmed in the dialog.
 function destinationStore(local){
  let uncertain=null,accepted=null;
  const destinationPath='/drafts/detailed';
  const make=async()=>{
   const [own,server]=await Promise.all([local.load(),request(destinationPath)]);
   if(!own.ok)return own;
   if(!server||!Number.isSafeInteger(server.revision)||server.revision<0)throw Error('INVALID_DRAFT_RESPONSE');
   const serverData=server.data==null?null:project(server.data);
   if(serverData&&meaningful(own.data)&&signature(own.data)!==signature(serverData))return result(false,'CONFLICT');
   const value=serverData||own.data;
   return {ok:true,status:'LOADED',revision:server.revision,versionToken:JSON.stringify([server.revision,own.revision,own.versionToken]),data:clone(value),localRevision:own.revision,localToken:own.versionToken};
  };
  let opening=null;const snapshots=new Map();
  const keep=value=>{if(value.ok)snapshots.set(value.versionToken,value);return value;};
  const reopen=async()=>{
   if(uncertain){
    try{const reply=await request(destinationPath,uncertain.body);if(reply.revision!==uncertain.body.expectedRevision+1||signature(reply.data)!==signature(uncertain.body.data))throw Error('INVALID_DRAFT_ACK');accepted={...uncertain,reply};uncertain=null;return accepted.before;}
    catch(error){return result(false,error.status===409?'CONFLICT':'WRITE_FAILED');}
   }
   if(accepted)return accepted.before;
   try{return keep(await make());}catch{return result(false,'UNAVAILABLE');}
  };
  return {
   inspectCurrent(){opening=reopen();return opening;},
   async load(){if(opening)await opening;return reopen();},
   async commit(data,options={}){
    const {expectedRevision,expectedToken,canCommit=()=>true}=options;
    if(!canCommit())return result(false,'CANCELLED');
    const before=snapshots.get(expectedToken);
    if(!before||before.revision!==expectedRevision)return result(false,'CONFLICT');
    const projected=project(data);
    if(accepted){if(accepted.before.versionToken!==expectedToken||signature(accepted.body.data)!==signature(projected))return result(false,'CONFLICT');return result(true,'IDEMPOTENT',{data:clone(projected),revision:accepted.reply.revision});}
    const current=await reopen();if(!canCommit())return result(false,'CANCELLED');
    if(!current.ok||current.versionToken!==expectedToken)return result(false,'CONFLICT');
    const saved=await local.commit(projected,{...options,expectedRevision:before.localRevision,expectedToken:before.localToken});
    if(!saved.ok)return saved;
    // The original domain write has passed canCommit and is already confirmed.
    // Persist that confirmed copy even if a later closing gesture occurs.
    const attempt={before,body:{expectedRevision,requestKey:options.transactionId||crypto.randomUUID(),data:projected}};
    try{const reply=await request(destinationPath,attempt.body);if(reply.revision!==expectedRevision+1||signature(reply.data)!==signature(projected))throw Error('INVALID_DRAFT_ACK');accepted={...attempt,reply};return result(true,'COMMITTED',{data:clone(projected),revision:reply.revision});}
    catch(error){if(error.status!==409)uncertain=attempt;return result(false,error.status===409?'CONFLICT':'WRITE_FAILED');}
   }
  };
 }
 return {start,flush,retry,choose,destinationStore,inspect:()=>({mode,revision,state,blocked,pending:!!pending,dirty:signature(bridge.snapshot())!==synced})};
}

export function mountQuoteDraftSync(app,createSync){
 const adapter=window.ORDER_APP_ADAPTER,bridge=app.quoteDraftBridge;
 if(!adapter?.request||!bridge||(window.ORDER_APP_CONTEXT?.authenticated??window.ORDER_APP_CONTEXT?.actor?.authenticated??true)===false)return null;
 const mode=document.documentElement.dataset.r3QuoteMode==='simple'?'simple':'detailed';
 const partition=document.documentElement.dataset.r3QuotePartition;
 const key=['order.quote.server-meta.v1',partition,mode,window.ORDER_APP_CONTEXT?.runId||'product',window.ORDER_APP_CONTEXT?.persona||''].join(':');
 const host=document.createElement('div');host.className='add-row r3-draft-status';
 const status=document.createElement('p');status.className='ui-field-error';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const action=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='ui-copy-action';b.textContent=label;b.hidden=true;b.onclick=fn;return b;};
 let sync,timer=null;
 const retry=action('자동저장 다시 시도',()=>void sync.retry());
 const server=action('서버 초안으로 바꾸기',()=>void sync.choose('server'));
 const local=action('현재 입력으로 서버 초안 변경',()=>void sync.choose('local'));
 host.append(status,retry,server,local);document.getElementById('checkpoint-status')?.after(host);
 const messages={loading:'최근 작성 내용을 확인하고 있어요.',ready:'모드별 최근 작성 내용 하나만 자동 저장합니다.',saving:'최근 작성 내용을 저장하고 있어요.',saved:'모드별 최근 작성 내용이 저장됐어요.',conflict:'다른 창의 초안과 현재 입력이 달라요. 현재 입력은 유지했습니다.',failed:'서버 저장을 확인하지 못했어요. 현재 입력은 유지했습니다.',invalid:'작성 중인 입력을 확인해 주세요. 현재 입력은 유지했습니다.'};
 sync=createSync({mode,request:async(...args)=>{await adapter.ready;return adapter.request(...args);},bridge,
  readMeta:()=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}},
  writeMeta:value=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}},
  onState:value=>{host.dataset.state=value.state;status.textContent=messages[value.state]||messages.failed;retry.hidden=!['failed','invalid'].includes(value.state);server.hidden=local.hidden=value.state!=='conflict';for(const b of [retry,server,local])b.disabled=['loading','saving'].includes(value.state);}
 });
 window.ORDER_QUOTE_DRAFT_SYNC=sync;
 const schedule=event=>{if(event?.target?.closest?.('.r3-draft-status'))return;clearTimeout(timer);timer=setTimeout(()=>{if(bridge.canSave())void sync.flush();},500);};
 for(const type of ['input','change','click'])document.getElementById('app')?.addEventListener(type,schedule);
 document.addEventListener('order-quote-committed',schedule);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&bridge.canSave())void sync.flush();});
 window.addEventListener('beforeunload',event=>{if(sync.inspect().dirty||sync.inspect().pending){event.preventDefault();event.returnValue='';}});
 void sync.start().then(value=>{if(value?.ok&&bridge.canSave())return sync.flush();}).catch(()=>{});
 return sync;
}
