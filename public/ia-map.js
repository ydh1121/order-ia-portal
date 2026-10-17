'use strict';
/* Unprivileged rendering code. Private screen/policy rows and historical graph arrive only via authenticated OWNER API. */
(()=>{
const el=(t,c,v)=>{const n=document.createElement(t);if(c)n.className=c;if(v!==undefined)n.textContent=String(v);return n};
const put=(n,...children)=>{n.append(...children);return n};
const h=(title,desc)=>put(el('div','map-heading'),el('h3','',title),el('p','',desc));
const pill=x=>el('span','map-pill',x);
let data,openScreen,openView;
const graph=()=>data.iaMap,screen=id=>data.screens.items.find(x=>x.screenId===id);
const jump=(id,label)=>{const n=el('button','map-jump',label||id+' · '+(screen(id)?.name||'UNKNOWN'));n.type='button';n.disabled=!screen(id);n.onclick=()=>openScreen(id);return n};
const message='화면명·상태·승인 결과는 인증된 현재 Google 원장 기준입니다. 연결/개발 단계는 원본 IA v0.3 기획 참고이며 실제 기능 구현·사용자 승인이 아닙니다.';
const foot=()=>el('p','map-source',message);
const setView=(s,role)=>{openView(s,role)};
function overview(){
 const root=el('div','map-view');root.append(h('전체 IA 구조 · 실제 원장 연결','고객·공급자·관리자 화면을 탐색합니다. 연결은 v0.3 계획 기준입니다.'));
 const stats=el('div','map-stats');
 for(const [t,n,to] of [['화면 원장',76,'sitemap'],['검토 대장',25,'policy'],['사업 단계',7,'roadmap'],['의견 기록',data.notes.items.length,'notes']]){
 const b=el('button','map-stat');put(b,el('strong','',n),el('span','',t),el('small','','열기 →'));b.onclick=()=>setView(to);stats.append(b)}
 root.append(stats,h('고객 주요 흐름','각 화면을 누르면 현재 원장 상세 및 관련 화면을 볼 수 있습니다.'));
 const path=el('div','map-chain');for(const id of ['F00','F17','F01','F07','F06','F02','F03']){if(path.childElementCount)path.append(el('span','map-arrow','→'));path.append(jump(id))}root.append(path);
 const warning=el('p','map-warning','가격 공개와 사업자서류 등 운영 조건은 최신 검토 대장 기준으로 판단하며, 일부 승인과 최종 구현·LOWFI 승인을 구분합니다.');root.append(warning);
 const roles=el('div','map-role-cards');for(const f of graph().families){const n=el('button','map-role-card');put(n,el('b','',f.name),pill(f.groups.reduce((a,g)=>a+g.ids.length,0)+'개'),el('small','',f.subtitle));n.onclick=()=>setView('sitemap',f.code);roles.append(n)}
 root.append(h('역할별 분류','v0.3 기준 다섯 역할, 현재 원장의 76 ScreenID 검증'),roles,foot());return root
}
function sitemap(focusRole){
 const root=el('div','map-view');root.append(h('전체 사이트맵 · 계층형 트리','역할 → 기능군 → 화면. 개별 접기·펼치기, 전체 접기/펼치기, 검색·IA 단계 필터를 제공합니다.'));
 const bar=el('div','map-controls'),search=el('input','map-input'),role=el('select','map-input'),wave=el('select','map-input');
 search.type='search';search.placeholder='화면 ID·이름 검색';search.setAttribute('aria-label','사이트맵 검색');
 const opt=(s,l)=>{const o=el('option','',l);o.value=s;return o};
 role.append(opt('all','모든 역할'));for(const f of graph().families)role.append(opt(f.code,f.name));role.value=focusRole||'all';role.setAttribute('aria-label','역할 필터');
 wave.append(opt('all','모든 단계'));for(let n=0;n<=6;n++)wave.append(opt('R'+n,'IA-R'+n));wave.setAttribute('aria-label','IA 단계 필터');
 const expand=el('button','map-control-button','모두 펼치기'),collapse=el('button','map-control-button','모두 접기'),count=el('p','map-count'),tree=el('div','map-tree');
 put(bar,search,role,wave,expand,collapse);root.append(bar,count,tree,foot());
 function draw(){tree.replaceChildren();let total=0;const q=search.value.trim().toLocaleLowerCase('ko-KR');
 for(const family of graph().families){if(role.value!=='all'&&role.value!==family.code)continue;const familyEl=el('details','map-family');familyEl.open=true;let familyCount=0;
 for(const group of family.groups){const ids=group.ids.filter(id=>{const x=screen(id);return x&&(wave.value==='all'||graph().related[id]?.wave===wave.value)&&[id,x.name,x.details,group.name].some(v=>String(v||'').toLocaleLowerCase('ko-KR').includes(q))});
 if(!ids.length)continue;familyCount+=ids.length;const d=el('details','map-group');d.open=true;
 put(d,put(el('summary'),el('strong','',group.name),pill(ids.length+'개')));
 const leaves=el('div','map-leaves');for(const id of ids){const x=screen(id),b=el('button','map-leaf');put(b,el('b','',id),el('span','',x.name),el('small','',x.status||'검증 안 됨'));b.onclick=()=>openScreen(id);leaves.append(b)}d.append(leaves);familyEl.append(d)}
 if(!familyCount)continue;total+=familyCount;familyEl.prepend(put(el('summary'),el('strong','',family.name),pill(familyCount+'개'),el('small','',family.subtitle)));tree.append(familyEl)}
 count.textContent='표시 '+total+' / 76개 · 화면명과 상태는 Google 원장';if(!total)tree.append(el('p','map-empty','일치하는 화면이 없습니다.'))}
 for(const [n,event] of [[search,'input'],[role,'change'],[wave,'change']])n.addEventListener(event,draw);
 expand.onclick=()=>{for(const n of tree.querySelectorAll('details'))n.open=true};collapse.onclick=()=>{for(const n of tree.querySelectorAll('details'))n.open=false};
 draw();return root
}
function journey(){
 const root=el('div','map-view');root.append(h('고객 여정 · 세로 경로','원본 v0.3에 명시된 경로와 예외 노드를 현재 화면으로 연결합니다. 연결 관계는 기획 참고입니다.'));
 const routeNames={basic:'기본 경로',store:'다른 매장',nooffer:'가격 없음',nego:'가격 네고',doc:'서류 보완',all:'전체 보기'},tabs=el('div','map-tabs'),wrap=el('div','map-journey'),g=graph().journey;
 let current='basic';
 for(const [name,title] of Object.entries(routeNames)){const b=el('button','map-tab',title);b.dataset.path=name;b.setAttribute('aria-pressed',String(name===current));b.onclick=()=>{current=name;draw()};tabs.append(b)}
 function draw(){wrap.replaceChildren();for(const b of tabs.querySelectorAll('button')){const v=b.dataset.path===current;b.classList.toggle('selected',v);b.setAttribute('aria-pressed',String(v))}
 const show=current==='all'?new Set([...g.steps,...g.branches].map(x=>x.key)):new Set(g.paths[current]||[]);
 const core=el('ol','map-timeline');g.steps.forEach((n,i)=>{const li=el('li','map-step'+(!show.has(n.key)?' dim':''));put(li,el('span','map-num',String(i+1).padStart(2,'0')),jump(n.id),el('p','',n.desc));if(i<g.steps.length-1)li.append(el('small','map-flow-arrow','↓ 계획상 다음 단계'));core.append(li)});
 const branch=el('div','map-branches');branch.append(h('조건·예외·운영 의존','현재 선택 경로의 분기 화면'));
 const keys=new Map([...g.steps,...g.branches].map(n=>[n.key,n]));let n=0;
 for(const x of g.branches){if(!show.has(x.key))continue;const b=el('article','map-branch');put(b,pill(x.kind==='ops'?'운영 연결':'예외 경로'),jump(x.id),el('p','',x.desc));
 const links=el('div','map-links');for(const e of g.edges.filter(e=>e[0]===x.key||e[1]===x.key)){const other=keys.get(e[0]===x.key?e[1]:e[0]);if(other)links.append(jump(other.id,other.id))}b.append(links);branch.append(b);n++}
 if(!n)branch.append(el('p','map-empty','해당 경로의 별도 예외가 없습니다.'));wrap.append(core,branch)}
 root.append(tabs,wrap,h('원본 v0.3 예외 상황 10건','현재 ScreenID 상세로 이동합니다.'));const cases=el('div','map-scenarios');
 for(const x of g.scenarios){const b=el('article','map-card');put(b,el('h4','',x.title),el('p','',x.description),jump(x.screenId));cases.append(b)}root.append(cases,foot());draw();return root
}
function operations(){const root=el('div','map-view');root.append(h('고객 ↔ 공급자 ↔ 관리자 운영 연결','실제 원본 v0.3에 기록된 운영 의존 8건입니다. 각 화면 번호를 누르면 현재 Google 원장 상세로 이동합니다.'));
 const grid=el('div','map-grid');for(const x of graph().operations){const card=el('article','map-card');put(card,el('h4','',x.title),el('p','',x.description));const path=el('div','map-chain');for(const id of x.ids){if(path.childElementCount)path.append(el('span','map-arrow','→'));path.append(jump(id))}card.append(path,el('small','map-muted','v0.3 기획 연결 · 실제 운영 구현 여부는 화면별 QA 확인'));grid.append(card)}root.append(grid,foot());return root}
function policy(){const root=el('div','map-view');root.append(h('승인 정책 · 향후 검토','원장의 상태값만 승인 판단에 사용합니다. 일부 핵심요건 승인과 운영 세부 검토는 완전 승인이 아닙니다.'));
 const stat=el('div','map-stats');for(const [t,n] of [['전체 항목',data.decisions.total],['검토 항목',data.decisions.active],['완전 승인',data.decisions.fullyApproved]])put(stat,put(el('div','map-stat-static'),el('span','',t),el('strong','',n)));root.append(stat);
 const featured=[data.decisions.items.find(x=>x.isFullyApproved),data.decisions.items.find(x=>!x.isFullyApproved&&x.status.includes('운영세부'))].filter(Boolean);
 for(const d of featured){const article=el('article','map-policy-feature');put(article,pill(d.id),el('h4','',d.name),el('p','',d.question),el('strong','',d.status),el('p','map-muted',d.isFullyApproved?'정책 승인 · 실제 화면 구현/LOWFI 승인과 별개':'운영 세부 검토 중 · 자동 완전 승인 금지'));const links=el('div','map-links');for(const id of graph().policyLinks[d.id]||[])links.append(jump(id));article.append(links);root.append(article)}
 const list=el('div','map-policy-list');for(const d of data.decisions.items){const details=el('details','map-policy-row');put(details,put(el('summary'),pill(d.id),el('strong','',d.name),el('span','map-state'+(d.isFullyApproved?' approved':''),d.status)));const body=el('div','map-policy-body');put(body,el('p','',d.question),el('small','map-muted','구현: '+d.implementation+' · 사용자 메모 ≠ 최종 승인'));const links=el('div','map-links');for(const id of graph().policyLinks[d.id]||[])links.append(jump(id));body.append(links.childElementCount?links:el('small','map-muted','확인 가능한 관련 화면: UNKNOWN'));details.append(body);list.append(details)}root.append(h('25개 원장 검토 카드','각 항목은 Google Sheets에서 읽습니다.'),list,foot());return root}
function enrichRoadmap(host){if(!data?.iaMap)return;host.append(h('IA 개발 단계 R0~R6 · 원본 v0.3 참고','상단 사업 Stage0~6은 Google 최신 원장입니다. 아래 기술 구분은 오래된 기획 참고 자료이며 개발 완료 증거가 아닙니다.'));
 const grid=el('div','map-grid');for(const x of graph().technical){const card=el('article','map-card');put(card,pill(x.code),el('h4','',x.name),el('p','',x.details),el('small','map-muted','v0.3 당시 상태: '+x.historicalState));grid.append(card)}host.append(grid,foot())}
function mapDetail(host,x){if(!data?.iaMap)return;const rel=graph().related[x.screenId];if(!rel)return;
 const box=el('section','map-detail');box.append(h('연결된 화면 · 이동','v0.3 '+rel.wave+' 기획 연결 / 현재 ScreenID 검증 완료'));
 for(const [title,links] of [['화면 동작',rel.actions.map(a=>[a.target,a.label+' → '+a.target])],['운영 관련',rel.related.map(id=>[id,undefined])]]){
 if(!links.length)continue;box.append(el('h4','',title));const path=el('div','map-links');for(const [id,label] of links)path.append(jump(id,label));box.append(path)}
 if(!rel.actions.length&&!rel.related.length)box.append(el('p','map-muted','확인된 연결: UNKNOWN. 임의 관계는 만들지 않습니다.'));
 const decisions=data.decisions.items.filter(d=>(graph().policyLinks[d.id]||[]).includes(x.screenId));if(decisions.length){box.append(el('h4','','관련 정책'));for(const d of decisions){const b=el('button','map-detail-policy',d.id+' · '+d.name);b.onclick=()=>openView('policy');box.append(b)}}
 const count=data.notes.items.filter(n=>n.screenOrDecisionId===x.screenId).length;box.append(el('p','map-muted','원장 연결 의견 '+count+'건 · 읽기 전용 / 승인 아님'));host.append(box)}
function bind(payload,callbacks){data=payload;openScreen=callbacks.openScreen;openView=callbacks.openView}
function render(section,payload,target,callbacks){bind(payload,callbacks);const route={overview,sitemap,journey,operation,policy};if(!data.iaMap){target.append(el('p','map-empty','기획 연결 자료를 확인할 수 없습니다.'));return}if(route[section])target.append(route[section]());else target.append(el('p','map-empty','선택된 화면을 표시할 수 없습니다.'))}
window.iaMap={bind,render,mapDetail,enrichRoadmap};
})();
