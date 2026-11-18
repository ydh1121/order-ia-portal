// Project the existing product reference into the offline QA runtime. The snapshot
// contains holidays only; there is no supplier or operator availability calendar here.
export function consultationDate(env, root, source) {
  const trigger=root.querySelector('[data-action="choose-consult-date"]');
  if(!trigger)return;
  const dialog=root.querySelector('.consult-date-dialog'), grid=dialog.querySelector('.qa-calendar-grid'), title=dialog.querySelector('h2');
  dialog.dataset.r3Popup='';
  const holidays=new Map(source.records.map(row=>[row.date,row.name]));
  const clock=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=Object.fromEntries(clock.formatToParts(new Date()).map(part=>[part.type,part.value]));
  const today=[parts.year,parts.month,parts.day].join('-');
  const key=(year,month,day)=>[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
  const initial=today.split('-').map(Number);
  let year=initial[0],month=initial[1],chosen='';
  function paint(shouldFocus=true){
    title.textContent=year+'년 '+month+'월';
    grid.replaceChildren();
    const first=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
    for(let i=0;i<first;i++)grid.append(document.createElement('span'));
    const last=new Date(Date.UTC(year,month,0)).getUTCDate();
    for(let day=1;day<=last;day++){
      const value=key(year,month,day),weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay(),holiday=holidays.get(value);
      const b=document.createElement('button');b.type='button';b.textContent=day;b.dataset.day=value;
      b.disabled=value<today||!source.coverage.includes(year)||weekday===0||weekday===6||holidays.has(value);
      b.setAttribute('aria-label',value+(holiday?' '+holiday:''));b.setAttribute('aria-pressed',String(chosen===value));
      if(value===today)b.setAttribute('aria-current','date');
      if(holiday)b.title=holiday;
      grid.append(b);
    }
    dialog.querySelector('[data-action="previous-month"]').disabled=key(year,month,1)<=today.slice(0,7)+'-01';
    dialog.querySelector('[data-action="next-month"]').disabled=year>Math.max(...source.coverage)||year===Math.max(...source.coverage)&&month===12;
    const firstEnabled=grid.querySelector('button:not(:disabled)');if(shouldFocus)(firstEnabled||dialog.querySelector('[data-action="cancel-date"]')).focus();
  }
  const restored=new MutationObserver(()=>{if(!dialog.hidden&&!grid.childElementCount)paint(false);});
  restored.observe(dialog,{attributes:true,attributeFilter:['hidden']});
  env.addEventListener('abort',()=>restored.disconnect(),{once:true});
  function close(){dialog.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    const a=b.dataset.action;
    if(a==='choose-consult-date'){dialog.hidden=false;trigger.setAttribute('aria-expanded','true');paint();}
    if(a==='previous-month'||a==='next-month'){
      const d=new Date(Date.UTC(year,month-1+(a==='previous-month'?-1:1),1));year=d.getUTCFullYear();month=d.getUTCMonth()+1;paint();
    }
    if(a==='cancel-date')close();
    if(b.dataset.day&&grid.contains(b)){chosen=b.dataset.day;trigger.querySelector('strong').textContent=chosen;close();}
  },{signal:env});
  dialog.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
    if(e.key==='Tab'){const bs=[...dialog.querySelectorAll('button:not(:disabled)')];if(e.shiftKey&&e.target===bs[0]){e.preventDefault();bs.at(-1).focus();}else if(!e.shiftKey&&e.target===bs.at(-1)){e.preventDefault();bs[0].focus();}}
    if(!e.target.dataset.day)return;
    const steps={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};const step=steps[e.key];if(!step)return;
    e.preventDefault();const nodes=[...grid.querySelectorAll('button')];
    let i=nodes.indexOf(e.target)+step;
    while(i>=0&&i<nodes.length&&nodes[i].disabled)i+=step;
    nodes[i]?.focus();
  },{signal:env});
}
