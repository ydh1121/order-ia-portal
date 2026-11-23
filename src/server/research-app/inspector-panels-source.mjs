// Server-only adaptation: the released helper's source remains untouched. The
// research inspector needs its private disposer when a verified route changes.
import {browserFunction} from '../browser-source.mjs';
import {installReviewPanels} from '../r3-ui/review-panels.mjs';
import {installPinProjection} from '../r3-ui/pin-projection.mjs';

const once=(source,marker,replacement)=>{
  if(source.split(marker).length!==2)throw Error('RESEARCH_INSPECTOR_SOURCE_MISMATCH: '+marker.slice(0,70));
  return source.replace(marker,replacement);
};

export function getResearchInspectorPanelsModule() {
  const source=Function.prototype.toString.call(installReviewPanels).replace(/<\/script/gi,'<\\/script').trim();
  if(!source.endsWith('}')||!source.includes('function dispose()'))throw Error('REVIEW_PANELS_DISPOSER_UNAVAILABLE');
  let adapted=source.slice(0,-1)+'\nreturn {dispose(){dispose();removeEventListener("pagehide",dispose);}};\n}';
  adapted=once(adapted,'const popup=root.querySelector(',"const popup=document.getElementById('r3-veil')?.closest('dialog[open]')||root.querySelector(");
  adapted=once(adapted,".find(el=>{try{return el.matches(':popover-open');}",".find(el=>{if(el.closest('[data-research-annotation]'))return false;try{return el.matches(':popover-open');}");
  return 'export const installResearchReviewPanels = '+browserFunction(installReviewPanels).replace(source,()=>adapted)+';\n';
}

/** QA overlays can live inside a native modal without becoming product anchors. */
export function getResearchPinProjectionModule(){
  const source=Function.prototype.toString.call(installPinProjection).replace(/<\/script/gi,'<\\/script').trim();
  let adapted=once(source,"const root=document.querySelector('#order-single');",`const root=document.querySelector('#order-single');
  const qaOverlay=node=>node?.nodeType===1&&node.closest('[data-research-annotation]');
  const productMutation=record=>!qaOverlay(record.target)&&[...record.addedNodes,...record.removedNodes].some(node=>!qaOverlay(node));
  const content=node=>{if(!node.querySelector('[data-research-annotation]'))return text(node.textContent);const copy=node.cloneNode(true);copy.querySelectorAll('[data-research-annotation]').forEach(el=>el.remove());return text(copy.textContent);};`);
  adapted=once(adapted,"for(const el of node.querySelectorAll('*')){","for(const el of node.querySelectorAll('*')){if(qaOverlay(el))continue;");
  adapted=once(adapted,'function changed(){current=null;notifyChanged();}','function changed(records){if(records&&!records.some(productMutation))return;current=null;notifyChanged();}');
  adapted=once(adapted,'if(observer.takeRecords().length)changed();','const pending=observer.takeRecords();if(pending.length)changed(pending);');
  const labelPattern=/text\((el|exact|other)\.textContent\)/g;
  if([...source.matchAll(labelPattern)].length!==6)throw Error('RESEARCH_PROJECTION_LABEL_SEAM');
  // Only the original comparisons change; the new helper still reads text.
  adapted=adapted.replace(labelPattern,'content($1)');
  const ignored='[data-order-pin-proxy],.r3-options';
  if(adapted.split(ignored).length!==3)throw Error('RESEARCH_PROJECTION_STRUCTURE_SEAM');
  adapted=adapted.replaceAll(ignored,ignored+',[data-research-annotation]');
  return 'export const installPinProjection = '+browserFunction(installPinProjection).replace(source,()=>adapted)+';\n';
}
