/** Preserve the shared input/IME owner. The mirror uses the native line's
 * fractional advances and floating-field baseline instead of rounded offsets. */
export function researchInputMotionSource(source){
  const replace=(before,after)=>{
    if(source.split(before).length!==2)throw Error('RESEARCH_INPUT_MOTION_SOURCE_CHANGED:'+before.slice(0,72));
    source=source.replace(before,after);
  };
  const before="const paddingTop=input.tagName==='TEXTAREA'?parseFloat(cs.paddingTop)||0:Math.max(parseFloat(cs.paddingTop)||0,((input.offsetHeight||box.height)-(parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2))/2);";
  const after="const insetTop=parseFloat(cs.paddingTop)||0,insetBottom=parseFloat(cs.paddingBottom)||0,borderTop=parseFloat(cs.borderTopWidth)||0,borderBottom=parseFloat(cs.borderBottomWidth)||0,lineHeight=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2;const layoutHeight=/^[\\d.]+px$/.test(cs.height)?parseFloat(cs.height)+(cs.boxSizing==='content-box'?insetTop+insetBottom+borderTop+borderBottom:0):input.offsetHeight||box.height;const paddingTop=input.tagName==='TEXTAREA'?insetTop:insetTop+Math.max(0,(layoutHeight-borderTop-borderBottom-insetTop-insetBottom-lineHeight)/2);";
  replace(before,after);
  replace('  function caretTarget(record,index){',String.raw`  function alignNativeGlyphs(input,record){
   if(input.tagName!=='INPUT'||!doc.createRange)return;
   const range=doc.createRange();if(typeof range.getBoundingClientRect!=='function')return;
   const measure=record.measure||(record.measure=doc.createElement('span'));
   if(!measure.isConnected){measure.className='r3-input-measure';measure.setAttribute('aria-hidden','true');Object.assign(measure.style,{position:'absolute',left:'0',top:'0',width:'max-content',whiteSpace:'pre',visibility:'hidden',pointerEvents:'none',font:'inherit',letterSpacing:'inherit',wordSpacing:'inherit'});record.layer.append(measure);}
   const cs=win.getComputedStyle(input);for(const key of ['fontKerning','fontFeatureSettings','fontVariationSettings','fontVariantLigatures']){measure.style[key]=cs[key];record.line.style[key]=cs[key];}
   const text=record.chars.map(ch=>record.type==='password'?'•':ch).join('');measure.textContent=text;
   if(!text){record.nativeMetrics=true;measure.remove();return;}
   const full=measure.getBoundingClientRect(),width=parseFloat(win.getComputedStyle(measure).width),scale=full.width&&width?full.width/width:1;
   if(!full.width){measure.remove();return;}
   range.setStart(measure.firstChild,0);let offset=0,advance=0;
   for(let index=0;index<record.chars.length;index++){
    offset+=record.type==='password'?1:record.chars[index].length;range.setEnd(measure.firstChild,offset);
    const next=(range.getBoundingClientRect().right-full.left)/scale;
    record.glyphs[index].style.width=Math.max(0,next-advance)+'px';advance=next;
   }
   record.nativeMetrics=true;measure.remove();
  }
  function glyphPosition(record,span,includeMotion=false){
   if(!record.nativeMetrics)return {x:span.offsetLeft,y:span.offsetTop};
   let x=0;for(const glyph of record.glyphs){if(glyph===span)break;x+=parseFloat(glyph.style.width)||0;}
   const shift=includeMotion?win.getComputedStyle(span).translate?.split(/\s+/).map(parseFloat)||[]:[];
   return {x:x+(shift[0]||0),y:span.offsetTop+(shift[1]||0)};
  }
  function caretTarget(record,index){`);
  replace('if(units>=index)return record.glyphs[i].offsetLeft;','if(units>=index)return glyphPosition(record,record.glyphs[i]).x;');
  replace('return last?last.offsetLeft+last.offsetWidth:0;','return last?glyphPosition(record,last).x+(record.nativeMetrics?parseFloat(last.style.width)||0:last.offsetWidth):0;');
  replace('record.glyphs=record.chars.map(ch=>{const span=record.make(ch);line.append(span);return span;});','record.glyphs=record.chars.map(ch=>{const span=record.make(ch);line.append(span);return span;});alignNativeGlyphs(input,record);');
  replace("const positions=new Map(record.glyphs.map(span=>{const shift=win.getComputedStyle(span).translate?.split(/\\s+/).map(parseFloat)||[];return [span,{x:span.offsetLeft+(shift[0]||0),y:span.offsetTop+(shift[1]||0)}];}));","const positions=new Map(record.glyphs.map(span=>[span,glyphPosition(record,span,true)]));");
  replace('record.glyphs.splice(start,0,...inserted);record.chars=b;record.value=next;','record.glyphs.splice(start,0,...inserted);record.chars=b;record.value=next;alignNativeGlyphs(input,record);');
  replace('const x=from.x-span.offsetLeft,y=from.y-span.offsetTop;','const current=glyphPosition(record,span),x=from.x-current.x,y=from.y-current.y;');
  replace("media?.addEventListener?.('change',stopAll,{signal:controller.signal});","media?.addEventListener?.('change',stopAll,{signal:controller.signal});doc.fonts?.addEventListener?.('loadingdone',stopAll,{signal:controller.signal});");
  return source;
}
