/** Fixed projections; never return private Sheet identifiers, URLs or raw user memo columns in normal lists. */
export const CANONICAL_SCREEN_IDS = Object.freeze([
  ...Array.from({length:18},(_,i)=>'F'+String(i).padStart(2,'0')),
  ...Array.from({length:10},(_,i)=>'U'+String(i).padStart(2,'0')),
  ...Array.from({length:9},(_,i)=>'P'+String(i).padStart(2,'0')),
  ...Array.from({length:5},(_,i)=>'C'+String(i).padStart(2,'0')),
  ...Array.from({length:34},(_,i)=>'A'+String(i).padStart(2,'0'))
]);
const canonicalScreenSet = new Set(CANONICAL_SCREEN_IDS);

export function project(tab, values) {
  if(!Array.isArray(values)||values.length<2) throw new Error('EMPTY_SHEET');
  const rows=values.slice(1);
  if(tab==='screens') {
    const items=rows.filter(r=>r[0]).map(r=>({screenId:r[0],name:r[1]||'',audience:r[2]||'',plannedRoute:r[3]||'',phase:r[4]||'',status:r[5]||'',qaVerified:r[6]||'',details:r[7]||'',lowfiApproved:false,artifactLinksVerified:false}));
    if(items.length!==76||new Set(items.map(x=>x.screenId)).size!==76||items.some(x=>!x.name||!canonicalScreenSet.has(x.screenId))) throw new Error('SCREEN_PARITY_FAILED');
    return {total:76,source:'GOOGLE_SHEETS_AUTHENTICATED_READ',items};
  }
  if(tab==='decisions') {
    const items=rows.filter(r=>r[0]).map(r=>({id:r[0],name:r[1]||'',question:r[2]||'',status:r[3]||'',relatedScreens:r[4]||'',isFullyApproved:r[3]==='승인 완료',implementation:'PLAN_ONLY'}));
    const ids=new Set(items.map(x=>x.id));
    if(items.length!==25||ids.size!==25||items.filter(x=>x.isFullyApproved).length!==1||!Array.from({length:25},(_,i)=>'PENDING-'+String(i+1).padStart(2,'0')).every(x=>ids.has(x))||!items.find(x=>x.id==='PENDING-19')?.status.includes('운영세부')) throw new Error('DECISION_PARITY_FAILED');
    return {total:25,active:24,fullyApproved:1,source:'GOOGLE_SHEETS_AUTHENTICATED_READ',items};
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
