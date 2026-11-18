// Serialized by the approved QA shell. Keep dependencies inside the binder.
export function mountReviewDownloads({release, notify, getLocalDrafts = () => [], onOfflineDraftBackup, onImportPreview} = {}) {
  const api = '/api/ia/r3-qa';
  const legacyHash = 'e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
  const enc = new TextEncoder();
  const say = msg => { if (notify) notify(msg); };
  const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const fetchPrivate = async url => {
    const r = await fetch(url, {credentials:'same-origin', cache:'no-store', redirect:'error'});
    if (!r.ok) throw new Error('서버 자료를 읽지 못했어요.');
    return r;
  };
  async function readSnapshot() {
    let cursor = 0, until = null;
    const events = [];
    for (;;) {
      const q = new URLSearchParams({release, since:String(cursor), limit:'150'});
      if (until !== null) q.set('until', String(until));
      const page = await (await fetchPrivate(api + '/backup?' + q)).json();
      if (page.release !== release || page.legacySourceSha256 !== legacyHash || !Array.isArray(page.events) ||
          !Number.isSafeInteger(page.until) || (until !== null && until !== page.until)) throw new Error('백업 버전을 확인할 수 없어요.');
      until = page.until;
      for (const event of page.events) {
        if (event.release !== release || !Number.isSafeInteger(event.cursor) || event.cursor <= cursor || event.cursor > until) throw new Error('서버 이력이 이어지지 않아요.');
        events.push(event);
        cursor = event.cursor;
      }
      if (page.nextCursor !== cursor || (!page.hasMore && cursor !== until) || (page.hasMore && page.events.length === 0)) throw new Error('전체 이력을 받지 못했어요.');
      if (!page.hasMore) break;
    }
    const bytes = await (await fetchPrivate(api + '/legacy-source')).arrayBuffer();
    if (await sha(bytes) !== legacyHash) throw new Error('원본 의견 해시가 맞지 않아요.');
    const legacyOriginalJson = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes);
    const snapshot={schema:'order-r3-review-backup/v1',release,until,events,legacySourceSha256:legacyHash,legacyOriginalJson,localDrafts:getLocalDrafts()};
    assertComplete(snapshot);
    return snapshot;
  }

  function printable(x) { return typeof x === 'string' ? x : x == null ? '' : JSON.stringify(x); }
  function rowsOf(snapshot) {
    const all = [];
    const legacy = JSON.parse(snapshot.legacyOriginalJson);
    for (const [key, rec] of Object.entries(legacy.records)) {
      const push = (kind,id,revision,action,time,body,detail,parent='') => all.push(['원본',key,kind,id,parent,revision,action,time,body,printable(detail)]);
      push('review',rec.frameId,'',rec.status,rec.statusUpdatedAt,rec.note,{context:rec.context,history:rec.history,drafts:rec.drafts,draftDeletes:rec.draftDeletes});
      if (rec.figma) push('figma',rec.frameId,'',rec.figma.status,rec.figma.updatedAt,rec.figma.note,rec.figma);
      for (const item of rec.exports || []) push('export',rec.frameId,'','export',item.createdAt || item.at,'',item);
      function thread(comment, parent='') {
        push(parent?'reply':'comment',comment.id,'',comment.deleted?'deleted':comment.status,comment.updatedAt,comment.body,comment,parent);
        for (const [n,old] of (comment.history || []).entries()) push('history',comment.id,n+1,'history',old.at || old.updatedAt,old.body,old,parent);
        for (const reply of comment.replies || []) thread(reply,comment.id);
      }
      for (const c of rec.comments || []) thread(c);
    }
    for (const e of snapshot.events) {
      const t=e.data?.target || {}, key=[t.screen,t.state,t.variant,t.viewport].join('/');
      all.push(['서버',key,e.kind,e.id,printable(e.data?.parent),e.revision,e.action,e.updatedAt,
        e.data?.body || e.data?.note || e.reason || '',printable(e)]);
    }
    for (const d of snapshot.localDrafts || []) all.push(['이 브라우저','','local-draft','','','','draft','','',printable(d)]);
    return all;
  }
  function csv(snapshot) {
    const quote = x => {
      let v = printable(x);
      if (/^\s*[=+@-]|^[\t\r\n]/.test(v)) v = "'" + v;
      return '"' + v.replaceAll('"','""') + '"';
    };
    const columns=['출처','화면/상태/변형/폭','기록 종류','ID','상위 의견','revision','상태/동작','시각','의견','상세 JSON'];
    return '\ufeff' + [columns,...rowsOf(snapshot)].map(r=>r.map(quote).join(',')).join('\r\n') + '\r\n';
  }
  function markdown(snapshot) {
    const lines=['# Order QA 검토 이력','','릴리스 '+snapshot.release+' · 서버 커서 '+snapshot.until,''];
    const block = x => printable(x).split(/\r\n|\r|\n/).map(s=>'    '+s).join('\n');
    for (const row of rowsOf(snapshot)) {
      const [origin,key,kind,id,parent,rev,status,time,body,detail]=row;
      lines.push('## '+origin+' · '+(kind==='comment'?'의견':kind==='reply'?'답글':kind==='history'?'편집 이력':kind.replace(/[^\w-]/g,'')),'',block([key,id,parent,rev,status,time].filter(v=>v!=='' && v!=null).join(' · ')),'');
      if (body) lines.push(block(body),'');
      if (detail) lines.push(block(detail),'');
    }
    return lines.join('\n');
  }
  function download(text,filename,mime) {
    const url=URL.createObjectURL(new Blob([text],{type:mime}));
    const a=document.createElement('a');
    a.href=url; a.download=filename; a.hidden=true;
    document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const actions = new Set(['export-review','export-csv','export-markdown']);
  let busy=false;
  async function click(e) {
    const action=e.target.closest?.('[data-lab-action]')?.dataset.labAction;
    if (!actions.has(action)) return;
    e.preventDefault();e.stopImmediatePropagation();
    if (busy) return;
    busy=true;
    try {
      const snapshot=await readSnapshot(), name='ORDER_QA_'+release+'_r'+snapshot.until;
      if(action==='export-review') download(JSON.stringify(snapshot,null,2),name+'.json','application/json;charset=utf-8');
      if(action==='export-csv') download(csv(snapshot),name+'.csv','text/csv;charset=utf-8');
      if(action==='export-markdown') download(markdown(snapshot),name+'_comments.md','text/markdown;charset=utf-8');
      say('서버 이력을 포함한 파일을 내보냈어요.');
    } catch {
      const drafts=getLocalDrafts();
      if(action==='export-review' && drafts?.length) {
        if(onOfflineDraftBackup) onOfflineDraftBackup(drafts);
        else download(JSON.stringify({schema:'order-r3-local-drafts/v1',release,localDrafts:drafts},null,2),'ORDER_QA_LOCAL_DRAFTS.json','application/json;charset=utf-8');
        say('서버 백업에 실패해 이 브라우저의 초안만 내보냈어요.');
      } else say('서버 백업을 완료하지 못했어요. 연결 후 다시 시도해 주세요.');
    } finally { busy=false; }
  }
  async function inspect(e) {
    if(e.target.id!=='review-import') return;
    e.stopImmediatePropagation();
    const field=e.target, file=field.files?.[0];
    if(!file) return;
    try {
      const data=JSON.parse(await file.text());
      let message;
      if(data.schema==='order-r3-review-backup/v1' && data.release===release && Array.isArray(data.events) &&
         data.legacySourceSha256===legacyHash && typeof data.legacyOriginalJson==='string' && await sha(enc.encode(data.legacyOriginalJson))===legacyHash) {
        assertComplete(data);
        const original=JSON.parse(data.legacyOriginalJson);
        message='선택한 백업에 원본 '+Object.keys(original.records).length+'건과 서버 이력 '+data.events.length+'건이 있어요.';
      } else if (await sha(await file.arrayBuffer())===legacyHash) {
        message='기존 서버 원본과 일치해요. 원본 의견 '+Object.keys(data.records).length+'건을 확인했어요.';
      } else throw new Error('unverified');
      const output=document.getElementById('review-import-result');
      if(output) output.textContent=message;
      if(onImportPreview) onImportPreview(message);
      say(message+' 서버 자료는 그대로예요.');
    } catch { say('이 버전의 원본과 백업 이력을 확인할 수 없어요.'); }
    finally {field.value='';}
  }
  function assertComplete(data) {
    const revisions=new Map();let cursor=0;
    for(const e of data.events) {
      const k=JSON.stringify([e.kind,e.id]);
      if(e.release!==release || e.revision!==(revisions.get(k)||0)+1 || !Number.isSafeInteger(e.cursor) || e.cursor<=cursor ||
        !/^[a-f0-9]{64}$/.test(e.requestHash)) throw new Error('incomplete');
      revisions.set(k,e.revision);cursor=e.cursor;
    }
    if(cursor!==data.until) throw new Error('incomplete');
  }
  document.addEventListener('click',click,true);
  document.addEventListener('change',inspect,true);
  return ()=>{document.removeEventListener('click',click,true);document.removeEventListener('change',inspect,true);};
}
