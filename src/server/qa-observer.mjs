/** IA half of the existing MSG0568 protocol. The export name is protocol lineage.
 * R4 transport recognition is PREPARED_NOT_BOUND: it is not catalogue registration,
 * a provider/document allowlist, a research permit, publication or native acceptance.
 * Immutable UX files own the inner/outward bridge; never inject or clone that bridge.
 */
export function createR3ObserverSession(identity,emit=()=>{},options={}){
 const schema='order.ia.viewer/1',revision='ux-r3-observer-1';
 const fields=['artifact_id','version','package_sha256','entrypoint_sha256','baseline_commit'];
 const isR4=identity?.artifact_id==='ORDER-DESIGN-QA-0569-R4'&&identity.version==='R4'&&identity.package_sha256==='b36f967d8ee08a9da46ba1a548961a342ca78b29d572ea4eca7d4c3e0eff9196'&&identity.entrypoint_sha256==='b063eeb3142ec91ee961eca5fd656388aa5725fbf86b06c39cc088a26703033a';
 const isR3=identity?.artifact_id==='ORDER-DESIGN-QA-0569-R3'&&identity.version==='R3';
 if((!isR3&&!isR4)||identity.baseline_commit!=='b7ca48c432cbd1284d15def276aea708a16dc99d'||!['package_sha256','entrypoint_sha256'].every(k=>typeof identity[k]==='string'&&/^[a-f0-9]{64}$/.test(identity[k])))throw Error('UNSUPPORTED_VIEWER_REVISION');
 const fixed=Object.fromEntries(fields.map(k=>[k,identity[k]]));
 const nonce=options.nonce||crypto.randomUUID();if(!/^[A-Za-z0-9_-]{16,128}$/.test(nonce))throw Error('INVALID_NONCE');
 const stages=new Set(['wrapper-start','wrapper','boot','style','iframe-document-requested','child-document','envelope-validated','capabilities-checked','module-scheduled','modules-executed','product-ready','boot-timeout','disposed']);
 const codes=new Set(['WRAPPER_RUNTIME_ERROR','WRAPPER_REJECTION','WRAPPER_INITIALIZATION_FAILED','BOOT_INSTANCE_MARKER_INVALID','BOOT_MARKER_INVALID','RANDOM_ID_UNAVAILABLE','BOOT_TIMEOUT','ENVELOPE_MISSING','ENVELOPE_DUPLICATE','ENVELOPE_NODE_COUNT_INVALID','ENVELOPE_JSON_INVALID','ENVELOPE_SCHEMA_INVALID','INSTANCE_INVALID','WEBCRYPTO_UNAVAILABLE','IMPORTMAP_UNSUPPORTED','DIALOG_UNSUPPORTED','SHA256_UNAVAILABLE','QA_FIXTURE_REJECTED','MODULE_LOAD_ERROR','UNCLASSIFIED_RUNTIME_ERROR','BOOTSTRAP_FAILED','RESOURCE_MISSING','PRESET_REFUSED','PRESET_BUSY','STYLE_SETTLE_TIMEOUT','STYLE_INTERRUPTED_INPUT','STATE_PRESERVATION_UNCONFIRMED','STYLE_APPLY_FAILED','STYLE_CANCELLED','STYLE_CANCELLED_AFTER_SETTLE','STYLE_ACCEPT_TIMEOUT','STYLE_ACCEPT_STATE_CHANGED','STYLE_ACCEPT_INTERRUPTED','STYLE_CHANGED_BEFORE_ACCEPT','STYLE_CANCELLED_BEFORE_ACCEPT','STYLE_DISPOSED','STYLE_RECOVERY_REQUESTED','CANCEL_CONFIRMED_BY_PROBE','PRESERVATION_RECEIPT_INVALID','ACCEPTANCE_RECEIPT_INVALID','OUTER_HOOK_FAILED','UNKNOWN_FAILURE','CSP_BLOCKED']);
 // R4 adds two observations and three boot codes; its inherited R3.1 recovery
 // also emits a terminal STYLE_RECOVERY_TIMEOUT. None establishes readiness.
 if(isR4){for(const x of ['module-import-started','module-import-resolved'])stages.add(x);for(const x of ['PARENT_ORIGIN_UNAVAILABLE','ENVELOPE_PARENT_ORIGIN_INVALID','MODULE_EXECUTION_ERROR','STYLE_RECOVERY_TIMEOUT'])codes.add(x)}
 const presets=new Set(['original','ibm','linear','vercel']);
 const checks=['committed','validation','inputs','view','scroll','focus'];
 const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
 const preserved=o=>exact(o,checks)&&checks.every(k=>o[k]===true);
 const generationOK=g=>Number.isSafeInteger(g)&&g>=0;
 const sequence=id=>typeof id==='string'&&/^ux-[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id.slice(3)))?Number(id.slice(3)):0;
 const set=options.setTimeout||globalThis.setTimeout,clear=options.clearTimeout||globalThis.clearTimeout;
 const timeout=Math.min(15000,Math.max(250,options.timeoutMs??8000));
 // The R4 package owns its 12s initial deadline. Do not cut it off with the
 // legacy 8s style timer. Stage/probe observations cannot renew this deadline.
 const bootTimeout=isR4?15000:timeout;
 let state='IDLE',source=null,attached=false,closed=false,timer=null,generation=-1,childObserved=false,ready=false,failed=false,preset='original',active=null,lastSequence=0,announced=null,lastStage=null;
 const envelope=(type,requestId)=>({schema,revision,type,nonce,...fixed,...(requestId?{request_id:requestId}:{})});
 const report=(next,code=null)=>{state=next;emit({state,code,generation,preset,active_request:active?.id||null,accepted:next==='ACCEPTED',...(isR4?{stage:lastStage}:{})})};
 const stop=()=>{if(timer!==null){clear(timer);timer=null}};
 const close=next=>{if(closed)return false;const command=envelope('dispose');stop();closed=true;ready=false;active=null;announced=null;source=null;report(next);options.onClose?.(command);return true};
 const wait=(delay=timeout)=>{stop();timer=set(()=>close('TIMEOUT'),delay)};
 const correlated=d=>active&&d.request_id===active.id&&d.payload.preset===active.preset;
 function receive(event){
  const d=event?.data;
  if(closed||!source||event.source!==source||event.origin!=='null'||!d||!exact(d,['schema','revision','type','nonce',...fields,'payload',...(Object.hasOwn(d,'request_id')?['request_id']:[])])||d.schema!==schema||d.revision!==revision||d.nonce!==nonce||fields.some(k=>d[k]!==fixed[k]))return false;
  const p=d.payload,withRequest=Object.hasOwn(d,'request_id');
  if(d.type==='boot'){
   if(withRequest||!exact(p,['stage','generation','child_observed','capabilities'])||!stages.has(p.stage)||!generationOK(p.generation)||p.generation<=generation||typeof p.child_observed!=='boolean'||!exact(p.capabilities,['preset_control','wrapper_preset_observation','probe','cancel_style','dispose'])||p.capabilities.preset_control!==false||!['wrapper_preset_observation','probe','cancel_style','dispose'].every(k=>p.capabilities[k]===true))return false;
   generation=p.generation;lastStage=p.stage;childObserved=p.child_observed;ready=false;failed=false;active=null;announced=null;preset='original';report('BOOTING');wait(bootTimeout);return true;
  }
  if(d.type==='disposed'){
   if(withRequest||!exact(p,['stage','generation'])||p.stage!=='disposed'||p.generation!==generation)return false;
   return close('DISPOSED');
  }
  if(generation<0||failed)return false;
  if(d.type==='stage'){
   if(withRequest||!exact(p,['stage','generation'])||!stages.has(p.stage)||p.generation!==generation)return false;
   lastStage=p.stage;if(p.stage==='child-document')childObserved=true;
   if(isR4)emit({state,code:null,generation,preset,active_request:active?.id||null,accepted:false,stage:lastStage,observation_only:true});return true;
  }
  if(d.type==='ready'){
   if(withRequest||!exact(p,['gates','preset','generation','active_request','active_phase'])||!exact(p.gates,['modules','storage','pending'])||p.gates.modules!==true||p.gates.storage!==true||p.gates.pending!==false||!childObserved||p.generation!==generation||!presets.has(p.preset))return false;
   if(p.active_request===null){if(p.active_phase!==null||active)return false}
   else if(!sequence(p.active_request)||!['pending','applied','recovering'].includes(p.active_phase)||active&&(p.active_request!==active.id||p.active_phase!==active.phase))return false;
   ready=true;lastStage='product-ready';
   if(active){report(state);return true} // A probe never consumes outstanding applied/recovery work.
   preset=p.preset;announced=p.active_request;
   if(announced){report('AWAITING_STYLE_RECEIPT');wait()}else{stop();report('READY')}
   return true;
  }
  if(d.type==='pending'){
   const seq=sequence(d.request_id);
   if(!withRequest||!exact(p,['preset','accepted'])||p.accepted!==false||!presets.has(p.preset)||!ready||active||seq<=lastSequence||announced&&announced!==d.request_id)return false;
   lastSequence=seq;announced=null;active={id:d.request_id,preset:p.preset,previous:preset,phase:'pending',hadApplied:false,cancelRequested:false};report('PENDING');wait();return true;
  }
  if(d.type==='applied'||d.type==='accepted'){
   const accepted=d.type==='accepted';
   if(!withRequest||!exact(p,['preset','checks','accepted',...(accepted?['recovery']:[])])||!correlated(d)||!preserved(p.checks)||p.accepted!==accepted)return false;
   if(!accepted){if(active.phase!=='pending')return false;active.phase='applied';active.hadApplied=true;report('APPLIED_PENDING_ACCEPT');wait();return true}
   const normal=active.phase==='applied'&&p.recovery===false,recovered=active.phase==='recovering'&&active.hadApplied&&p.recovery===true;
   if(!normal&&!recovered)return false;
   preset=active.preset;active=null;ready=true;stop();report('ACCEPTED');return true;
  }
  if(d.type==='recovering'||d.type==='cancel-requested'){
   const recovering=d.type==='recovering';
   if(!withRequest||!exact(p,['preset','accepted',...(recovering?['code']:[])])||!correlated(d)||p.accepted!==false||recovering&&!codes.has(p.code))return false;
   active.cancelRequested=true;if(recovering)active.phase='recovering';report(recovering?'RECOVERING':'CANCEL_REQUESTED');wait();return true;
  }
  if(d.type==='error'){
   if(!p||!stages.has(p.stage)||!codes.has(p.code)||p.generation!==generation||p.accepted!==false)return false;
   const keys=['stage','code','generation','restored','accepted','terminal'];
   if(!withRequest){if(!exact(p,keys)||p.restored!==false||p.terminal!==true)return false;stop();lastStage=p.stage;ready=false;failed=true;active=null;announced=null;report(p.code==='RESOURCE_MISSING'?'MISSING_RESOURCE':'BOOT_FAILED',p.code);return true}
   if(!correlated(d))return false;
   // Actual R4 outward bridge: failed bounded recovery is terminal, not a
   // rollback receipt and not an instruction to restart its recovery timer.
   if(isR4&&p.restored===false&&p.terminal===true){
    if(!exact(p,[...keys,'preset']))return false;
    stop();lastStage=p.stage;ready=false;failed=true;active=null;announced=null;report('STYLE_FAILED',p.code);return true;
   }
   if(p.restored===true){if(!exact(p,[...keys,'preset','restored_preset'])||p.terminal!==true||p.restored_preset!==active.previous)return false;preset=active.previous;active=null;ready=false;stop();report('ROLLED_BACK',p.code);return true}
   if(!exact(p,[...keys,'preset','recovering'])||p.restored!==false||p.terminal!==false||p.recovering!==true)return false;
   active.phase='recovering';ready=false;report('RECOVERING',p.code);wait();return true;
  }
  return false;
 }
 return Object.freeze({
  get state(){return state},get nonce(){return nonce},get selectedPreset(){return preset},get lastStage(){return lastStage},
  attach(windowProxy){if(attached||closed||!windowProxy)throw Error('VIEWER_ALREADY_ATTACHED');attached=true;source=windowProxy;report('BOOTING');wait(bootTimeout);return envelope('host-init')},
  onLoad(){/* Neither onload nor an API response establishes readiness. */},
  message:receive,
  probe(){if(!attached||closed)throw Error('VIEWER_CLOSED');return envelope('probe')},
  cancel(){if(closed||!active||active.cancelRequested)throw Error('NO_PENDING_STYLE');active.cancelRequested=true;return envelope('cancel',active.id)},
  request(){throw Error('PACKAGE_OWNS_PRESET_CONTROL')},
  dispose(){return close('DISPOSED')}
 });
}
