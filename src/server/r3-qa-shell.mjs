import {browserFunction} from './browser-source.mjs';
import {reviewPanelAuthStates} from './r3-ui/qa-shell-auth-states.gen.mjs';
import {hostCode,frameCode} from './r3-ui/review-engine.gen.mjs';
import {installQaSession} from './qa-session-client.mjs';
import {approvedShellBody,shellStyles} from './r3-ui/approved-shell.mjs';
import {installReviewShortcut, mountApprovedMarkers} from './r3-ui/approved-markers.mjs';
import {installPinProjection} from './r3-ui/pin-projection.mjs';
import {installReviewPanels} from './r3-ui/review-panels.mjs';
import {bootApprovedShell} from './r3-ui/approved-controller.mjs';
import {mountQuoteJourneyBridge} from './r3-ui/quote-journey-bridge.mjs';
import {installReviewMotion} from './r3-ui/review-motion-bridge.mjs';
import {motionRequirements} from './r3-ui/motion-requirements.mjs';
import {quoteCommit} from './r3-product-sources.mjs';
import {buyerResultClient,projectBuyerResult,buyerResultCss} from './r3-quote-result.mjs';
import {mountReviewDownloads} from './r3-qa-downloads.mjs';
import {createResearchExportTools} from './research-app/export-snapshot.mjs';

const js=v=>JSON.stringify(v).replaceAll('<','\\u003c');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The product runtime is byte-identical. Shortcuts and marker decoration belong to the QA tool.
// Pin presentation is part of the review tool, not the preserved product HTML,
// CSS or released frame identity. Historical replay code is still executed intact.
const pinPresentationStyle='.r3-pin.is-resolved{background:#315de6;border-style:dashed}.r3-pin.is-previous{background:#7c3aed}.r3-pin.is-mixed{background:linear-gradient(135deg,#7c3aed 0 50%,#315de6 50% 100%)}.r3-pin.is-previous:hover,.r3-pin.is-previous.is-selected{box-shadow:0 0 0 4px #7c3aed33}.r3-pin.is-resolved::before{content:"✓";position:absolute;left:-5px;bottom:-5px;display:grid;place-items:center;width:12px;height:12px;border-radius:50%;background:white;color:#087f5b;font:800 9px/1 system-ui}.r3-pin.is-previous[data-cluster]:not([data-cluster=""])::after{color:#7c3aed}';
const reviewFrameCode='function presentReviewFrame(session,replay){('+browserFunction(installReviewPanels)+')(session,'+JSON.stringify(reviewPanelAuthStates)+');('+browserFunction(installPinProjection)+')(session);const pinStyle=document.createElement("style");pinStyle.textContent='+JSON.stringify(pinPresentationStyle)+';document.head.append(pinStyle);if(replay){replay(session);}else{window.ORDER_QA_REVIEW_RUNTIME?.(session);('+browserFunction(mountQuoteJourneyBridge)+')(session);('+browserFunction(installReviewShortcut)+')(session);('+browserFunction(installReviewMotion)+')(session);('+frameCode+')(session);}('+browserFunction(mountApprovedMarkers)+')(session);}';

export function renderR3Qa(nonce){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Order · QA 검토</title><style>${shellStyles}
${buyerResultCss.replaceAll('#buyerResult','#snapshot')}</style></head><body>
${approvedShellBody()}
<script nonce="${esc(nonce)}">(${browserFunction(installQaSession)})();(${hostCode})(${js(nonce)},${js(reviewFrameCode)},(${browserFunction(bootApprovedShell)}),(${browserFunction(mountReviewDownloads)}),(${buyerResultClient}),(${browserFunction(projectBuyerResult)}),${js({product:quoteCommit,requirements:motionRequirements})},(${browserFunction(createResearchExportTools)}))</script></body></html>`;
}
