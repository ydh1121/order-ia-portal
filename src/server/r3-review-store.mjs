const sourceSha = 'e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
const kinds = new Set(['comment','draft','review','change','figma','artifact','screen']);
const actions = new Set(['save','relocate','resolve','delete','reopen']);
const viewFields = new Set(['id','instance','x','y','viewport','scale','scroll','layers','artifactHash']);
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

function validTarget(x) {
  return keys(x,allowed('screen','state','variant','viewport','artifactHash')) &&
    [x.screen,x.state,x.variant].every(pointId) && integer(x.viewport,240,8192) && sha(x.artifactHash);
}
function validAnchor(x) {
  return keys(x,viewFields) && pointId(x.id) && pointId(x.instance) && sha(x.artifactHash) &&
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
    comment:['body','anchor','sourceKey','sourceCommentId'], draft:['body','anchor','sourceKey','sourceCommentId'],
    review:['decision','sourceKey'], change:['status','evidenceRef','body','sourceKey','sourceCommentId'],
    figma:['figmaUrl','status','evidenceRef','sourceKey'], artifact:['evidenceRef','status'], screen:['sourceKey','evidenceRef','status']
  };
  if (!keys(d,allowed('target',...types[kind])) || !validTarget(d.target)) return false;
  if ('sourceKey' in d && !recordId(d.sourceKey)) return false;
  if ('sourceCommentId' in d && !recordId(d.sourceCommentId)) return false;
  if ('evidenceRef' in d && (!text(d.evidenceRef,512) || !d.evidenceRef.trim())) return false;
  if ('body' in d && !text(d.body,10000)) return false;
  if (d.anchor!=null && (!validAnchor(d.anchor) || d.anchor.artifactHash!==d.target.artifactHash)) return false;
  if (kind==='comment') return typeof d.body==='string' && d.body.trim().length>0;
  if (kind==='draft') return typeof d.body==='string';
  if (kind==='review') return ['changes_requested','unreviewed','approved'].includes(d.decision);
  if (kind==='change') return ['unknown','not_started','implemented','verified','recheck','blocked'].includes(d.status) &&
    (!['implemented','verified','recheck'].includes(d.status) || Boolean(d.evidenceRef));
  if (kind==='figma') return ['linked','exported','edited','unlinked'].includes(d.status) &&
    (d.figmaUrl===undefined || figmaLink(d.figmaUrl)) && (d.status!=='exported'||Boolean(d.evidenceRef));
  return (d.status===undefined || pointId(d.status)) && (kind!=='artifact'||Boolean(d.evidenceRef));
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
    // A moved point may attach to the next build of the same logical screen. The
    // old target/hash and coordinates remain on their previous immutable event.
    const oldTarget=action==='relocate'?{...data.target,artifactHash:b.data.target.artifactHash}:data.target;
    if(JSON.stringify(canonical(oldTarget))!==JSON.stringify(canonical(b.data.target))) return invalid();
    if((previous.action==='delete'||previous.action==='resolve') && action!=='reopen') return invalid();
    if(action==='reopen' && !['delete','resolve'].includes(previous.action)) return invalid();
    if(action==='relocate' && (!b.data.anchor || data.body!==b.data.body)) return invalid();
    if(['delete','resolve','reopen'].includes(action) && JSON.stringify(canonical(data))!==JSON.stringify(canonical(b.data))) return invalid();
  }
  // The comparison and insert are one SQL statement; validation never grants a stale write.
  const insertion=await db.prepare(`INSERT OR IGNORE INTO qa_review_events
    (release,kind,id,revision,action,reason,data,actor,request_key,request_hash)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE ?=coalesce(
      (SELECT max(revision) FROM qa_review_events WHERE release=? AND kind=? AND id=?),0)`)
    .bind(b.release,b.kind,b.id,b.expectedRevision+1,action,reason,JSON.stringify(b.data),actor,b.idempotencyKey,hash,
      b.expectedRevision,b.release,b.kind,b.id).run();
  const saved=await replay();return saved?result(saved,insertion.meta.changes===0):conflict();
}
function pageNumber(s,fallback,min,max) {
  if(s===null)return fallback;
  if (!/^\d+$/.test(s)) return null;
  const n=Number(s);return integer(n,min,max)?n:null;
}
async function read(db,url,path) {
  const q=url.searchParams,limit=pageNumber(q.get('limit'),50,1,150);
  if(limit===null) return invalid();
  if(path==='/legacy'){
    const after=pageNumber(q.get('after'),0,0,2147483647);if(after===null)return invalid();
    const source=await db.prepare('SELECT complete FROM qa_legacy_sources WHERE sha256=?').bind(sourceSha).first();
    if(!source?.complete)return json({error:'SOURCE_IMPORT_PENDING'},503);
    const rows=(await db.prepare('SELECT source_key,source_pointer,ordinal,payload FROM qa_legacy_records WHERE source_sha=? AND ordinal>? ORDER BY ordinal LIMIT ?')
      .bind(sourceSha,after,limit).all()).results;
    return json({items:rows.map(r=>({sourceKey:r.source_key,sourcePointer:r.source_pointer,sourceSha256:sourceSha,reviewedReleaseId:null,artifactHash:null,data:JSON.parse(r.payload)})),nextCursor:rows.at(-1)?.ordinal??after,hasMore:rows.length===limit});
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
  if(path!=='/events')terms.push('NOT EXISTS (SELECT 1 FROM qa_review_events n WHERE n.release=e.release AND n.kind=e.kind AND n.id=e.id AND n.revision>e.revision)');
  if(q.get('unresolved')==='1')terms.push("e.kind='comment' AND e.action NOT IN ('resolve','delete')");
  const rows=(await db.prepare('SELECT e.* FROM qa_review_events e WHERE '+terms.join(' AND ')+' ORDER BY e.cursor LIMIT ?').bind(...args,limit).all()).results;
  return json({items:rows.map(shape),nextCursor:rows.at(-1)?.cursor??since,hasMore:rows.length===limit});
}
export async function handleR3Review({request,env,actor,path,checkTarget}) {
  if(!env.ORDER_QA_DB)return json({error:'QA_STORE_UNAVAILABLE'},503);
  try {
    if(request.method==='GET' && ['/records','/events','/legacy','/backup'].includes(path))return await read(env.ORDER_QA_DB,new URL(request.url),path);
    if(request.method==='POST' && path==='/records'){
      const body=await readJson(request);
      if(checkTarget && (!validTarget(body?.data?.target)||!await checkTarget(body.data.target,body.release)))return invalid();
      return await write(env.ORDER_QA_DB,actor.id??actor.email,body);
    }
    return json({error:'NOT_FOUND'},404);
  }catch{return json({error:'QA_STORE_UNAVAILABLE'},503);}
}
