const once=(source,before,after)=>{if(source.split(before).length!==2)throw Error('RESEARCH_BUSINESS_CLASSIFICATION_SOURCE_CHANGED');return source.replace(before,after);};
/** The same consonant/IME/keyboard picker reads the verified local catalogue.
 * Static archived runtimes and their example suggestions stay unchanged. */
export function researchBusinessClassificationSource(source){
  source=once(source,'const sectors=[','const sectors=w.ORDER_RESEARCH_WORKFLOW_POLISH?.businessClasses.sectors||[');
  source=once(source,'const industries=[','const industries=w.ORDER_RESEARCH_WORKFLOW_POLISH?.businessClasses.industries||[');
  const evidence="mountEvidence(root,{api,kind:'reprice',signal:c.signal})";
  if(source.split(evidence).length!==3)throw Error('RESEARCH_WORKFLOW_REVIEW_STATE_SOURCE_CHANGED');
  source=source.replaceAll(evidence,"mountEvidence(root,{api,kind:'reprice',state:s,signal:c.signal})");
  return once(source,"c.signal.addEventListener('abort',()=>{gen++;accepted=[];root.__orderSelectedFiles=[];input.value='';},{once:true});", "on(root,'research-evidence-loaded',()=>{gen++;accepted=[];root.__orderSelectedFiles=[];input.value='';});c.signal.addEventListener('abort',()=>{gen++;accepted=[];root.__orderSelectedFiles=[];input.value='';},{once:true});");
}
