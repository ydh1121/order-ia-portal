/** Preserve the shared input/IME owner, correcting its mirror's native vertical
 * alignment for floating fields with asymmetric top and bottom padding. */
export function researchInputMotionSource(source){
  const before="const paddingTop=input.tagName==='TEXTAREA'?parseFloat(cs.paddingTop)||0:Math.max(parseFloat(cs.paddingTop)||0,((input.offsetHeight||box.height)-(parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2))/2);";
  const after="const insetTop=parseFloat(cs.paddingTop)||0,insetBottom=parseFloat(cs.paddingBottom)||0,borderTop=parseFloat(cs.borderTopWidth)||0,borderBottom=parseFloat(cs.borderBottomWidth)||0,lineHeight=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2;const paddingTop=input.tagName==='TEXTAREA'?insetTop:insetTop+Math.max(0,((input.offsetHeight||box.height)-borderTop-borderBottom-insetTop-insetBottom-lineHeight)/2);";
  if(source.split(before).length!==2)throw Error('RESEARCH_INPUT_MOTION_SOURCE_CHANGED');
  return source.replace(before,after);
}
