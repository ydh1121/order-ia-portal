import {caseKinds,creatorRole,transitions} from './r3-role-rules.mjs';
// Build the practice menu from the same transition rules used by the signed server handler.
export function practiceCatalog(){return Object.fromEntries(caseKinds.map(kind=>{
  const states={},pending=['DRAFT'];while(pending.length){const state=pending.pop();if(Object.hasOwn(states,state))continue;states[state]=transitions(kind,state);for(const rule of states[state])pending.push(rule.next);}
  return [kind,{creator:creatorRole(kind),states}];
}));}
export function startRolePractice(host,catalog,labels){
  const make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const choose=(label,options)=>{const l=make('label',label),s=make('select');for(const [value,text] of options)s.append(new Option(text,value));l.append(s);return [l,s];};
  const btn=(label,on)=>{const b=make('button',label);b.type='button';b.onclick=on;return b;};
  const detail=make('details'),title=make('summary','역할별 시나리오 체험');detail.append(title,make('p','예시 데이터로 매장·공급처·운영의 인계를 검토합니다. 창을 닫으면 연습 내역이 지워집니다.'));
  const [kl,kind]=choose('검토 업무',Object.keys(catalog).map(k=>[k,labels[k]]));const [rl,role]=choose('체험 역할',['BUYER','OPERATOR','SUPPLIER'].map(k=>[k,labels[k]]));
  const workspace=make('div'),jobs=make('div'),audit=make('ol');let c,rev=0,unsaved=false;
  const seed=()=>{c={state:'DRAFT',id:crypto.randomUUID().slice(0,8),history:[],kind:kind.value};rev=0;role.value=catalog[c.kind].creator;unsaved=false;render();};
  function render(){workspace.replaceChildren(make('h3',`${labels[c.kind]} · ${labels[c.state]}`),make('p',`예시 업무 ${c.id} · ${rev+1}판`));jobs.replaceChildren();
    const next=catalog[c.kind].states[c.state];const permitted=next.filter(r=>r.role===role.value);if(!permitted.length&&next.length)jobs.append(make('p',next.map(r=>labels[r.role]).filter((s,i,a)=>a.indexOf(s)===i).join(' / ')+' 담당자의 처리를 기다립니다.'));
    for(const r of permitted){const expected=rev;jobs.append(btn(labels[r.action],()=>{if(expected!==rev)return;c.history.push(`${labels[role.value]} · ${labels[r.action]} → ${labels[r.next]}`);c.state=r.next;rev++;unsaved=true;render();}));}
    audit.replaceChildren(...c.history.map(h=>make('li',h)));}
  const run=btn('새 예시 시작',seed);kind.onchange=()=>{if(unsaved)jobs.replaceChildren(make('p','새 예시를 시작하면 기존 체험 내역이 지워집니다.'),btn('새 예시 시작',seed),btn('이전 예시 계속',()=>{kind.value=c.kind;render();}));else seed();};role.onchange=()=>{kind.value=c.kind;render();};detail.append(kl,rl,run,workspace,jobs,audit);const a=make('a','예시 가격·배송비 검토');a.href='/ia?view=pricing-r3&practice=1';detail.append(a);host.append(detail);seed();
}
