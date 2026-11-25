const sourceSha = 'e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
const kinds = new Set(['comment','reply','draft','review','change','figma','artifact','screen','feedback']);
const actions = new Set(['save','relocate','resolve','delete','reopen']);
const viewFields = new Set(['id','instance','x','y','viewport','scale','scroll','layers','artifactHash','mode']);
const pointId = x => typeof x === 'string' && /^[\w.:-]{1,120}$/u.test(x);
const recordId = x => typeof x === 'string' && /^[\w./:-]{1,240}$/u.test(x);
const sha = x => typeof x === 'string' && /^[0-9a-f]{64}$/u.test(x);
const integer = (x,min,max) => Number.isSafeInteger(x) && x >= min && x <= max;
const number = (x,min,max) => Number.isFinite(x) && x >= min && x <= max;
const text = (x,max) => typeof x === 'string' && x.length <= max;
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const keys = (x,allowed) => obj(x) && Object.keys(x).every(k=>allowed.has(k));
const allowed = (...fields) => new Set(fields);
const canonical = x => Array.isArray(x) ? x.map(canonical) : obj(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])) : x;
const json = (body,status=200) => Response.json(body,{status,headers:{
  'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Cf-Access-Jwt-Assertion',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
const invalid = () => json({error:'INVALID_REVIEW_REQUEST'},400);
const validMode = x => !Object.hasOwn(x,'mode') || ['simple','detailed'].includes(x.mode);
const reviewMode = x => x.mode ?? 'simple';

function validTarget(x) {
  return keys(x,allowed('screen','state','variant','viewport','artifactHash','mode')) && validMode(x) &&
    [x.screen,x.state,x.variant].every(pointId) && integer(x.viewport,240,8192) && sha(x.artifactHash);
}
function validAnchor(x) {
  return keys(x,viewFields) && validMode(x) && pointId(x.id) && pointId(x.instance) && sha(x.artifactHash) &&
    number(x.x,0,1) && number(x.y,0,1) && number(x.scale,.1,5) &&
    keys(x.viewport,allowed('width','height')) && integer(x.viewport.width,1,8192) && integer(x.viewport.height,1,16384) &&
    Array.isArray(x.scroll) && x.scroll.length<=24 && x.scroll.every(s=>keys(s,allowed('id','x','y')) &&
      pointId(s.id) && number(s.x,0,1000000) && number(s.y,0,1000000)) &&
    Array.isArray(x.layers) && x.layers.length<=24 && x.layers.every(pointId);
}
function figmaLink(raw) {
  if (!text(raw,2048)) return false;
  try {const u=new URL(raw);return u.protocol==='https:' && ['www.figma.com','figma.com'].includes(u.hostname) && !u.username && !u.password && !u.port;}
  catch{return false;}
}
function validData(kind,d) {
  const types = {
    comment:['body','anchor','sourceKey','sourceCommentId'], reply:['body','parent','purpose','sourceArtifactHash'], draft:['body','anchor','sourceKey','sourceCommentId','parent','purpose','sourceArtifactHash'],
    review:['decision','sourceKey'], change:['status','evidenceRef','body','sourceKey','sourceCommentId'],
    figma:['figmaUrl','status','evidenceRef','sourceKey','note'], artifact:['evidenceRef','status'], screen:['sourceKey','evidenceRef','status','body'],
    feedback:['parent','status']
  };
  if (!keys(d,allowed('target',...types[kind])) || !validTarget(d.target)) return false;
  if ('sourceKey' in d && !recordId(d.sourceKey)) return false;
  if ('sourceCommentId' in d && !recordId(d.sourceCommentId)) return false;
  if ('evidenceRef' in d && (!text(d.evidenceRef,512) || !d.evidenceRef.trim())) return false;
  if ('body' in d && !text(d.body,kind==='screen'?8000:10000)) return false;
  if (d.anchor!=null && (!validAnchor(d.anchor) || d.anchor.artifactHash!==d.target.artifactHash || reviewMode(d.anchor)!==reviewMode(d.target))) return false;
  if ('parent' in d && (!keys(d.parent,allowed('origin','id')) ||
      !['current','legacy'].includes(d.parent.origin) || !recordId(d.parent.id))) return false;
  // Historical records without a mode remain the original simple review. A
  // detailed review may not relabel a legacy comment or its processing state.
  if (d.parent?.origin==='legacy' && reviewMode(d.target)!=='simple') return false;
  if ('purpose' in d && (d.purpose!=='rework'||!d.parent)) return false;
  if (d.purpose==='rework') {
    if (d.parent.origin==='current' ? !sha(d.sourceArtifactHash) : 'sourceArtifactHash' in d) return false;
  } else if ('sourceArtifactHash' in d) return false;
  if (kind==='reply' && !d.parent) return false;
  if (kind==='feedback') return Boolean(d.parent) && ['unresolved','recheck','resolved'].includes(d.status);
  if (kind==='reply'||kind==='comment') return typeof d.body==='string' && d.body.trim().length>0;
  if (kind==='draft') return typeof d.body==='string';
  if (kind==='review') return ['changes_requested','unreviewed','approved'].includes(d.decision);
  if (kind==='change') return ['unknown','not_started','implemented','verified','recheck','blocked','carried'].includes(d.status) &&
    (!['implemented','verified','recheck','carried'].includes(d.status) || Boolean(d.evidenceRef));
  if (kind==='figma') return ['none','linked','exported','imported','editing','edited','commented','reviewed','unlinked'].includes(d.status) &&
    (d.note===undefined || text(d.note,10000)) &&
    (d.figmaUrl===undefined || figmaLink(d.figmaUrl)) && (d.status!=='exported'||Boolean(d.evidenceRef));
  return (d.status===undefined || pointId(d.status)) && (kind!=='artifact'||Boolean(d.evidenceRef));
}
function reworkParent(b) {
  const {parent,target,sourceArtifactHash}=b.data;
  if(parent.origin==='legacy')return {
    sql:` AND EXISTS (SELECT 1 FROM qa_legacy_records r JOIN qa_legacy_sources s ON s.sha256=r.source_sha AND s.complete=1,
      json_each(r.payload,'$.comments') c
      WHERE r.source_sha=? AND r.source_key=? AND json_extract(c.value,'$.id')=?
      AND coalesce(json_extract(c.value,'$.deleted'),0)=0
      AND coalesce((SELECT json_extract(f.data,'$.status') FROM qa_review_events f
        WHERE f.release=? AND f.kind='feedback' AND json_extract(f.data,'$.parent.origin')='legacy'
        AND json_extract(f.data,'$.parent.id')=json_extract(c.value,'$.id')
        AND json_extract(f.data,'$.target.screen')=? AND json_extract(f.data,'$.target.state')=?
        AND json_extract(f.data,'$.target.variant')=? AND json_extract(f.data,'$.target.viewport')=?
        AND json_extract(f.data,'$.target.artifactHash')=? ORDER BY f.cursor DESC LIMIT 1),
        CASE WHEN json_extract(c.value,'$.status')='resolved' THEN 'resolved' ELSE 'unresolved' END) IN ('unresolved','recheck'))`,
    args:[sourceSha,[target.screen,target.state,target.variant,target.viewport].join('/'),parent.id,
      b.release,target.screen,target.state,target.variant,target.viewport,target.artifactHash]
  };
  return {
    sql:` AND EXISTS (SELECT 1 FROM qa_review_events p LEFT JOIN qa_review_events f ON f.cursor=(
        SELECT max(v.cursor) FROM qa_review_events v WHERE v.release=p.release AND v.kind='feedback'
        AND json_extract(v.data,'$.parent.origin')='current' AND json_extract(v.data,'$.parent.id')=p.id
        AND json_extract(v.data,'$.target.screen')=json_extract(p.data,'$.target.screen')
        AND json_extract(v.data,'$.target.state')=json_extract(p.data,'$.target.state')
        AND json_extract(v.data,'$.target.variant')=json_extract(p.data,'$.target.variant')
        AND json_extract(v.data,'$.target.viewport')=json_extract(p.data,'$.target.viewport')
        AND coalesce(json_extract(v.data,'$.target.mode'),'simple')=coalesce(json_extract(p.data,'$.target.mode'),'simple')
        AND json_extract(v.data,'$.target.artifactHash')=?)
      WHERE p.release=? AND p.kind='comment' AND p.id=? AND p.revision=(
        SELECT max(n.revision) FROM qa_review_events n WHERE n.release=p.release AND n.kind=p.kind AND n.id=p.id)
      AND p.action<>'delete' AND json_extract(p.data,'$.target.screen')=? AND json_extract(p.data,'$.target.state')=?
      AND json_extract(p.data,'$.target.variant')=? AND json_extract(p.data,'$.target.viewport')=?
      AND coalesce(json_extract(p.data,'$.target.mode'),'simple')=?
      AND json_extract(p.data,'$.target.artifactHash')=?
      AND CASE WHEN json_extract(p.data,'$.target.artifactHash')=? AND (f.cursor IS NULL OR p.cursor>f.cursor)
        THEN CASE WHEN p.action='resolve' THEN 'resolved' ELSE 'unresolved' END
        ELSE coalesce(json_extract(f.data,'$.status'),CASE WHEN p.action='resolve' THEN 'resolved' ELSE 'unresolved' END)
        END IN ('unresolved','recheck'))`,
    args:[target.artifactHash,b.release,parent.id,target.screen,target.state,target.variant,target.viewport,reviewMode(target),sourceArtifactHash,target.artifactHash]
  };
}
async function readJson(request,limit=32768) {
  if (request.headers.get('content-type')?.split(';')[0].trim()!=='application/json' || !request.body) return null;
  if(Number(request.headers.get('content-length'))>limit) return null;
  const reader=request.body.getReader(),decode=new TextDecoder('utf-8',{fatal:true});
  let bytes=0,body='';
  try {
    while(true){const next=await reader.read();if(next.done)break;
      bytes+=next.value.length;if(bytes>limit){await reader.cancel();return null;}body+=decode.decode(next.value,{stream:true});}
    return JSON.parse(body+decode.decode());
  }catch{return null;}finally{reader.releaseLock();}
}
function shape(r) {
  if (!r) return null;
  return {id:r.id,release:r.release,kind:r.kind,revision:r.revision,data:JSON.parse(r.data),
    action:r.action,reason:r.reason,actor:r.actor,updatedAt:r.updated_at,cursor:r.cursor};
}
const currentSql='SELECT * FROM qa_review_events WHERE release=? AND kind=? AND id=? ORDER BY revision DESC LIMIT 1';
async function write(db,actor,b) {
  if (!keys(b,allowed('release','id','kind','expectedRevision','idempotencyKey','data','action','reason')) ||
      !pointId(b.release)||!kinds.has(b.kind)||!recordId(b.id)||!pointId(b.idempotencyKey)||
      !integer(b.expectedRevision,0,2147483646)||!validData(b.kind,b.data)) return invalid();
  const action=b.action??'save',reason=b.reason??'';
  if (!actions.has(action)||!text(reason,1000)||
      (action!=='save' && (!reason.trim()||b.kind!=='comment'||b.expectedRevision<1))) return invalid();
  const clean={id:b.id,release:b.release,kind:b.kind,data:b.data,expectedRevision:b.expectedRevision,action,reason};
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(clean))))),
    x=>x.toString(16).padStart(2,'0')).join('');
  const replay=()=>db.prepare('SELECT * FROM qa_review_events WHERE actor=? AND request_key=?').bind(actor,b.idempotencyKey).first();
  const result=(prior,replayed=true)=>prior.request_hash===hash ? json({...shape(prior),replayed}):json({error:'IDEMPOTENCY_KEY_REUSED'},409);
  const prior=await replay(); if(prior) return result(prior);
  const getCurrent=()=>db.prepare(currentSql).bind(b.release,b.kind,b.id).first();
  const previous=await getCurrent();
  const conflict=async()=>{const retry=await replay();return retry?result(retry):json({error:'REVISION_CONFLICT',current:shape(await getCurrent())},409);};
  if ((previous?.revision??0)!==b.expectedRevision) return conflict();
  if(previous){
    const data=JSON.parse(previous.data);
    if (['reply','feedback'].includes(b.kind) && (data.parent.id!==b.data.parent.id || data.parent.origin!==b.data.parent.origin)) return invalid();
    if(b.kind==='reply'&&(data.purpose!==b.data.purpose||data.sourceArtifactHash!==b.data.sourceArtifactHash))return invalid();
    // A moved point may attach to the next build of the same logical screen. The
    // old target/hash and coordinates remain on their previous immutable event.
    const oldTarget=action==='relocate'?{...data.target,artifactHash:b.data.target.artifactHash}:data.target;
    if(JSON.stringify(canonical(oldTarget))!==JSON.stringify(canonical(b.data.target))) return invalid();
    if(previous.action==='delete' && action!=='reopen') return invalid();
    if(previous.action==='resolve' && !['reopen','delete'].includes(action)) return invalid();
    if(action==='reopen' && !['delete','resolve'].includes(previous.action)) return invalid();
    if(action==='relocate' && (!b.data.anchor || data.body!==b.data.body)) return invalid();
    if(['delete','resolve','reopen'].includes(action) && JSON.stringify(canonical(data))!==JSON.stringify(canonical(b.data))) return invalid();
  }
  // The comparison and insert are one SQL statement; validation never grants a stale write.
  // A new reply must be attached to an existing comment on this exact screen.
  // Evaluate the parent and revision in the insert so a concurrent delete wins cleanly.
  let parentCondition='',parentArgs=[];
  const isRework=b.kind==='reply'&&b.data.purpose==='rework';
  if(isRework){
    // Rework belongs to the current review of the original comment. Resolve,
    // delete and relocation races are checked in the same INSERT as its save.
    const guard=reworkParent(b);parentCondition=guard.sql;parentArgs=guard.args;
  }else if((b.kind==='reply' && !previous)||b.kind==='feedback'){
    const {parent,target}=b.data;
    if(parent.origin==='legacy'){
      parentCondition=` AND EXISTS (SELECT 1 FROM qa_legacy_records r JOIN qa_legacy_sources s ON s.sha256=r.source_sha AND s.complete=1,
        json_each(r.payload,'$.comments') c
        WHERE r.source_sha=? AND r.source_key=? AND json_extract(c.value,'$.id')=?
        AND coalesce(json_extract(c.value,'$.deleted'),0)=0)`;
      parentArgs=[sourceSha,[target.screen,target.state,target.variant,target.viewport].join('/'),parent.id];
    }else{
      parentCondition=` AND EXISTS (SELECT 1 FROM qa_review_events p
        WHERE p.release=? AND p.kind='comment' AND p.id=? AND p.revision=(
          SELECT max(newer.revision) FROM qa_review_events newer WHERE newer.release=p.release AND newer.kind=p.kind AND newer.id=p.id)
        AND p.action NOT IN (${b.kind==='feedback'?"'delete'":"'delete','resolve'"})
        AND json_extract(p.data,'$.target.screen')=? AND json_extract(p.data,'$.target.state')=?
        AND json_extract(p.data,'$.target.variant')=? AND json_extract(p.data,'$.target.viewport')=?
        AND coalesce(json_extract(p.data,'$.target.mode'),'simple')=?
        ${b.kind==='feedback'?`AND (json_extract(p.data,'$.target.artifactHash')<>? OR
          (?='resolved' AND p.action='resolve') OR (?<>'resolved' AND p.action<>'resolve'))`
          :"AND json_extract(p.data,'$.target.artifactHash')=?"})`;
      // The same-artifact status follows the latest source action atomically.
      // A late second request must not conceal a concurrent resolve or reopen.
      // Comments from older artifacts keep their independent review status.
      parentArgs=[b.release,parent.id,target.screen,target.state,target.variant,target.viewport,reviewMode(target),target.artifactHash,
        ...(b.kind==='feedback'?[b.data.status,b.data.status]:[])];
    }
  }
  const insertion=await db.prepare(`INSERT OR IGNORE INTO qa_review_events
    (release,kind,id,revision,action,reason,data,actor,request_key,request_hash)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE ?=coalesce(
      (SELECT max(revision) FROM qa_review_events WHERE release=? AND kind=? AND id=?),0)`+parentCondition)
    .bind(b.release,b.kind,b.id,b.expectedRevision+1,action,reason,JSON.stringify(b.data),actor,b.idempotencyKey,hash,
      b.expectedRevision,b.release,b.kind,b.id,...parentArgs).run();
  const saved=await replay();
  if(saved)return result(saved,insertion.meta.changes===0);
  if(isRework&&(await getCurrent())?.revision===b.expectedRevision)return json({error:'REPLY_PARENT_UNAVAILABLE'},409);
  if(parentCondition && !await getCurrent())return json({error:b.kind==='feedback'?'FEEDBACK_SOURCE_UNAVAILABLE':'REPLY_PARENT_UNAVAILABLE'},409);
  return conflict();
}
function pageNumber(s,fallback,min,max) {
  if(s===null)return fallback;
  if (!/^\d+$/.test(s)) return null;
  const n=Number(s);return integer(n,min,max)?n:null;
}
const feedbackViewKey=target=>JSON.stringify([target.screen,target.state,target.variant,target.viewport,reviewMode(target)]);
const feedbackParentKey=(parent,target)=>JSON.stringify([parent.origin,parent.id,feedbackViewKey(target)]);
async function activeFeedbackAt(db,release,until,currentArtifactHash,includeActiveTarget){
  // Only state and source identity are needed to decide which original bodies
  // belong in the active queue. The append-only event and legacy bytes stay put.
  const rows=(await db.prepare(`SELECT e.kind,e.id,e.action,e.cursor,
    json_extract(e.data,'$.target') AS target,json_extract(e.data,'$.parent') AS parent,json_extract(e.data,'$.status') AS status
    FROM qa_review_events e WHERE e.release=? AND e.cursor<=? AND e.kind IN ('comment','feedback')
    AND NOT EXISTS (SELECT 1 FROM qa_review_events n WHERE n.release=e.release AND n.kind=e.kind AND n.id=e.id AND n.revision>e.revision AND n.cursor<=?)
    ORDER BY e.cursor`).bind(release,until,until).all()).results;
  const sources=new Map(),feedback=new Map(),hashes=new Map(),states=new Map();
  for(const row of rows){
    const target=JSON.parse(row.target),parent=row.kind==='comment'?{origin:'current',id:row.id}:JSON.parse(row.parent);
    const key=feedbackParentKey(parent,target);
    if(row.kind==='comment')sources.set(key,{...row,target});
    else{if(!feedback.has(key))feedback.set(key,[]);feedback.get(key).push({...row,target});}
  }
  const legacy=(await db.prepare(`SELECT r.source_key,json_extract(c.value,'$.id') AS id,
    json_extract(c.value,'$.status') AS status,coalesce(json_extract(c.value,'$.deleted'),0) AS deleted
    FROM qa_legacy_records r JOIN qa_legacy_sources s ON s.sha256=r.source_sha AND s.complete=1,
    json_each(r.payload,'$.comments') c WHERE r.source_sha=?`).bind(sourceSha).all()).results;
  for(const row of legacy){
    const [screen,state,variant,width]=row.source_key.split('/'),target={screen,state,variant,viewport:Number(width)};
    sources.set(feedbackParentKey({origin:'legacy',id:row.id},target),{...row,target,cursor:0});
  }
  const stateFor=(parent,target)=>{
    const key=feedbackParentKey(parent,target);
    if(!states.has(key))states.set(key,(async()=>{
      if(includeActiveTarget?.(target,release)===false)return 'inactive';
      const source=sources.get(key);
      if(source?.action==='delete'||source?.deleted)return 'archived';
      const viewKey=feedbackViewKey(target);
      if(!hashes.has(viewKey))hashes.set(viewKey,Promise.resolve(currentArtifactHash?.(target,release)??null));
      const hash=await hashes.get(viewKey),history=feedback.get(key)||[];
      const entry=hash?history.findLast(row=>row.target.artifactHash===hash):null,previous=history.at(-1),decision=entry||previous;
      const newerSource=parent.origin==='current'&&source&&(!decision||source.cursor>decision.cursor)&&(!entry||source.target.artifactHash===hash);
      const fallback=(parent.origin==='current'?source?.action==='resolve':source?.status==='resolved')?'resolved':'unresolved';
      return newerSource?(source.action==='resolve'?'resolved':'unresolved'):
        decision?.status||fallback;
    })());
    return states.get(key);
  };
  const isActive=async(parent,target)=>!['resolved','archived','inactive'].includes(await stateFor(parent,target));
  return {
    async record(row){
      const data=JSON.parse(row.data),parent=row.kind==='comment'?{origin:'current',id:row.id}:data.parent;
      if(includeActiveTarget?.(data.target,release)===false)return false;
      if(parent)return isActive(parent,data.target);
      const id=data.sourceCommentId||(row.kind==='draft'?row.id:null);
      if(id)for(const origin of ['current','legacy']){
        const candidate={origin,id};if(sources.has(feedbackParentKey(candidate,data.target))&&!await isActive(candidate,data.target))return false;
      }
      return true;
    },
    async legacy(data,sourceKey){
      const [screen,state,variant,width]=sourceKey.split('/'),target={screen,state,variant,viewport:Number(width)};
      if(includeActiveTarget?.(target,release)===false)return null;
      const comments=data.comments||[],keep=await Promise.all(comments.map(comment=>isActive({origin:'legacy',id:comment.id},target)));
      return {...data,comments:comments.filter((_,i)=>keep[i]),...(keep.some(value=>!value)?{inactiveCommentsOmitted:true}:{})};
    }
  };
}
async function read(db,url,path,currentArtifactHash,includeActiveTarget) {
  const q=url.searchParams,limit=pageNumber(q.get('limit'),50,1,150);
  if(limit===null) return invalid();
  if(path==='/legacy-source'){
    const source=await db.prepare('SELECT original_bytes,chunk_count,complete FROM qa_legacy_sources WHERE sha256=?').bind(sourceSha).first();
    if(!source?.complete)return json({error:'SOURCE_IMPORT_PENDING'},503);
    const {results}=await db.prepare('SELECT ordinal,hex(raw_bytes) AS bytes FROM qa_legacy_chunks WHERE source_sha=? ORDER BY ordinal').bind(sourceSha).all();
    if(results.length!==source.chunk_count)return json({error:'SOURCE_INCOMPLETE'},503);
    const bytes=new Uint8Array(source.original_bytes);
    let offset=0;
    for(const [i,row] of results.entries()){
      if(row.ordinal!==i||typeof row.bytes!=='string'||row.bytes.length%2||offset+row.bytes.length/2>bytes.length)return json({error:'SOURCE_INCOMPLETE'},503);
      for(let j=0;j<row.bytes.length;j+=2)bytes[offset++]=parseInt(row.bytes.slice(j,j+2),16);
    }
    if(offset!==bytes.length)return json({error:'SOURCE_INCOMPLETE'},503);
    return new Response(bytes,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'}});
  }
  const scope=q.get('scope')??'active';if(!['active','all'].includes(scope))return invalid();
  if(path==='/legacy'){
    const after=pageNumber(q.get('after'),0,0,2147483647);if(after===null)return invalid();
    const release=q.get('release')??'MSG0585-R3';if(!pointId(release))return invalid();
    const bound=await db.prepare('SELECT coalesce(max(cursor),0) AS n FROM qa_review_events WHERE release=?').bind(release).first();
    const until=pageNumber(q.get('until'),bound.n,0,bound.n);if(until===null)return invalid();
    const source=await db.prepare('SELECT complete FROM qa_legacy_sources WHERE sha256=?').bind(sourceSha).first();
    if(!source?.complete)return json({error:'SOURCE_IMPORT_PENDING'},503);
    const rows=(await db.prepare('SELECT source_key,source_pointer,ordinal,payload FROM qa_legacy_records WHERE source_sha=? AND ordinal>? ORDER BY ordinal LIMIT ?')
      .bind(sourceSha,after,limit).all()).results;
    const queue=scope==='active'?await activeFeedbackAt(db,release,until,currentArtifactHash,includeActiveTarget):null;
    const projected=await Promise.all(rows.map(async r=>({sourceKey:r.source_key,sourcePointer:r.source_pointer,sourceSha256:sourceSha,reviewedReleaseId:null,artifactHash:null,data:queue?await queue.legacy(JSON.parse(r.payload),r.source_key):JSON.parse(r.payload)}))),items=projected.filter(row=>row.data!==null);
    return json({items,scope,until,nextCursor:rows.at(-1)?.ordinal??after,hasMore:rows.length===limit});
  }
  const release=q.get('release'),since=pageNumber(q.get('since'),0,0,Number.MAX_SAFE_INTEGER),kind=q.get('kind'),id=q.get('id');
  if(!pointId(release)||since===null||(kind&&!kinds.has(kind))||(id&&!recordId(id)))return invalid();
  if(path==='/backup'){
    const bound=await db.prepare('SELECT coalesce(max(cursor),0) AS n FROM qa_review_events WHERE release=?').bind(release).first();
    const until=pageNumber(q.get('until'),bound.n,0,bound.n);
    if(until===null || since>until || kind || id)return invalid();
    const rows=(await db.prepare('SELECT * FROM qa_review_events WHERE release=? AND cursor>? AND cursor<=? ORDER BY cursor LIMIT ?')
      .bind(release,since,until,limit).all()).results;
    const nextCursor=rows.at(-1)?.cursor??since;
    return json({release,until,nextCursor,hasMore:nextCursor<until,legacySourceSha256:sourceSha,
      events:rows.map(r=>({...shape(r),requestKey:r.request_key,requestHash:r.request_hash}))});
  }
  if(path==='/events' && !(kind&&id))return invalid();
  const terms=['e.release=?','e.cursor>?'],args=[release,since];
  if(kind){terms.push('e.kind=?');args.push(kind);}if(id){terms.push('e.id=?');args.push(id);}
  let until=null;
  if(path!=='/events'){
    const bound=await db.prepare('SELECT coalesce(max(cursor),0) AS n FROM qa_review_events WHERE release=?').bind(release).first();
    until=pageNumber(q.get('until'),bound.n,0,bound.n);if(until===null||since>until)return invalid();
    terms.push('e.cursor<=?','NOT EXISTS (SELECT 1 FROM qa_review_events n WHERE n.release=e.release AND n.kind=e.kind AND n.id=e.id AND n.revision>e.revision AND n.cursor<=?)');args.push(until,until);
  }
  if(q.get('unresolved')==='1')terms.push(path==='/events'?"e.kind='comment' AND e.action NOT IN ('resolve','delete')":"e.kind='comment'");
  const rows=(await db.prepare('SELECT e.* FROM qa_review_events e WHERE '+terms.join(' AND ')+' ORDER BY e.cursor LIMIT ?').bind(...args,limit).all()).results;
  const queue=path!=='/events'&&(scope==='active'||q.get('unresolved')==='1')?await activeFeedbackAt(db,release,until,currentArtifactHash,includeActiveTarget):null;
  const keep=queue?await Promise.all(rows.map(row=>queue.record(row))):rows.map(()=>true);
  return json({items:rows.filter((_,i)=>keep[i]).map(shape),...(until===null?{}:{scope,until}),nextCursor:rows.at(-1)?.cursor??since,hasMore:rows.length===limit});
}
export async function handleR3Review({request,env,actor,path,checkTarget,currentArtifactHash,includeActiveTarget}) {
  if(!env.ORDER_QA_DB)return json({error:'QA_STORE_UNAVAILABLE'},503);
  try {
    if(request.method==='GET' && ['/records','/events','/legacy','/legacy-source','/backup'].includes(path))return await read(env.ORDER_QA_DB,new URL(request.url),path,currentArtifactHash,includeActiveTarget);
    if(request.method==='POST' && path==='/records'){
      const body=await readJson(request);
      if(checkTarget){
        if(!validTarget(body?.data?.target))return invalid();
        if(!await checkTarget(body.data.target,body.release)){
          // An already stored live comment keeps its immutable source target
          // after deployment. This grants no arbitrary historical new target.
          let source=null;
          if(body.expectedRevision>0&&kinds.has(body.kind)&&recordId(body.id))source=await env.ORDER_QA_DB.prepare(currentSql).bind(body.release,body.kind,body.id).first();
          if(!source&&['reply','feedback'].includes(body.kind)&&body.data.parent?.origin==='current'&&recordId(body.data.parent.id))source=await env.ORDER_QA_DB.prepare(currentSql).bind(body.release,'comment',body.data.parent.id).first();
          if(!source||!body.data.target.screen.startsWith('live-')||JSON.stringify(canonical(JSON.parse(source.data).target))!==JSON.stringify(canonical(body.data.target)))return json({error:'REVIEW_TARGET_UNAVAILABLE'},400);
        }
      }
      return await write(env.ORDER_QA_DB,actor.id??actor.email,body);
    }
    return json({error:'NOT_FOUND'},404);
  }catch{return json({error:'QA_STORE_UNAVAILABLE'},503);}
}
