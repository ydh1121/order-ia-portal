import {browserFunction} from './browser-source.mjs';
import {createSavedBusinessBridge,mountSavedBusinessPicker} from './r3-saved-business-client.mjs';

export const quoteExtension='saved-businesses-20261120-v1';
// Match one explicit factory export in the pinned product source. A changed base
// fails closed instead of silently attaching to an unreviewed implementation.
export function extendQuoteSource(path,source){
 if(path==='web/main.mjs')return source+`\n(${browserFunction(mountSavedBusinessPicker)})(app);\n`;
 if(path!=='web/app.mjs')return source;
 const marker='return Object.freeze({regularBridge:window.OrderRegularQ4Bridge,quoteService,simpleReview:window.OrderSimpleQuoteReview,quoteDocument,connectQ4';
 if(source.split(marker).length!==2)throw Error('QUOTE_EXTENSION_SOURCE_MISMATCH');
 const adapter=`const savedBusinessBridge=(${browserFunction(createSavedBusinessBridge)})({getState:()=>S,guard:guardPendingEdits,save,render,blankSite,addressFields,addressStatus,projectSimpleQuote,resetSimple:()=>simpleUI?.resetLocal(),simpleMode,regionSelection});\n`;
 return `import {regionSelection} from './region-reference.mjs';\n`+source.replace(marker,adapter+marker.replace('regularBridge:','savedBusinessBridge,regularBridge:'));
}
