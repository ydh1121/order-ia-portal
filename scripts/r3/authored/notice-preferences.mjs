// Fixture preferences live in the authenticated QA shell for the life of its tab.
// No email, note, identity or production consent event is transferred.
export function connectNoticePreferences(){
  let channel=null,artifact=null,flags=[false,false,false];
  const signup=()=>document.querySelector('.terms-page [name="terms-check"]');
  const allowed=value=>Array.isArray(value)&&value.length===3&&value.every(x=>typeof x==='boolean');
  function reflect(){
    const all=signup();
    if(all){all.checked=flags[1]&&flags[2];all.indeterminate=flags[1]!==flags[2];}
    for(const [index,flag] of flags.entries()){
      const control=document.querySelector('.profile-page [data-action="notice-'+(index+1)+'"]');
      if(control){control.setAttribute('aria-checked',String(flag));control.lastElementChild.textContent=flag?'켬':'끔';}
    }
  }
  function save(){
    if(!channel||!artifact)return;
    parent.postMessage({scope:'ORDER_R3_FRAME',channel,artifact,type:'setNoticeFixture',payload:flags.slice()},'*');
    reflect();
  }
  addEventListener('message',e=>{
    const m=e.data;
    if(e.source!==parent||m?.scope!=='ORDER_R3_HOST'||m.type!=='noticeFixture'||!allowed(m.payload)||typeof m.channel!=='string'||typeof m.artifact!=='string')return;
    channel=m.channel;artifact=m.artifact;flags=m.payload.slice();reflect();document.documentElement.dataset.noticeReady='true';
  });
  document.addEventListener('change',e=>{if(channel&&e.target===signup()){flags=[flags[0],e.target.checked,e.target.checked];save();}});
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!channel||!b)return;
    const match=/^notice-([1-3])$/.exec(b.dataset.action||'');
    if(match&&b.closest('.profile-page')){e.stopImmediatePropagation();const k=Number(match[1])-1;flags[k]=!flags[k];save();return;}
    if(b.dataset.action==='open-notice-settings'){
      e.stopImmediatePropagation();parent.postMessage({scope:'ORDER_R3_FRAME',channel,artifact,type:'navigate',payload:{screen:'profile',state:'notification'}},'*');return;
    }
    if(b.closest('.profile-page'))queueMicrotask(reflect);
  },true);
}
