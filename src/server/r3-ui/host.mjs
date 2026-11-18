// Trusted top-level chrome. Only typed review fields and allow-listed UI positions are persisted.
export function bootQaHost(nonce, frameBootstrap) {
  const $=id=>document.getElementById(id),release='MSG0585-R3',base='/api/ia/r3-qa';
  const node=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
  function btn(text,handler){const b=node('button',text);b.type='button';b.onclick=handler;return b;}
  const status=msg=>{$('live').textContent=msg;};
  const records=new Map(),legacy=new Map(),edits=new Map();
  let screens=[],current=null,artifact=null,target=null,csrf='',filter='all',session='',generation=0,cursor=0,editor=null,pending=null,storing=false,missing=new Set(),subset=null;
  let legacyAvailable=false,reviewAvailable=false,displayPins=true,wantsPoint=false;
  const frame=$('frame'), drawer=$('drawer'),body=$('body-text');
  const reviewKey=(v,width)=>[v.screen,v.state,v.variant,width].join('/');
  const localKey=(kind,id)=>kind+'/'+id;
  const match=(t,v,width)=>t&&t.screen===v.screen&&t.state===v.state&&t.variant===v.variant&&t.viewport===width;
  const announceError=e=>status(e.status===401||e.status===403?'접근 권한을 확인해 주세요.':'불러오지 못했습니다. 다시 시도해 주세요.');
  async function api(url,options={}){
    const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options});
    const j=await r.json();if(!r.ok){const e=Error(j.error||'FAILED');Object.assign(e,{status:r.status,current:j.current});throw e;}return j;
  }
  function showRecords(){const d=new Map();for(const r of records.values()){const t=r.data?.target;if(!t)continue;const k=reviewKey(t,t.viewport);if(!d.has(k))d.set(k,[]);d.get(k).push(r);}return d;}
  function stateInfo(row,width,index){
    const key=reviewKey(row,width), past=legacy.get(key),live=index.get(key)||[];
    const reviewed=live.find(r=>r.kind==='review'&&r.data.target.artifactHash===row.hashes?.[width]);
    const change=live.find(r=>r.kind==='change'&&r.data.target.artifactHash===row.hashes?.[width]);
    const oldApproval=past?.status==='okay'||live.some(r=>r.kind==='review'&&r.data.decision==='approved'&&r.data.target.artifactHash!==row.hashes?.[width]);
    const changed=row.authoredChange||['implemented','verified','recheck'].includes(change?.data.status);
    return {implemented:change?.data.status==='implemented',verified:change?.data.status==='verified',blocked:change?.data.status==='blocked',untouched:change?.data.status==='not_started',previous:past?.status==='fix',changed,approved:reviewed?.data.decision==='approved',unreviewed:!reviewed||reviewed.data.decision==='unreviewed',requested:reviewed?.data.decision==='changes_requested',needs:reviewed?.data.decision==='changes_requested'||(changed||oldApproval)&&!reviewed,unknown:!change&&!row.authoredChange,oldApproval};
  }
  const filters=[['all','▤','전체'],['previous','↶','이전 수정 요청'],['changed','✎','이번 판 수정'],['approved','✓','사용자 통과'],['unreviewed','○','미검토'],['unknown','?','확인 전'],['needs','↻','재검토'],['untouched','…','미착수'],['verified','☑','구현 검증'],['blocked','Ⅱ','보류']];
  function widthFor(row){return Number($('width').value)||row.defaultWidth;}
  function filtered(){
    const index=showRecords(),q=$('search').value.toLocaleLowerCase().trim();
    return screens.filter(row=>{
      const past=legacy.get(reviewKey(row,widthFor(row)));
      const live=index.get(reviewKey(row,widthFor(row)))||[];
      const search=[row.id,row.screen,row.label,row.stateLabel,row.group,...(past?.comments||[]).filter(c=>!c.deleted).flatMap(c=>[c.id,c.body]),...live.filter(r=>r.action!=='delete').flatMap(r=>[r.id,r.data.body,r.data.sourceCommentId,r.data.evidenceRef])].join(' ').toLocaleLowerCase();
      return (!q||search.includes(q))&&(filter==='all'||stateInfo(row,widthFor(row),index)[filter]);
    });
  }
  function list(){
    const index=showRecords(),rows=filtered();const used=new Set(rows.map(r=>r.id));$('filters').replaceChildren();
    for(const [id,icon,name] of filters){const count=id==='all'?screens.length:screens.filter(r=>stateInfo(r,widthFor(r),index)[id]).length;
      const b=btn(icon+' '+name+' '+((id==='previous'&&!legacyAvailable||['approved','unreviewed','unknown','needs'].includes(id)&&!reviewAvailable)?'—':count),()=>{filter=id;list();$('choose').showModal();});
      b.setAttribute('aria-pressed',String(filter===id));$('filters').append(b);}
    const tiles=$('tiles');tiles.replaceChildren();
    for(const row of rows){const tile=node('article');tile.className='tile';const b=btn('',()=>{$('choose').close();select(row);});
      b.append(node('strong',row.label),node('span',row.stateLabel+' · '+row.variant+' · '+widthFor(row)+'px'));
      b.setAttribute('aria-current',String(current?.id===row.id));tile.append(b,btn('이 화면에 의견',async()=>{$('choose').close();await select(row);if(target)edit(null,null,true);}));tiles.append(tile);}
    if(!used.size)tiles.append(node('p','해당하는 화면이 없습니다.'));
  }
  function send(type,payload){if(session&&artifact)frame.contentWindow?.postMessage({scope:'ORDER_R3_HOST',channel:session,artifact:artifact.hash,type,payload},'*');}
  function localDraft(){return target?reviewKey(target,target.viewport)+'/'+target.artifactHash:null;}
  function remember(){if(editor){editor.body=body.value;edits.set(localDraft(),editor);}}
  function comments(){return [...records.values()].filter(r=>r.kind==='comment'&&target&&match(r.data.target,target,target.viewport)&&r.action!=='delete');}
  function syncPins(){send('pins',comments().filter(r=>r.data.anchor&&r.action!=='resolve').map(r=>({id:r.id,anchor:r.data.anchor})));send('visible',displayPins);}
  function hideDrawer(){wantsPoint=false;remember();drawer.hidden=true;$('authoring').hidden=true;editor=null;subset=null;send('mode',false);$('points').focus();}
  function edit(r=null,past=null,picking=false,parent=null){
    if(!target)return;
    $('blocks').hidden=true;drawer.hidden=false;$('authoring').hidden=false;
    $('conflict').hidden=true;editor=parent?{id:crypto.randomUUID(),body:'',revision:0,parent}:r?{id:r.id,parent:r.data.parent,revision:r.revision,body:r.data.body,anchor:r.data.anchor,sourceKey:r.data.sourceKey,sourceCommentId:r.data.sourceCommentId}:past?{id:crypto.randomUUID(),body:past.body,sourceKey:reviewKey(target,target.viewport),sourceCommentId:past.id,revision:0}:edits.get(localDraft())||{id:crypto.randomUUID(),body:'',revision:0};
    setEditorFields();
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
  function pick(){wantsPoint=true;remember();drawer.hidden=true;send('mode',true);frame.focus();$('pick-cancel').hidden=false;status('위치를 선택하세요.');}
  const stage=()=>{wantsPoint=false;drawer.hidden=false;$('authoring').hidden=false;$('blocks').hidden=true;$('pick-cancel').hidden=true;send('mode',false);body.focus();};
  function notes(ids=null){
    if(!target)return;remember();editor=null;subset=ids;drawer.hidden=false;$('blocks').hidden=false;$('authoring').hidden=true;
    const box=$('notes');box.replaceChildren();
    const key=reviewKey(target,target.viewport);const past=legacy.get(key),live=comments();
    const info=stateInfo(current,target.viewport,showRecords());
    box.append(node('p',[info.previous?'이전 수정 요청':null,info.blocked?'구현 보류':info.verified?'구현 검증':info.untouched?'미착수':info.changed?'이번 판 수정':info.unknown?'구현 확인 전':null,info.approved?'사용자 통과':info.requested?'이번 판 수정 요청':info.needs?'재검토 대기':'이번 판 미검토',info.oldApproval?'이전 판 통과':null].filter(Boolean).join(' · ')));
    if(!ids){
      for(const d of [...records.values()].filter(r=>r.kind==='draft'&&match(r.data.target,target,target.viewport)&&r.data.target.artifactHash===target.artifactHash&&r.data.body&&records.get(localKey(r.data.parent?'reply':'comment',r.id))?.data.body!==r.data.body)){box.append(btn('임시 의견 이어쓰기',()=>{edit();editor={id:d.id,revision:records.get(localKey(d.data.parent?'reply':'comment',d.id))?.revision??0,body:d.data.body,anchor:d.data.anchor,parent:d.data.parent,draftRevision:d.revision};setEditorFields();}));}
      for(const c of past?.comments||[]){if(c.deleted)continue;const card=node('article');card.append(node('small','이전 의견 · '+c.id),node('p',c.body),btn('이번 판에 위치 연결',()=>edit(null,c,true)));thread(card,{origin:'legacy',id:c.id},true);box.append(card);}
      if(past?.figma?.url){const t=node('p','이전 Figma 링크 · '+past.figma.url);box.append(t);}
      if(past?.status==='fix'&&!(past.comments||[]).some(c=>!c.deleted))box.append(node('p','본문이 없는 이전 수정 요청'));
    }
    for(const r of records.values()){
      if(r.kind!=='comment'||r.action!=='delete'||!match(r.data.target,target,target.viewport)||(ids&&!ids.includes(r.id)))continue;
      const card=node('article');
      thread(card,{origin:'current',id:r.id},false);
      if(card.childElementCount){card.prepend(node('small','삭제된 의견'));box.append(card);}
    }
    for(const r of live.filter(r=>!ids||ids.includes(r.id))){
      const card=node('article'),same=r.data.target.artifactHash===target.artifactHash;
      card.append(node('small',(r.action==='resolve'?'해결됨':'이번 판 의견')+' · r'+r.revision),node('p',r.data.body));
      if(!same||r.data.anchor&&missing.has(r.id))card.append(node('span','위치 재연결 필요'));
      if(!same)card.append(btn('새 판에 위치 연결',()=>edit(null,{id:r.id,body:r.data.body},true)));
      if(r.data.anchor&&same)card.append(btn('위치 보기',()=>{hideDrawer();for(const p of r.data.anchor.scroll||[]){if(p.id==='host-surface')$('surface').scrollTo(p.x,p.y);else if(p.id==='host-document')document.scrollingElement.scrollTo(p.x,p.y);}send('restore',r.data.anchor);}));
      if(r.action!=='resolve'&&same)card.append(btn('수정',()=>edit(r)),btn('위치 다시 연결',()=>{edit(r);editor.action='relocate';body.readOnly=true;pick();}));
      if(same)card.append(btn(r.action==='resolve'?'다시 열기':'해결',()=>eventReason(r,r.action==='resolve'?'reopen':'resolve')),btn('삭제',()=>eventReason(r,'delete')));
      thread(card,{origin:'current',id:r.id},same&&r.action!=='resolve');
      card.append(btn('이력',async()=>{try{const j=await api(base+'/events?release='+release+'&kind=comment&id='+encodeURIComponent(r.id));for(const e of j.items)card.append(node('p','r'+e.revision+' · '+e.action+' · '+(e.reason||e.data.body||'')));}catch(e){announceError(e);}}));box.append(card);
    }
    for(const r of records.values())if(['figma','change'].includes(r.kind)&&match(r.data.target,target,target.viewport))box.append(node('small',[r.kind,r.data.status,r.data.evidenceRef,r.data.figmaUrl].filter(Boolean).join(' · ')));
    if(!box.querySelector('article')&&!past)box.append(node('p','등록된 의견이 없습니다.'));
  }
  async function write(kind,id,data,rev,action='save',reason=''){
    const packet={release,id,kind,expectedRevision:rev,data,action,reason};const sig=JSON.stringify(packet);
    if(!pending||pending.sig!==sig)pending={sig,key:crypto.randomUUID()};
    if(storing)return false;storing=true;
    try{if(!csrf||!reviewAvailable)throw Error('STORE_UNAVAILABLE');
      const r=await api(base+'/records',{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':csrf},body:JSON.stringify({...packet,idempotencyKey:pending.key})});
      if(r.id!==id||!Number.isInteger(r.revision))throw Error('UNCONFIRMED');
      records.set(localKey(kind,id),r);pending=null;list();syncPins();status('저장됨 · r'+r.revision);return true;
    }catch(e){
      if(e.current)records.set(localKey(kind,id),e.current);
      status(e.status===409?'다른 탭에서 먼저 저장했습니다. 내 입력을 보관했습니다.':'저장하지 못했습니다. 내 입력을 보관했습니다.');
      if(e.message==='REPLY_PARENT_UNAVAILABLE')status('원래 의견이 해결되었거나 삭제되었습니다. 답글은 초안으로 남아 있습니다.');
      if(e.current&&editor){
        const current=e.current,box=$('conflict');
        box.replaceChildren(node('span','다른 탭의 내용 · '+(current.data.body||current.data.decision||'')));
        if(['reply','comment','draft'].includes(kind)&&!['delete','resolve'].includes(current.action)){
          box.append(btn('다른 탭의 내용을 확인하고 계속 수정',()=>{
            if(kind==='draft')editor.draftRevision=current.revision;
            else editor.revision=current.revision;
            box.hidden=true;body.focus();
          }));
        }
        box.hidden=false;
      }
      return false;
    }finally{storing=false;}
  }
  async function eventReason(r,action){const why=window.prompt('이유를 입력해 주세요.');if(!why?.trim())return;const ok=await write(r.kind,r.id,r.data,r.revision,action,why.trim());if(ok)notes();}
  async function saveDraft(draft){if(!editor||!target)return;remember();const data={target,body:body.value,anchor:editor.anchor??null};if(editor.sourceKey)data.sourceKey=editor.sourceKey;if(editor.sourceCommentId)data.sourceCommentId=editor.sourceCommentId;
    if(editor.parent){data.parent=editor.parent;delete data.anchor;}
    const kind=draft?'draft':editor.parent?'reply':'comment',rev=draft?editor.draftRevision??0:editor.revision;
    const why=!draft&&editor.action==='relocate'?window.prompt('위치를 바꾼 이유를 입력해 주세요.'):'';
    if(!draft&&editor.action==='relocate'&&!why?.trim())return;
    if(await write(kind,editor.id,data,rev,draft?'save':editor.action||'save',why||'')){
      if(draft){editor.draftRevision=rev+1;return;}
      edits.delete(localDraft());editor=null;notes();
    }
  }
  // Actual snapshot values stay in the trusted host and never enter comments, HTML exports or the frame.
  let quoteGeneration=0,allowedSites=[];
  function clearPrivateQuote(){quoteGeneration++;allowedSites=[];$('buyer-sites').replaceChildren();$('buyer-quotes').replaceChildren();$('snapshot').textContent='';}
  async function loadSites(){
    clearPrivateQuote();const seq=quoteGeneration;
    try{const j=await api('/api/ia/r3-price/sites');if(seq!==quoteGeneration)return;
      allowedSites=j.sites.filter(s=>s.verification==='VERIFIED');
      $('buyer-sites').replaceChildren(new Option('인증한 사업장 선택',''),...allowedSites.map((s,i)=>new Option(s.org_id+' · '+s.site_id,String(i))));
      if(!allowedSites.length)$('snapshot').textContent='인증된 사업장이 없습니다.';
    }catch(e){if(seq===quoteGeneration)announceError(e);}
  }
  $('buyer-sites').onchange=async()=>{
    const seq=++quoteGeneration;$('buyer-quotes').replaceChildren();$('snapshot').textContent='';
    const which=$('buyer-sites').value,site=which!==''&&allowedSites[Number(which)];if(!site)return;
    try{const q=new URLSearchParams({org:site.org_id,site:site.site_id}),j=await api('/api/ia/r3-price/offers?'+q);
      if(seq===quoteGeneration)$('buyer-quotes').replaceChildren(new Option('기존 견적 선택',''),...j.quotes.map(v=>new Option(v.id,v.id)));
    }catch(e){if(seq===quoteGeneration)announceError(e);}
  };
  $('buyer-quotes').onchange=async()=>{
    const seq=++quoteGeneration,id=$('buyer-quotes').value;$('snapshot').textContent='';if(!id)return;
    try{const j=await api('/api/ia/r3-price/quote?id='+encodeURIComponent(id));if(seq!==quoteGeneration)return;
      const value=j.response?.quotes?.[0]?.total?.decimal;
      if(j.status==='EXPIRED'){$('snapshot').textContent='유효기간이 지난 견적입니다.';return;}
      if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value)){status('견적을 확인할 수 없습니다.');return;}
      const [whole,decimal]=value.split('.');const price=BigInt(whole).toLocaleString('ko-KR')+(decimal?'.'+decimal:'');
      $('snapshot').textContent='납품 견적 '+price+'원 · '+new Date(j.expiresAt).toLocaleDateString('ko-KR')+'까지';
    }catch(e){if(seq===quoteGeneration)announceError(e);}
  };
  $('quote-open').onclick=loadSites;addEventListener('pagehide',clearPrivateQuote);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPrivateQuote();});
  const sameOriginUrl=(path)=>new URL(path,location.href);
  function download(filename,bytes,mime){const url=URL.createObjectURL(new Blob([bytes],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function select(row,version=$('version').value){
    if(!row)return;wantsPoint=false;clearPrivateQuote();$('buyer').hidden=row.screen!=='quote-result'||version!=='current';remember();editor=null;drawer.hidden=true;$('pick-cancel').hidden=true;$('conflict').hidden=true;
    document.querySelectorAll('[data-review]').forEach(b=>b.disabled=version!=='current');const n=++generation;current=row;target=null;artifact=null;session='';missing.clear();frame.srcdoc='';$('caption').textContent=row.label+' · '+row.stateLabel;
    const width=widthFor(row);$('surface').style.setProperty('--width',width+'px');
    const url=sameOriginUrl(location.href);url.searchParams.set('screen',row.id);url.searchParams.set('width',width);history.replaceState(null,'',url);
    try{
      const a=await api(base+'/artifact?id='+encodeURIComponent(row.id)+'&width='+width+'&version='+version);
      if(n!==generation)return;artifact=a;session=crypto.randomUUID();if(version==='current'){row.hashes??={};row.hashes[width]=a.hash;}
      target={screen:row.screen,state:row.state,variant:row.variant,viewport:width,artifactHash:a.hash};
      const boot=frameBootstrap.replaceAll('</script','<\\/script');const params=JSON.stringify({channel:session,artifact:a.hash,screen:row.screen,state:row.state,variant:row.variant}).replaceAll('<','\\u003c');
      const script='<script nonce="'+nonce+'">('+boot+')('+params+')</'+'script>';
      // srcdoc inherits parent CSP; the child further restricts network, forms and images.
      const policy='<meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'nonce-'+nonce+'\';style-src \'unsafe-inline\';img-src data:;connect-src \'none\';form-action \'none\';base-uri \'none\'">';
      frame.srcdoc=a.html.replace('<!--R3-POLICY-->',()=>policy).replace('<!--R3-FRAME-->',()=>(a.mount?'<script nonce="'+nonce+'">'+a.mount.replace(/<\/script/gi,'<\\/script')+'</'+'script>':'')+script);
      $('version-mark').textContent=version==='previous'?'이전 화면':'이번 판';
      list();
    }catch(e){if(n===generation)announceError(e);}
  }
  async function refresh(first=false){
    try{
      const page=await api(base+'/records?release='+release+'&since='+cursor+'&limit=150');
      for(const r of page.items)records.set(localKey(r.kind,r.id),r);cursor=page.nextCursor;reviewAvailable=true;
      if(page.hasMore)await refresh();list();syncPins();if(!drawer.hidden&&!editor)notes(subset);
    }catch(e){if(first)reviewAvailable=false;announceError(e);}
  }
  async function readLegacy(){
    let after=0;try{for(;;){const j=await api(base+'/legacy?after='+after+'&limit=50');for(const r of j.items)legacy.set(r.sourceKey,r.data);if(!j.hasMore)break;after=j.nextCursor;}legacyAvailable=true;list();}catch(e){announceError(e);}
  }
  addEventListener('message',e=>{
    const m=e.data;if(!artifact||e.source!==frame.contentWindow||e.origin!=='null'||m?.scope!=='ORDER_R3_FRAME'||m.channel!==session||m.artifact!==artifact.hash)return;
    if(m.type==='ready'){syncPins();if(wantsPoint)send('mode',true);return;}
    if(m.type==='point'&&wantsPoint&&editor&&m.payload?.artifactHash===artifact.hash&&m.payload.instance===target.screen){
      const {id,instance,x,y,viewport,scale,scroll,layers,artifactHash}=m.payload;
      if(typeof id!=='string'||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||!Array.isArray(scroll)||!Array.isArray(layers))return;
      const track=(id,el)=>({id,x:Math.max(0,el.scrollLeft),y:Math.max(0,el.scrollTop)});
      editor.anchor={id,instance,x,y,viewport,scale,layers,artifactHash,scroll:[...scroll.slice(0,22),track('host-surface',$('surface')),track('host-document',document.scrollingElement)]};$('point-state').textContent='위치 지정됨';stage();}
    if(m.type==='cancelPick'&&editor)stage();
    if(m.type==='openPins'&&Array.isArray(m.payload?.ids))notes(m.payload.ids);
    if(m.type==='missing'&&Array.isArray(m.payload?.ids))missing=new Set(m.payload.ids);
    if(!wantsPoint&&m.type==='navigate'&&typeof m.payload?.screen==='string'){const row=screens.find(r=>r.screen===m.payload.screen&&(!m.payload.state||m.payload.state===r.state)&&r.variant===current.variant);if(row)select(row);}
  });
  $('open').onclick=()=>{$('choose').showModal();$('search').focus();};$('close-choose').onclick=()=>$('choose').close();
  $('search').oninput=list;$('width').onchange=()=>select(current);$('version').onchange=()=>select(current);
  $('next').onclick=()=>{const index=showRecords();const rows=screens.filter(v=>{const s=stateInfo(v,widthFor(v),index);return(s.previous||s.needs)&&!s.approved;});if(rows.length)select(rows[(rows.findIndex(r=>r.id===current?.id)+1)%rows.length]);else status('해당하는 미해결 화면이 없습니다.');};
  $('points').onclick=()=>notes();$('new').onclick=()=>edit(null,null,true);$('general').onclick=()=>edit();$('reposition').onclick=pick;
  $('pick-cancel').onclick=stage;$('close-drawer').onclick=hideDrawer;$('hide-pins').onclick=()=>{displayPins=!displayPins;send('visible',displayPins);$('hide-pins').setAttribute('aria-pressed',String(!displayPins));};
  $('save').onclick=()=>saveDraft(false);$('draft').onclick=()=>saveDraft(true);$('sync').onclick=async()=>{await readLegacy();await refresh();};body.oninput=remember;
  $('backup').onclick=async()=>{
    remember();const localDrafts=[...edits],events=[];let since=0,until,source;
    try{
      for(;;){const params=new URLSearchParams({release,since:String(since),limit:'100'});if(until!==undefined)params.set('until',String(until));
        const j=await api(base+'/backup?'+params);until=j.until;source=j.legacySourceSha256;events.push(...j.events);
        if(!j.hasMore)break;if(j.nextCursor<=since)throw Error('CURSOR');since=j.nextCursor;}
      download('ORDER_R3_REVIEW_BACKUP.json',JSON.stringify({schema:'order-r3-review-backup/v1',release,until,events,legacySourceSha256:source,localDrafts},null,2),'application/json');status('서버 이력과 내 초안을 백업했습니다.');
    }catch(e){download('ORDER_R3_LOCAL_DRAFTS.json',JSON.stringify({schema:'order-r3-local-drafts/v1',release,serverBackup:'UNAVAILABLE',localDrafts},null,2),'application/json');status('서버 백업 실패 · 내 초안만 보관했습니다.');}
  };
  $('export').onclick=async()=>{if(!artifact)return;const file=artifact.file;download(file,artifact.editable,'text/html');await write('figma',crypto.randomUUID(),{target,status:'exported',evidenceRef:'sha256:'+artifact.exportHash},0);};
  $('link-figma').onclick=async()=>{if(!target)return;const url=prompt('Figma 링크');if(url)await write('figma',crypto.randomUUID(),{target,status:'linked',figmaUrl:url},0);};
  for(const b of document.querySelectorAll('[data-review]'))b.onclick=async()=>{if(!target||$('version').value!=='current')return;const val=b.dataset.review,id='verdict/'+reviewKey(target,target.viewport)+'/'+target.artifactHash;const currentReview=records.get(localKey('review',id));if(await write('review',id,{target,decision:val},currentReview?.revision??0))notes();};
  (async()=>{try{
    const [me,a]=await Promise.all([api('/api/ia/auth/me'),api(base+'/artifact')]);csrf=me.csrf;screens=a.items;
    const u=new URL(location.href);if(['320','390','768','1440'].includes(u.searchParams.get('width')))$('width').value=u.searchParams.get('width');
    list();await Promise.all([select(screens.find(r=>r.id===u.searchParams.get('screen'))||screens.find(r=>r.screen==='login')||screens[0]),readLegacy(),refresh(true)]);
    addEventListener('focus',()=>refresh());
  }catch(e){announceError(e);}})();
}
