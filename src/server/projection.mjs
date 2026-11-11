/** Fixed projections; never return private Sheet identifiers, URLs or raw user memo columns in normal lists. */
export const CANONICAL_SCREEN_IDS = Object.freeze([
  ...Array.from({length:18},(_,i)=>'F'+String(i).padStart(2,'0')),
  ...Array.from({length:10},(_,i)=>'U'+String(i).padStart(2,'0')),
  ...Array.from({length:9},(_,i)=>'P'+String(i).padStart(2,'0')),
  ...Array.from({length:5},(_,i)=>'C'+String(i).padStart(2,'0')),
  ...Array.from({length:34},(_,i)=>'A'+String(i).padStart(2,'0'))
]);
const canonicalScreenSet = new Set(CANONICAL_SCREEN_IDS);

// Single server-owned status mapping; partial approval is not full approval.
export const DECISION_STATUS_CLASS = Object.freeze({
  '승인 완료':'APPROVED',
  '검토 필요':'OPEN',
  '보류 검토':'OPEN',
  '향후 검토':'OPEN',
  '핵심 공개요건 승인·운영세부 검토':'IN_REVIEW',
  '엔진·UI 통합 완료, 웹 검수 및 정책 검토 중':'IN_REVIEW',
  '진행 — 연구·제작 승인':'IN_REVIEW'
});

export function project(tab, values) {
  if(!Array.isArray(values)||values.length<2) throw new Error('EMPTY_SHEET');
  const rows=values.slice(1);
  if(tab==='screens') {
    const items=rows.filter(r=>r[0]).map(r=>({screenId:r[0],name:r[1]||'',audience:r[2]||'',plannedRoute:r[3]||'',phase:r[4]||'',status:r[5]||'',qaVerified:r[6]||'',details:r[7]||'',lowfiApproved:false,artifactLinksVerified:false}));
    if(items.length!==76||new Set(items.map(x=>x.screenId)).size!==76||items.some(x=>!x.name||!canonicalScreenSet.has(x.screenId))) throw new Error('SCREEN_PARITY_FAILED');
    return {total:76,source:'GOOGLE_SHEETS_AUTHENTICATED_READ',items};
  }
  if(tab==='decisions') {
    const header=values[0];
    const requiredHeaders=['검토 ID','쉬운 제목','무엇을 결정해야 하나요?','현재 상태'];
    if(!Array.isArray(header)||requiredHeaders.some((name,i)=>String(header[i]??'').trim()!==name))throw new Error('DECISION_PARITY_FAILED');
    const items=[],ids=new Set(),counts={OPEN:0,IN_REVIEW:0,APPROVED:0};
    let trailingEmpty=false;
    for(const row of rows){
      if(!Array.isArray(row))throw new Error('DECISION_PARITY_FAILED');
      const nonempty=row.some(value=>String(value??'').trim()!=='');
      if(!nonempty){trailingEmpty=true;continue}
      if(trailingEmpty)throw new Error('DECISION_PARITY_FAILED');
      const id=String(row[0]??'').trim();
      const name=String(row[1]??'').trim();
      const question=String(row[2]??'').trim();
      const status=String(row[3]??'').trim();
      if(!/^PENDING-(?:0[1-9]|[1-9][0-9]+)$/.test(id)||ids.has(id)||!name||!question||!status)throw new Error('DECISION_PARITY_FAILED');
      if(!Object.prototype.hasOwnProperty.call(DECISION_STATUS_CLASS,status))throw new Error('DECISION_PARITY_FAILED');
      ids.add(id);
      const reviewState=DECISION_STATUS_CLASS[status];
      counts[reviewState]++;
      items.push({id,name,question,status,relatedScreens:String(row[4]??'').trim(),reviewState,isFullyApproved:reviewState==='APPROVED',implementation:'PLAN_ONLY'});
    }
    if(items.length===0)throw new Error('DECISION_PARITY_FAILED');
    return {total:items.length,active:counts.OPEN+counts.IN_REVIEW,open:counts.OPEN,in_review:counts.IN_REVIEW,approved:counts.APPROVED,fullyApproved:counts.APPROVED,source:'GOOGLE_SHEETS_AUTHENTICATED_READ',items};
  }
  if(tab==='roadmap') {
    const items=rows.filter(r=>r[0]).map(r=>({stage:r[0],type:r[1],goal:r[2],description:r[3],status:r[4],scope:r[5],dependency:r[6]||''}));
    if(items.length!==7||items.some((x,i)=>x.stage!==i+'단계')) throw new Error('ROADMAP_PARITY_FAILED');
    return {total:7,items};
  }
  if(tab==='guide') return {items:rows.filter(r=>r[0]).map(r=>({order:r[0],area:r[1],instructions:r[2]}))};
  if(tab==='notes') {
    // Dedicated, privileged endpoint only; no implicit approval/asset status inferred from submitted opinions.
    return {items:rows.filter(r=>r[1]&&r[3]).map(r=>({id:r[0]||null,screenOrDecisionId:r[1],date:r[2]||'',text:r[3],handlingStatus:r[5]||'',planningReply:r[6]||'',appliedVersion:r[7]||'',approvedByUser:false}))};
  }
  throw new Error('INVALID_PROJECTION');
}
export const privateAssetsContract = (screenId) => ({screenId,kind:'LOWFI|HIFI|PRODUCT|ADMIN',verifiedOriginalUrl:null,immutableHash:null,sourceCommit:null,qaStatus:'NOT_VERIFIED',reviewer:null,userApproval:'NONE'});
