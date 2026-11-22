// Server-only adaptation: the released helper's source remains untouched. The
// research inspector needs its private disposer when a verified route changes.
import {browserFunction} from '../browser-source.mjs';
import {installReviewPanels} from '../r3-ui/review-panels.mjs';

export function getResearchInspectorPanelsModule() {
  const source=Function.prototype.toString.call(installReviewPanels).replace(/<\/script/gi,'<\\/script').trim();
  if(!source.endsWith('}')||!source.includes('function dispose()'))throw Error('REVIEW_PANELS_DISPOSER_UNAVAILABLE');
  const adapted=source.slice(0,-1)+'\nreturn {dispose(){dispose();removeEventListener("pagehide",dispose);}};\n}';
  return 'export const installResearchReviewPanels = '+browserFunction(installReviewPanels).replace(source,()=>adapted)+';\n';
}
