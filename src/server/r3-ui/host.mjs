// Trusted top-level chrome. Only typed review fields and allow-listed UI positions are persisted.
export function bootQaHost(nonce, frameBootstrap, bootShell, exportReview, createBuyerResult, projectBuyerResult, motionReview={requirements:[]}, createResearchExports=null) {
  const $=id=>document.getElementById(id),release='MSG0585-R3',base='/api/ia/r3-qa';
  const node=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
  function btn(text,handler){const b=node('button',text);b.type='button';b.onclick=handler;return b;}
  let statusTimer;
  const status=msg=>{const live=$('live');live.textContent=msg;live.classList.add('is-visible');clearTimeout(statusTimer);
    statusTimer=setTimeout(()=>live.classList.remove('is-visible'),3400);};
  const records=new Map(),legacy=new Map(),edits=new Map(),secondary=new Map();
  // Historical source documents are read-only evidence for display projection.
  // Neither the stored anchor nor its source artifact identity is rewritten.
  const pinSources=new Map(),pinSourceRequests=new Map();
  const pinSourceFrames=new Map(),pinSourceQueue=[],pinSourceActive=new Set(),pinSourceAttempted=new Set();
  let pinSourceEpoch=0,pinSourcePaused=false,pinSourceCacheBytes=0;
  let screens=[],current=null,artifact=null,target=null,csrf='',filter='all',session='',generation=0,cursor=0,editor=null,pending=null,storing=false,missing=new Set(),subset=null;
  let legacyAvailable=false,reviewAvailable=false,displayPins=true,wantsPoint=false,continuousPoints=false;
  let shell, commentFilter='open';
  let pendingPurchaseFixture=null;
  let navigation=null,navigationPending=false,navigationReady=false;
  // IDs of the recorded two-tab exercise, confirmed by the physical D1 receipts.
  // Text, account identity and date alone are insufficient to classify a user note.
  const testThread='682bf278-9317-4944-be49-c6bfd906d950';
  const isTest=r=>r?.release===release && (r.kind==='comment' && r.id===testThread ||
    r.kind==='reply' && r.data.parent?.origin==='current' && r.data.parent.id===testThread);
  const showTest=()=>$('audit-demo')?.checked===true;
  const frame=$('frame'), drawer=$('drawer'),body=$('body-text');
  const researchExports=typeof createResearchExports==='function'?createResearchExports():null;
  const exportLabels=new Map(['export','export-editable','export-runnable'].map(id=>[id,$(id)?.textContent]));
  let researchExportPending=false;
  function presentExports(){
    for(const [id,label]of exportLabels)if($(id))$(id).textContent=artifact?.application?(id==='export-runnable'?'연구본 실행 링크':'현재 화면 HTML'):label;
  }
  let displayed=null, transitionTimeout=0, exitAnimation=null, publication=null;
  // Desired review target and the live app's acknowledged session can differ
  // while an artifact lookup or message is in flight. Keep the latter until a
  // newer authenticated ready/route proves that the same app adopted its token.
  let researchLive=null,researchPending=null,researchDocumentBuild=null,researchRouteRevision=0;
  let reviewMode='simple',detailedCatalog=null,detailedCatalogRequest=null;
  const modeOf=value=>value?.mode==='detailed'?'detailed':'simple';
  const modeFields=mode=>mode==='detailed'?{mode:'detailed'}:{};
  const validMode=value=>value===undefined||value==='simple'||value==='detailed';
  const sameMode=(a,b)=>validMode(a?.mode)&&validMode(b?.mode)&&modeOf(a)===modeOf(b);
  const atMode=(value,mode)=>({...value,mode});
  const rowMode=row=>row?.mode||((row?.application)?reviewMode:'simple');
  const rowHash=(row,width)=>rowMode(row)==='detailed'?detailedCatalog?.get(row.id)?.hashes?.[width]:row.hashes?.[width];
  const rowView=(row,width)=>({screen:row.screen,state:row.state,variant:row.variant,viewport:width,artifactHash:rowHash(row,width),...modeFields(rowMode(row))});
  function modeUrl(url,mode){
    const previous=url.searchParams.get('mode');
    if(['focus','board','dual'].includes(previous)&&!url.searchParams.has('preview'))url.searchParams.set('preview',previous);
    if(mode==='detailed')url.searchParams.set('mode','detailed');else url.searchParams.delete('mode');return url;
  }
  async function loadDetailedCatalog(){
    if(detailedCatalog)return detailedCatalog;
    if(!detailedCatalogRequest)detailedCatalogRequest=api(base+'/artifact?mode=detailed').then(result=>{
      if(result.mode!=='detailed'||!Array.isArray(result.items))throw Error('INVALID_DETAILED_CATALOG');
      detailedCatalog=new Map(result.items.map(row=>[row.id,row]));return detailedCatalog;
    }).finally(()=>{detailedCatalogRequest=null;});
    return detailedCatalogRequest;
  }
  const researchCandidates=new Map();
  function rememberResearch(value){
    researchCandidates.set(value.channel,value);
    while(researchCandidates.size>32){const key=researchCandidates.keys().next().value;if(key===researchLive?.channel){const live=researchCandidates.get(key);researchCandidates.delete(key);researchCandidates.set(key,live);}else researchCandidates.delete(key);}
  }
  function resetResearch(){researchLive=null;researchPending=null;researchDocumentBuild=null;researchRouteRevision=0;researchCandidates.clear();}
  function sendResearchSelection(){
    const next=researchPending,live=researchLive;
    if(!next||next.generation!==generation||!live||live.application!==next.identity.application||next.from===live.channel)return;
    next.from=live.channel;rememberResearch(next.identity);
    frame.contentWindow.postMessage({scope:'ORDER_R3_HOST',channel:live.channel,artifact:live.hash,type:'researchSelect',payload:next.payload},location.origin);
  }
  function researchFailed(message='검토 화면 정보를 불러오지 못했습니다. 앱의 입력은 유지됩니다. 화면을 다시 선택해 주세요.'){
    clearTimeout(transitionTimeout);researchPending=null;displayed=null;target=null;artifact=null;session='';frame.inert=false;
    status(message);
  }
  function historyResearchNotice(row,width,hash,mode='simple'){
    status('이력 앱 안에서 이동했습니다. 원래 검토 화면으로 돌아와 위치 의견을 확인해 주세요.');clearTimeout(statusTimer);
    if(row)$('live').append(document.createTextNode(' '),btn('이력 원화면 다시 열기',()=>{shell?.setActiveMode?.('focus');$('width').value=String(width);return select(atMode(row,mode),'recorded',null,hash);}));
  }
  let returnMode=history.state?.orderReviewMode;
  function restoreOnboardingChoice(){
    if(!returnMode||!displayed||current?.screen!=='onboarding'||current.id!==returnMode.row)return;
    if(['simple','detailed'].includes(returnMode.mode))send('returnToMode',{mode:returnMode.mode});
    returnMode=null;
    const state={...history.state};delete state.orderReviewMode;history.replaceState(state,'',location.href);
  }
  addEventListener('pageshow',event=>{
    if(event.persisted){returnMode=history.state?.orderReviewMode;restoreOnboardingChoice();}
  });
  const motionModes={replay:'다시 재생',normal:'정상',delay:'지연',error:'오류',offline:'오프라인',complete:'완료'};
  function scenario(mode){
    if(!target||!displayed||displayed.channel!==session||!Object.hasOwn(motionModes,mode)||artifact?.version!=='current')return;
    send('motionScenario',{mode});
    if($('motion-note'))$('motion-note').textContent='검수 입력 · '+motionModes[mode];
  }
  function presentMotion(){
    const box=$('motion-sources');if(!box||!current||!target)return;
    const version=artifact?.version;
    const sourceCommit=artifact?.archivedSource?.commit||publication?.iaCommit;
    box.replaceChildren();$('motion-actions').replaceChildren();$('motion-note').textContent='';
    const build=$('motion-build');
    build.textContent=version==='current'?
      [('IA '+(sourceCommit?.slice(0,12)||'게시 확인 대기')),'제품 '+(publication?.productCommit||motionReview.product||'미확인').slice(0,12),'화면 '+target.artifactHash.slice(0,12),!artifact?.archivedSource&&publication?.deploymentId&&'배포 '+publication.deploymentId].filter(Boolean).join(' · '):
      '이전 검토판 · 화면 '+target.artifactHash.slice(0,12);
    if(version!=='current')return;
    if(sourceCommit&&/^[a-f0-9]{40}$/.test(sourceCommit)){
      const link=node('a','검토 중인 IA 코드');link.href='https://github.com/ydh1121/order-ia-portal/commit/'+sourceCommit;
      link.rel='noopener noreferrer';link.target='_blank';build.append(document.createTextNode(' '),link);
    }
    if(artifact?.source?.mode==='controlled-qa'){
      const detail=node('details'),summary=node('summary',artifact?.archivedSource?'보존된 화면 소스':'현재 화면 소스');detail.append(summary,node('p','제품 화면과 같은 코드를 실행하며, 로그인·DB 응답은 QA 더미 상태로 제어합니다.'));
      for(const path of artifact.source.files||[]){
        if(typeof path!=='string'||!/^((src\/server)|(scripts\/r3))\/[a-zA-Z0-9_./-]+$/.test(path))continue;
        const entry=node(sourceCommit?'a':'p',path);
        if(sourceCommit&&/^[a-f0-9]{40}$/.test(sourceCommit)){entry.href='https://github.com/ydh1121/order-ia-portal/blob/'+sourceCommit+'/'+path;entry.target='_blank';entry.rel='noopener noreferrer';}
        detail.append(entry);
      }
      detail.append(node('small','위치 의견은 이 화면의 소스 해시와 컴포넌트 위치에 연결됩니다.'));box.append(detail);
    }
    const canSimulate=['quote-wait','common'].includes(current.screen)||current.screen.startsWith('admin-');
    const options=current.screen==='quote-result'?['replay']:canSimulate?Object.keys(motionModes):[];
    for(const key of options){
      const control=btn(motionModes[key],()=>scenario(key));control.dataset.motionMode=key;$('motion-actions').append(control);
    }
    for(const r of motionReview.requirements.filter(r=>r.screens.includes('*')||r.screens.includes(current.screen)||(r.screens.includes('admin-*')&&current.screen.startsWith('admin-')))){
      const d=node('details'),summary=node('summary',r.id+' · '+r.name);d.append(summary,node('p',r.trigger),node('p',r.scope));
      if(r.status==='SUPERSEDED')d.append(node('p','후속 요청으로 제외'));
      const sourceLabel=r.sourceState==='PUBLIC_PREVIEW_ONLY_SOURCE_ACCESS_LIMITED'?'공개 예시 확인 · 코드 접근 제한':r.sourceState==='REFERENCE_IDENTIFIED'?'원문 참조 확인':r.sourceState==='SELECTED_MEDIA_OBSERVATIONS_ARCHIVED'?'지정 영상 관찰 기록 보존':'원문 보관';
      d.append(node('small',sourceLabel));
      if(r.application){
        const sample=screens.find(row=>row.id.startsWith(r.application.example+'/'));
        if(sample)d.append(node('p','대표 화면 · '+sample.label+' / '+sample.stateLabel));
        d.append(node('p',r.application.behavior),node('p','남은 확인 · '+r.application.remaining));
      }
      for(const [i,url] of r.links.entries()){
        const link=node('a','참조 '+(i+1));link.href=url;link.target='_blank';link.rel='noopener noreferrer';d.append(link,document.createTextNode(' '));
      }
      if(r.feedback.length)d.append(node('small','관련 Figma 의견 '+r.feedback.join(', ')));
      box.append(d);
    }
  }
  let sessionNotice;
  document.addEventListener('ia-session-expired',()=>{
    remember();
    if(!sessionNotice){
      sessionNotice=node('aside');sessionNotice.id='qa-session-notice';sessionNotice.setAttribute('role','alert');
      const label=node('span','로그인을 다시 연결해 주세요. 작성 중인 의견은 이 탭에 남아 있어요.');
      const link=node('a','로그인 열기');const u=new URL('/login',location.href);u.searchParams.set('returnView','qa-lab');
      if(current)u.searchParams.set('screen',current.id);if(target)u.searchParams.set('width',target.viewport);
      link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';
      sessionNotice.append(label,link,btn('연결 확인',()=>document.dispatchEvent(new Event('ia-session-check'))));$('lab').append(sessionNotice);
    }
    sessionNotice.hidden=false;
  });
  document.addEventListener('ia-session-restored',event=>{
    if(typeof event.detail?.csrf!=='string')return;
    csrf=event.detail.csrf;if(sessionNotice)sessionNotice.hidden=true;
    if(!navigationReady)void loadNavigation();
    refresh().then(()=>status('다시 연결했어요. 작성 중인 의견을 계속 저장할 수 있어요.'));
  });
  const reviewKey=(v,width)=>[v.screen,v.state,v.variant,width].join('/')+(modeOf(v)==='detailed'?'/detailed':'');
  const localKey=(kind,id)=>kind+'/'+id;
  function retainLatestRecord(kind,id,record){
    const key=localKey(kind,id),known=records.get(key);
    if(record?.id===id&&Number.isInteger(record.revision)&&(!known||record.revision>known.revision))records.set(key,record);
    return records.get(key);
  }
  const match=(t,v,width)=>t&&t.screen===v.screen&&t.state===v.state&&t.variant===v.variant&&t.viewport===width&&modeOf(t)===modeOf(v);
  const announceError=e=>status(e.status===401||e.status===403?'접근 권한을 확인해 주세요.':'불러오지 못했습니다. 다시 시도해 주세요.');
  async function api(url,options={}){
    const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});
    const json=(r.headers.get('content-type')||'').includes('application/json');
    const invalidate=reason=>{remember();document.dispatchEvent(new CustomEvent('ia-session-invalid',{detail:{reason}}));};
    if(r.redirected||r.type==='opaqueredirect'||!json&&(r.ok||r.status===401||r.status===403)){
      invalidate('AUTHENTICATION_REQUIRED');throw Object.assign(Error('SESSION_REQUIRED'),{status:401});
    }
    if(!json)throw Object.assign(Error('SERVICE_UNAVAILABLE'),{status:r.status});
    const j=await r.json();
    if(!r.ok){
      if(r.status===401||r.status===403&&['SESSION_DENIED','LOGIN_DENIED','AUTHENTICATION_REQUIRED','IA_ACCESS_DENIED'].includes(j.error))invalidate(j.error||'SESSION_REQUIRED');
      // Permission and CSRF denials do not prove that the user signed out.
      if(j.error==='CSRF_DENIED')document.dispatchEvent(new Event('ia-session-check'));
      const e=Error(j.error||'FAILED');Object.assign(e,{status:r.status,current:j.current});throw e;
    }
    return j;
  }
  async function loadNavigation(){
    try{navigation=await api(base+'/navigation');navigationReady=true;list();}
    catch(e){navigationReady=false;status('메뉴 구성을 불러오지 못했습니다. 화면 검토는 계속할 수 있어요.');}
  }
  async function saveNavigation(layout){
    if(!navigationReady||navigationPending)return;
    const previous=navigation;navigation={...navigation,layout};navigationPending=true;list();
    try{
      navigation=await api(base+'/navigation',{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':csrf},body:JSON.stringify({expectedRevision:previous.revision,layout})});
      status('메뉴 구성을 저장했어요. 다른 기기에서도 이어집니다.');
    }catch(e){
      navigation=e.current||previous;
      status(e.status===409?'다른 창에서 바뀐 메뉴를 불러왔어요. 이동이나 이름 변경을 다시 해 주세요.':'메뉴를 저장하지 못했어요. 변경 전 구성을 유지합니다.');
    }finally{navigationPending=false;list();}
  }
  function showRecords(){const d=new Map();for(const r of records.values()){const t=r.data?.target;if(!t)continue;const k=reviewKey(t,t.viewport);if(!d.has(k))d.set(k,[]);d.get(k).push(r);}return d;}
  function stateInfo(row,width,index){
    const view=rowView(row,width),key=reviewKey(view,width), past=legacy.get(key),live=index.get(key)||[];
    const reviewed=live.find(r=>r.kind==='review'&&r.data.target.artifactHash===view.artifactHash);
    const changes=live.filter(r=>r.kind==='change'&&r.data.target.artifactHash===view.artifactHash);
    const hasStatus=(...states)=>changes.some(r=>states.includes(r.data.status));
    const oldApproval=past?.status==='okay'||live.some(r=>r.kind==='review'&&r.data.decision==='approved'&&r.data.target.artifactHash!==view.artifactHash);
    const changed=row.authoredChange||hasStatus('implemented','verified','recheck');
    return {implemented:hasStatus('implemented'),verified:hasStatus('verified'),blocked:hasStatus('blocked'),untouched:hasStatus('not_started'),previous:feedbackFor(row,width).some(item=>item.previous&&item.actionable),changed,approved:reviewed?.data.decision==='approved',unreviewed:!reviewed||reviewed.data.decision==='unreviewed',requested:reviewed?.data.decision==='changes_requested',needs:reviewed?.data.decision==='changes_requested'||(changed||oldApproval)&&!reviewed,unknown:hasStatus('unknown')||(!changes.length&&!row.authoredChange),oldApproval};
  }
  const filters=[['all','▤','전체'],['previous','↶','이전 수정 요청'],['changed','✎','이번 판 수정'],['approved','✓','사용자 통과'],['unreviewed','○','미검토'],['unknown','?','확인 전'],['needs','↻','재검토'],['untouched','…','미착수'],['verified','☑','구현 검증'],['blocked','Ⅱ','보류']];
  function widthFor(row){return Number($('width').value)||(row.defaultWidth>=768?1280:390);}
  const qaLabel=row=>row.screen==='q2'?'Q2 구매량·현재 가격':row.label;
  function oldReviews(row){return rowMode(row)==='detailed'?[]:[...legacy.entries()].filter(([key])=>key.slice(0,key.lastIndexOf('/'))===row.id);}
  function historyWidth(row){return actionableWidth(row,{previous:true});}
  function resultWidth(row){return filter==='previous'?historyWidth(row)||widthFor(row):widthFor(row);}
  function selectFiltered(row){const w=resultWidth(row);$('width').value=String(w);return select(row);}

  function filtered(){
    const index=showRecords(),q=$('search').value.toLocaleLowerCase().trim();
    return screens.filter(row=>{
      const past=oldReviews(row).map(([,r])=>r);
      const live=index.get(reviewKey(rowView(row,widthFor(row)),widthFor(row)))||[];
      const search=[row.id,row.screen,row.label,row.stateLabel,row.group,...past.flatMap(r=>r.comments||[]).filter(c=>!c.deleted).flatMap(c=>[c.id,c.body]),...live.filter(r=>r.action!=='delete'&&!isTest(r)).flatMap(r=>[r.id,r.data.body,r.data.sourceCommentId,r.data.evidenceRef])].join(' ').toLocaleLowerCase();
      return (!q||search.includes(q))&&(filter==='all'||(filter==='previous'?Boolean(historyWidth(row)):stateInfo(row,widthFor(row),index)[filter]));
    });
  }
  function list(){
    const index=showRecords(),rows=filtered();const used=new Set(rows.map(r=>r.id));$('filters').replaceChildren();
    const metrics=$('review-summary');metrics?.replaceChildren();
    for(const [id,icon,name] of filters){const count=id==='all'?screens.length:id==='previous'?screens.filter(row=>historyWidth(row)).length:screens.filter(r=>stateInfo(r,widthFor(r),index)[id]).length;
      if(metrics && ['previous','changed','approved','unreviewed'].includes(id)){
        const m=btn('',()=>{filter=id;list();$('choose').showModal();});m.dataset.metric=id;
        m.append(node('strong',id==='previous'&&!legacyAvailable?'—':count), node('span',name+(id==='previous'?' · 전체 폭':'')));metrics.append(m);
      }
      const b=btn(icon+' '+name+' '+((id==='previous'&&!legacyAvailable||['approved','unreviewed','unknown','needs'].includes(id)&&!reviewAvailable)?'—':count),()=>{filter=id;list();$('choose').showModal();});
      b.setAttribute('aria-pressed',String(filter===id));$('filters').append(b);}
    const tiles=$('tiles');tiles.replaceChildren();
    for(const row of rows){const tile=node('article');tile.className='tile';const b=btn('',()=>{$('choose').close();selectFiltered(row);});
      b.append(node('strong',qaLabel(row)),node('span',row.stateLabel+' · '+row.variant+' · '+resultWidth(row)+'px'));
      b.setAttribute('aria-current',String(current?.id===row.id));tile.append(b,btn('이 화면에 의견',async()=>{$('choose').close();await selectFiltered(row);if(target)edit(null,null,true);}));tiles.append(tile);}
    if(!used.size)tiles.append(node('p','해당하는 화면이 없습니다.'));
    const overview=$('review-records');
    if(overview){
      overview.replaceChildren();
      const requests=screens.flatMap(row=>feedbackWidths(row).filter(width=>feedbackFor(row,width).some(item=>item.previous&&item.actionable)).map(width=>({row,width})));
      const first=requests.slice(0,8);
      for(const {row,width} of first){
        const b=btn(qaLabel(row)+' · '+row.stateLabel+' · '+width+'px · 이전 수정 요청',async()=>{
          $('width').value=String(width);await select(row);if(target)notes();
        });b.className='overview-record';overview.append(b);
      }
      if(first.length<requests.length)overview.append(btn('이전 수정 요청 전체 '+requests.length+'건',()=>{filter='previous';list();$('choose').showModal();}));
    }
    shell?.render();
  }
  function setSecondaryPick(item,enabled){
    // A detached card or one rendered for a different revision cannot send review data.
    if(!item.frame.isConnected){secondary.delete(item.source);return;}
    item.frame.inert=Boolean(item.board&&!enabled);
    item.frame.style.pointerEvents=enabled?'auto':'';
    item.source.postMessage({scope:'ORDER_R3_HOST',channel:item.channel,artifact:item.hash,type:'mode',payload:enabled},'*');
  }
  function send(type,payload){
    if(session&&artifact)frame.contentWindow?.postMessage({scope:'ORDER_R3_HOST',channel:session,artifact:artifact.hash,type,payload},'*');
    if(type==='mode'){
      const active=Boolean(payload)||continuousPoints;
      $('new').classList.toggle('active',active);$('new').setAttribute('aria-pressed',String(active));
      $('lab').classList.toggle('pin-mode',active);
      $('pick-cancel').hidden=!active;$('pick-cancel').textContent=continuousPoints?'위치 코멘트 종료':'위치 선택 닫기';
      for(const item of secondary.values())setSecondaryPick(item,Boolean(payload));
    }
  }
  function localDraft(){return target?reviewKey(target,target.viewport)+'/'+target.artifactHash:null;}
  let draftStorageKey='';
  const draftKey=(id)=>localDraft()+'|'+id;
  function draftsForScreen(){const prefix=localDraft()+'|';return [...edits].filter(([key])=>key.startsWith(prefix)).map(([,value])=>value);}
  function earlierDraftsForScreen(){
    if(!target)return [];
    const prefix=reviewKey(target,target.viewport)+'/';
    return [...edits].flatMap(([key,draft])=>{
      if(!key.startsWith(prefix)||!key.endsWith('|'+draft.id))return [];
      const hash=key.slice(prefix.length,key.length-draft.id.length-1);
      return /^[a-f0-9]{64}$/.test(hash)&&hash!==target.artifactHash?[{hash,draft}]:[];
    });
  }
  async function resumeEarlierDraft({hash,draft}){
    const row=current,view=target&&reviewKey(target,target.viewport);
    if(!row||!view)return;
    // Resume the exact source and request identity. Moving a saved reply/draft
    // to a new hash would invalidate its immutable target and retry packet.
    await select(row,'recorded',null,hash);
    if(!target||reviewKey(target,target.viewport)!==view||target.artifactHash!==hash||$('version').value==='prior-r3'){
      status('작성 당시 화면을 불러오지 못했습니다. 미저장 내용은 이 탭에 그대로 보관했습니다.');return;
    }
    edit(null,null,false,null,draft);
    status('작성 당시 화면에서 미저장 내용을 이어 씁니다.');
  }
  function persistDrafts(){
    if(!draftStorageKey)return;
    try{
      if(edits.size)sessionStorage.setItem(draftStorageKey,JSON.stringify([...edits]));
      else sessionStorage.removeItem(draftStorageKey);
    }catch{status('이 탭에 초안을 보관하지 못했습니다. 도구에서 의견을 백업해 주세요.');}
  }
  async function loadDrafts(email){
    if(typeof email!=='string'||!email)return;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email.toLowerCase()));
    const owner=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    draftStorageKey='order.qa.unsent.v1.'+release+'.'+owner;
    try{
      const saved=JSON.parse(sessionStorage.getItem(draftStorageKey)||'[]');
      for(const [key,value] of saved)if(typeof key==='string'&&typeof value?.id==='string'&&typeof value.body==='string'&&key.endsWith('|'+value.id))edits.set(key,value);
    }catch{status('이 탭의 초안을 불러오지 못했습니다.');}
  }
  function remember(){
    if(!editor||!target)return;
    editor.body=body.value;
    if(editor.dirty||editor.retry)edits.set(draftKey(editor.id),editor);
    else edits.delete(draftKey(editor.id));
    persistDrafts();
  }
  function feedbackRecord(parent,view=target){
    if(!view)return null;
    return [...records.values()].filter(r=>r.kind==='feedback'&&r.data.parent?.origin===parent.origin&&r.data.parent?.id===parent.id&&match(r.data.target,view,view.viewport)&&r.data.target.artifactHash===view.artifactHash).sort((a,b)=>b.cursor-a.cursor)[0]||null;
  }
  function feedbackState(parent,fallback='unresolved',view=target){
    return feedbackProjection(parent,fallback,view).status;
  }
  function feedbackProjection(parent,fallback='unresolved',view=target){
    // One display projection for the work list, pins and counts. An explicit
    // state on this artifact wins over history, including an explicit reopen.
    // This projection never creates a feedback or a screen approval record.
    if(!view)return {status:fallback,actionable:fallback!=='resolved',resolved:fallback==='resolved'};
    const entry=feedbackRecord(parent,view),source=parent.origin==='current'?records.get(localKey('comment',parent.id)):null;
    const previous=entry?null:[...records.values()].filter(r=>r.kind==='feedback'&&r.data.parent?.origin===parent.origin&&r.data.parent?.id===parent.id&&match(r.data.target,view,view.viewport)).sort((a,b)=>b.cursor-a.cursor)[0];
    const decision=entry||previous;
    const newerSource=source&&(!decision||source.cursor>decision.cursor)&&(!entry||source.data.target.artifactHash===view.artifactHash);
    const value=newerSource?(source.action==='resolve'?'resolved':'unresolved'):decision?.data.status||fallback;
    const inherited=Boolean(!newerSource&&previous);
    return {status:value,actionable:value!=='resolved',resolved:value==='resolved',inherited,
      ...(inherited&&value==='resolved'?{resolvedInArtifact:previous.data.target.artifactHash}:{})};
  }
  function feedbackFor(row,width){
    if(!reviewAvailable||!row)return [];
    const view=rowView(row,width);
    const entries=[],past=legacy.get(reviewKey(view,width));
    for(const c of past?.comments||[]){
      if(c.deleted)continue;
      const parent={origin:'legacy',id:c.id};
      entries.push({parent,previous:true,...feedbackProjection(parent,c.status==='resolved'?'resolved':'unresolved',view)});
    }
    for(const r of records.values()){
      if(r.kind!=='comment'||r.action==='delete'||!match(r.data.target,view,width)||(!showTest()&&isTest(r)))continue;
      const parent={origin:'current',id:r.id};
      entries.push({parent,previous:r.data.target.artifactHash!==view.artifactHash,...feedbackProjection(parent,r.action==='resolve'?'resolved':'unresolved',view)});
    }
    return entries;
  }
  function feedbackWidths(row){
    const widths=new Set(oldReviews(row).map(([key])=>Number(key.split('/').at(-1))));
    for(const r of records.values())if(r.data?.target&&match(r.data.target,rowView(row,r.data.target.viewport),r.data.target.viewport))widths.add(r.data.target.viewport);
    return [...widths].filter(Number.isFinite).sort((a,b)=>a-b);
  }
  function actionableWidth(row,{previous=false}={}){
    const preferred=widthFor(row),widths=feedbackWidths(row);
    return [preferred,...widths.filter(w=>w!==preferred)].find(width=>feedbackFor(row,width).some(item=>item.actionable&&(!previous||item.previous)))||null;
  }
  function feedbackCounts(rows=screens){
    const counts=new Map();
    for(const row of rows)for(const width of feedbackWidths(row)){
      const count=feedbackFor(row,width).filter(item=>item.actionable).length;
      if(count)counts.set(row.screen,(counts.get(row.screen)||0)+count);
    }
    return counts;
  }
  let changingFeedback=false;
  async function saveFeedback(parent,value){
    if(!target||$('version').value!=='current'||changingFeedback||storing)return;
    changingFeedback=true;
    try{
      const view={...target},prior=feedbackRecord(parent,view),source=parent.origin==='current'?records.get(localKey('comment',parent.id)):null;
      const same=source&&match(source.data.target,view,view.viewport)&&source.data.target.artifactHash===view.artifactHash;
      const action=same?(value==='resolved'&&source.action!=='resolve'?'resolve':value!=='resolved'&&source.action==='resolve'?'reopen':null):null;
      const reason=action?window.prompt('이유를 입력해 주세요.')?.trim():'';
      if(action&&!reason)return;
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([view,parent])));
      const id=prior?.id||'feedback:'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
      if(action&&!await write('comment',source.id,source.data,source.revision,action,reason))return;
      if(!await write('feedback',id,{target:view,parent,status:value},prior?.revision??0))await refresh();
      // A failed status write can follow a confirmed source event. Render that
      // event so the reviewer sees the actual state and can safely retry.
      if(target&&match(target,view,view.viewport)&&target.artifactHash===view.artifactHash)notes(subset);
    }finally{changingFeedback=false;}
  }
  function feedbackControls(card,parent,fallback='unresolved'){
    const projection=feedbackProjection(parent,fallback),value=projection.status,entry=feedbackRecord(parent);
    card.dataset.feedbackOrigin=parent.origin;card.dataset.feedbackId=parent.id;card.dataset.feedbackStatus=value;
    card.dataset.feedbackSource=projection.inherited?'previous':entry?'current':'original';
    const group=node('div');group.className='feedback-status';group.setAttribute('role','group');group.setAttribute('aria-label','의견 처리 상태');
    for(const [status,label] of [['unresolved','미해결'],['recheck','재검토'],['resolved','해결']]){
      const b=btn(label,()=>saveFeedback(parent,status));b.dataset.feedbackState=status;b.setAttribute('aria-label','의견 '+label);b.setAttribute('aria-pressed',String(value===status));b.disabled=$('version').value!=='current';group.append(b);
    }
    card.append(group);
    if(entry){const history=node('details');history.append(node('summary','상태 변경 이력'));
      history.addEventListener('toggle',async()=>{if(!history.open||history.dataset.loaded)return;try{
        const j=await api(base+'/events?release='+release+'&kind=feedback&id='+encodeURIComponent(entry.id));
        for(const e of j.items)history.append(node('small',({'unresolved':'미해결','recheck':'재검토','resolved':'해결'})[e.data.status]+' · '+new Date(e.updatedAt).toLocaleString('ko-KR')));
        history.dataset.loaded='true';
      }catch(e){announceError(e);}});card.append(history);}
    return value;
  }
  function comments(){return [...records.values()].filter(r=>r.kind==='comment'&&(showTest()||!isTest(r))&&target&&match(r.data.target,target,target.viewport)&&r.action!=='delete');}
  const legacyPinId=id=>'legacy:'+id;
  const pinSourceKey=(view,hash)=>reviewKey(view,view.viewport)+'/'+hash;
  function pinFeedback(parent,fallback,view){
    const {resolved,resolvedInArtifact}=feedbackProjection(parent,fallback,view);
    return {resolved,...(resolvedInArtifact?{resolvedInArtifact}:{})};
  }
  function reviewPins(view,document){
    if(!view)return [];
    const pins=[],past=legacy.get(reviewKey(view,view.viewport));
    for(const c of past?.comments||[]){
      if(c.deleted||!c.anchor)continue;
      const a=c.anchor;
      if(typeof a.path!=='string'||![a.x,a.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))continue;
      pins.push({id:legacyPinId(c.id),origin:'legacy',previous:true,sourceArtifactHash:'legacy',legacyAnchor:a,
        anchor:{id:'unmapped-legacy',instance:view.screen,artifactHash:view.artifactHash,x:a.x,y:a.y,viewport:{width:view.viewport,height:844},scale:1,scroll:[],layers:[]},
        ...pinFeedback({origin:'legacy',id:c.id},c.status==='resolved'?'resolved':'unresolved',view)});
    }
    for(const r of records.values()){
      if(r.kind!=='comment'||r.action==='delete'||!match(r.data.target,view,view.viewport)||(!showTest()&&isTest(r))||!r.data.anchor)continue;
      const a=r.data.anchor,sourceHash=r.data.target.artifactHash;
      if(a.instance!==view.screen||a.artifactHash!==sourceHash||modeOf(a)!==modeOf(view))continue;
      pins.push({id:r.id,origin:'current',previous:document?.version!=='current'||sourceHash!==view.artifactHash,
        sourceArtifactHash:sourceHash,sameContent:sourceHash===document?.source?.contentHash,
        anchor:{...a,artifactHash:view.artifactHash},
        ...pinFeedback({origin:'current',id:r.id},r.action==='resolve'?'resolved':'unresolved',view)});
    }
    return pins.map((pin,i)=>({...pin,ordinal:i+1}));
  }
  const pinSourceBytes=value=>value?new Blob([value.html||'',value.mountedHtml||'']).size:0;
  function forgetPinSource(key){pinSourceCacheBytes-=pinSourceBytes(pinSources.get(key));pinSources.delete(key);}
  function cachePinSource(key,value){
    forgetPinSource(key);
    pinSources.set(key,value);pinSourceCacheBytes+=pinSourceBytes(value);
    while(pinSources.size>32||pinSourceCacheBytes>32*1024*1024){
      const first=pinSources.keys().next().value;
      forgetPinSource(first);
    }
  }
  function validPinSourceSnapshot(html){
    if(typeof html!=='string'||html.length>8*1024*1024||new Blob([html]).size>8*1024*1024)return false;
    const template=document.createElement('template');template.innerHTML=html;
    return template.content.childElementCount===1&&template.content.firstElementChild.id==='order-single'&&template.content.querySelectorAll('#order-single').length===1;
  }
  // Runs only in the opaque reference frame. No product data, interaction or
  // parent DOM is imported: the exact archive supplies its own fixture/runtime.
  function collectPinSource(identity){
    if(window===parent)return;
    let disposed=false,requested=false,quiet=0,deadline=0,observer=null;
    const sameTarget=value=>value&&['screen','state','variant','viewport','height','mode'].every(key=>value[key]===identity.target[key]);
    function dispose(){disposed=true;clearTimeout(quiet);clearTimeout(deadline);observer?.disconnect();removeEventListener('message',receive);removeEventListener('pagehide',dispose);}
    function complete(stable){
      if(disposed)return;
      const roots=document.querySelectorAll('#order-single'),snapshot=stable&&roots.length===1?roots[0].outerHTML:null;
      const html=typeof snapshot==='string'&&snapshot.length<=8*1024*1024&&new Blob([snapshot]).size<=8*1024*1024?snapshot:null;
      parent.postMessage({scope:'ORDER_R3_PIN_SOURCE_FRAME',type:'snapshot',channel:identity.channel,artifact:identity.artifact,target:identity.target,html},'*');
      dispose();
    }
    const settled=()=>{clearTimeout(quiet);quiet=setTimeout(()=>complete(true),40);};
    function receive(event){
      const message=event.data;
      if(disposed||requested||event.source!==parent||message?.scope!=='ORDER_R3_PIN_SOURCE_HOST'||message.type!=='snapshot'||message.channel!==identity.channel||message.artifact!==identity.artifact||!sameTarget(message.target))return;
      requested=true;
      const roots=document.querySelectorAll('#order-single');if(roots.length!==1){complete(false);return;}
      // Chromium may pause RAF in an offscreen/hidden iframe. The frozen frame
      // has already sent ready; wait for a short DOM quiet period instead.
      observer=new MutationObserver(settled);observer.observe(roots[0],{childList:true,subtree:true,attributes:true,characterData:true});
      settled();deadline=setTimeout(()=>complete(false),1500);
    }
    addEventListener('message',receive);addEventListener('pagehide',dispose,{once:true});
  }
  function finishPinSource(request,{mountedHtml,cancelled=false}={}){
    if(request.done)return;request.done=true;
    clearTimeout(request.timer);request.snapshotCleanup?.();request.controller.abort();
    if(request.frame){pinSourceFrames.delete(request.window);request.frame.remove();}
    pinSourceActive.delete(request);
    const owns=pinSourceRequests.get(request.key)===request;
    if(owns)pinSourceRequests.delete(request.key);
    if(!cancelled&&owns&&request.epoch===pinSourceEpoch){
      cachePinSource(request.key,request.source?{artifactHash:request.hash,sourceHash:request.source.hash,html:request.source.html,
        ...(mountedHtml?{mountedHtml}:{mountedUnavailable:true})}:null);
    }
    if(!cancelled&&!pinSourcePaused){pumpPinSources();syncPins();}
  }
  function cancelPinSources(){
    pinSourceEpoch++;
    for(const request of pinSourceRequests.values())finishPinSource(request,{cancelled:true});
    pinSourceQueue.length=0;pinSourceAttempted.clear();
  }
  function snapshotResearchPinSource(request){
    // A versioned app has no legacy script-injection markers. Its optional
    // inspector sends ready after the real module mount; read only that app
    // root after a bounded quiet period. Do not fall back to the loading page.
    let quiet=0,deadline=0,observer;
    request.snapshotCleanup=()=>{clearTimeout(quiet);clearTimeout(deadline);observer?.disconnect();};
    try{
      const document=request.frame.contentDocument,roots=document?.querySelectorAll('#order-single');
      if(roots?.length!==1){finishPinSource(request);return;}
      const root=roots[0];
      const complete=()=>{
        if(request.done)return;
        const html=root.isConnected&&document.querySelectorAll('#order-single').length===1?root.outerHTML:null;
        finishPinSource(request,validPinSourceSnapshot(html)?{mountedHtml:html}:{});
      };
      const settled=()=>{clearTimeout(quiet);quiet=setTimeout(complete,40);};
      observer=new MutationObserver(settled);observer.observe(root,{childList:true,subtree:true,attributes:true,characterData:true});
      settled();deadline=setTimeout(()=>finishPinSource(request),1500);
    }catch{finishPinSource(request);}
  }
  function routePinSourceMessage(event){
    const request=pinSourceFrames.get(event.source);if(!request)return false;
    // Consume every message from reference frames before the live review routes.
    const message=event.data;
    if(!request.frame.isConnected){finishPinSource(request);return true;}
    if(request.done||request.epoch!==pinSourceEpoch||event.origin!==(request.source.application?location.origin:'null')||message?.channel!==request.channel||message.artifact!==request.source.hash)return true;
    if(message.scope==='ORDER_R3_FRAME'&&message.type==='ready'&&!request.snapshotRequested&&(!request.source.application||modeOf(message.payload)===modeOf(request.target))){
      request.snapshotRequested=true;
      if(request.source.application)snapshotResearchPinSource(request);
      else request.frame.contentWindow.postMessage({scope:'ORDER_R3_PIN_SOURCE_HOST',type:'snapshot',channel:request.channel,artifact:request.source.hash,target:request.target},'*');
    }else if(!request.source.application&&message.scope==='ORDER_R3_PIN_SOURCE_FRAME'&&message.type==='snapshot'&&request.snapshotRequested&&
      message.target&&['screen','state','variant','viewport','height','mode'].every(key=>message.target[key]===request.target[key])){
      finishPinSource(request,validPinSourceSnapshot(message.html)?{mountedHtml:message.html}:{});
    }
    return true;
  }
  function pumpPinSources(){
    if(pinSourcePaused)return;
    while(pinSourceActive.size<2&&pinSourceQueue.length){
      const request=pinSourceQueue.shift();if(request.done||pinSourceRequests.get(request.key)!==request)continue;
      pinSourceActive.add(request);request.timer=setTimeout(()=>finishPinSource(request),8000);
      const query=new URLSearchParams({id:[request.target.screen,request.target.state,request.target.variant].join('/'),width:String(request.target.viewport),version:request.hash==='legacy'?'previous':'recorded'});
      if(modeOf(request.target)==='detailed')query.set('mode','detailed');
      if(request.hash!=='legacy')query.set('artifactHash',request.hash);
      api(base+'/artifact?'+query,{signal:request.controller.signal}).then(source=>{
        if(request.done||request.epoch!==pinSourceEpoch)return;
        if(source.release!==release||typeof source.html!=='string'||source.html.length>8000000||!/^[a-f0-9]{64}$/.test(source.hash)||
          (request.hash==='legacy'?source.version!=='previous':source.hash!==request.hash)||modeOf(source)!==modeOf(request.target))throw Error('UNKNOWN_PIN_SOURCE');
        request.source=source;request.channel=crypto.randomUUID();
        const unit=node('iframe');request.frame=unit;unit.setAttribute('sandbox','allow-scripts');unit.setAttribute('aria-hidden','true');unit.tabIndex=-1;unit.inert=true;
        unit.dataset.pinSourceReference='';unit.style.cssText='position:fixed;left:-20000px;top:0;width:'+request.target.viewport+'px;height:'+request.target.height+'px;visibility:hidden;pointer-events:none;border:0';
        document.body.append(unit);
        if(source.application){
          // Same-origin is needed to read the exact mounted DOM. The hidden,
          // inert evidence frame has no forms, modals, downloads or popups.
          unit.setAttribute('sandbox','allow-scripts allow-same-origin');
          unit.src=researchDocumentUrl(source,request.channel,request.target.viewport).href;
        }else unit.srcdoc=frameDocument(source,request.target,request.channel,request.target);
        request.window=unit.contentWindow;pinSourceFrames.set(request.window,request);
      }).catch(()=>{if(!request.done)finishPinSource(request);});
    }
  }
  function loadPinSources(view,pins){
    if(pinSourcePaused)return;
    for(const hash of new Set(pins.filter(p=>p.previous&&!p.sameContent&&p.sourceArtifactHash!==view.artifactHash).map(p=>p.sourceArtifactHash))){
      const key=pinSourceKey(view,hash);
      if(pinSources.has(key)){pinSourceAttempted.add(key);continue;}
      if(pinSourceRequests.has(key)||pinSourceAttempted.has(key))continue;
      if(pinSourceRequests.size>=64)break;
      const recordedHeight=pins.find(pin=>pin.sourceArtifactHash===hash&&Number.isInteger(pin.anchor?.viewport?.height)&&pin.anchor.viewport.height>0&&pin.anchor.viewport.height<=10000)?.anchor.viewport.height;
      const request={key,hash,target:{screen:view.screen,state:view.state,variant:view.variant,viewport:view.viewport,height:recordedHeight||844,...modeFields(modeOf(view))},epoch:pinSourceEpoch,controller:new AbortController(),done:false};
      pinSourceAttempted.add(key);pinSourceRequests.set(key,request);pinSourceQueue.push(request);
    }
    pumpPinSources();
  }
  addEventListener('pagehide',()=>{pinSourcePaused=true;cancelPinSources();});
  addEventListener('pageshow',()=>{pinSourcePaused=false;syncPins();});
  function pinsForDisplay(view,document,post){
    // Original comments can arrive before their later status events. Wait for
    // the complete initial snapshot before drawing them as unresolved pins.
    const pins=reviewAvailable?reviewPins(view,document):[];
    loadPinSources(view,pins);
    const sources=[...new Set(pins.map(p=>p.sourceArtifactHash))].map(hash=>pinSources.get(pinSourceKey(view,hash))).filter(Boolean);
    post('pin-sources',sources);
    post('pins',pins.filter(p=>!p.resolved||$('show-resolved-pins')?.checked));
    post('visible',displayPins);
  }
  function syncSecondaryPins(item){
    if(!item.frame.isConnected){secondary.delete(item.source);return;}
    const view={screen:item.row.screen,state:item.row.state,variant:item.row.variant,viewport:item.width,artifactHash:item.hash,...modeFields(modeOf(item.artifact))};
    pinsForDisplay(view,item.artifact,(type,payload)=>item.source.postMessage({scope:'ORDER_R3_HOST',channel:item.channel,artifact:item.hash,type,payload},'*'));
  }
  function syncPins(){
    if(target)pinsForDisplay(target,artifact,send);
    send('pin-view',{draft:editor?.anchor||null,selected:subset||[]});
    for(const item of secondary.values())syncSecondaryPins(item);
  }
  function jumpToPin(pin){
    hideDrawer();
    for(const p of pin.anchor.scroll||[]){if(p.id==='host-surface')$('surface').scrollTo(p.x,p.y);else if(p.id==='host-document')document.scrollingElement.scrollTo(p.x,p.y);}
    send('restore',{...pin.anchor,sourceArtifactHash:pin.sourceArtifactHash,sameContent:pin.sameContent,legacyAnchor:pin.legacyAnchor});
  }
  function pinLocation(card,pin){
    if(!pin)return;
    if(pin.resolvedInArtifact){
      const prior=node('small','이전 판에서 해결됨 · 다시 검토하려면 미해결 또는 재검토를 선택하세요.');prior.dataset.pinPreviousResolution=pin.id;card.append(prior);
      const original=node('a','해결한 판 열기'),url=sameOriginUrl(location.href);url.searchParams.set('version','recorded');url.searchParams.set('artifactHash',pin.resolvedInArtifact);modeUrl(url,modeOf(target));original.href=url.href;original.dataset.pinResolvedArtifact=pin.resolvedInArtifact;card.append(original);
    }
    const state=node('small');state.dataset.pinLocation=pin.id;card.append(state);
    const jump=btn('위치 보기',()=>jumpToPin(pin));jump.dataset.pinJump=pin.id;card.append(jump);
  }
  function updatePinLocations(){
    for(const el of document.querySelectorAll('[data-pin-location]')){
      const absent=missing.has(el.dataset.pinLocation);
      el.textContent=absent?'현재 화면에서 원래 요소를 찾지 못했습니다. 원본 화면에서 위치를 확인할 수 있습니다.':'';
      el.hidden=!absent;
    }
    for(const button of document.querySelectorAll('[data-pin-jump]'))button.disabled=missing.has(button.dataset.pinJump);
  }
  function hideDrawer(){continuousPoints=false;wantsPoint=false;remember();drawer.hidden=true;$('authoring').hidden=true;editor=null;subset=null;syncPins();send('mode',false);$('points').focus();}
  function edit(r=null,past=null,picking=false,parent=null,saved=null,intent={}){
    if(!target||$('version').value==='prior-r3')return;
    shell?.setTab('review');$('blocks').hidden=true;drawer.hidden=false;$('authoring').hidden=false;
    $('conflict').hidden=true;editor=saved||((r&&edits.get(draftKey(r.id)))||null);
    if(!editor)editor=parent?{id:crypto.randomUUID(),body:'',revision:0,parent,...intent}:r?{id:r.id,parent:r.data.parent,purpose:r.data.purpose,sourceArtifactHash:r.data.sourceArtifactHash,revision:r.revision,body:r.data.body,anchor:r.data.anchor,sourceKey:r.data.sourceKey,sourceCommentId:r.data.sourceCommentId}:past?{id:crypto.randomUUID(),body:past.body,sourceKey:reviewKey(target,target.viewport),sourceCommentId:past.id,revision:0}:{id:crypto.randomUUID(),body:'',revision:0};
    setEditorFields();syncPins();
    body.readOnly=false;
    if(picking)pick();else body.focus();
  }
  function setEditorFields(){
    const rework=editor.purpose==='rework';
    body.value=editor.body||'';
    $('reposition').hidden=Boolean(editor.parent);
    $('reposition').textContent=editor.anchor?'위치 지정 변경':'위치 코멘트로 지정';
    $('point-state').textContent=rework?'재작업 지시':editor.parent?'답글':editor.anchor?'위치 지정됨':'화면 전체';
    $('editor-label').textContent=rework?'재작업 지시사항':'코멘트';
    $('authoring-help').hidden=!rework;
    if(rework)body.setAttribute('aria-describedby','authoring-help');else body.removeAttribute('aria-describedby');
    body.placeholder=rework?'다시 작업할 내용과 확인할 기준을 남겨 주세요.':'수정할 부분을 남겨 주세요.';
    $('save').textContent=rework?'재작업 지시 저장':editor.parent?'답글 저장':'의견 저장';
    const sourceNote=$('editor-source');
    if(sourceNote){sourceNote.hidden=!artifact?.archivedSource;sourceNote.textContent=artifact?.archivedSource?'이전 판의 화면에서 이어 쓰는 중입니다. 작성 당시 화면에 저장됩니다.':'';}
    showEditorSaveError(editor.saveFailure?.message||'');
  }
  function showEditorSaveError(message){
    const box=$('save-error');if(!box)return;
    box.textContent=message;box.hidden=!message;
  }
  function thread(card,parent,allowReply,{allowRework=false,sourceArtifactHash}={}){
    const replies=[...records.values()].filter(r=>r.kind==='reply'&&r.data.parent?.origin===parent.origin&&
      r.data.parent.id===parent.id&&match(r.data.target,target,target.viewport));
    for(const r of replies){
      const line=node('div'),rework=r.data.purpose==='rework';
      line.dataset.replyId=r.id;
      if(rework){line.className='rework-instruction';line.dataset.replyPurpose='rework';}
      line.append(node('small',(rework?(r.data.target.artifactHash===target.artifactHash?'재작업 지시':'이전 판 재작업 지시'):'답글')+' · r'+r.revision),node('p',r.data.body));
      if((rework?allowRework:allowReply)&&r.data.target.artifactHash===target.artifactHash)line.append(btn(rework?'재작업 지시 수정':'답글 수정',()=>edit(r)));
      if(rework){
        const history=node('details'),entries=node('div');let loaded=false;
        history.append(node('summary','재작업 지시 이력'),entries);
        history.ontoggle=async()=>{if(!history.open||loaded)return;try{
          const j=await api(base+'/events?release='+release+'&kind=reply&id='+encodeURIComponent(r.id));
          entries.replaceChildren(...j.items.map(e=>node('p','r'+e.revision+' · '+(e.updatedAt||'')+' · '+(e.reason||e.data.body||''))));loaded=true;
        }catch(e){announceError(e);}};
        line.append(history);
      }
      card.append(line);
    }
    if(allowRework){const action=btn('재작업 지시',()=>edit(null,null,false,parent,null,{purpose:'rework',...(sourceArtifactHash?{sourceArtifactHash}:{})}));action.className='rework-action';card.append(action);}
    if(allowReply)card.append(btn('답글 작성',()=>edit(null,null,false,parent)));
  }
  function pick(){
    // Replies and rework instructions always keep their original thread's
    // anchor. Only a comment draft can enter the location editor.
    if(!editor||editor.parent||!target)return;
    shell?.focusForPoint();wantsPoint=true;remember();drawer.hidden=true;send('mode',true);frame.focus();$('pick-cancel').hidden=false;status('위치를 선택하세요. 선택 후 작성 중인 코멘트로 돌아옵니다.');
  }
  function beginPointComment(continuous=false){
    if(!target||$('version').value==='prior-r3')return;
    continuousPoints=continuous&&!(editor?.revision>0||editor?.action==='relocate');
    if(editor&&!editor.parent)pick();
    else{remember();edit(null,null,true);}
  }
  const stage=()=>{wantsPoint=false;syncPins();drawer.hidden=false;$('authoring').hidden=false;$('blocks').hidden=true;send('mode',false);body.focus();};
  function stopPointMode(){continuousPoints=false;wantsPoint=false;remember();send('mode',false);syncPins();}
  function cancelPoint(){stopPointMode();if(editor)stage();else notes();}

  function notes(ids=null){
    if(!target)return;remember();editor=null;subset=ids;drawer.hidden=false;$('blocks').hidden=false;$('authoring').hidden=true;
    shell?.setTab('review');shell?.historyLinks();syncPins();
    const box=$('notes');box.replaceChildren();
    const key=reviewKey(target,target.viewport);const past=legacy.get(key),live=comments(),pins=new Map(reviewPins(target,artifact).map(p=>[p.id,p]));
    const indexed=showRecords(),info=stateInfo(current,target.viewport,indexed);
    $('review-heading').textContent=qaLabel(current)+' / '+current.stateLabel;
    presentMotion();
    const widths=shell?.reviewWidths()||[];
    $('review-viewports').replaceChildren(...(widths.length?widths:[target.viewport]).map(width=>{
      const choice=btn(width+'px',async()=>{if(width!==target.viewport){$('width').value=String(width);await select(current);if(target)notes();}});
      choice.dataset.reviewViewport=width;choice.classList.toggle('active',width===target.viewport);return choice;
    }));
    const allComments=[...live.map(r=>feedbackProjection({origin:'current',id:r.id},r.action==='resolve'?'resolved':'unresolved')),
      ...(past?.comments||[]).filter(c=>!c.deleted).map(c=>feedbackProjection({origin:'legacy',id:c.id},c.status==='resolved'?'resolved':'unresolved'))];
    const openCount=reviewAvailable?allComments.filter(item=>item.actionable).length:null;
    $('comment-count').textContent=openCount===null?'불러오는 중':'미해결 '+openCount+'개 · 전체 '+allComments.length+'개';
    for(const b of document.querySelectorAll('[data-review]'))b.classList.toggle('active',b.dataset.review===(info.approved?'approved':info.requested?'changes_requested':'unreviewed'));
    for(const b of document.querySelectorAll('[data-comment-filter]'))b.classList.toggle('active',b.dataset.commentFilter===commentFilter);
    const visible=value=>reviewAvailable&&(ids||commentFilter==='all'||(commentFilter==='resolved'?value==='resolved':commentFilter==='recheck'?value==='recheck':value!=='resolved'));
    syncScreenMemo(past);
    syncFigma(past);
    box.append(node('p',[info.previous?'이전 수정 요청':null,info.blocked?'구현 보류':info.verified?'구현 검증':info.untouched?'미착수':info.changed?'이번 판 수정':info.unknown?'구현 확인 전':null,info.approved?'사용자 통과':info.requested?'이번 판 수정 요청':info.needs?'재검토 대기':'이번 판 미검토',info.oldApproval?'이전 판 통과':null].filter(Boolean).join(' · ')));
    if(!ids){
      for(const draft of draftsForScreen()){
        const label=(draft.purpose==='rework'?'저장하지 않은 재작업 지시 이어쓰기':draft.parent?'저장하지 않은 답글 이어쓰기':'저장하지 않은 의견 이어쓰기')+' · '+(draft.body||(draft.anchor?'위치 지정됨':'내용 없음')).slice(0,40);
        box.append(btn(label,()=>edit(null,null,false,null,draft)));
      }
      for(const saved of earlierDraftsForScreen()){
        const {draft}=saved,label=(draft.purpose==='rework'?'이전 판의 미저장 재작업 지시 이어쓰기':draft.parent?'이전 판의 미저장 답글 이어쓰기':'이전 판의 미저장 의견 이어쓰기')+' · '+(draft.body||(draft.anchor?'위치 지정됨':'내용 없음')).slice(0,40);
        box.append(btn(label,()=>resumeEarlierDraft(saved)));
      }
      for(const d of [...records.values()].filter(r=>r.kind==='draft'&&match(r.data.target,target,target.viewport)&&r.data.target.artifactHash===target.artifactHash&&r.data.body&&records.get(localKey(r.data.parent?'reply':'comment',r.id))?.data.body!==r.data.body)){box.append(btn(d.data.purpose==='rework'?'임시 재작업 지시 이어쓰기':'임시 의견 이어쓰기',()=>{edit();editor={id:d.id,revision:records.get(localKey(d.data.parent?'reply':'comment',d.id))?.revision??0,body:d.data.body,anchor:d.data.anchor,parent:d.data.parent,purpose:d.data.purpose,sourceArtifactHash:d.data.sourceArtifactHash,draftRevision:d.revision};setEditorFields();}));}
      if(past?.note)box.append(node('small','이전 화면 의견'),node('p',past.note));
    }
      for(const c of past?.comments||[]){
        if(ids&&!ids.includes(legacyPinId(c.id)))continue;
        const sourceState=feedbackState({origin:'legacy',id:c.id},c.status==='resolved'||c.deleted?'resolved':'unresolved');
        if(c.deleted&&commentFilter!=='all'||!visible(sourceState))continue;
        const card=node('article');
        card.className='comment-card';
        card.append(node('small',(c.deleted?'이전 삭제 기록':c.status==='resolved'?'이전 해결 의견':'이전 의견')+' · '+c.id),node('p',c.body));
        if(c.anchor){
          const locationLabel=c.anchor.label||c.anchor.tag||'화면';
          card.append(node('small','원래 위치 · '+locationLabel+' · '+target.viewport+'px'));
          pinLocation(card,pins.get(legacyPinId(c.id)));
          const original=node('a','의견을 남긴 화면 열기'),url=sameOriginUrl(location.href);
          url.searchParams.set('version','previous');url.searchParams.delete('artifactHash');original.href=url.href;card.append(original);
        }
        if(c.history?.length) {
          const details=node('details');details.append(node('summary','편집 이력 '+c.history.length+'건'));
          for(const e of c.history) details.append(node('small',e.updatedAt||''),node('p',e.body||''));
          card.append(details);
        }
        for(const e of c.replies||[])card.append(node('small','이전 답글'),node('p',e.body||''));
        if(c.deleted){box.append(card);continue;}
        feedbackControls(card,{origin:'legacy',id:c.id},c.status==='resolved'?'resolved':'unresolved');
        const change=records.get(localKey('change','feedback:'+c.id+':'+target.artifactHash));
        const labels={carried:'기존 구현 인수 · 사용자 재검토',unknown:'반영 근거 확인 전',recheck:'수정 근거 있음 · 재검토 필요',implemented:'수정됨',verified:'구현 검증',blocked:'보류',not_started:'미착수'};
        function showChange(parent,event){
          parent.append(node('strong',labels[event.data.status]||'확인 전'));
          if(event.data.body)parent.append(node('p',event.data.body));
          if(event.data.evidenceRef)parent.append(node('small',event.data.evidenceRef));
        }
        if(change)showChange(card,change);
        const previousChanges=(indexed.get(key)||[]).filter(r=>r.kind==='change'&&r.data.sourceCommentId===c.id&&r.data.target.artifactHash!==target.artifactHash);
        if(previousChanges.length){
          const history=node('details');history.append(node('summary','이전 판 기술 기록 '+previousChanges.length+'건'));
          for(const record of previousChanges){history.append(node('small',record.data.target.artifactHash.slice(0,12)));showChange(history,record);}
          card.append(history);
        }
        if($('version').value==='current')card.append(btn('이번 판에 위치 연결',()=>edit(null,c,true)));
        thread(card,{origin:'legacy',id:c.id},$('version').value!=='prior-r3',{allowRework:$('version').value==='current'&&sourceState!=='resolved'});box.append(card);
      }
    if(!ids){
      if(past?.figma?.url){const t=node('p','이전 Figma 링크 · '+past.figma.url);box.append(t);}
      if(past?.status==='fix'&&!(past.comments||[]).some(c=>!c.deleted))box.append(node('p','본문이 없는 이전 수정 요청'));
    }
    for(const r of records.values()){
      if((isTest(r)&&!showTest())||!visible('resolved')||r.kind!=='comment'||r.action!=='delete'||!match(r.data.target,target,target.viewport)||(ids&&!ids.includes(r.id)))continue;
      const card=node('article');
      card.append(node('small','삭제된 의견 · r'+r.revision));
      thread(card,{origin:'current',id:r.id},false);
      if($('version').value!=='prior-r3'&&r.data.target.artifactHash===target.artifactHash)card.append(btn('의견 복원',()=>eventReason(r,'reopen')));
      box.append(card);
    }
    for(const r of live.filter(r=>(!ids||ids.includes(r.id))&&visible(feedbackState({origin:'current',id:r.id},r.action==='resolve'?'resolved':'unresolved')))){
      const card=node('article'),same=r.data.target.artifactHash===target.artifactHash;card.className='comment-card';
      if(isTest(r))card.append(node('small','실행 검증 기록 · 두 탭 저장 시험'));
      card.append(node('small',(!same?'이전 판 의견':r.action==='resolve'?'원문 해결 기록':'이번 판 의견')+' · r'+r.revision),node('p',r.data.body));
      const feedback=feedbackControls(card,{origin:'current',id:r.id},r.action==='resolve'?'resolved':'unresolved');
      if(r.data.anchor)pinLocation(card,pins.get(r.id));
      if(!same && $('version').value==='current'){
        const old=document.createElement('a'), url=sameOriginUrl(location.href);
        url.searchParams.set('version','recorded');url.searchParams.set('artifactHash',r.data.target.artifactHash);
        modeUrl(url,modeOf(r.data.target));
        old.href=url.href;old.textContent='의견을 남긴 화면 열기';card.append(old);
      }
      if(!same&&$('version').value==='current')card.append(btn('새 판에 위치 연결',()=>edit(null,{id:r.id,body:r.data.body},true)));
      const editable=same&&r.action!=='resolve'&&feedback!=='resolved'&&$('version').value!=='prior-r3';
      if(editable)card.append(btn('수정',()=>edit(r)),btn('위치 다시 연결',()=>{edit(r);editor.action='relocate';body.readOnly=true;pick();}));
      if(same&&$('version').value!=='prior-r3')card.append(btn('삭제',()=>eventReason(r,'delete')));
      thread(card,{origin:'current',id:r.id},editable,{allowRework:$('version').value==='current'&&feedback!=='resolved',sourceArtifactHash:r.data.target.artifactHash});
      card.append(btn('이력',async()=>{try{const j=await api(base+'/events?release='+release+'&kind=comment&id='+encodeURIComponent(r.id));for(const e of j.items)card.append(node('p','r'+e.revision+' · '+e.action+' · '+(e.reason||e.data.body||'')));}catch(e){announceError(e);}}));box.append(card);
    }
    for(const r of records.values())if((r.kind==='figma'||(r.kind==='change'&&!r.data.sourceCommentId))&&match(r.data.target,target,target.viewport)&&r.data.target.artifactHash===target.artifactHash)box.append(node('small',[r.kind,r.data.status,r.data.evidenceRef,r.data.figmaUrl].filter(Boolean).join(' · ')));
    if(!box.querySelector('article')&&!past)box.append(node('p','등록된 의견이 없습니다.'));
    updatePinLocations();
  }
  async function write(kind,id,data,rev,action='save',reason=''){
    if($('version').value==='prior-r3'){status('보관한 검토판입니다. 이번 판에서 새 의견을 작성해 주세요.');return false;}
    const packet={release,id,kind,expectedRevision:rev,data,action,reason};const sig=JSON.stringify(packet);
    if(storing)return false;
    const draftEditor=editor&&['comment','reply','draft'].includes(kind)&&editor.id===id?editor:null;
    if(draftEditor)showEditorSaveError('');
    if(draftEditor?.retry?.sig===sig)pending=draftEditor.retry;
    if(!pending||pending.sig!==sig)pending={sig,key:crypto.randomUUID()};
    if(draftEditor){draftEditor.retry=pending;remember();}
    storing=true;
    try{if(!csrf||!reviewAvailable)throw Error('STORE_UNAVAILABLE');
      const r=await api(base+'/records',{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':csrf},body:JSON.stringify({...packet,idempotencyKey:pending.key})});
      if(r.id!==id||!Number.isInteger(r.revision))throw Error('UNCONFIRMED');
      const latest=retainLatestRecord(kind,id,r);
      if(latest?.revision>r.revision){
        // An idempotency replay acknowledges its original revision; it must
        // not replace a newer record or discard the reviewer's pending text.
        const conflict=Error('NEWER_REVIEW_AVAILABLE');conflict.status=409;conflict.current=latest;throw conflict;
      }
      if(draftEditor){delete draftEditor.retry;delete draftEditor.saveFailure;}pending=null;list();syncPins();status('저장됨 · r'+r.revision);return true;
    }catch(e){
      if(e.current)e.current=retainLatestRecord(kind,id,e.current);
      let message='서버가 저장을 완료하지 못했습니다. 입력은 이 탭에 보관했습니다.';
      if(e.status===409)message='다른 탭에서 먼저 저장했습니다. 내 입력을 보관했습니다.';
      else if(e.status===401)message='로그인을 다시 연결한 뒤 저장해 주세요. 작성 중인 의견은 남아 있습니다.';
      else if(e.status===403)message='저장 권한을 확인해 주세요. 작성 중인 의견은 남아 있습니다.';
      else if(e.message==='REVIEW_TARGET_UNAVAILABLE')message='작성한 화면 버전을 확인할 수 없어 저장하지 못했습니다. 입력은 이 탭에 보관했습니다.';
      else if(e.status===400)message='입력 내용이나 작성 화면을 확인할 수 없어 저장하지 못했습니다. 입력은 이 탭에 보관했습니다.';
      else if(e.message==='STORE_UNAVAILABLE')message='검토 기록을 불러온 뒤 다시 저장해 주세요. 입력은 이 탭에 보관했습니다.';
      else if(e.message==='UNCONFIRMED')message='저장 응답을 확인하지 못했습니다. 입력은 보관했으며 같은 저장 버튼으로 다시 확인할 수 있습니다.';
      if(e.message==='REPLY_PARENT_UNAVAILABLE')message='원래 의견이 해결되었거나 삭제되었습니다. '+(data.purpose==='rework'?'재작업 지시는':'답글은')+' 초안으로 남아 있습니다.';
      if(e.message==='NEWER_REVIEW_AVAILABLE')message='이 요청은 이미 저장됐지만 이후 수정된 내용이 있습니다. 최신 내용을 확인한 뒤 계속해 주세요. 입력은 보관했습니다.';
      status(message);
      if(draftEditor){
        const code=/^[A-Z0-9_]{1,80}$/.test(e.message||'')?e.message:'SAVE_RESPONSE_UNAVAILABLE';
        draftEditor.saveFailure={message,code,status:Number.isInteger(e.status)?e.status:0,at:new Date().toISOString()};
        persistDrafts();
        if(editor===draftEditor)showEditorSaveError(message);
      }
      if(e.current&&draftEditor&&editor===draftEditor&&target&&match(target,data.target,data.target.viewport)&&target.artifactHash===data.target.artifactHash){
        const current=e.current,box=$('conflict');
        box.replaceChildren(node('span','다른 탭의 내용 · '+(current.data.body||current.data.decision||'')));
        if(['reply','comment','draft'].includes(kind)&&!['delete','resolve'].includes(current.action)){
          box.append(btn('다른 탭의 내용을 확인하고 계속 수정',()=>{
            if(editor!==draftEditor)return;
            if(kind==='draft')draftEditor.draftRevision=current.revision;
            else draftEditor.revision=current.revision;
            remember();box.hidden=true;body.focus();
          }));
        }
        box.hidden=false;
      }
      return false;
    }finally{storing=false;}
  }
  async function eventReason(r,action){const why=window.prompt('이유를 입력해 주세요.');if(!why?.trim())return;const ok=await write(r.kind,r.id,r.data,r.revision,action,why.trim());if(ok)notes();}
  async function saveDraft(draft){if(!editor||!target)return;remember();
    const submitted=editor,view={...target},key=draftKey(submitted.id);
    if(!draft&&!submitted.body.trim()){
      const message=submitted.purpose==='rework'?'재작업 지시 내용을 입력해 주세요.':submitted.parent?'답글 내용을 입력해 주세요.':'의견 내용을 입력해 주세요.';
      showEditorSaveError(message);status(message);body.focus();return;
    }
    const content=value=>JSON.stringify([value.body,value.anchor,value.parent,value.purpose,value.sourceArtifactHash,value.sourceKey,value.sourceCommentId,value.action]);
    const sentContent=content(submitted),data={target:view,body:submitted.body,anchor:submitted.anchor??null};
    if(submitted.sourceKey)data.sourceKey=submitted.sourceKey;if(submitted.sourceCommentId)data.sourceCommentId=submitted.sourceCommentId;
    if(submitted.parent){data.parent=submitted.parent;delete data.anchor;}
    if(submitted.purpose==='rework'){data.purpose='rework';if(submitted.sourceArtifactHash)data.sourceArtifactHash=submitted.sourceArtifactHash;}
    const kind=draft?'draft':submitted.parent?'reply':'comment',rev=draft?submitted.draftRevision??0:submitted.revision;
    const why=!draft&&submitted.action==='relocate'?window.prompt('위치를 바꾼 이유를 입력해 주세요.'):'';
    if(!draft&&submitted.action==='relocate'&&!why?.trim())return;
    if(await write(kind,submitted.id,data,rev,draft?'save':submitted.action||'save',why||'')){
      const changed=content(submitted)!==sentContent;
      if(draft)submitted.draftRevision=rev+1;else submitted.revision=rev+1;
      submitted.dirty=changed;
      // A late response owns only the submitted draft, never a newly opened
      // editor or its screen. Additional typing stays unsaved at the new revision.
      if(!edits.has(key)||edits.get(key)===submitted){if(changed)edits.set(key,submitted);else edits.delete(key);}
      persistDrafts();
      if(editor!==submitted||!target||!match(target,view,view.viewport)||target.artifactHash!==view.artifactHash)return;
      if(changed){status('전송한 내용은 저장했습니다. 추가로 입력한 내용은 아직 저장하지 않았습니다.');return;}
      if(draft)return;
      const again=continuousPoints&&Boolean(submitted.anchor)&&!submitted.parent&&submitted.action!=='relocate';
      editor=null;
      if(again){edit(null,null,true);status('저장됨 · 다음 위치를 선택하세요.');}
      else notes();
    }
  }
  // Actual snapshot values stay in the trusted host and never enter comments, HTML exports or the frame.
  let quoteGeneration=0,allowedSites=[];
  const buyerView=createBuyerResult($('snapshot'),projectBuyerResult,
    id=>api('/api/ia/r3-price/quote?id='+encodeURIComponent(id)),(step,id)=>{
      if(step==='same'&&id){location.assign('/ia?view=pricing-r3&quote='+encodeURIComponent(id)+'#quote');return;}
      location.assign('/ia?view=simple-r3&step='+(step==='new'?'q2':'review')+'#/form');
    });
  function clearPrivateQuote(){buyerView.clear();quoteGeneration++;allowedSites=[];$('buyer-sites').replaceChildren();$('buyer-quotes').replaceChildren();$('snapshot').textContent='';}
  async function loadSites(){
    clearPrivateQuote();const seq=quoteGeneration;
    try{const j=await api('/api/ia/r3-price/sites');if(seq!==quoteGeneration)return;
      allowedSites=j.sites.filter(s=>s.verification==='VERIFIED');
      $('buyer-sites').replaceChildren(new Option('인증한 사업장 선택',''),...allowedSites.map((s,i)=>new Option(s.org_id+' · '+s.site_id,String(i))));
      if(!allowedSites.length)$('snapshot').textContent='인증된 사업장이 없습니다.';
    }catch(e){if(seq===quoteGeneration)announceError(e);}
  }
  $('buyer-sites').onchange=async()=>{
    const seq=++quoteGeneration;buyerView.clear();$('buyer-quotes').replaceChildren();$('snapshot').textContent='';
    const which=$('buyer-sites').value,site=which!==''&&allowedSites[Number(which)];if(!site)return;
    try{const q=new URLSearchParams({org:site.org_id,site:site.site_id}),j=await api('/api/ia/r3-price/offers?'+q);
      if(seq===quoteGeneration)$('buyer-quotes').replaceChildren(new Option('기존 견적 선택',''),...j.quotes.map(v=>new Option(v.id,v.id)));
    }catch(e){if(seq===quoteGeneration)announceError(e);}
  };
  $('buyer-quotes').onchange=async()=>{
    const seq=++quoteGeneration,id=$('buyer-quotes').value;buyerView.clear();if(!id)return;
    try{const snapshot=await api('/api/ia/r3-price/quote?id='+encodeURIComponent(id));
      if(seq===quoteGeneration)buyerView.show(snapshot);
    }catch(e){if(seq===quoteGeneration){if([401,403].includes(e.status))buyerView.gate();else announceError(e);}}
  };
  $('quote-open').onclick=loadSites;addEventListener('pagehide',clearPrivateQuote);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPrivateQuote();});
  const sameOriginUrl=(path)=>new URL(path,location.href);
  function download(filename,bytes,mime){const url=URL.createObjectURL(new Blob([bytes],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function exportResearch(kind='snapshot'){
    if(researchExportPending)return;
    if(!artifact?.application||!current||!target||!displayed||!researchExports?.[kind]){status('현재 연구 화면이 확인된 뒤 다시 내보내기를 눌러 주세요.');return;}
    const item=artifact,snapshotTarget={...target},acknowledged={...displayed},epoch=generation,channel=session;
    const expected={build:item.application.build,artifact:item.hash,channel,width:target.viewport,version:item.version,screen:current.screen,state:current.state,variant:current.variant,...modeFields(modeOf(target))};
    researchExportPending=true;
    try{
      const file=await researchExports[kind]({frame,expected,acknowledged,origin:location.origin,application:item.application});
      if(epoch!==generation||artifact!==item||session!==channel||displayed?.channel!==channel||target?.artifactHash!==snapshotTarget.artifactHash)throw Error('RESEARCH_EXPORT_TARGET_CHANGED');
      download(file.file,file.html,'text/html;charset=utf-8');
      // Only the digest and review target enter the audit record. Product DOM,
      // input values and the host's private quote panel never leave this file.
      await write('figma',crypto.randomUUID(),{target:snapshotTarget,status:'exported',evidenceRef:'sha256:'+file.sha256},0);
    }catch{status('현재 화면을 내보내지 못했습니다. 화면과 이미지가 모두 열린 뒤 다시 시도해 주세요.');}
    finally{researchExportPending=false;}
  }
  function frameDocument(a,row,channel,reference=null){
      const boot=frameBootstrap.replaceAll('</script','<\\/script');const params=JSON.stringify({channel:channel,artifact:a.hash,version:a.version,screen:row.screen,state:row.state,variant:row.variant,authOriginStep:reference?null:authOriginStep||null,...(a.fixture?{fixture:a.fixture}:{})}).replaceAll('<','\\u003c');
      const replay=a.replayFrame?',('+a.replayFrame.replaceAll('</script','<\\/script')+')':'';
      const script='<script nonce="'+nonce+'">('+boot+')('+params+replay+')</'+'script>';
      const referenceScript=reference?'<script nonce="'+nonce+'">('+collectPinSource.toString().replace(/<\/script/gi,'<\\/script')+')('+JSON.stringify({channel,artifact:a.hash,target:reference}).replaceAll('<','\\u003c')+')</'+'script>':'';
      // srcdoc inherits parent CSP; the child further restricts network, forms and images.
      const policy='<meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'nonce-'+nonce+'\';style-src \'unsafe-inline\';img-src data:;connect-src \'none\';form-action \'none\';base-uri \'none\'">';
      const reduced=$('motion-enabled')?.checked===false?'<style>*, *:before, *:after{transition:none!important;animation-play-state:paused!important;scroll-behavior:auto!important}</style>':'';
      const html=reduced?a.html.replace('<html ','<html data-review-reduced '):a.html;
      return html.replace('<!--R3-POLICY-->',()=>policy+reduced).replace('<!--R3-FRAME-->',()=>referenceScript+(a.mount?'<script nonce="'+nonce+'">'+a.mount.replace(/<\/script/gi,'<\\/script')+'</'+'script>':'')+(a.qaRuntime?'<script nonce="'+nonce+'">'+a.qaRuntime.replace(/<\/script/gi,'<\\/script')+'</'+'script>':'')+script);
  }
  function researchDocumentUrl(a,channel,width){
    const url=new URL(a.application.url,location.origin);
    if(url.origin!==location.origin||url.pathname!=='/ia'||url.searchParams.get('view')!=='research-r3'||!/^[a-zA-Z0-9_.-]{1,128}$/.test(a.application.build||'')||url.searchParams.has('build')&&url.searchParams.get('build')!==a.application.build)throw Error('INVALID_RESEARCH_APPLICATION_URL');
    for(const [key,value]of Object.entries({inspect:'1',channel,artifact:a.hash,width,build:a.application.build,version:a.version==='current'?'current':'recorded'}))url.searchParams.set(key,String(value));
    if(!validMode(a.mode)||!validMode(url.searchParams.get('mode')??undefined)||(url.searchParams.get('mode')||'simple')!==modeOf(a))throw Error('INVALID_RESEARCH_APPLICATION_MODE');
    url.searchParams.set('mode',modeOf(a));
    return url;
  }
  function loadReviewDocument(unit,a,row,channel,width){
    if(a.application){
      const url=researchDocumentUrl(a,channel,width);
      unit.removeAttribute('srcdoc');unit.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');unit.src=url.href;
    }else{unit.removeAttribute('src');unit.setAttribute('sandbox','allow-scripts');unit.srcdoc=frameDocument(a,row,channel);}
  }
  // The source step is short-lived and belongs to this QA tab's guest authentication flow.
  let authOriginStep = null, arrivalScreen = null;
  async function select(row,version=$('version').value,originStep=null,pinnedHash=null,appliedState=false,purchaseFixture=null,researchNavigation=null){
    if(!row)return;
    const requestedMode=row.application?(researchNavigation?.mode??row.mode??reviewMode):'simple';
    if(!validMode(requestedMode)){status('검토 모드를 확인할 수 없습니다.');return;}
    remember();reviewMode=requestedMode;row=atMode(row,requestedMode);
    cancelPinSources();
    clearTimeout(transitionTimeout);exitAnimation?.cancel();
    const previous=displayed||researchLive;displayed=null;researchPending=null;
    if(row && row.id !== current?.id) authOriginStep = originStep;
    continuousPoints=false;send('mode',false);wantsPoint=false;clearPrivateQuote();$('buyer').hidden=row.screen!=='quote-result'||version!=='current';remember();editor=null;drawer.hidden=true;$('pick-cancel').hidden=true;$('conflict').hidden=true;
    document.querySelectorAll('[data-review]').forEach(b=>b.disabled=version!=='current');const n=++generation;current=row;$('quote-candidates').hidden=version!=='current'||!['q1','q2','q3','q4','quote-review'].includes(row.screen);target=null;artifact=null;session='';missing.clear();frame.inert=true;$('caption').textContent=row.label+' · '+row.stateLabel;
    const width=widthFor(row);shell?.render();$('surface').style.setProperty('--width',width+'px');
    for(const id of ['new','general','figma-stage','figma-url','figma-memo','link-figma'])$(id).disabled=version==='prior-r3'||version==='recorded';
    const url=sameOriginUrl(location.href);url.searchParams.set('screen',row.id);url.searchParams.set('width',width);
    if(version==='current')url.searchParams.delete('version');else url.searchParams.set('version',version);
    if(pinnedHash)url.searchParams.set('artifactHash',pinnedHash);else url.searchParams.delete('artifactHash');
    modeUrl(url,requestedMode);
    history.replaceState(null,'',url);
    try{
      if(requestedMode==='detailed'){await loadDetailedCatalog();if(n!==generation)return;}
      const a=await api(base+'/artifact?id='+encodeURIComponent(row.id)+'&width='+width+'&version='+version+(pinnedHash?'&artifactHash='+encodeURIComponent(pinnedHash):'')+(requestedMode==='detailed'?'&mode=detailed':''));
      if(n!==generation)return;
      if(!validMode(a.mode)||modeOf(a)!==requestedMode)throw Error('RESEARCH_MODE_MISMATCH');
      if(a.fixture&&purchaseFixture)a.fixture={...a.fixture,data:{purchases:purchaseFixture.purchases},selectedPurchaseId:purchaseFixture.selectedPurchaseId};
      if(version==='recorded'||version!==a.version){version=a.version;$('version').value=version;url.searchParams.set('version',version);history.replaceState(null,'',url);for(const id of ['new','general','figma-stage','figma-url','figma-memo','link-figma'])$(id).disabled=version==='prior-r3';}
      artifact=a;presentExports();session=crypto.randomUUID();if(version==='current'&&!a.archivedSource){const hashRow=requestedMode==='detailed'?detailedCatalog?.get(row.id):screens.find(item=>item.id===row.id)||row;if(hashRow){hashRow.hashes??={};hashRow.hashes[width]=a.hash;}}
      target={screen:row.screen,state:row.state,variant:row.variant,viewport:width,artifactHash:a.hash,...modeFields(requestedMode)};
      const identity={channel:session,hash:a.hash,width,version:a.version,screen:row.screen,state:row.state,variant:row.variant,motion:$('motion-enabled').checked,runtimeDigest:a.source?.runtimeDigest||null,epoch:a.archivedSource?.epoch||null,application:a.application?.build||null,generation:n,...modeFields(requestedMode)};
      const documentSwap=()=>{if(n!==generation)return;resetResearch();if(a.application){researchDocumentBuild=a.application.build;rememberResearch(identity);}loadReviewDocument(frame,a,row,session,width);};
      const onboarding=row.screen==='onboarding'&&/^(guest|member)-[1-4]$/.test(row.state)&&row.state.split('-')[0]===previous?.state.split('-')[0];
      const component=['login','signup','password','otp','terms'].includes(row.screen)&&row.runtimeFamily!=='snapshot';
      const sameRuntime=previous&&previous.runtimeDigest===(a.source?.runtimeDigest||null)&&previous.epoch===(a.archivedSource?.epoch||null);
      if(a.application&&researchDocumentBuild===a.application.build&&version==='current'&&!pinnedHash){
        researchPending={generation:n,identity,from:null,payload:{channel:session,artifact:a.hash,hash:a.hash,screen:row.screen,state:row.state,variant:row.variant,viewport:width,version:'current',...modeFields(requestedMode),route:{screen:row.screen,state:row.state,variant:row.variant,mode:requestedMode},fixture:a.fixture||null,acknowledgeOnly:Boolean(researchNavigation),routeRevision:researchNavigation?.routeRevision}};
        sendResearchSelection();
        // A missing acknowledgement must not discard a live app's input by
        // silently replacing its document. Leave it available for recovery.
        transitionTimeout=setTimeout(()=>{if(n===generation)researchFailed();},15000);
      }else if((row.screen==='quote-result'||onboarding||component)&&sameRuntime&&previous?.version==='current'&&row.screen===previous.screen&&row.variant===previous.variant&&version==='current'&&previous.width===width&&previous.motion===$('motion-enabled').checked&&!pinnedHash){
        const payload={state:row.state,hash:a.hash,channel:session,...(a.fixture?{fixture:a.fixture}:{})};
        if(onboarding||component)payload.markup=a.html;if(component)payload.applied=appliedState;
        frame.contentWindow.postMessage({scope:'ORDER_R3_HOST',channel:previous.channel,artifact:previous.hash,type:component?'componentState':onboarding?'onboardingState':'resultState',payload},'*');
        transitionTimeout=setTimeout(documentSwap,component?1400:320);
      }else{
        if(previous&&$('motion-enabled')?.checked&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&frame.animate){
          exitAnimation=frame.animate([{opacity:1},{opacity:0}],{duration:100,easing:'ease-out',fill:'forwards'});
          try{await exitAnimation.finished;}catch{/* A newer state owns the frame. */}
        }
        if(n!==generation)return;
        exitAnimation?.cancel();documentSwap();
      }
      $('version-mark').textContent=version==='previous'?'이전 화면':version==='prior-r3'?'이전 R3 검토판':'이번 판';
      list();
    }catch(e){if(n===generation){if(!researchDocumentBuild)frame.srcdoc='';researchPending=null;target=null;artifact=null;session='';frame.inert=false;announceError(e);}}
  }
  async function refresh(first=false){
    try{
      let changed=!reviewAvailable;
      for(;;){
        const page=await api(base+'/records?release='+release+'&since='+cursor+'&limit=150');
        for(const row of page.items){
          const key=localKey(row.kind,row.id);
          if((records.get(key)?.revision??0)>=row.revision)continue;
          records.set(key,row);changed=true;
        }
        cursor=Math.max(cursor,page.nextCursor);
        if(!page.hasMore)break;
      }
      reviewAvailable=true;
      // Focusing a drawer control from the iframe must not replace the button
      // between pointerdown and click when its records already match the server.
      if(changed){list();syncPins();if(!drawer.hidden&&!editor&&shell?.activeTab()==='review')notes(subset);}
    }catch(e){if(first)reviewAvailable=false;announceError(e);}
  }
  async function readLegacy(){
    let after=0;try{for(;;){const j=await api(base+'/legacy?after='+after+'&limit=50');for(const r of j.items)legacy.set(r.sourceKey,r.data);if(!j.hasMore)break;after=j.nextCursor;}legacyAvailable=true;list();syncPins();if(!drawer.hidden&&!editor)notes(subset);}catch(e){announceError(e);}
  }
  let journeyDraft=null;
  let sampleUnread=1;
  function widgetKey(){
    return draftStorageKey&&current?.id==='admin-overview/normal/email'&&target?'order.ia.widget.'+draftStorageKey+'/'+current.id+'/'+target.viewport+'/'+target.artifactHash:null;
  }
  function validWidgets(p){
    return p&&Object.keys(p).length===1&&Array.isArray(p.layout)&&p.layout.length===3&&
      p.layout.every(v=>v&&Object.keys(v).length===2&&[0,1,2].includes(v.index)&&typeof v.wide==='boolean')&&
      new Set(p.layout.map(v=>v.index)).size===3;
  }
  const questionScreens=['q1','q2','q3','q4','quote-review'];
  let menuPublished=false;
  async function loadPublication(){
    try{menuPublished=(await api('/api/order/features')).orderMenu===true;}catch{menuPublished=false;}
    if(current&&questionScreens.includes(current.screen)&&$('version').value==='current')send('menuPublication',menuPublished);
  }
  loadPublication();addEventListener('pageshow',loadPublication);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadPublication();});
  let fixtureNotices=[false,false,false];
  let consultationFixture={passes:[],topics:[],memo:'',date:'',time:''};
  const roleMenus={passes:['quotes','delivery'],search:['quotes'],profile:['activity','business','quotes'],drawer:['consult']};
  addEventListener('message',e=>{
    if(routePinSourceMessage(e))return;
    const m=e.data;
    const item=secondary.get(e.source);
    if(item&&e.origin===(item.artifact.application?location.origin:'null')&&item.frame.isConnected&&m?.scope==='ORDER_R3_FRAME'&&m.channel===item.channel&&m.artifact===item.hash){
      if(item.artifact.application&&m.type==='researchRoute'){
        if(item.artifact.version!=='current'){historyResearchNotice(item.row,item.width,item.hash,modeOf(item.artifact));return;}
        const route=m.payload?.route,revision=m.payload?.routeRevision;
        if(!route||!validMode(route.mode)||!Number.isSafeInteger(revision)||revision<=0||route.build&&route.build!==item.artifact.application.build)return;
        const row=screens.find(row=>row.application&&row.screen===route.screen&&row.state===route.state&&row.variant===route.variant);
        if(row){item.frame.inert=true;shell.setActiveMode('focus');$('width').value=String(item.width);select(atMode(row,modeOf(route)),'current');}
        return;
      }
      if(m.type==='userActivity'){document.dispatchEvent(new Event('ia-session-activity'));return;}
      if(m.type==='ready'){if(!sameMode(m.payload,item.artifact))return;setSecondaryPick(item,wantsPoint);syncSecondaryPins(item);return;}
      if(m.type==='pinProjectionChanged'){syncSecondaryPins(item);return;}
      if(!wantsPoint&&m.type==='openPins'&&Array.isArray(m.payload?.ids)){
        const view={screen:item.row.screen,state:item.row.state,variant:item.row.variant,viewport:item.width,artifactHash:item.hash,...modeFields(modeOf(item.artifact))};
        const known=new Set(reviewPins(view,item.artifact).map(p=>p.id)),ids=m.payload.ids.filter(id=>known.has(id));
        if(!ids.length)return;
        shell.setActiveMode('focus');$('width').value=String(item.width);
        select(atMode(item.row,modeOf(item.artifact))).then(()=>{if(target?.artifactHash===item.hash)notes(ids);});return;
      }
      if(wantsPoint&&m.type==='cancelPick'&&editor){stopPointMode();stage();return;}
      if(wantsPoint&&m.type==='point'&&editor&&m.payload?.artifactHash===item.hash&&m.payload.instance===item.row.screen&&sameMode(m.payload,item.artifact)){
        const a=m.payload;
        if(typeof a.id!=='string'||![a.x,a.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Array.isArray(a.scroll)||!Array.isArray(a.layers))return;
        if((editor.revision>0||editor.sourceKey) && (item.row.id!==current.id || item.width!==target.viewport||!sameMode(item.artifact,target))){
          status('기존 의견은 같은 화면과 너비에서 위치를 선택해 주세요.');return;
        }
        const saved=editor, keepContinuous=continuousPoints, surface=$('surface');
        const anchor={id:a.id,instance:a.instance,artifactHash:a.artifactHash,x:a.x,y:a.y,viewport:a.viewport,scale:a.scale,layers:a.layers,...modeFields(modeOf(item.artifact)),
          scroll:[...a.scroll.slice(0,22),{id:'host-surface',x:surface.scrollLeft,y:surface.scrollTop},{id:'host-document',x:0,y:0}]};
        send('mode',false);editor=null;wantsPoint=false;
        shell.setActiveMode('focus');$('width').value=String(item.width);
        select(atMode(item.row,modeOf(item.artifact))).then(()=>{if(target?.artifactHash!==item.hash)return;continuousPoints=keepContinuous;saved.anchor=anchor;saved.dirty=true;edit(null,null,false,null,saved);send('mode',false);remember();});
      }
      return;
    }
    if(e.source===frame.contentWindow&&e.origin===location.origin&&m?.scope==='ORDER_R3_FRAME'){
      const known=researchCandidates.get(m.channel);
      if(known&&m.artifact===known.hash){
        if(known.generation<(researchLive?.generation??-1))return;
        if(m.type==='ready'&&(!sameMode(m.payload,known)||m.payload?.version!==undefined&&m.payload.version!==known.version))return;
        if(m.type==='ready'||m.type==='researchRoute'){
          researchLive=known;
          for(const [key,value]of researchCandidates)if(value.generation<known.generation)researchCandidates.delete(key);
        }
        if(m.type==='userActivity'){document.dispatchEvent(new Event('ia-session-activity'));return;}
        if(m.type==='researchError'){
          if(researchPending&&m.payload?.channel===researchPending.identity.channel)researchFailed();
          return;
        }
        if(m.type==='researchRoute'){
          const route=m.payload?.route,routeRevision=m.payload?.routeRevision;
          if(known.version!=='current'){
            const row=screens.find(row=>row.screen===known.screen&&row.state===known.state&&row.variant===known.variant);
            researchFailed();historyResearchNotice(row,known.width,known.hash,modeOf(known));return;
          }
          if(!route||!validMode(route.mode)||!Number.isSafeInteger(routeRevision)||routeRevision<=researchRouteRevision||route.build&&route.build!==known.application)return;
          const row=screens.find(row=>row.application&&row.screen===route.screen&&row.state===route.state&&row.variant===route.variant);
          if(!row){researchFailed();return;}
          researchRouteRevision=routeRevision;
          select(row,'current',null,null,false,null,{...route,routeRevision});return;
        }
        if(m.type==='ready'){
          if(researchPending?.identity.channel===m.channel)researchPending=null;
          else sendResearchSelection();
        }
      }
    }
    if(!artifact||e.source!==frame.contentWindow||e.origin!==(artifact.application?location.origin:'null')||m?.scope!=='ORDER_R3_FRAME'||m.channel!==session||m.artifact!==artifact.hash)return;
    if(m.type==='userActivity'){document.dispatchEvent(new Event('ia-session-activity'));return;}
    if(m.type==='pinProjectionChanged'){syncPins();return;}
    const isCurrent=$('version').value==='current';
    if(isCurrent&&!wantsPoint&&m.type==='qaPurchaseFixture'){
      const data=m.payload,fields=new Set(['id','revision','status','createdAt','updatedAt','offerId','quoteId','product','quantity','trays','unitPrice','total','paid','refunded','cancelledTrays','paymentMethod','channel','date','targetId','target','supplierId','shipmentOrigin','serviceDate','carrier','tracking','receiptId','paymentReference','paymentConfirmedAt']);
      if(!artifact.qaRuntime||!data||!Array.isArray(data.purchases)||data.purchases.length>100||!(data.selectedPurchaseId===null||typeof data.selectedPurchaseId==='string'&&data.selectedPurchaseId.length<=128))return;
      const purchases=[];
      for(const item of data.purchases){
        if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||item.id.length>128)return;
        const clean={};for(const [key,value] of Object.entries(item)){if(!fields.has(key))continue;
          if(!(value===null||typeof value==='string'&&value.length<=512||typeof value==='number'&&Number.isFinite(value)))return;clean[key]=value;}
        purchases.push(clean);
      }
      pendingPurchaseFixture={channel:session,artifact:artifact.hash,at:Date.now(),purchases,selectedPurchaseId:data.selectedPurchaseId};return;
    }
    if(isCurrent&&!wantsPoint&&m.type==='downloadReviewDocument'){
      if(['receipt/complete','admin-quotes/list'].includes(current.screen+'/'+current.state)){
        if(artifact.application){if(frame.contentWindow.navigator.userActivation?.isActive)void exportResearch();}
        else download('QA_'+current.screen+'_'+current.state+'.html',artifact.editable,'text/html;charset=utf-8');
      }
      return;
    }
    if(isCurrent&&!wantsPoint&&m.type==='readNoticeFixture'&&current.screen==='profile'){
      sampleUnread=0;send('noticeCountFixture',sampleUnread);return;
    }
    if(isCurrent&&!wantsPoint&&m.type==='reviewWidgetLayout'&&widgetKey()&&validWidgets(m.payload)){
      try{sessionStorage.setItem(widgetKey(),JSON.stringify(m.payload));}catch{/* The current fixture can still be arranged without local storage. */}
      return;
    }
    const notices=isCurrent&&(current.screen==='profile'||current.id==='terms/optional/email');
    const consultation=isCurrent&&current.screen==='drawer';
    if(consultation&&!wantsPoint&&m.type==='setConsultationFixture'){
      const data=m.payload;
      const entries=(value,allowed)=>Array.isArray(value)&&value.length<=allowed.length&&value.every(x=>allowed.includes(x));
      if(data&&entries(data.passes,['b17','c15','r12'])&&entries(data.topics,['납품 일정','수량','가격 조건'])&&
        typeof data.memo==='string'&&data.memo.length<=300&&typeof data.date==='string'&&(!data.date||/^\d{4}-\d{2}-\d{2}$/.test(data.date))&&
        typeof data.time==='string'&&(!data.time||/^\d{2}시 \d{2}분$/.test(data.time))){
        consultationFixture={passes:[...new Set(data.passes)],topics:[...new Set(data.topics)],memo:data.memo,date:data.date,time:data.time};
      }
      return;
    }
    if(notices&&!wantsPoint&&m.type==='setNoticeFixture'&&Array.isArray(m.payload)&&m.payload.length===3&&m.payload.every(x=>typeof x==='boolean')){
      fixtureNotices=m.payload.slice();
      return;
    }
    const input=isCurrent&&['q2','quote-review'].includes(current.screen);
    if(isCurrent&&!wantsPoint&&questionScreens.includes(current.screen)&&m.type==='quoteMode'){
      if(menuPublished&&['simple','detailed'].includes(m.payload))location.assign('/ia?view='+m.payload+'-r3');
      return;
    }
    if(input&&!wantsPoint&&m.type==='quoteStep'){
      if(['q2','review'].includes(m.payload))location.assign('/ia?view=simple-r3&step='+m.payload+'#/form');
      return;
    }
    if(input&&current.screen==='q2'&&!wantsPoint&&m.type==='quoteInput'){
      const d=m.payload,amount=v=>typeof v==='string'&&/^\d{1,10}$/.test(v);
      if(!d||!['month','delivery'].includes(d.basis)||!['판','개'].includes(d.unit)||!amount(d.qty)||Number(d.qty)<1||
        typeof d.unknown!=='boolean'||(d.unknown?d.price!=='':!amount(d.price)))return;
      journeyDraft={basis:d.basis,qty:d.qty,unit:d.unit,price:d.price,unknown:d.unknown};
      select(screens.find(r=>r.id==='quote-review/normal/email'));return;
    }
    if(m.type==='ready'){if(!sameMode(m.payload,target))return;clearTimeout(transitionTimeout);frame.inert=false;displayed={channel:session,hash:artifact.hash,width:target.viewport,version:artifact.version,screen:current.screen,state:current.state,variant:current.variant,motion:$('motion-enabled').checked,runtimeDigest:artifact.source?.runtimeDigest||null,epoch:artifact.archivedSource?.epoch||null,application:artifact.application?.build||null,...modeFields(modeOf(target))};
      if(artifact.application){syncPins();if(wantsPoint)send('mode',true);return;}
      if(isCurrent&&arrivalScreen===current.id){send('memberArrival',true);arrivalScreen=null;}
      if(isCurrent)restoreOnboardingChoice();
      if(isCurrent&&['profile','onboarding'].includes(current.screen))send('noticeCountFixture',sampleUnread);
      if(isCurrent&&widgetKey()){
        try{const layout=JSON.parse(sessionStorage.getItem(widgetKey()));if(validWidgets(layout))send('restoreWidgetLayout',layout);}catch{/* Invalid or unavailable browser storage. */}
      }
      if(input&&journeyDraft)send('journeyDraft',journeyDraft);
      if(isCurrent&&questionScreens.includes(current.screen))send('menuPublication',menuPublished);
      if(notices)send('noticeFixture',fixtureNotices);if(consultation)send('consultationFixture',consultationFixture);syncPins();if(wantsPoint)send('mode',true);return;}
    if(m.type==='point'&&wantsPoint&&editor&&m.payload?.artifactHash===artifact.hash&&m.payload.instance===target.screen&&sameMode(m.payload,target)){
      const {id,instance,x,y,viewport,scale,scroll,layers,artifactHash}=m.payload;
      if(typeof id!=='string'||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||!Array.isArray(scroll)||!Array.isArray(layers))return;
      const track=(id,el)=>({id,x:Math.max(0,el.scrollLeft),y:Math.max(0,el.scrollTop)});
      editor.anchor={id,instance,x,y,viewport,scale,layers,artifactHash,...modeFields(modeOf(target)),scroll:[...scroll.slice(0,22),track('host-surface',$('surface')),track('host-document',document.scrollingElement)]};editor.dirty=true;remember();$('point-state').textContent='위치 지정됨';stage();}
    if(m.type==='cancelPick'&&editor){stopPointMode();stage();}
    if(m.type==='openPins'&&Array.isArray(m.payload?.ids))notes(m.payload.ids);
    if(m.type==='missing'&&Array.isArray(m.payload?.ids)){missing=new Set(m.payload.ids);updatePinLocations();}
    if(isCurrent&&!wantsPoint&&['localState','componentStateRequest'].includes(m.type)&&m.payload?.screen===current.screen&&['login','signup','password','otp','terms'].includes(current.screen)){
      const row=screens.find(r=>r.screen===current.screen&&r.variant===current.variant&&r.state===m.payload.state);
      if(row&&row.id!==current.id)select(row,undefined,authOriginStep,null,m.type==='localState');
      return;
    }
    if(!wantsPoint && m.type==='navigate' && typeof m.payload?.screen==='string'){
      let {screen,state}=m.payload, originStep=authOriginStep;
      if(['role-consult','role-delivery'].includes(screen)){
        if(isCurrent&&current.screen==='quote-result')location.assign('/ia?view=roles-r3&menu='+(screen==='role-consult'?'consult':'delivery'));
        return;
      }
      if(screen==='role-case' && $('version').value==='current'){
        const scope=current.screen==='business'?'business':['proof','signature'].includes(current.screen)?'reprice':null;
        if(scope && state===scope)location.assign('/ia?view=roles-r3&menu='+scope);
        return;
      }
      if(screen==='role-work'){
        if(isCurrent&&roleMenus[current.screen]?.includes(state))location.assign('/ia?view=roles-r3&menu='+state);
        return;
      }
      if(current.screen==='onboarding'){
        if(screen==='simple-r3'||screen==='detailed-r3'&&current.state.startsWith('member-')){
          history.replaceState({...history.state,orderReviewMode:{row:current.id,mode:screen==='simple-r3'?'simple':'detailed'}},'',location.href);
          location.assign('/ia?view='+screen);return;
        }
        originStep=/^guest-[1-4]$/.test(current.state) && (screen==='login'||screen==='signup') ? current.state.slice(-1) : null;
      } else if(originStep && ['login','signup','password','otp','terms'].includes(current.screen)){
        const closed=screen==='login' && state==='closed';
        if(closed || screen==='onboarding' && /^(guest|member)-[1-4]$/.test(state)){
          screen='onboarding';
          state=(closed || state.startsWith('guest-')?'guest-':'member-')+originStep;
          originStep=null;
        }
      }
      // Product entry chooses the requested integrated design. QA deep links keep their explicit variant.
      const preferred=current.screen==='onboarding' && screen==='login' && state==='empty'?'compact':current.variant;
      const row=screens.find(r=>r.screen===screen && (!state || state===r.state) && r.variant===preferred)
        || screens.find(r=>r.screen===screen && (!state || state===r.state) && r.variant==='email');
      if(row){
        arrivalScreen=authOriginStep&&['login','signup','otp'].includes(current.screen)&&row.screen==='onboarding'&&row.state.startsWith('member-')?row.id:null;
        const purchaseFixture=pendingPurchaseFixture?.channel===session&&pendingPurchaseFixture?.artifact===artifact.hash&&Date.now()-pendingPurchaseFixture.at<5000?pendingPurchaseFixture:null;
        pendingPurchaseFixture=null;select(row,undefined,originStep,null,false,purchaseFixture);
      }
    }
  });
  $('open').onclick=()=>{$('choose').showModal();$('search').focus();};$('close-choose').onclick=()=>$('choose').close();
  $('search').oninput=list;$('width').onchange=()=>select(current);$('version').onchange=()=>select(current);
  $('next').onclick=()=>{const rows=screens.filter(row=>actionableWidth(row));if(rows.length){const row=rows[(rows.findIndex(r=>r.id===current?.id)+1)%rows.length];$('width').value=String(actionableWidth(row));return select(row);}else status('해당하는 미해결 화면이 없습니다.');};
  $('points').onclick=()=>{stopPointMode();notes();};$('new').onclick=()=>{if(continuousPoints||wantsPoint)cancelPoint();else beginPointComment(true);};$('general').onclick=()=>{stopPointMode();remember();edit();};$('reposition').onclick=pick;
  if($('drawer-new-location'))$('drawer-new-location').onclick=()=>beginPointComment(false);
  $('pick-cancel').onclick=cancelPoint;$('close-drawer').onclick=hideDrawer;$('hide-pins').onclick=()=>{displayPins=!displayPins;syncPins();$('hide-pins').setAttribute('aria-pressed',String(!displayPins));};
  addEventListener('keydown',event=>{if(event.key==='Escape'&&(continuousPoints||wantsPoint)){event.preventDefault();cancelPoint();}});
  $('save').onclick=()=>saveDraft(false);$('draft').onclick=()=>saveDraft(true);$('sync').onclick=async()=>{pinSourceAttempted.clear();for(const [key,value] of pinSources)if(value===null||value.mountedUnavailable)forgetPinSource(key);await readLegacy();await refresh();};body.oninput=()=>{if(editor){editor.dirty=true;remember();}};
  if(exportReview) exportReview({release, notify:status, getLocalDrafts:()=>{remember();return [...edits];}});
  $('export').onclick=async()=>{if(!artifact)return;if(artifact.application)return exportResearch();const item=artifact, snapshotTarget={...target};download(item.file,item.editable,'text/html');await write('figma',crypto.randomUUID(),{target:snapshotTarget,status:'exported',evidenceRef:'sha256:'+item.exportHash},0);};
  const memoDrafts=new Map();
  const memoTimers=new Map();
  const memoId=t=>'memo/'+reviewKey(t,t.viewport)+'/'+t.artifactHash;
  function memoDraftKey(id){return draftStorageKey+'.screen.'+id;}
  function loadMemoDraft(id){
    if(memoDrafts.has(id))return memoDrafts.get(id);
    if(!draftStorageKey)return;
    try{
      const value=JSON.parse(sessionStorage.getItem(memoDraftKey(id))||'null');
      if(typeof value?.body==='string'&&Number.isInteger(value.revision)){
        memoDrafts.set(id,value);return value;
      }
    }catch{}
  }
  function storeMemoDraft(id,draft){
    if(draft)memoDrafts.set(id,draft);else memoDrafts.delete(id);
    if(!draftStorageKey)return;
    try{
      if(draft)sessionStorage.setItem(memoDraftKey(id),JSON.stringify(draft));
      else sessionStorage.removeItem(memoDraftKey(id));
    }catch{status('이 탭에 화면 의견 초안을 보관하지 못했습니다.');}
  }
  function syncScreenMemo(past){
    const id=memoId(target),saved=records.get(localKey('screen',id));
    const field=$('review-note'),draft=loadMemoDraft(id);
    field.readOnly=$('version').value!=='current';
    field.value=draft?.body??saved?.data.body??past?.note??'';
    field.dataset.revision=String(draft?.revision??saved?.revision??0);
    $('save-review-note').hidden=field.readOnly;
    const state=$('review-note-state');state.replaceChildren();
    if(draft && (saved?.revision??0)!==draft.revision){
      state.append(node('p','다른 탭의 화면 의견 · '+(saved?.data.body||'')),
        btn('다른 탭의 내용을 확인하고 내 메모 이어쓰기',()=>{
          storeMemoDraft(id,{...draft,revision:saved.revision});syncScreenMemo(past);field.focus();
        }));
    }else if(draft)state.textContent='이 탭의 미저장 메모';
    else if(saved)state.textContent='저장됨 · r'+saved.revision;
    const history=Array.isArray(past?.history)?past.history:[];
    $('history-details').hidden=!history.length;
    const list=$('record-history');list.replaceChildren();
    for(const h of history){
      const item=node('article');item.className='record-history-item';
      item.append(node('small',h.at||h.updatedAt||''),node('p',h.note||'(메모 없음)'));
      if(h.figma?.note)item.append(node('p',h.figma.note));
      list.append(item);
    }
  }
  function queueMemo(t,delay=850){
    const id=memoId(t);
    clearTimeout(memoTimers.get(id));
    memoTimers.set(id,setTimeout(()=>{memoTimers.delete(id);saveMemo(t);},delay));
  }
  async function saveMemo(t){
    const id=memoId(t),draft=loadMemoDraft(id);
    if(!draft||draft.saving)return;
    if(storing){queueMemo(t,200);return;}
    const prior=records.get(localKey('screen',id));
    const isVisible=()=>target&&memoId(target)===id&&!drawer.hidden;
    if((prior?.revision??0)!==draft.revision){
      if(isVisible())syncScreenMemo(legacy.get(reviewKey(t,t.viewport)));return;
    }
    const body=draft.body,revision=draft.revision;
    draft.saving=true;
    const ok=await write('screen',id,{target:t,body},revision);
    delete draft.saving;
    if(ok){
      const currentDraft=loadMemoDraft(id);
      if(currentDraft?.body===body)storeMemoDraft(id,null);
      else if(currentDraft){storeMemoDraft(id,{body:currentDraft.body,revision:revision+1});queueMemo(t);}
    }
    if(isVisible())syncScreenMemo(legacy.get(reviewKey(t,t.viewport)));
  }
  $('review-note').oninput=()=>{
    if(!target||$('version').value!=='current')return;
    const t={...target},id=memoId(t),field=$('review-note');
    storeMemoDraft(id,{body:field.value,revision:Number(field.dataset.revision)});
    $('review-note-state').textContent='이 탭의 미저장 메모';
    queueMemo(t);
  };
  $('save-review-note').onclick=()=>{
    if(!target||$('version').value!=='current')return;
    const id=memoId(target);clearTimeout(memoTimers.get(id));memoTimers.delete(id);saveMemo({...target});
  };
  const figmaId=t=>'figma/'+reviewKey(t,t.viewport)+'/'+t.artifactHash;
  function syncFigma(past){
    const log=[...records.values()].filter(r=>r.kind==='figma'&&match(r.data.target,target,target.viewport)&&r.data.target.artifactHash===target.artifactHash);
    const saved=records.get(localKey('figma',figmaId(target)))?.data;
    const old=past?.figma||{}, prior=log.filter(r=>r.data.figmaUrl).at(-1)?.data;
    const statusValue=saved?.status||old.status||(log.some(r=>r.data.status==='exported')?'exported':'none');
    const select=$('figma-stage');select.value=[...select.options].some(o=>o.value===statusValue)?statusValue:'none';
    $('figma-url').value=saved?.figmaUrl??prior?.figmaUrl??old.url??'';
    $('figma-memo').value=saved?.note??old.note??'';
    $('figma-status-badge').textContent=select.selectedOptions[0]?.textContent||'';
    const link=$('figma-open');link.hidden=true;link.removeAttribute('href');
    try{const url=new URL($('figma-url').value);if(url.protocol==='https:'&&['www.figma.com','figma.com'].includes(url.hostname)&&!url.username&&!url.password&&!url.port){link.href=url.href;link.rel='noopener noreferrer';link.hidden=false;}}catch{}
    $('export-record').textContent='기존 HTML 내보내기 '+(past?.exports||[]).length+'회 · 이번 판 '+log.filter(r=>r.data.evidenceRef?.startsWith('sha256:')).length+'회';
  }
  $('link-figma').onclick=async()=>{
    if(!target)return;
    const id=figmaId(target),prior=records.get(localKey('figma',id));
    const data={target,status:$('figma-stage').value,note:$('figma-memo').value};
    if($('figma-url').value.trim())data.figmaUrl=$('figma-url').value.trim();
    if(data.status==='exported')data.evidenceRef='사용자가 기록한 HTML 내보내기';
    if(await write('figma',id,data,prior?.revision??0))syncFigma(legacy.get(reviewKey(target,target.viewport)));
  };
  $('export-editable').onclick=()=>$('export').click();
  $('export-runnable').onclick=async()=>{
    if(!artifact||!current||!target)return;
    if(artifact.application)return exportResearch('link');
    const snapshotTarget={...target},html=frameDocument(artifact,current,crypto.randomUUID());
    // For a downloaded offline prototype allow the isolated runtime to mount,
    // while retaining its file's strict no-network policy and no server access.
    const file=html.replace('if(window===parent)return;', '');
    download(artifact.file.replace('.html','_offline.html'),file,'text/html');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(file));
    const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    await write('figma',crypto.randomUUID(),{target:snapshotTarget,status:'exported',evidenceRef:'sha256:'+hash},0);
  };
  if($('show-resolved-pins'))$('show-resolved-pins').onchange=syncPins;
  $('audit-demo').onchange=()=>{list();syncPins();};
  for(const b of document.querySelectorAll('[data-comment-filter]')) b.onclick=()=>{commentFilter=b.dataset.commentFilter;notes();};
  shell=bootShell({
    snapshot:()=>({screens,current,records,legacy,navigation,navigationPending,navigationReady}),saveNavigation,select,notes,close:hideDrawer,width:widthFor,isTest,label:qaLabel,feedbackFor,feedbackCounts,
    leaveEditor:()=>{remember();editor=null;},info:(r,w)=>stateInfo(r,w,showRecords()),
    liveFor:(r,w)=>showRecords().get(reviewKey(rowView(r,w),w))||[],
    loadPreview:async(row,width,unit,board)=>{
      const mode=rowMode(row),version=$('version').value;
      if(mode==='detailed')await loadDetailedCatalog();
      const j=await api(base+'/artifact?id='+encodeURIComponent(row.id)+'&width='+width+'&version='+version+(mode==='detailed'?'&mode=detailed':''));
      if(!unit.isConnected)return;
      if(!validMode(j.mode)||modeOf(j)!==mode)throw Error('RESEARCH_MODE_MISMATCH');
      for(const [source,stale] of secondary)if(!stale.frame.isConnected)secondary.delete(source);
      const channel=crypto.randomUUID();
      loadReviewDocument(unit,board&&!j.qaRuntime&&!j.application?{...j,mount:null}:j,row,channel,width);
      const source=unit.contentWindow;secondary.set(source,{source,frame:unit,channel,hash:j.hash,row:atMode(row,mode),width,board,artifact:j});
    }
  });
  for(const b of document.querySelectorAll('[data-review]'))b.onclick=async()=>{if(!target||$('version').value!=='current')return;const val=b.dataset.review,id='verdict/'+reviewKey(target,target.viewport)+'/'+target.artifactHash;const currentReview=records.get(localKey('review',id));if(await write('review',id,{target,decision:val},currentReview?.revision??0))notes();};
  (async()=>{try{
    const [me,a]=await Promise.all([api('/api/ia/auth/me'),api(base+'/artifact')]);csrf=me.csrf;document.dispatchEvent(new CustomEvent('ia-session-ready',{detail:me}));screens=a.items;publication=a.publication||null;navigation={revision:0,layout:a.navigationDefaults};await Promise.all([loadDrafts(me.email),loadNavigation()]);
    const u=new URL(location.href);if(['320','360','375','390','430','768','1024','1280','1440','1920'].includes(u.searchParams.get('width')))$('width').value=u.searchParams.get('width');
    const requestedMode=u.searchParams.get('mode')??undefined;
    if(!validMode(requestedMode)&&!['focus','board','dual'].includes(requestedMode))throw Error('INVALID_REVIEW_MODE');
    reviewMode=requestedMode==='detailed'?'detailed':'simple';
    const requested=u.searchParams.get('version');
    if(['previous','prior-r3'].includes(requested))$('version').value=requested;
    const pinned=u.searchParams.get('artifactHash');
    list();await Promise.all([select(screens.find(r=>r.id===u.searchParams.get('screen'))||screens.find(r=>r.id==='login/empty/compact')||screens[0],requested==='recorded'&&pinned?'recorded':$('version').value,null,pinned),readLegacy(),refresh(true)]);
    if(target&&draftsForScreen().length){notes();status('저장하지 않은 글이 이 탭에 남아 있습니다.');}
    addEventListener('focus',()=>refresh());
  }catch(e){announceError(e);}})();
}
