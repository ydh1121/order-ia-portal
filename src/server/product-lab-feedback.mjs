// The product runner and the historical reviewer share the same append-only
// review API. A displayed implementation result never sets a user verdict.
export async function mountProductFeedback(options){
 const {container,api,target,runId,anchor,onSaved,restore}=options,release='MSG0585-R3',doc=container.ownerDocument;
 const node=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const button=(label,action)=>{const b=node('button',label);b.type='button';b.onclick=action;return b;};
 const labels={unresolved:'미해결',recheck:'재검토',resolved:'해결'};
 const same=(a,b)=>['screen','state','variant','viewport','artifactHash'].every(k=>a[k]===b[k]);
 const draftKey='order.live-comment/'+runId+'/'+target.screen+'/'+target.state+'/'+target.variant+'/'+target.viewport;
 const field=node('textarea');field.setAttribute('aria-label',anchor?'선택 위치에 의견':'이 화면에 의견');
 try{field.value=sessionStorage.getItem(draftKey)||'';}catch{}
 field.oninput=()=>{try{sessionStorage.setItem(draftKey,field.value);}catch{}};
 const message=node('p'),list=node('section');message.setAttribute('role','status');
 let records=[],pending=null,busy=false;
 const write=payload=>api('/api/ia/r3-qa/records',payload);
 const save=button('의견 저장',async()=>{
  if(busy||!field.value.trim())return;busy=true;save.disabled=true;
  const text=field.value;if(!pending||pending.text!==text)pending={id:crypto.randomUUID(),key:crypto.randomUUID(),text};
  try{
   await write({release,id:pending.id,kind:'comment',expectedRevision:0,idempotencyKey:pending.key,data:{target,body:text,...(anchor?{anchor}:{}),sourceKey:'lab/'+runId+'/'+target.screen.slice(5)}});
   pending=null;message.textContent='저장했어요.';
   if(field.value===text){field.value='';try{sessionStorage.removeItem(draftKey);}catch{}await refresh();onSaved?.();}else{field.oninput();await refresh();}
  }catch(error){message.textContent=error.status===401?'로그인을 확인한 뒤 다시 저장해 주세요. 작성 내용은 남아 있어요.':error.message;}
  finally{busy=false;save.disabled=false;}
 });
 container.append(field,save,message,list);
 async function refresh(){
  const all=[];let cursor=0;
  for(;;){const data=await api('/api/ia/r3-qa/records?release='+release+'&limit=150&since='+cursor);all.push(...data.items);if(!data.hasMore)break;if(data.nextCursor<=cursor)throw Error('INVALID_REVIEW_CURSOR');cursor=data.nextCursor;}
  records=all;list.replaceChildren();
  const comments=all.filter(c=>c.kind==='comment'&&c.data.target.screen===target.screen&&c.data.target.state===target.state&&c.action!=='delete').sort((a,b)=>b.cursor-a.cursor);
  if(!comments.length)list.append(node('p','아직 의견이 없습니다.'));
  for(const comment of comments)draw(comment);
 }
 function feedbackFor(comment){return records.filter(r=>r.kind==='feedback'&&r.data.parent.origin==='current'&&r.data.parent.id===comment.id&&same(r.data.target,comment.data.target)).sort((a,b)=>b.cursor-a.cursor)[0];}
 function stateOf(comment){const entry=feedbackFor(comment);return entry&&entry.cursor>comment.cursor?entry.data.status:comment.action==='resolve'?'resolved':'unresolved';}
 function draw(comment){
  const article=node('article'),status=stateOf(comment),title=node('p',comment.data.body),meta=node('small',labels[status]+' · '+comment.data.target.variant+' · '+new Date(comment.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}));
  article.dataset.reviewId=comment.id;article.dataset.feedbackStatus=status;article.append(title,meta);
  const reason=node('input');reason.placeholder='상태 변경 사유';reason.setAttribute('aria-label','상태 변경 사유');article.append(reason);
  const actions=node('div');actions.className='status-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','의견 처리 상태');
  for(const [value,label]of Object.entries(labels)){
   const b=button(label,async()=>{if(busy)return;busy=true;actions.querySelectorAll('button').forEach(n=>n.disabled=true);
    try{
     const prior=feedbackFor(comment),action=value==='resolved'&&comment.action!=='resolve'?'resolve':value!=='resolved'&&comment.action==='resolve'?'reopen':null;
     if(action)await write({release,id:comment.id,kind:'comment',expectedRevision:comment.revision,idempotencyKey:crypto.randomUUID(),data:comment.data,action,reason:reason.value.trim()||'QA 의견 상태를 '+label+'로 변경'});
     await write({release,id:prior?.id||'live-feedback:'+crypto.randomUUID(),kind:'feedback',expectedRevision:prior?.revision||0,idempotencyKey:crypto.randomUUID(),data:{target:comment.data.target,parent:{origin:'current',id:comment.id},status:value}});
     await refresh();
    }catch(error){message.textContent=error.status===409?'다른 변경이 먼저 저장됐어요. 현재 상태를 다시 확인해 주세요.':error.message;await refresh().catch(()=>{});}
    finally{busy=false;}
   });b.setAttribute('aria-pressed',String(value===status));actions.append(b);
  }
  if(comment.data.anchor&&same(comment.data.target,target)&&comment.data.sourceKey==='lab/'+runId+'/'+target.screen.slice(5))actions.append(button('위치 보기',()=>restore?.(comment.data.anchor)));
  article.append(actions);
  for(const reply of records.filter(r=>r.kind==='reply'&&r.data.parent.origin==='current'&&r.data.parent.id===comment.id))article.append(node('blockquote',reply.data.body));
  if(comment.action!=='resolve'){
   const reply=node('textarea'),replyKey=draftKey+'/reply/'+comment.id;let pendingReply=null;reply.setAttribute('aria-label','답글');reply.placeholder='답글';try{reply.value=sessionStorage.getItem(replyKey)||'';}catch{}reply.oninput=()=>{try{sessionStorage.setItem(replyKey,reply.value);}catch{}};const submit=button('답글 저장',async()=>{
    if(!reply.value.trim()||busy)return;busy=true;submit.disabled=true;
    const text=reply.value;if(!pendingReply||pendingReply.text!==text)pendingReply={id:crypto.randomUUID(),key:crypto.randomUUID(),text};
    try{await write({release,id:pendingReply.id,kind:'reply',expectedRevision:0,idempotencyKey:pendingReply.key,data:{target:comment.data.target,parent:{origin:'current',id:comment.id},body:text}});pendingReply=null;if(reply.value===text){reply.value='';try{sessionStorage.removeItem(replyKey);}catch{}}else reply.oninput();await refresh();}
    catch(error){message.textContent=error.message;}finally{busy=false;submit.disabled=false;}
   });article.append(reply,submit);
  }
  const history=node('details');history.append(node('summary','변경 이력'));history.ontoggle=async()=>{
   if(!history.open||history.dataset.loaded)return;
   try{const entry=feedbackFor(comment),events=[];for(const [kind,id]of [['comment',comment.id],...(entry?[['feedback',entry.id]]:[])]){
    let cursor=0;for(;;){const data=await api('/api/ia/r3-qa/events?release='+release+'&kind='+kind+'&id='+encodeURIComponent(id)+'&since='+cursor+'&limit=150');events.push(...data.items);if(!data.hasMore)break;cursor=data.nextCursor;}
   }
   for(const item of events.sort((a,b)=>a.cursor-b.cursor))history.append(node('p',new Date(item.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+(item.kind==='feedback'?labels[item.data.status]:({save:'의견 저장',resolve:'해결',reopen:'다시 열기',relocate:'위치 변경'})[item.action]||item.action)+(item.reason?' · '+item.reason:'')));
   history.dataset.loaded='true';}catch(error){message.textContent=error.message;}
  };article.append(history);list.append(article);
 }
 try{await refresh();}catch(error){message.textContent=error.message;}
 field.focus();
}
