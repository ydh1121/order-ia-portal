// Trusted top-level chrome. Only typed review fields and allow-listed UI positions are persisted.
export function bootQaHost(nonce, frameBootstrap, bootShell, exportReview, createBuyerResult, projectBuyerResult, motionReview={requirements:[]}) {
  const $=id=>document.getElementById(id),release='MSG0585-R3',base='/api/ia/r3-qa';
  const node=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
  function btn(text,handler){const b=node('button',text);b.type='button';b.onclick=handler;return b;}
  let statusTimer;
  const status=msg=>{const live=$('live');live.textContent=msg;live.classList.add('is-visible');clearTimeout(statusTimer);
    statusTimer=setTimeout(()=>live.classList.remove('is-visible'),3400);};
  const records=new Map(),legacy=new Map(),edits=new Map(),secondary=new Map();
  let screens=[],current=null,artifact=null,target=null,csrf='',filter='all',session='',generation=0,cursor=0,editor=null,pending=null,storing=false,missing=new Set(),subset=null;
  let legacyAvailable=false,reviewAvailable=false,displayPins=true,wantsPoint=false,continuousPoints=false;
  let shell, commentFilter='open';
  let navigation=null,navigationPending=false,navigationReady=false;
  // IDs of the recorded two-tab exercise, confirmed by the physical D1 receipts.
  // Text, account identity and date alone are insufficient to classify a user note.
  const testThread='682bf278-9317-4944-be49-c6bfd906d950';
  const isTest=r=>r?.release===release && (r.kind==='comment' && r.id===testThread ||
    r.kind==='reply' && r.data.parent?.origin==='current' && r.data.parent.id===testThread);
  const showTest=()=>$('audit-demo')?.checked===true;
  const frame=$('frame'), drawer=$('drawer'),body=$('body-text');
  let displayed=null, transitionTimeout=0, exitAnimation=null, publication=null;
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
    box.replaceChildren();$('motion-actions').replaceChildren();$('motion-note').textContent='';
    const build=$('motion-build');
    build.textContent=version==='current'?
      [('IA '+(publication?.iaCommit?.slice(0,12)||'게시 확인 대기')),'제품 '+(publication?.productCommit||motionReview.product||'미확인').slice(0,12),'화면 '+target.artifactHash.slice(0,12),publication?.deploymentId&&'배포 '+publication.deploymentId].filter(Boolean).join(' · '):
      '이전 검토판 · 화면 '+target.artifactHash.slice(0,12);
    if(version!=='current')return;
    if(publication?.iaCommit&&/^[a-f0-9]{40}$/.test(publication.iaCommit)){
      const link=node('a','검토 중인 IA 코드');link.href='https://github.com/ydh1121/order-ia-portal/commit/'+publication.iaCommit;
      link.rel='noopener noreferrer';link.target='_blank';build.append(document.createTextNode(' '),link);
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
  const reviewKey=(v,width)=>[v.screen,v.state,v.variant,width].join('/');
  const localKey=(kind,id)=>kind+'/'+id;
  const match=(t,v,width)=>t&&t.screen===v.screen&&t.state===v.state&&t.variant===v.variant&&t.viewport===width;
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
    const key=reviewKey(row,width), past=legacy.get(key),live=index.get(key)||[];
    const reviewed=live.find(r=>r.kind==='review'&&r.data.target.artifactHash===row.hashes?.[width]);
    const changes=live.filter(r=>r.kind==='change'&&r.data.target.artifactHash===row.hashes?.[width]);
    const hasStatus=(...states)=>changes.some(r=>states.includes(r.data.status));
    const oldApproval=past?.status==='okay'||live.some(r=>r.kind==='review'&&r.data.decision==='approved'&&r.data.target.artifactHash!==row.hashes?.[width]);
    const changed=row.authoredChange||hasStatus('implemented','verified','recheck');
    return {implemented:hasStatus('implemented'),verified:hasStatus('verified'),blocked:hasStatus('blocked'),untouched:hasStatus('not_started'),previous:past?.status==='fix',changed,approved:reviewed?.data.decision==='approved',unreviewed:!reviewed||reviewed.data.decision==='unreviewed',requested:reviewed?.data.decision==='changes_requested',needs:reviewed?.data.decision==='changes_requested'||(changed||oldApproval)&&!reviewed,unknown:hasStatus('unknown')||(!changes.length&&!row.authoredChange),oldApproval};
  }
  const filters=[['all','▤','전체'],['previous','↶','이전 수정 요청'],['changed','✎','이번 판 수정'],['approved','✓','사용자 통과'],['unreviewed','○','미검토'],['unknown','?','확인 전'],['needs','↻','재검토'],['untouched','…','미착수'],['verified','☑','구현 검증'],['blocked','Ⅱ','보류']];
  function widthFor(row){return Number($('width').value)||(row.defaultWidth>=768?1280:390);}
  function oldReviews(row){return [...legacy.entries()].filter(([key])=>key.slice(0,key.lastIndexOf('/'))===row.id);}
  function historyWidth(row){const r=oldReviews(row).find(([,v])=>v.status==='fix');return r?Number(r[0].split('/').at(-1)):null;}
  function resultWidth(row){return filter==='previous'?historyWidth(row)||widthFor(row):widthFor(row);}
  function selectFiltered(row){const w=resultWidth(row);$('width').value=String(w);return select(row);}

  function filtered(){
    const index=showRecords(),q=$('search').value.toLocaleLowerCase().trim();
    return screens.filter(row=>{
      const past=oldReviews(row).map(([,r])=>r);
      const live=index.get(reviewKey(row,widthFor(row)))||[];
      const search=[row.id,row.screen,row.label,row.stateLabel,row.group,...past.flatMap(r=>r.comments||[]).filter(c=>!c.deleted).flatMap(c=>[c.id,c.body]),...live.filter(r=>r.action!=='delete'&&!isTest(r)).flatMap(r=>[r.id,r.data.body,r.data.sourceCommentId,r.data.evidenceRef])].join(' ').toLocaleLowerCase();
      return (!q||search.includes(q))&&(filter==='all'||(filter==='previous'?Boolean(historyWidth(row)):stateInfo(row,widthFor(row),index)[filter]));
    });
  }
  function list(){
    const index=showRecords(),rows=filtered();const used=new Set(rows.map(r=>r.id));$('filters').replaceChildren();
    const metrics=$('review-summary');metrics?.replaceChildren();
    for(const [id,icon,name] of filters){const count=id==='all'?screens.length:id==='previous'?[...legacy.values()].filter(r=>r.status==='fix').length:screens.filter(r=>stateInfo(r,widthFor(r),index)[id]).length;
      if(metrics && ['previous','changed','approved','unreviewed'].includes(id)){
        const m=btn('',()=>{filter=id;list();$('choose').showModal();});m.dataset.metric=id;
        m.append(node('strong',id==='previous'&&!legacyAvailable?'—':count), node('span',name+(id==='previous'?' · 전체 폭':'')));metrics.append(m);
      }
      const b=btn(icon+' '+name+' '+((id==='previous'&&!legacyAvailable||['approved','unreviewed','unknown','needs'].includes(id)&&!reviewAvailable)?'—':count),()=>{filter=id;list();$('choose').showModal();});
      b.setAttribute('aria-pressed',String(filter===id));$('filters').append(b);}
    const tiles=$('tiles');tiles.replaceChildren();
    for(const row of rows){const tile=node('article');tile.className='tile';const b=btn('',()=>{$('choose').close();selectFiltered(row);});
      b.append(node('strong',row.label),node('span',row.stateLabel+' · '+row.variant+' · '+resultWidth(row)+'px'));
      b.setAttribute('aria-current',String(current?.id===row.id));tile.append(b,btn('이 화면에 의견',async()=>{$('choose').close();await selectFiltered(row);if(target)edit(null,null,true);}));tiles.append(tile);}
    if(!used.size)tiles.append(node('p','해당하는 화면이 없습니다.'));
    const overview=$('review-records');
    if(overview){
      overview.replaceChildren();
      const keys=[...legacy.keys()].filter(key=>legacy.get(key)?.status==='fix');
      const first=keys.slice(0,8);
      for(const key of first){
        const end=key.lastIndexOf('/'), row=screens.find(v=>v.id===key.slice(0,end));if(!row)continue;
        const width=Number(key.slice(end+1)), record=legacy.get(key);
        const b=btn(row.label+' · '+row.stateLabel+' · '+width+'px · 이전 수정 요청',async()=>{
          $('width').value=String(width);await select(row);if(target)notes();
        });b.className='overview-record';overview.append(b);
      }
      if(first.length<keys.length)overview.append(btn('이전 수정 요청 전체 '+keys.length+'건',()=>{filter='previous';list();$('choose').showModal();}));
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
    const entry=feedbackRecord(parent,view),source=parent.origin==='current'?records.get(localKey('comment',parent.id)):null;
    // A later change to this exact source must not be hidden by an older status.
    // Older-artifact and imported originals retain their independent history.
    if(source&&view&&match(source.data.target,view,view.viewport)&&source.data.target.artifactHash===view.artifactHash&&(!entry||source.cursor>entry.cursor))return source.action==='resolve'?'resolved':'unresolved';
    return entry?.data.status||fallback;
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
    const value=feedbackState(parent,fallback),entry=feedbackRecord(parent);
    card.dataset.feedbackOrigin=parent.origin;card.dataset.feedbackId=parent.id;card.dataset.feedbackStatus=value;
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
  function syncPins(){
    const eligible=[...records.values()].filter(r=>r.kind==='comment'&&target&&match(r.data.target,target,target.viewport)&&(showTest()||!isTest(r))&&r.data.anchor);
    const pins=eligible.map((r,i)=>({id:r.id,anchor:r.data.anchor,ordinal:i+1,resolved:feedbackState({origin:'current',id:r.id},r.action==='resolve'?'resolved':'unresolved')==='resolved',deleted:r.action==='delete'}))
      .filter(p=>!p.deleted && (!p.resolved||$('show-resolved-pins')?.checked));
    send('pins',pins);send('visible',displayPins);send('pin-view',{draft:editor?.anchor||null,selected:subset||[]});
  }
  function hideDrawer(){continuousPoints=false;wantsPoint=false;remember();drawer.hidden=true;$('authoring').hidden=true;editor=null;subset=null;syncPins();send('mode',false);$('points').focus();}
  function edit(r=null,past=null,picking=false,parent=null,saved=null){
    if(!target||$('version').value==='prior-r3')return;
    shell?.setTab('review');$('blocks').hidden=true;drawer.hidden=false;$('authoring').hidden=false;
    $('conflict').hidden=true;editor=saved||((r&&edits.get(draftKey(r.id)))||null);
    if(!editor)editor=parent?{id:crypto.randomUUID(),body:'',revision:0,parent}:r?{id:r.id,parent:r.data.parent,revision:r.revision,body:r.data.body,anchor:r.data.anchor,sourceKey:r.data.sourceKey,sourceCommentId:r.data.sourceCommentId}:past?{id:crypto.randomUUID(),body:past.body,sourceKey:reviewKey(target,target.viewport),sourceCommentId:past.id,revision:0}:{id:crypto.randomUUID(),body:'',revision:0};
    setEditorFields();syncPins();
    body.readOnly=false;
    if(picking)pick();else body.focus();
  }
  function setEditorFields(){
    body.value=editor.body||'';
    $('reposition').hidden=Boolean(editor.parent);
    $('point-state').textContent=editor.parent?'답글':editor.anchor?'위치 지정됨':'화면 전체';
    $('save').textContent=editor.parent?'답글 저장':'의견 저장';
  }
  function thread(card,parent,allowReply){
    const replies=[...records.values()].filter(r=>r.kind==='reply'&&r.data.parent?.origin===parent.origin&&
      r.data.parent.id===parent.id&&match(r.data.target,target,target.viewport));
    for(const r of replies){
      const line=node('div');
      line.append(node('small','답글 · r'+r.revision),node('p',r.data.body));
      if(allowReply&&r.data.target.artifactHash===target.artifactHash)line.append(btn('답글 수정',()=>edit(r)));
      card.append(line);
    }
    if(allowReply)card.append(btn('답글 작성',()=>edit(null,null,false,parent)));
  }
  function pick(){shell?.focusForPoint();wantsPoint=true;remember();drawer.hidden=true;send('mode',true);frame.focus();$('pick-cancel').hidden=false;status('위치를 선택하세요.');}
  const stage=()=>{wantsPoint=false;syncPins();drawer.hidden=false;$('authoring').hidden=false;$('blocks').hidden=true;send('mode',false);body.focus();};
  function stopPointMode(){continuousPoints=false;wantsPoint=false;remember();send('mode',false);syncPins();}

  function notes(ids=null){
    if(!target)return;remember();editor=null;subset=ids;drawer.hidden=false;$('blocks').hidden=false;$('authoring').hidden=true;
    shell?.setTab('review');shell?.historyLinks();syncPins();
    const box=$('notes');box.replaceChildren();
    const key=reviewKey(target,target.viewport);const past=legacy.get(key),live=comments();
    const indexed=showRecords(),info=stateInfo(current,target.viewport,indexed);
    $('review-heading').textContent=current.label+' / '+current.stateLabel;
    presentMotion();
    const widths=shell?.reviewWidths()||[];
    $('review-viewports').replaceChildren(...(widths.length?widths:[target.viewport]).map(width=>{
      const choice=btn(width+'px',async()=>{if(width!==target.viewport){$('width').value=String(width);await select(current);if(target)notes();}});
      choice.dataset.reviewViewport=width;choice.classList.toggle('active',width===target.viewport);return choice;
    }));
    $('comment-count').textContent=(live.length+(past?.comments||[]).filter(c=>!c.deleted).length)+'개';
    for(const b of document.querySelectorAll('[data-review]'))b.classList.toggle('active',b.dataset.review===(info.approved?'approved':info.requested?'changes_requested':'unreviewed'));
    for(const b of document.querySelectorAll('[data-comment-filter]'))b.classList.toggle('active',b.dataset.commentFilter===commentFilter);
    const visible=value=>ids||commentFilter==='all'||(commentFilter==='resolved'?value==='resolved':commentFilter==='recheck'?value==='recheck':value!=='resolved');
    syncScreenMemo(past);
    syncFigma(past);
    box.append(node('p',[info.previous?'이전 수정 요청':null,info.blocked?'구현 보류':info.verified?'구현 검증':info.untouched?'미착수':info.changed?'이번 판 수정':info.unknown?'구현 확인 전':null,info.approved?'사용자 통과':info.requested?'이번 판 수정 요청':info.needs?'재검토 대기':'이번 판 미검토',info.oldApproval?'이전 판 통과':null].filter(Boolean).join(' · ')));
    if(!ids){
      for(const draft of draftsForScreen()){
        const label=(draft.parent?'저장하지 않은 답글 이어쓰기':'저장하지 않은 의견 이어쓰기')+' · '+(draft.body||'위치 지정됨').slice(0,40);
        box.append(btn(label,()=>edit(null,null,false,null,draft)));
      }
      for(const d of [...records.values()].filter(r=>r.kind==='draft'&&match(r.data.target,target,target.viewport)&&r.data.target.artifactHash===target.artifactHash&&r.data.body&&records.get(localKey(r.data.parent?'reply':'comment',r.id))?.data.body!==r.data.body)){box.append(btn('임시 의견 이어쓰기',()=>{edit();editor={id:d.id,revision:records.get(localKey(d.data.parent?'reply':'comment',d.id))?.revision??0,body:d.data.body,anchor:d.data.anchor,parent:d.data.parent,draftRevision:d.revision};setEditorFields();}));}
      if(past?.note)box.append(node('small','이전 화면 의견'),node('p',past.note));
      for(const c of past?.comments||[]){
        const sourceState=feedbackState({origin:'legacy',id:c.id},c.status==='resolved'||c.deleted?'resolved':'unresolved');
        if(c.deleted&&commentFilter!=='all'||!visible(sourceState))continue;
        const card=node('article');
        card.className='comment-card';
        card.append(node('small',(c.deleted?'이전 삭제 기록':c.status==='resolved'?'이전 해결 의견':'이전 의견')+' · '+c.id),node('p',c.body));
        if(c.anchor){
          const location=c.anchor.label||c.anchor.tag||'화면';
          card.append(node('small','원래 위치 · '+location+' · '+target.viewport+'px'));
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
        thread(card,{origin:'legacy',id:c.id},$('version').value!=='prior-r3');box.append(card);
      }
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
      if(!same||r.data.anchor&&missing.has(r.id))card.append(node('span','위치 재연결 필요'));
      if(!same && $('version').value==='current'){
        const old=document.createElement('a'), url=sameOriginUrl(location.href);
        url.searchParams.set('version','recorded');url.searchParams.set('artifactHash',r.data.target.artifactHash);
        old.href=url.href;old.textContent='의견을 남긴 화면 열기';card.append(old);
      }
      if(!same&&$('version').value==='current')card.append(btn('새 판에 위치 연결',()=>edit(null,{id:r.id,body:r.data.body},true)));
      if(r.data.anchor&&same)card.append(btn('위치 보기',()=>{hideDrawer();for(const p of r.data.anchor.scroll||[]){if(p.id==='host-surface')$('surface').scrollTo(p.x,p.y);else if(p.id==='host-document')document.scrollingElement.scrollTo(p.x,p.y);}send('restore',r.data.anchor);}));
      const editable=same&&r.action!=='resolve'&&feedback!=='resolved'&&$('version').value!=='prior-r3';
      if(editable)card.append(btn('수정',()=>edit(r)),btn('위치 다시 연결',()=>{edit(r);editor.action='relocate';body.readOnly=true;pick();}));
      if(same&&$('version').value!=='prior-r3')card.append(btn('삭제',()=>eventReason(r,'delete')));
      thread(card,{origin:'current',id:r.id},editable);
      card.append(btn('이력',async()=>{try{const j=await api(base+'/events?release='+release+'&kind=comment&id='+encodeURIComponent(r.id));for(const e of j.items)card.append(node('p','r'+e.revision+' · '+e.action+' · '+(e.reason||e.data.body||'')));}catch(e){announceError(e);}}));box.append(card);
    }
    for(const r of records.values())if((r.kind==='figma'||(r.kind==='change'&&!r.data.sourceCommentId))&&match(r.data.target,target,target.viewport)&&r.data.target.artifactHash===target.artifactHash)box.append(node('small',[r.kind,r.data.status,r.data.evidenceRef,r.data.figmaUrl].filter(Boolean).join(' · ')));
    if(!box.querySelector('article')&&!past)box.append(node('p','등록된 의견이 없습니다.'));
  }
  async function write(kind,id,data,rev,action='save',reason=''){
    if($('version').value==='prior-r3'){status('보관한 검토판입니다. 이번 판에서 새 의견을 작성해 주세요.');return false;}
    const packet={release,id,kind,expectedRevision:rev,data,action,reason};const sig=JSON.stringify(packet);
    if(storing)return false;
    const draftEditor=editor&&['comment','reply','draft'].includes(kind)&&editor.id===id?editor:null;
    if(draftEditor?.retry?.sig===sig)pending=draftEditor.retry;
    if(!pending||pending.sig!==sig)pending={sig,key:crypto.randomUUID()};
    if(draftEditor){draftEditor.retry=pending;remember();}
    storing=true;
    try{if(!csrf||!reviewAvailable)throw Error('STORE_UNAVAILABLE');
      const r=await api(base+'/records',{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':csrf},body:JSON.stringify({...packet,idempotencyKey:pending.key})});
      if(r.id!==id||!Number.isInteger(r.revision))throw Error('UNCONFIRMED');
      records.set(localKey(kind,id),r);if(draftEditor)delete draftEditor.retry;pending=null;list();syncPins();status('저장됨 · r'+r.revision);return true;
    }catch(e){
      if(e.current)records.set(localKey(kind,id),e.current);
      if(e.status===409)status('다른 탭에서 먼저 저장했습니다. 내 입력을 보관했습니다.');
      else if(e.status===401)status('로그인을 다시 연결한 뒤 저장해 주세요. 작성 중인 의견은 남아 있습니다.');
      else if(e.status===403)status('저장 권한을 확인해 주세요. 작성 중인 의견은 남아 있습니다.');
      else status('저장하지 못했습니다. 내 입력을 보관했습니다.');
      if(e.message==='REPLY_PARENT_UNAVAILABLE')status('원래 의견이 해결되었거나 삭제되었습니다. 답글은 초안으로 남아 있습니다.');
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
    const content=value=>JSON.stringify([value.body,value.anchor,value.parent,value.sourceKey,value.sourceCommentId,value.action]);
    const sentContent=content(submitted),data={target:view,body:submitted.body,anchor:submitted.anchor??null};
    if(submitted.sourceKey)data.sourceKey=submitted.sourceKey;if(submitted.sourceCommentId)data.sourceCommentId=submitted.sourceCommentId;
    if(submitted.parent){data.parent=submitted.parent;delete data.anchor;}
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
  function frameDocument(a,row,channel){
      const boot=(a.replayFrame||frameBootstrap).replaceAll('</script','<\\/script');const params=JSON.stringify({channel:channel,artifact:a.hash,version:a.version,screen:row.screen,state:row.state,variant:row.variant,authOriginStep:authOriginStep||null}).replaceAll('<','\\u003c');
      const script='<script nonce="'+nonce+'">('+boot+')('+params+')</'+'script>';
      // srcdoc inherits parent CSP; the child further restricts network, forms and images.
      const policy='<meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'nonce-'+nonce+'\';style-src \'unsafe-inline\';img-src data:;connect-src \'none\';form-action \'none\';base-uri \'none\'">';
      const reduced=$('motion-enabled')?.checked===false?'<style>*, *:before, *:after{transition:none!important;animation-play-state:paused!important;scroll-behavior:auto!important}</style>':'';
      const html=reduced?a.html.replace('<html ','<html data-review-reduced '):a.html;
      return html.replace('<!--R3-POLICY-->',()=>policy+reduced).replace('<!--R3-FRAME-->',()=>(a.mount?'<script nonce="'+nonce+'">'+a.mount.replace(/<\/script/gi,'<\\/script')+'</'+'script>':'')+script);
  }
  // The source step is short-lived and belongs to this QA tab's guest authentication flow.
  let authOriginStep = null, arrivalScreen = null;
  async function select(row,version=$('version').value,originStep=null,pinnedHash=null,appliedState=false){
    if(!row)return;
    clearTimeout(transitionTimeout);exitAnimation?.cancel();
    const previous=displayed;displayed=null;
    if(row && row.id !== current?.id) authOriginStep = originStep;
    continuousPoints=false;send('mode',false);wantsPoint=false;clearPrivateQuote();$('buyer').hidden=row.screen!=='quote-result'||version!=='current';remember();editor=null;drawer.hidden=true;$('pick-cancel').hidden=true;$('conflict').hidden=true;
    document.querySelectorAll('[data-review]').forEach(b=>b.disabled=version!=='current');const n=++generation;current=row;$('quote-candidates').hidden=version!=='current'||!['q1','q2','q3','q4','quote-review'].includes(row.screen);target=null;artifact=null;session='';missing.clear();frame.inert=true;$('caption').textContent=row.label+' · '+row.stateLabel;
    const width=widthFor(row);shell?.render();$('surface').style.setProperty('--width',width+'px');
    for(const id of ['new','general','figma-stage','figma-url','figma-memo','link-figma'])$(id).disabled=version==='prior-r3'||version==='recorded';
    const url=sameOriginUrl(location.href);url.searchParams.set('screen',row.id);url.searchParams.set('width',width);
    if(version==='current')url.searchParams.delete('version');else url.searchParams.set('version',version);
    if(pinnedHash)url.searchParams.set('artifactHash',pinnedHash);else url.searchParams.delete('artifactHash');
    history.replaceState(null,'',url);
    try{
      const a=await api(base+'/artifact?id='+encodeURIComponent(row.id)+'&width='+width+'&version='+version+(pinnedHash?'&artifactHash='+encodeURIComponent(pinnedHash):''));
      if(n!==generation)return;
      if(version==='recorded'||version!==a.version){version=a.version;$('version').value=version;url.searchParams.set('version',version);history.replaceState(null,'',url);for(const id of ['new','general','figma-stage','figma-url','figma-memo','link-figma'])$(id).disabled=version==='prior-r3';}
      artifact=a;session=crypto.randomUUID();if(version==='current'){row.hashes??={};row.hashes[width]=a.hash;}
      target={screen:row.screen,state:row.state,variant:row.variant,viewport:width,artifactHash:a.hash};
      const documentSwap=()=>{if(n===generation)frame.srcdoc=frameDocument(a,row,session);};
      const onboarding=row.screen==='onboarding'&&/^(guest|member)-[1-4]$/.test(row.state)&&row.state.split('-')[0]===previous?.state.split('-')[0];
      const component=['login','signup','password','otp','terms'].includes(row.screen)&&row.runtimeFamily!=='snapshot';
      if((row.screen==='quote-result'||onboarding||component)&&previous?.version==='current'&&row.screen===previous.screen&&row.variant===previous.variant&&version==='current'&&previous.width===width&&previous.motion===$('motion-enabled').checked&&!pinnedHash){
        const payload={state:row.state,hash:a.hash,channel:session};
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
    }catch(e){if(n===generation){frame.srcdoc='';frame.inert=false;announceError(e);}}
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
        cursor=Math.max(cursor,page.nextCursor);reviewAvailable=true;
        if(!page.hasMore)break;
      }
      // Focusing a drawer control from the iframe must not replace the button
      // between pointerdown and click when its records already match the server.
      if(changed){list();syncPins();if(!drawer.hidden&&!editor&&shell?.activeTab()==='review')notes(subset);}
    }catch(e){if(first)reviewAvailable=false;announceError(e);}
  }
  async function readLegacy(){
    let after=0;try{for(;;){const j=await api(base+'/legacy?after='+after+'&limit=50');for(const r of j.items)legacy.set(r.sourceKey,r.data);if(!j.hasMore)break;after=j.nextCursor;}legacyAvailable=true;list();}catch(e){announceError(e);}
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
    const m=e.data;
    const item=secondary.get(e.source);
    if(item&&e.origin==='null'&&item.frame.isConnected&&m?.scope==='ORDER_R3_FRAME'&&m.channel===item.channel&&m.artifact===item.hash){
      if(m.type==='userActivity'){document.dispatchEvent(new Event('ia-session-activity'));return;}
      if(m.type==='ready'){setSecondaryPick(item,wantsPoint);return;}
      if(wantsPoint&&m.type==='cancelPick'&&editor){stopPointMode();stage();return;}
      if(wantsPoint&&m.type==='point'&&editor&&m.payload?.artifactHash===item.hash&&m.payload.instance===item.row.screen){
        const a=m.payload;
        if(typeof a.id!=='string'||![a.x,a.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Array.isArray(a.scroll)||!Array.isArray(a.layers))return;
        if((editor.revision>0||editor.sourceKey) && (item.row.id!==current.id || item.width!==target.viewport)){
          status('기존 의견은 같은 화면과 너비에서 위치를 선택해 주세요.');return;
        }
        const saved=editor, keepContinuous=continuousPoints, surface=$('surface');
        const anchor={id:a.id,instance:a.instance,artifactHash:a.artifactHash,x:a.x,y:a.y,viewport:a.viewport,scale:a.scale,layers:a.layers,
          scroll:[...a.scroll.slice(0,22),{id:'host-surface',x:surface.scrollLeft,y:surface.scrollTop},{id:'host-document',x:0,y:0}]};
        send('mode',false);editor=null;wantsPoint=false;
        shell.setActiveMode('focus');$('width').value=String(item.width);
        select(item.row).then(()=>{if(target?.artifactHash!==item.hash)return;continuousPoints=keepContinuous;saved.anchor=anchor;saved.dirty=true;edit(null,null,false,null,saved);send('mode',false);remember();});
      }
      return;
    }
    if(!artifact||e.source!==frame.contentWindow||e.origin!=='null'||m?.scope!=='ORDER_R3_FRAME'||m.channel!==session||m.artifact!==artifact.hash)return;
    if(m.type==='userActivity'){document.dispatchEvent(new Event('ia-session-activity'));return;}
    const isCurrent=$('version').value==='current';
    if(isCurrent&&!wantsPoint&&m.type==='downloadReviewDocument'){
      if(['receipt/complete','admin-quotes/list'].includes(current.screen+'/'+current.state))
        download('QA_'+current.screen+'_'+current.state+'.html',artifact.editable,'text/html;charset=utf-8');
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
    if(m.type==='ready'){clearTimeout(transitionTimeout);frame.inert=false;displayed={channel:session,hash:artifact.hash,width:target.viewport,version:artifact.version,screen:current.screen,state:current.state,variant:current.variant,motion:$('motion-enabled').checked};
      if(isCurrent&&arrivalScreen===current.id){send('memberArrival',true);arrivalScreen=null;}
      if(isCurrent)restoreOnboardingChoice();
      if(isCurrent&&['profile','onboarding'].includes(current.screen))send('noticeCountFixture',sampleUnread);
      if(isCurrent&&widgetKey()){
        try{const layout=JSON.parse(sessionStorage.getItem(widgetKey()));if(validWidgets(layout))send('restoreWidgetLayout',layout);}catch{/* Invalid or unavailable browser storage. */}
      }
      if(input&&journeyDraft)send('journeyDraft',journeyDraft);
      if(isCurrent&&questionScreens.includes(current.screen))send('menuPublication',menuPublished);
      if(notices)send('noticeFixture',fixtureNotices);if(consultation)send('consultationFixture',consultationFixture);syncPins();if(wantsPoint)send('mode',true);return;}
    if(m.type==='point'&&wantsPoint&&editor&&m.payload?.artifactHash===artifact.hash&&m.payload.instance===target.screen){
      const {id,instance,x,y,viewport,scale,scroll,layers,artifactHash}=m.payload;
      if(typeof id!=='string'||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||!Array.isArray(scroll)||!Array.isArray(layers))return;
      const track=(id,el)=>({id,x:Math.max(0,el.scrollLeft),y:Math.max(0,el.scrollTop)});
      editor.anchor={id,instance,x,y,viewport,scale,layers,artifactHash,scroll:[...scroll.slice(0,22),track('host-surface',$('surface')),track('host-document',document.scrollingElement)]};editor.dirty=true;remember();$('point-state').textContent='위치 지정됨';stage();}
    if(m.type==='cancelPick'&&editor){stopPointMode();stage();}
    if(m.type==='openPins'&&Array.isArray(m.payload?.ids))notes(m.payload.ids);
    if(m.type==='missing'&&Array.isArray(m.payload?.ids))missing=new Set(m.payload.ids);
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
        select(row,undefined,originStep);
      }
    }
  });
  $('open').onclick=()=>{$('choose').showModal();$('search').focus();};$('close-choose').onclick=()=>$('choose').close();
  $('search').oninput=list;$('width').onchange=()=>select(current);$('version').onchange=()=>select(current);
  $('next').onclick=()=>{const index=showRecords();const rows=screens.filter(v=>{const s=stateInfo(v,widthFor(v),index);return(historyWidth(v)||s.needs)&&!s.approved;});if(rows.length){const row=rows[(rows.findIndex(r=>r.id===current?.id)+1)%rows.length];if(historyWidth(row))$('width').value=String(historyWidth(row));select(row);}else status('해당하는 미해결 화면이 없습니다.');};
  $('points').onclick=()=>{stopPointMode();notes();};$('new').onclick=()=>{if(continuousPoints||wantsPoint){stopPointMode();notes();}else{continuousPoints=true;edit(null,null,true);}};$('general').onclick=()=>{stopPointMode();edit();};$('reposition').onclick=pick;
  $('pick-cancel').onclick=()=>{stopPointMode();notes();};$('close-drawer').onclick=hideDrawer;$('hide-pins').onclick=()=>{displayPins=!displayPins;send('visible',displayPins);$('hide-pins').setAttribute('aria-pressed',String(!displayPins));};
  addEventListener('keydown',event=>{if(event.key==='Escape'&&continuousPoints){event.preventDefault();stopPointMode();notes();}});
  $('save').onclick=()=>saveDraft(false);$('draft').onclick=()=>saveDraft(true);$('sync').onclick=async()=>{await readLegacy();await refresh();};body.oninput=()=>{if(editor){editor.dirty=true;remember();}};
  if(exportReview) exportReview({release, notify:status, getLocalDrafts:()=>{remember();return [...edits];}});
  $('export').onclick=async()=>{if(!artifact)return;const item=artifact, snapshotTarget={...target};download(item.file,item.editable,'text/html');await write('figma',crypto.randomUUID(),{target:snapshotTarget,status:'exported',evidenceRef:'sha256:'+item.exportHash},0);};
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
    snapshot:()=>({screens,current,records,legacy,navigation,navigationPending,navigationReady}),saveNavigation,select,notes,close:hideDrawer,width:widthFor,isTest,
    leaveEditor:()=>{remember();editor=null;},info:(r,w)=>stateInfo(r,w,showRecords()),
    liveFor:(r,w)=>showRecords().get(reviewKey(r,w))||[],
    loadPreview:async(row,width,unit,board)=>{
      const version=$('version').value, j=await api(base+'/artifact?id='+encodeURIComponent(row.id)+'&width='+width+'&version='+version);
      if(!unit.isConnected)return;
      for(const [source,stale] of secondary)if(!stale.frame.isConnected)secondary.delete(source);
      const channel=crypto.randomUUID(),source=unit.contentWindow;
      secondary.set(source,{source,frame:unit,channel,hash:j.hash,row,width,board});
      unit.srcdoc=frameDocument(board?{...j,mount:null}:j,row,channel);
    }
  });
  for(const b of document.querySelectorAll('[data-review]'))b.onclick=async()=>{if(!target||$('version').value!=='current')return;const val=b.dataset.review,id='verdict/'+reviewKey(target,target.viewport)+'/'+target.artifactHash;const currentReview=records.get(localKey('review',id));if(await write('review',id,{target,decision:val},currentReview?.revision??0))notes();};
  (async()=>{try{
    const [me,a]=await Promise.all([api('/api/ia/auth/me'),api(base+'/artifact')]);csrf=me.csrf;document.dispatchEvent(new CustomEvent('ia-session-ready',{detail:me}));screens=a.items;publication=a.publication||null;navigation={revision:0,layout:a.navigationDefaults};await Promise.all([loadDrafts(me.email),loadNavigation()]);
    const u=new URL(location.href);if(['320','360','375','390','430','768','1024','1280','1440','1920'].includes(u.searchParams.get('width')))$('width').value=u.searchParams.get('width');
    const requested=u.searchParams.get('version');
    if(['previous','prior-r3'].includes(requested))$('version').value=requested;
    const pinned=u.searchParams.get('artifactHash');
    list();await Promise.all([select(screens.find(r=>r.id===u.searchParams.get('screen'))||screens.find(r=>r.id==='login/empty/compact')||screens[0],requested==='recorded'&&pinned?'recorded':$('version').value,null,pinned),readLegacy(),refresh(true)]);
    if(target&&draftsForScreen().length){notes();status('저장하지 않은 글이 이 탭에 남아 있습니다.');}
    addEventListener('focus',()=>refresh());
  }catch(e){announceError(e);}})();
}
