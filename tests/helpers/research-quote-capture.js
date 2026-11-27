/* Read-only browser observation. Rectangles are native getBoundingClientRect /
 * Range.getClientRects values in CSS pixels. Pseudo-element placement and native
 * input glyph boxes are deliberately not invented; the companion Chrome
 * DOMSnapshot textBoxes and PNG retain their actual layout/paint evidence. */
async ({expected, label, captureMode = 'existing-QA-iframe-at-observed-scale-one'}) => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const root = document.getElementById('order-single');
  const app = window.ORDER_RESEARCH_APP;
  const snapshot = app?.snapshot();
  const inspector = root?.__orderResearchInspector?.inspect();
  const standalone = captureMode === 'existing-standalone-research-route';
  if (!standalone && captureMode !== 'existing-QA-iframe-at-observed-scale-one') throw Error('QUOTE_CAPTURE_MODE_UNKNOWN');
  if (!root || !snapshot || (!standalone && (!inspector?.active || inspector.pendingRoute))) throw Error('QUOTE_CAPTURE_NOT_READY');
  if (standalone && (window !== window.top || inspector)) throw Error('QUOTE_CAPTURE_EXPECTED_STANDALONE');
  for (const key of ['screen', 'state', 'variant', 'mode']) {
    const actual = standalone ? snapshot.route[key] : key === 'mode' ? inspector.session.mode || 'simple' : inspector.session[key];
    if (snapshot.route[key] !== expected.route[key] || actual !== expected.route[key]) throw Error('QUOTE_CAPTURE_ROUTE_MISMATCH:' + key);
  }
  if (snapshot.build !== expected.build || document.documentElement.dataset.productBuild !== expected.build || (!standalone && inspector.session.artifact !== expected.artifactHash)) throw Error('QUOTE_CAPTURE_SOURCE_MISMATCH');
  if (innerWidth !== expected.viewport.width || (!standalone && inspector.session.viewport !== innerWidth) || (standalone && innerHeight !== expected.viewport.height)) throw Error('QUOTE_CAPTURE_VIEWPORT_MISMATCH');
  if (standalone && (document.documentElement.dataset.productScreen !== expected.route.screen || document.documentElement.dataset.productState !== expected.route.state)) throw Error('QUOTE_CAPTURE_STANDALONE_DOM_MISMATCH');
  const round = number => Math.round(number * 10000) / 10000;
  const finiteJson = value => JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='number'&&!Number.isFinite(item)?String(item):item));
  const rect = value => ({x: round(value.x), y: round(value.y), width: round(value.width), height: round(value.height)});
  const properties = ['display','visibility','opacity','position','zIndex','boxSizing','width','height','minWidth','maxWidth','minHeight','maxHeight',
    'overflowX','overflowY','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft',
    'backgroundColor','backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat','backgroundClip',
    'borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
    'borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle','borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius',
    'boxShadow','color','fontFamily','fontSize','fontWeight','fontStyle','fontStretch','fontVariationSettings','fontFeatureSettings','lineHeight','letterSpacing','wordSpacing',
    'textAlign','textTransform','textDecorationLine','textDecorationColor','textDecorationStyle','textOverflow','whiteSpace','wordBreak','overflowWrap','direction',
    'transform','transformOrigin','filter','backdropFilter','clipPath','maskImage','mixBlendMode','isolation',
    'gap','rowGap','columnGap','alignItems','alignContent','justifyContent','flexDirection','flexWrap','gridTemplateColumns',
    'fill','fillOpacity','stroke','strokeWidth','strokeOpacity','strokeLinecap','strokeLinejoin','paintOrder','appearance','accentColor','pointerEvents'];
  const style = value => Object.fromEntries(properties.map(key => [key, value[key] || '']));
  const locator = element => {
    const parts=[];
    for(let node=element;node&&node.nodeType===1;node=node.parentElement){
      if(node.id){parts.unshift('#'+CSS.escape(node.id));break;}
      let segment=node.localName;
      const siblings=node.parentElement?[...node.parentElement.children].filter(item=>item.localName===node.localName):[];
      if(siblings.length>1)segment+=':nth-of-type('+(siblings.indexOf(node)+1)+')';
      parts.unshift(segment);
    }
    return parts.join(' > ');
  };
  const painted = element => {
    if (!element.getClientRects().length) return false;
    for(let node=element;node;node=node.parentElement){
      const css=getComputedStyle(node);
      if(node.hidden||css.display==='none'||['hidden','collapse'].includes(css.visibility)||Number(css.opacity)===0)return false;
    }
    return true;
  };
  const elements=[], texts=[], pseudo=[], svg=[], controls=[], images=[], canvases=[];
  const ids=new Map(), all=[root,...root.querySelectorAll('*')];
  for (const element of all) {
    if (['script','style','template','link','meta'].includes(element.localName) || element.closest('#r3-veil,#r3-pins,[data-research-inspector-panel]') || !painted(element)) continue;
    const bounds=element.getBoundingClientRect();if(!bounds.width||!bounds.height)continue;
    const id=elements.length, css=getComputedStyle(element), path=locator(element);
    ids.set(element,id);
    elements.push({id,parent:null,tag:element.localName,domId:element.id||null,classes:element.getAttribute('class')||'',selector:path,
      rect:rect(bounds),documentRect:rect({x:bounds.x+scrollX,y:bounds.y+scrollY,width:bounds.width,height:bounds.height}),
      viewportIntersection:bounds.right>0&&bounds.bottom>0&&bounds.left<innerWidth&&bounds.top<innerHeight,
      css:style(css),scroll:{left:element.scrollLeft,top:element.scrollTop,width:element.scrollWidth,height:element.scrollHeight,clientWidth:element.clientWidth,clientHeight:element.clientHeight},
      semantics:{role:element.getAttribute('role'),ariaLabel:element.getAttribute('aria-label'),ariaInvalid:element.getAttribute('aria-invalid'),ariaExpanded:element.getAttribute('aria-expanded'),ariaPressed:element.getAttribute('aria-pressed'),disabled:element.disabled===true,inert:element.inert===true},
      ...(element.localName==='dialog'?{dialog:{open:element.open,modal:element.matches(':modal'),backdropCss:style(getComputedStyle(element,'::backdrop'))}}:{})});
    for(const name of ['::before','::after','::marker']){
      const value=getComputedStyle(element,name);
      if(value.content&&value.content!=='none'&&value.content!=='normal'&&value.display!=='none')pseudo.push({owner:id,name,content:value.content,
        evidence:'computed-style-with-observed-owner-rect',pseudoBoundingClientRectObserved:false,ownerRect:rect(bounds),css:style(value)});
    }
    if (element.localName==='svg'&&!element.parentElement.closest('svg')) svg.push({owner:id,xml:element.outerHTML,viewBox:element.getAttribute('viewBox'),rect:rect(bounds)});
    if (element.localName==='img') images.push({owner:id,src:element.getAttribute('src'),currentSrc:element.currentSrc,
      naturalWidth:element.naturalWidth,naturalHeight:element.naturalHeight,complete:element.complete,rect:rect(bounds)});
    if (element.localName==='canvas') {
      const value={owner:id,width:element.width,height:element.height,rect:rect(bounds),evidence:'native-existing-canvas-pixels'};
      try{value.png=element.toDataURL('image/png');}catch(error){value.pixelsUnavailable=error.name;}
      canvases.push(value);
    }
    if (['input','textarea','select'].includes(element.localName)) {
      if(element.type==='password'&&element.value)throw Error('QUOTE_CAPTURE_REFUSES_PASSWORD');
      controls.push({owner:id,type:element.type||element.localName,value:element.value,placeholder:element.getAttribute('placeholder'),checked:element.checked===true,
        textGeometrySource:'native-control; inspect Chrome textBoxes and PNG',domRangeGlyphRectObserved:false});
    }
  }
  for(const [element,id] of ids){let parent=element.parentElement;while(parent&&!ids.has(parent))parent=parent.parentElement;elements[id].parent=parent?ids.get(parent):null;}
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(!node.nodeValue.trim()||!ids.has(node.parentElement))continue;
    const range=document.createRange();range.selectNodeContents(node);
    const rects=[...range.getClientRects()].filter(value=>value.width&&value.height).map(rect);
    if(!rects.length)continue;
    texts.push({owner:ids.get(node.parentElement),text:node.nodeValue,rects,rect:rect(range.getBoundingClientRect()),
      evidence:'native-DOM-Range',css:style(getComputedStyle(node.parentElement))});
    range.detach();
  }
  const form=root.querySelector('#page-form'),header=root.querySelector('#order-app-header');
  const fontFaceRules=[],unreadableStylesheets=[];
  const scanRules=(rules,href)=>{for(const rule of rules){
    if(rule.type===CSSRule.FONT_FACE_RULE)fontFaceRules.push({stylesheet:href,family:rule.style.fontFamily,src:rule.style.getPropertyValue('src'),weight:rule.style.fontWeight,style:rule.style.fontStyle});
    if(rule.cssRules)scanRules(rule.cssRules,href);
  }};
  for(const sheet of document.styleSheets){try{scanRules(sheet.cssRules,sheet.href);}catch(error){unreadableStylesheets.push({href:sheet.href,error:error.name});}}
  const fieldState=[...root.querySelectorAll('[data-pick],[data-line-qty],[data-line-price]')].filter(painted).map(element=>({
    selector:locator(element),field:element.dataset.pick||(element.hasAttribute('data-line-qty')?'qty':'price'),
    value:element.dataset.value||element.value||'',pressed:element.getAttribute('aria-pressed'),invalid:element.getAttribute('aria-invalid'),rect:rect(element.getBoundingClientRect())}));
  return {format:'order-research-quote-dom-paint/v1',label,observedAt:new Date().toISOString(),captureMode,
    source:{build:snapshot.build,artifactHash:standalone?null:inspector.session.artifact,version:standalone?null:inspector.session.version,session:standalone?null:inspector.session,config:JSON.parse(document.getElementById('order-app-config').textContent),route:snapshot.route,environment:snapshot.environment},
    viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,scrollX,scrollY,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
      visual:visualViewport&&{width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}},
    fonts:{status:document.fonts.status,declaredFamily:getComputedStyle(root).fontFamily,faces:[...document.fonts].map(face=>({family:face.family,status:face.status,weight:face.weight,style:face.style})),fontFaceRules,unreadableStylesheets},
    anchors:{header:header&&{rect:rect(header.getBoundingClientRect()),html:header.outerHTML},form:form&&{rect:rect(form.getBoundingClientRect()),background:getComputedStyle(form).backgroundColor,
      paddingLeft:getComputedStyle(form).paddingLeft,paddingRight:getComputedStyle(form).paddingRight,border:getComputedStyle(form).borderWidth,boxShadow:getComputedStyle(form).boxShadow},
      closedAccordions:form?[...form.querySelectorAll(':scope>.stack>.t-acc[data-open=false]')].map(card=>({id:card.id,rect:rect(card.getBoundingClientRect()),header:rect(card.querySelector(':scope>.accordion-trigger').getBoundingClientRect()),body:rect(card.querySelector(':scope>.accordion-body').getBoundingClientRect())})):[],
      duplicateModeSwitchVisible:!!root.querySelector('#quote-mode-switch')&&painted(root.querySelector('#quote-mode-switch'))},
    fixture:{owner:snapshot.route.kind==='quote'?'regular-quote-engine/applyScenario':'existing-research-scene-and-QA-fixture-adapter',scope:snapshot.environment,quote:snapshot.quote},
    animations:document.getAnimations().map(animation=>({id:animation.id,playState:animation.playState,currentTime:animation.currentTime,
      target:animation.effect?.target?.nodeType===1?locator(animation.effect.target):null,timing:finiteJson(animation.effect?.getComputedTiming()||{})})),
    elements,texts,pseudo,svg,controls,images,canvases,fieldState,
    limits:['Computed pseudo CSS does not assert pseudo geometry.','DOM Range rectangles describe text boxes, not individual ink pixels.','Native input value glyph layout is supplied by the Chrome textBoxes sidecar.','A static snapshot does not verify motion timing or user acceptance.']};
}
