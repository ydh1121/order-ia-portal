// The live component library is a review-owned consumer of canonical product
// modules. Its URL and feedback identity remain stable without making product
// renderers depend on the review asset index or its showcase players.
import {getQaApplicationDocument} from './r3-qa-assets.mjs';
import {renderProductApplication,renderProductUiDocument} from './product-app-page.mjs';

export async function renderProductLibraryApplication(nonce,context,screen='component-library',state='default',variant='email',componentVariant=null){
 if(screen!=='component-library'||!/^[-\w]{1,100}$/.test(state))return null;
 if(componentVariant&&!/^[-\w]{1,100}$/.test(componentVariant))return null;
 if(context.actor?.authenticated===false){
  if(componentVariant)return null;
  return renderProductApplication(nonce,context,'login','empty',variant);
 }
 const document=await getQaApplicationDocument(screen,state,variant,componentVariant);
 if(!document||componentVariant&&document.componentVariantId!==componentVariant)return null;
 return renderProductUiDocument(nonce,context,document,{reviewLibrary:true});
}
