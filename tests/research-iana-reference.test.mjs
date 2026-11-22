import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash, webcrypto} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {quoteFiles} from '../src/server/r3-product-sources.mjs';
import {r3ProductAsset} from '../src/server/r3-product-page.mjs';
import {researchAssetBase, serveResearchAsset, listResearchAssetPaths} from '../src/server/research-app/page.mjs';
import {regularServiceSourceIdentity} from '../src/server/research-app/regular-service-assets.mjs';
import {createRegularServices} from '../src/server/research-app/regular-services.mjs';
import {
  REGULAR_IANA_MANIFEST_TEXT, REGULAR_IANA_RAW_TEXT,
  REGULAR_IANA_REFERENCE_PROVENANCE, regularIanaReference, regularIanaReferenceJson
} from '../src/server/research-app/regular-iana-reference.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const sha=(text,algorithm='sha256')=>createHash(algorithm).update(text).digest('hex');
const blob=text=>sha(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(text)+'\0'),Buffer.from(text)]),'sha1');
const sealed=path=>gunzipSync(Buffer.from(quoteFiles[path],'base64')).toString();
const originalEnvelope=JSON.parse(sealed('assets/iana-reference.json'));
const now=Date.parse(regularIanaReference.manifest.collectedAt)+1000;
const directory=await mkdtemp(join(tmpdir(),'order-pinned-iana-'));
for(const path of Object.keys(quoteFiles).filter(path=>path.startsWith('src/engine/')&&path.endsWith('.mjs'))
  .concat(['web/address-contract.mjs','web/address-service.mjs','web/address-ui.mjs','web/region-reference.mjs'])){
  await mkdir(dirname(join(directory,path)),{recursive:true});await writeFile(join(directory,path),sealed(path));
}
const loadModule=path=>import(pathToFileURL(join(directory,path)).href);
const iana=await loadModule('src/engine/adapters/iana-browser.mjs');
const email=await loadModule('src/engine/validation/email.mjs');
after(()=>rm(directory,{recursive:true,force:true}));

test('pinned regular manifest/raw bytes have original Git identities and exact browser envelope serialization',()=>{
  const p=REGULAR_IANA_REFERENCE_PROVENANCE;
  assert.equal(p.repository,'ydh1121/order');
  assert.equal(p.commit,'a5eec9e3c108b40940a65a617000855a2b00f8fa');
  for(const [source,identity]of [[REGULAR_IANA_MANIFEST_TEXT,p.manifest],[REGULAR_IANA_RAW_TEXT,p.raw]]){
    assert.equal(blob(source),identity.gitBlobSha1);
    assert.equal(sha(source),identity.sha256);
    assert.equal(Buffer.byteLength(source),identity.bytes);
  }
  assert.equal(p.raw.sha256,regularIanaReference.manifest.sourceSha256);
  assert.equal(p.raw.bytes,regularIanaReference.manifest.sourceBytes);
  assert.equal(regularIanaReference.manifest.version,'2026112100');
  assert.equal(regularIanaReference.manifest.tldCount,1435);
  assert.equal(regularIanaReferenceJson,JSON.stringify({
    schemaVersion:1,manifest:JSON.parse(REGULAR_IANA_MANIFEST_TEXT),rawText:REGULAR_IANA_RAW_TEXT
  })+'\n');
  assert.equal(sha(regularIanaReferenceJson),p.envelope.sha256);
  assert.equal(Buffer.byteLength(regularIanaReferenceJson),p.envelope.bytes);
  const labels=value=>value.rawText.trimEnd().split('\n').slice(1);
  const old=labels(originalEnvelope),current=labels(regularIanaReference);
  assert.deepEqual(old.filter(label=>!current.includes(label)),['XIHUAN']);
  assert.deepEqual(current.filter(label=>!old.includes(label)),[]);
  assert.equal(old.length,1436);assert.equal(current.length,1435);
});

test('the original regular browser parser and email validator reject removed TLD and altered reference bytes',async()=>{
  const reference=await iana.verifyBrowserIana(regularIanaReference,{crypto:webcrypto});
  assert.equal(reference.version,'2026112100');assert.equal(reference.tlds.length,1435);
  assert.equal(iana.browserIanaFreshness(reference,now).state,'FRESH');
  const previous=await iana.verifyBrowserIana(originalEnvelope,{crypto:webcrypto});
  const raw='buyer@example.xihuan';
  assert.equal(email.validateEmailSyntax({raw},{tldData:previous,nowMs:now}).status,'VALID');
  const result=email.validateEmailSyntax({raw},{tldData:reference,nowMs:now});
  assert.equal(result.status,'INVALID');assert.deepEqual(result.reasonCodes,['TLD_NOT_DELEGATED']);
  assert.equal(result.evidence.ownershipVerified,false);
  const allowed=email.validateEmailSyntax({raw:'buyer@example.com'},{tldData:reference,nowMs:now});
  assert.equal(allowed.status,'VALID');assert.equal(allowed.evidence.dnsVerified,false);
  await assert.rejects(iana.verifyBrowserIana({...regularIanaReference,
    manifest:{...regularIanaReference.manifest,sourceSha256:'0'.repeat(64)}},{crypto:webcrypto}));
  await assert.rejects(iana.verifyBrowserIana({...regularIanaReference,
    rawText:regularIanaReference.rawText.replace('\nCOM\n','\nCOX\n')},{crypto:webcrypto}));
  for(const source of [REGULAR_IANA_REFERENCE_PROVENANCE.browserParser,REGULAR_IANA_REFERENCE_PROVENANCE.emailValidator]){
    assert.equal(blob(sealed(source.path)),source.gitBlobSha1);
    assert.equal(sha(sealed(source.path)),source.sha256);
  }
});

test('only the research reference asset changes and provenance keeps regular executable source separate',async()=>{
  const current=await serveResearchAsset(researchAssetBase+'assets/iana-reference.json');
  assert.equal(current.status,200);assert.match(current.headers.get('content-type'),/^application\/json/);
  assert.equal(await current.text(),regularIanaReferenceJson);
  const regular=r3ProductAsset('/ia/r3-product/assets/iana-reference.json');
  assert.equal(await regular.text(),sealed('assets/iana-reference.json'));
  assert.equal(originalEnvelope.manifest.version,'2026111900');
  assert.equal((await listResearchAssetPaths()).filter(path=>path==='assets/iana-reference.json').length,1);
  const identity=await regularServiceSourceIdentity();
  assert.equal(identity.commit,'fd2ecddf71bf0548099bcc728219eac0d9d7da46');
  assert.deepEqual(identity.ianaReference,REGULAR_IANA_REFERENCE_PROVENANCE);
  assert.equal(identity.mailboxVerified,false);assert.equal(identity.ownershipVerified,false);
});

test('actual quote contact boot reuses shared contact owner and reads the same build-pinned reference before DNS',async()=>{
  const shared=await (await serveResearchAsset(researchAssetBase+'bridge/contact-ui.mjs')).text();
  const quote=await (await serveResearchAsset(researchAssetBase+'web/contact-ui.mjs')).text();
  const referencePath=researchAssetBase+'assets/iana-reference.json';
  assert.ok(shared.includes(referencePath));assert.ok(quote.includes(referencePath));
  await mkdir(join(directory,'bridge'),{recursive:true});
  await writeFile(join(directory,'bridge/contact-ui.mjs'),shared.split('\n').map(line=>
    line.startsWith('import ')?line.replaceAll(researchAssetBase,pathToFileURL(directory+'/').href):line).join('\n'));
  await writeFile(join(directory,'web/contact-ui.mjs'),quote);
  const dom=new JSDOM('<form><input id="email" type="email" required></form>',{url:'https://research.example',pretendToBeVisual:true});
  const calls=[];
  const services=await createRegularServices({document:dom.window.document,origin:dom.window.location.origin,
    loadModule,crypto:webcrypto,now:()=>now,fetcher:async(url,init)=>{
      calls.push({url,init});assert.equal(new URL(url).pathname,referencePath,'invalid TLD must not trigger DNS');
      return serveResearchAsset(new URL(url).pathname);
    },dns:{providers:['cloudflare'],retries:0}});
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  let release;
  try{
    release=services.installRegularGlobals(dom.window);
    const owners=['OrderPhone','OrderEmail','OrderEmailDomain','OrderEmailUI'].map(key=>dom.window[key]);
    globalThis.window=dom.window;
    await loadModule('web/contact-ui.mjs');
    assert.equal(services.hasRegularGlobals(dom.window),true);
    assert.deepEqual(['OrderPhone','OrderEmail','OrderEmailDomain','OrderEmailUI'].map(key=>dom.window[key]),owners);
    const input=services.mountEmail(dom.window.document.getElementById('email'),{autoValidate:false});
    input.set('buyer@example.xihuan');const result=await input.commit();
    assert.equal(result.ok,false);assert.equal(result.result.status,'INVALID_TLD');
    assert.equal(result.ownershipVerified,false);assert.equal(result.mailboxVerified,false);
    const verdict=await dom.window.OrderEmailDomain.validate('example.xihuan');
    assert.equal(verdict.state,'INVALID_TLD');assert.deepEqual(verdict.engineResult.reasonCodes,['TLD_NOT_DELEGATED']);
    assert.equal(calls.length,1);assert.equal(calls[0].init.credentials,'same-origin');
    assert.equal(new URL(calls[0].url).hostname,'research.example');
  }finally{
    release?.();services.dispose();dom.window.close();
    if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;
  }
});
