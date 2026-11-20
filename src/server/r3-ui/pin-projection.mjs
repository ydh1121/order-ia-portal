// Display-only adaptation for the released, frozen frame controller. The host
// checks screen/state/variant/width before sending these messages. Stored comment
// anchors and source hashes are never rewritten. "legacy" is a cache key for the
// host-selected previous document, not a fabricated artifact hash.
export function installPinProjection(session) {
  if (window === parent) return;
  const root=document.querySelector('#order-single');
  if (!root) return;
  const fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
  const stable=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','aria-controls','aria-label','data-provider'];
  const sources=new Map();
  const proxies=new Map();
  let current=null,stamp='',disposed=false,proxyCounter=0,usedProxies=null,notificationFrame=0,activePins=false;
  const text=value=>String(value??'').replace(/\s+/g,' ').trim();
  const tag=value=>typeof value==='string'?value.toLowerCase():'';
  const coordinate=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
  const scrollValue=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const sourceKey=value=>typeof value==='string'&&(value==='legacy'||/^[a-f0-9]{64}$/.test(value));
  const identity=()=>JSON.stringify([session.channel,session.artifact,session.screen,session.state,session.variant]);
  function clear(){
    if(notificationFrame)cancelAnimationFrame(notificationFrame);notificationFrame=0;
    sources.clear();for(const proxy of proxies.values())proxy.remove();proxies.clear();
    current=null;activePins=false;stamp=identity();
  }
  function fingerprint(el){return [el.localName,...fields.map(name=>el.getAttribute(name)||'')].join('|');}
  function hash(value){let h=2166136261;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(36);}
  function index(node){
    const byId=new Map([['screen',node]]),ids=new WeakMap([[node,'screen']]),paths=new WeakMap(),buckets=new Map();
    const elements=[];
    for(const el of node.querySelectorAll('*')){
      if(el.parentElement?.closest('svg')||['STYLE','SCRIPT','META'].includes(el.tagName))continue;
      const path=(paths.get(el.parentElement)||'screen')+'/'+fingerprint(el);paths.set(el,path);
      const id='a-'+hash(path);if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(el);
      if(!el.hasAttribute('data-order-pin-proxy'))elements.push(el);
    }
    for(const [id,els] of buckets)if(els.length===1){byId.set(id,els[0]);ids.set(els[0],id);}
    return {root:node,byId,ids,paths,elements};
  }
  function notifyChanged(){
    if(disposed||notificationFrame)return;
    const requestedIdentity=identity();
    notificationFrame=requestAnimationFrame(()=>{
      notificationFrame=0;if(disposed||requestedIdentity!==identity())return;
      parent.postMessage({scope:'ORDER_R3_FRAME',channel:session.channel,artifact:session.artifact,type:'pinProjectionChanged',payload:{}},'*');
    });
  }
  function changed(){current=null;notifyChanged();}
  const motionEvents=['animationend','animationcancel','transitionend','transitioncancel'];
  function motionSettled(event){
    if(!activePins||disposed||stamp!==identity()||!root.contains(event.target))return;
    // A settled transform changes geometry, not the released identity index.
    // Attribute-only class changes must not create ids absent from the frozen
    // controller, which also reindexes only on childList/identity resets.
    notifyChanged();
  }
  const observer=new MutationObserver(changed);
  observer.observe(root,{childList:true,subtree:true});
  function currentIndex(){
    if(observer.takeRecords().length)changed();
    return current||(current=index(root));
  }
  function unique(list){return list.length===1?list[0]:null;}
  function sameTag(a,b){return a?.localName===b?.localName;}
  function byTag(data,el){return data.elements.filter(other=>sameTag(el,other));}
  function classes(el){return [...el.classList].sort().join(' ');}
  function sameStructure(a,b){
    const clean=node=>{const copy=node.cloneNode(true);copy.querySelectorAll('[data-order-pin-proxy],.r3-options').forEach(el=>el.remove());return copy;};
    return clean(a).isEqualNode(clean(b));
  }
  function displayId(el,target){
    const existing=target.ids.get(el);if(existing)return existing;
    let proxy=proxies.get(el);
    if(!proxy||!root.contains(proxy)){
      proxy=document.createElement('span');
      do{proxy.id='__order_qa_pin_projection_'+(++proxyCounter);}while(document.getElementById(proxy.id));
      proxy.setAttribute('data-order-pin-proxy','');proxy.setAttribute('aria-hidden','true');proxy.hidden=true;
      proxy.style.cssText='display:none!important;width:0!important;height:0!important;pointer-events:none!important';
      const present=()=>root.contains(el)&&el.isConnected;
      proxy.getClientRects=()=>present()?el.getClientRects():[];
      proxy.getBoundingClientRect=()=>present()?el.getBoundingClientRect():{x:0,y:0,left:0,top:0,width:0,height:0,right:0,bottom:0};
      proxy.focus=options=>{if(present())el.focus?.(options);};
      proxy.scrollTo=(...args)=>{if(present())el.scrollTo?.(...args);};
      const matches=proxy.matches.bind(proxy);
      proxy.matches=selector=>['details','[data-r3-popup]'].includes(selector)?el.matches(selector):matches(selector);
      Object.defineProperty(proxy,'open',{get:()=>el.open,set:value=>{el.open=value;},configurable:true});
      if(el.matches('[data-r3-popup]'))Object.defineProperty(proxy,'hidden',{get:()=>el.hidden,set:value=>{el.hidden=value;},configurable:true});
      proxies.set(el,proxy);root.append(proxy);current=null;
    }
    usedProxies?.add(el);
    return currentIndex().ids.get(proxy)||null;
  }
  function hasIdentity(el,boundary){
    for(let node=el;node&&node!==boundary;node=node.parentElement){
      if(fields.some(name=>name!=='role'&&text(node.getAttribute(name))))return true;
    }
    return false;
  }
  function mapElement(el,source,target,allowIcon=true){
    if(!el)return null;
    if(el===source.root)return sameStructure(el,target.root)?target.root:null;
    const oldId=source.ids.get(el),exact=oldId&&target.byId.get(oldId);
    const label=text(el.textContent);
    // Compare the full fingerprint path as well as its short hash. Empty icons
    // remain identifiable through the fingerprinted action/structure around them.
    if(exact&&source.paths.get(el)===target.paths.get(exact)&&
      (hasIdentity(el,source.root)||(label&&label===text(exact.textContent))))return exact;
    const oldPeers=byTag(source,el),newPeers=byTag(target,el),matches=new Set();
    for(const name of stable){
      const value=el.getAttribute(name);if(!value)continue;
      if(unique(oldPeers.filter(other=>other.getAttribute(name)===value))!==el)continue;
      const match=unique(newPeers.filter(other=>other.getAttribute(name)===value));if(match)matches.add(match);
    }
    if(matches.size>1)return null; // Contradictory identities must not be guessed.
    if(matches.size===1)return [...matches][0];
    if(el.localName==='label'){
      const forId=el.getAttribute('for');
      const controls=forId?source.elements.filter(other=>other.id===forId&&other.matches('input,select,textarea')):
        [...el.querySelectorAll('input,select,textarea')];
      const control=unique(controls),destination=control&&mapElement(control,source,target,false);
      const labels=(data,input)=>data.elements.filter(other=>other.localName==='label'&&
        (other.contains(input)||(input.id&&other.getAttribute('for')===input.id)));
      if(destination&&unique(labels(source,control))===el){
        const match=unique(labels(target,destination));if(match)return match;
      }
    }
    const ownClasses=classes(el);
    if(ownClasses&&unique(oldPeers.filter(other=>classes(other)===ownClasses))===el){
      const match=unique(newPeers.filter(other=>classes(other)===ownClasses));if(match)return match;
    }
    if(label&&unique(oldPeers.filter(other=>text(other.textContent)===label))===el){
      const match=unique(newPeers.filter(other=>text(other.textContent)===label));if(match)return match;
    }
    if(allowIcon&&['svg','img','canvas'].includes(el.localName)){
      for(let owner=el.parentElement;owner&&owner!==source.root;owner=owner.parentElement){
        if(!owner.matches('button,a,label,[data-action],[data-mf-go],[data-op-route]'))continue;
        const destination=mapElement(owner,source,target,false);if(!destination)continue;
        const children=node=>[...node.querySelectorAll(el.localName)].filter(child=>
          (node===owner?source:target).ids.has(child));
        if(unique(children(owner))!==el)continue;
        const match=unique(children(destination));if(match)return match;
      }
    }
    return null;
  }
  function atPath(data,path){
    if(typeof path!=='string')return null;
    path=path.trim();if(path==='#order-single'||path===':scope')return data.root;
    path=path.replace(/^(?:#order-single|:scope)\s*>\s*/,'');
    // Walk direct children so QA-only proxies and native-select mirrors do not
    // change the original recorder's nth-of-type positions.
    if(!path)return null;
    let nodes=[data.root];
    for(const part of path.split(/\s*>\s*/)){
      const match=/^([a-z][a-z0-9-]*)(?::nth-of-type\(([1-9]\d*)\))?$/i.exec(part);if(!match)return null;
      nodes=nodes.flatMap(node=>{
        const children=[...node.children].filter(el=>el.localName===match[1].toLowerCase()&&!el.matches('[data-order-pin-proxy],.r3-options'));
        return match[2]?(children[Number(match[2])-1]?[children[Number(match[2])-1]]:[]):children;
      });
    }
    return unique(nodes);
  }
  function legacyLabelMatches(el,label){
    label=text(label);if(!label)return false;
    // These are recorded category labels, not the element's visible text.
    if(/^.+ \/ (제목|버튼|입력란|선택 영역)$/.test(label))return true;
    return label===text(el.textContent)||label===text(el.getAttribute('aria-label'));
  }
  function legacyElement(anchor,source,target){
    if(!anchor||typeof anchor!=='object'||!tag(anchor.tag))return null;
    if(source){
      const el=atPath(source,anchor.path);
      if(!el||el.localName!==tag(anchor.tag)||!legacyLabelMatches(el,anchor.label))return null;
      if(source.sourceHash===session.artifact){
        const exact=atPath(target,anchor.path);if(sameTag(el,exact))return exact;
      }
      return mapElement(el,source,target);
    }
    const label=text(anchor.label);
    if(!label||/^.+ \/ (제목|버튼|입력란|선택 영역)$/.test(label))return null;
    // Without the source document only a unique actual label+tag is evidence.
    return unique(target.elements.filter(el=>el.localName===tag(anchor.tag)&&
      (text(el.textContent)===label||text(el.getAttribute('aria-label'))===label)));
  }
  function mappedId(id,source,target){
    const el=source?.byId.get(id),mapped=el&&mapElement(el,source,target);
    return mapped&&displayId(mapped,target)||null;
  }
  function legacyScroll(anchor,source,target){
    const list=[];
    if(scrollValue(anchor.scrollTop))list.push({id:'document',x:0,y:anchor.scrollTop});
    if(source&&Array.isArray(anchor.nestedScroll))for(const entry of anchor.nestedScroll){
      if(!entry||!scrollValue(entry.top)||!scrollValue(entry.left))continue;
      const original=atPath(source,entry.path),mapped=original&&(source.sourceHash===session.artifact?atPath(target,entry.path):mapElement(original,source,target));
      const id=sameTag(original,mapped)&&mapped&&displayId(mapped,target);
      if(id&&id!=='screen')list.push({id,x:entry.left,y:entry.top});
    }
    return list;
  }
  function legacyLayers(anchor,source,target){
    if(!source||!Array.isArray(anchor.layers))return [];
    return anchor.layers.flatMap(layer=>{
      const path=typeof layer==='string'?layer:layer?.path,original=atPath(source,path);
      const mapped=original&&(source.sourceHash===session.artifact?atPath(target,path):mapElement(original,source,target));
      const id=sameTag(original,mapped)&&mapped&&displayId(mapped,target);
      return id?[id]:[];
    });
  }
  function nativeScroll(anchor,source,target){
    if(!Array.isArray(anchor.scroll))return [];
    return anchor.scroll.flatMap(entry=>{
      if(!entry||!scrollValue(entry.x)||!scrollValue(entry.y))return [];
      if(['document','host-surface','host-document'].includes(entry.id))return [{...entry}];
      const id=mappedId(entry.id,source,target);return id?[{...entry,id}]:[];
    });
  }
  function project(anchor,legacy,key,sameContent=false){
    if(!anchor||anchor.artifactHash!==session.artifact||anchor.instance!==session.screen)return anchor;
    // The host proves sameContent against artifact.source.contentHash. A new
    // review wrapper does not invalidate the original element identities.
    if(!legacy&&(!key||key===session.artifact||sameContent===true))return anchor;
    const target=currentIndex(),source=sourceKey(key)?sources.get(key):null;
    const x=legacy?legacy.x:anchor.x,y=legacy?legacy.y:anchor.y;
    const el=coordinate(x)&&coordinate(y)?(legacy?legacyElement(legacy,source,target):
      source&&mapElement(source.byId.get(anchor.id),source,target)):null;
    const id=el&&displayId(el,target);
    if(!id){
      // A removed old element can coincidentally share a current short id.
      // Keep unresolved display anchors outside the frame's valid id map.
      return {...anchor,id:target.byId.has(anchor.id)?'pin-unmapped:'+anchor.id:anchor.id};
    }
    return {...anchor,id,x,y,scroll:legacy?legacyScroll(legacy,source,target):nativeScroll(anchor,source,target),
      layers:legacy?legacyLayers(legacy,source,target):
        (Array.isArray(anchor.layers)?anchor.layers.flatMap(old=>{const id=mappedId(old,source,target);return id?[id]:[];}):[])};
  }
  function replacePayload(event,message,payload){
    // Shadow the event envelope instead of mutating the host's/source object's
    // nested data. All later listeners (frame and marker decoration) read this.
    Object.defineProperty(event,'data',{value:{...message,payload},configurable:true});
  }
  function onMessage(event){
    const message=event.data;
    if(disposed||event.source!==parent||message?.scope!=='ORDER_R3_HOST'||
      message.channel!==session.channel||message.artifact!==session.artifact)return;
    if(stamp!==identity())clear();
    if(message.type==='pin-sources'&&Array.isArray(message.payload)){
      for(const entry of message.payload){
        if(!entry||!sourceKey(entry.artifactHash)||typeof entry.html!=='string')continue;
        if(sources.has(entry.artifactHash)||entry.html.length>8*1024*1024||new Blob([entry.html]).size>8*1024*1024)continue;
        const doc=new DOMParser().parseFromString(entry.html,'text/html'),nodes=doc.querySelectorAll('#order-single');
        if(nodes.length===1)sources.set(entry.artifactHash,{...index(nodes[0]),sourceHash:/^[a-f0-9]{64}$/.test(entry.sourceHash||'')?entry.sourceHash:null});
      }
    }else if(message.type==='pins'&&Array.isArray(message.payload)){
      activePins=message.payload.some(pin=>pin?.anchor?.instance===session.screen&&pin.anchor.artifactHash===session.artifact);
      usedProxies=new Set();
      const pins=message.payload.map(pin=>{
        if(!pin||typeof pin!=='object')return pin;
        const anchor=project(pin.anchor,pin.legacyAnchor||pin.anchor?.legacy,pin.sourceArtifactHash||pin.anchor?.sourceArtifactHash,pin.sameContent===true||pin.anchor?.sameContent===true);
        return anchor===pin.anchor?pin:{...pin,anchor};
      });
      for(const [el,proxy] of proxies)if(!usedProxies.has(el)||!root.contains(el)){proxy.remove();proxies.delete(el);current=null;}
      usedProxies=null;
      replacePayload(event,message,pins);
    }else if(message.type==='restore'&&message.payload&&typeof message.payload==='object'){
      const anchor=message.payload;
      replacePayload(event,message,project(anchor,anchor.legacyAnchor||anchor.legacy,anchor.sourceArtifactHash,anchor.sameContent));
    }
  }
  function dispose(){
    disposed=true;observer.disconnect();clear();removeEventListener('message',onMessage);
    root.removeEventListener('r3-motion-identity-reset',clear);removeEventListener('pagehide',dispose);
    for(const type of motionEvents)root.removeEventListener(type,motionSettled,true);
  }
  clear();addEventListener('message',onMessage);
  root.addEventListener('r3-motion-identity-reset',clear);
  for(const type of motionEvents)root.addEventListener(type,motionSettled,true);
  addEventListener('pagehide',dispose,{once:true});
  return {dispose};
}
