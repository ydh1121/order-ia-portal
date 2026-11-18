import {browserFunction} from './browser-source.mjs';
import {practiceCatalog,startRolePractice} from './r3-role-practice.mjs';
import {createEvidenceEditor} from './r3-evidence-client.mjs';
const labels={
  business:'사업장 확인',supply:'공급 참여 심사',catalog:'상품·출고 정보 심사',consult:'상담',reprice:'가격 재검토',delivery:'납품 신청',
  BUYER:'매장',SUPPLIER:'공급처',OPERATOR:'운영',DRAFT:'작성 중',REVIEW:'검토 대기',EVIDENCE_REQUIRED:'수동 심사 서류 필요',
  NEEDS_INFO:'보완 요청',VERIFIED:'확인 완료',REJECTED:'반려',REVOKED:'인증 취소',APPROVED:'승인',OPEN:'상담 접수',ANSWERED:'답변 확인',CLOSED:'종료',
  RECALCULATION_REQUESTED:'재산정 요청',REQUESTED:'납품 요청',ACCEPTED:'요청 수락',PAYMENT_REVIEW:'입금 검토 요청',PAYMENT_REVIEWED:'입금 검토 완료',SCHEDULED:'일정 확인',DISPATCHED:'출고 확인',ISSUE_REVIEW:'이상 접수',RECEIVED:'수령 확인',DOCUMENT_REVIEWED:'거래 문서 검토 완료',SETTLEMENT_REVIEW:'정산 검토 대기',SETTLEMENT_REVIEWED:'정산 검토 완료',CANCELLED:'취소',
  submit:'검토 요청',manual:'조회 장애 · 수동 심사',attach:'증빙 연결',supplement:'보완 요청',verify:'사업장 확인',reject:'반려',revoke:'인증 취소',approve:'승인',respond:'답변 처리',followup:'추가 문의',resolve:'종료',
  'request-price':'가격 재산정 요청',accept:'요청 수락','payment-request':'입금 검토 요청','payment-review':'입금 검토 확인',schedule:'일정 확인',dispatch:'출고 확인','report-issue':'이상 접수',reschedule:'일정 재조정',receive:'수령 확인','document-review':'거래 문서 검토','settlement-review':'정산 검토 요청',settle:'정산 검토 확인',cancel:'취소',resume:'이어서 작성',create:'새 업무',
  MISSING_EVIDENCE:'증빙 보완',SCOPE_MISMATCH:'소속 확인',INVALID_DETAILS:'입력 정보 확인',DELIVERY_EXCEPTION:'납품 이상',REVIEW_DECISION:'검토 결과',
};
function runRolePage(labels,createEvidenceEditor){
  const $=id=>document.getElementById(id),name=k=>labels[k]||k;
  const roleUrl='/api/ia/r3-role',elements={list:$('list'),detail:$('detail'),create:$('create'),status:$('status')};
  const elm=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const button=(text,action)=>{const b=elm('button',text);b.type='button';b.addEventListener('click',action);return b;};
  const option=(s,value,label)=>{const o=elm('option',label);o.value=value;s.append(o);};
  let disposeEvidence=()=>{};let grants=[],pending=null,csrf='',next='',activeId='',loading=false,generation=0;
  const messages={NO_BUSINESS_MEMBERSHIP:'이 계정에 연결된 업무 권한이 없습니다.',ACCESS_DENIED:'이 업무에 접근할 수 없습니다.',CSRF_DENIED:'로그인을 다시 확인해 주세요.',NOT_FOUND:'업무를 열 수 없습니다.',QUOTE_UNAVAILABLE:'유효한 견적을 선택해 주세요.',REVISION_CONFLICT:'다른 사용자가 먼저 변경했습니다.',REVISION_OR_CONDITION_CHANGED:'검토 조건이 바뀌었습니다. 현재 상태를 확인해 주세요.',ACTION_NOT_ALLOWED:'현재 상태에서 처리할 수 없습니다.',CASE_EXISTS_OR_CHANGED:'이미 진행 중인 신청이 있습니다.'};
  async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});const result=await r.json();if(!r.ok)throw Object.assign(new Error(result.error||'UNAVAILABLE'),{status:r.status});return result;}
  const show=(message)=>{elements.status.replaceChildren(document.createTextNode(message));};
  function error(e){show(messages[e.message]||'업무를 불러오지 못했습니다. 다시 시도해 주세요.');}
  function field(form,title,key,choices){const label=elm('label',title);const input=elm(choices?'select':'input');input.name=key;input.required=true;
    if(choices)for(const [val,text] of choices)option(input,val,text);else input.maxLength=128;label.append(input);form.append(label);return input;}
  async function save(data){
    if(loading)return;loading=true;const request=pending&&JSON.stringify(pending.data)===JSON.stringify(data)?pending:{data,key:crypto.randomUUID()};pending=request;
    try{const result=await api(roleUrl,{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':csrf},body:JSON.stringify({...data,requestKey:request.key})});pending=null;await load();await detail(result.case.id);show('저장했습니다.');}
    catch(e){error(e);if(e.status===409 && data.action!=='create')elements.status.append(button('최신 상태 보기',()=>detail(data.caseId)));}
    finally{loading=false;}
  }
  function buildCreate(){const f=elements.create;f.replaceChildren();const creators=grants.filter(g=>g.role!=='OPERATOR');if(!creators.length){f.hidden=true;return;} f.hidden=false;
    const scope=field(f,'업무 범위','scope',creators.map((g,i)=>[String(i),`${name(g.role)} · ${g.org_id}${g.site_id?' / '+g.site_id:''}`]));const rest=elm('div');f.append(rest);let caseId=crypto.randomUUID();
    function populate(){rest.replaceChildren();const g=creators[+scope.value];const kinds=g.role==='SUPPLIER'?['supply','catalog']:['business','consult','reprice','delivery'];const kind=field(rest,'업무','kind',kinds.map(k=>[k,name(k)])); const extras=elm('div');rest.append(extras);
      function extra(){extras.replaceChildren();if(['delivery','reprice'].includes(kind.value))field(extras,'발급된 견적 ID','quoteId');if(kind.value==='catalog')field(extras,'상품 ID','productId');caseId=crypto.randomUUID();}kind.onchange=extra;extra();}
    scope.onchange=populate;populate();const submit=elm('button','작성 시작');f.append(submit);f.onsubmit=e=>{e.preventDefault();const g=creators[+scope.value],v=new FormData(f),data={action:'create',caseId,expectedRevision:0,kind:v.get('kind'),orgId:g.org_id};if(g.site_id)data.siteId=g.site_id;for(const k of ['quoteId','productId'])if(v.has(k))data[k]=String(v.get(k)).trim();save(data);};
  }
  function rows(cases){for(const c of cases){const li=elm('li');const b=button(`${name(c.kind)} · ${name(c.state)}`,()=>detail(c.id));b.dataset.anchor='case-'+c.id;li.append(b,elm('small',`${c.org_id}${c.site_id?' / '+c.site_id:''} · ${c.id}`));elements.list.append(li);}}
  async function load(append=false){const token=++generation; try{const reply=await api(roleUrl+(append&&next?'?after='+encodeURIComponent(next):''));if(token!==generation)return;
    grants=reply.grants;next=reply.next;if(!append){elements.list.replaceChildren();buildCreate();}rows(reply.cases);if(!elements.list.childElementCount)elements.list.append(elm('li','진행 중인 업무가 없습니다.'));$('more').hidden=!next;
  }catch(e){elements.list.replaceChildren();elements.detail.replaceChildren();elements.create.hidden=true;error(e);}}
  async function detail(caseId){disposeEvidence();activeId=caseId;try{const reply=await api(roleUrl+'?id='+encodeURIComponent(caseId));if(activeId!==caseId)return;const c=reply.case,el=elements.detail;el.replaceChildren();el.append(elm('h2',`${name(c.kind)} · ${name(c.state)}`));
    const dl=elm('dl');for(const [k,n] of Object.entries({id:'업무',org_id:'소속',site_id:'사업장',quote_id:'견적',order_id:'주문',delivery_id:'납품',document_id:'문서',settlement_id:'정산'}))if(c[k])dl.append(elm('dt',n),elm('dd',c[k]));el.append(dl);
    const history=elm('details');history.append(elm('summary','처리 이력'));const lines=elm('ol');for(const e of reply.events)lines.append(elm('li',`${e.revision}. ${name(e.action)} · ${name(e.next_state)}${e.reason_code?' · '+name(e.reason_code):''}`));history.append(lines);el.append(history);
    if(c.evidenceId||c.actions.includes('attach')){const editor=elm('div');el.append(editor);disposeEvidence=createEvidenceEditor({container:editor,caseId:c.id,kind:c.kind,csrf,evidenceId:c.evidenceId,readOnly:!c.actions.includes('attach'),onError:show,onReceipt:evidenceId=>save({caseId:c.id,action:'attach',expectedRevision:c.revision,evidenceId})});}
    if(c.actions.length){const f=elm('form'),act=field(f,'다음 처리','action',c.actions.map(a=>[a,name(a)])),extra=elm('div');f.append(extra);function inputs(){extra.replaceChildren();if(act.value==='attach')field(extra,'검사 완료 증빙 ID','evidenceId');if(['supplement','reject','revoke','report-issue'].includes(act.value))field(extra,'사유','reason',['MISSING_EVIDENCE','SCOPE_MISMATCH','INVALID_DETAILS','DELIVERY_EXCEPTION','REVIEW_DECISION'].map(r=>[r,name(r)]));}act.onchange=inputs;inputs();f.append(elm('button','선택한 처리 확인'));f.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));save({...d,caseId:c.id,expectedRevision:c.revision});};el.append(f);}
  }catch(e){elements.detail.replaceChildren();error(e);}}
  $('more').onclick=()=>load(true);$('refresh').onclick=()=>load();
  window.addEventListener('pageshow',async()=>{elements.list.replaceChildren();elements.detail.replaceChildren();elements.create.hidden=true;try{csrf=(await api('/api/ia/auth/me')).csrf||'';await load();}catch(e){error(e);}});
  window.addEventListener('pagehide',()=>{disposeEvidence();generation++;activeId='';csrf='';pending=null;elements.list.replaceChildren();elements.detail.replaceChildren();elements.create.hidden=true;});
}
export function renderR3RolePage(nonce){
  if(!/^[a-f0-9]{16,128}$/i.test(nonce))throw Error('INVALID_NONCE');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>역할별 업무 · Order QA</title><style>:root{font-family:system-ui,sans-serif;color:#18232a;background:#fff}body{max-width:62rem;margin:auto;padding:clamp(1rem,4vw,3rem)}nav,.actions,form{display:flex;flex-wrap:wrap;align-items:end;gap:.75rem}main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:2rem}header{margin:1.8rem 0}section{min-width:0}h1{font-size:1.8rem}button,input,select{font:inherit;min-height:44px;max-width:100%;box-sizing:border-box}button{cursor:pointer}form{margin:1rem 0}form[hidden]{display:none}form div{display:contents}label{display:grid;gap:.3rem;max-width:100%}ul{padding:0;list-style:none}li{margin:.6rem 0;overflow-wrap:anywhere}li small{display:block;margin-top:.3rem}dl{display:grid;grid-template-columns:max-content 1fr;gap:.4rem .8rem}dd{margin:0;overflow-wrap:anywhere}summary{cursor:pointer;min-height:44px}a{color:#22579b}p:empty{display:none}@media(max-width:640px){main{grid-template-columns:minmax(0,1fr)}}:focus-visible{outline:3px solid Highlight;outline-offset:2px}</style><body><nav><a href="/ia?view=qa-lab">QA랩</a><a href="/ia?view=pricing-r3#quote">가격·배송 설정</a></nav><header><h1>역할별 업무</h1><small>비공개 업무 검토</small></header><p role="status" id="status"></p><section id="r3-practice"></section><main><section><h2>내 업무</h2><button type="button" id="refresh">새로고침</button><form id="create" hidden></form><ul id="list"></ul><button type="button" hidden id="more">다음 50건</button></section><section id="detail" aria-live="polite"></section></main><script nonce="${nonce}">(${browserFunction(runRolePage)})(${JSON.stringify(labels)},${browserFunction(createEvidenceEditor)});(${browserFunction(startRolePractice)})(document.getElementById("r3-practice"),${JSON.stringify(practiceCatalog())},${JSON.stringify(labels)})</script></body></html>`;
}
