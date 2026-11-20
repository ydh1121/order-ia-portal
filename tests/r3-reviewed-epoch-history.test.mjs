import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readReviewedEpochArtifact,readReviewedEpochBody,isReviewedEpochTarget,reviewedEpochMetadata} from '../src/server/r3-qa-epoch-history.mjs';
import {serveR3Artifact,isR3ReviewTarget,renderR3Qa} from '../src/server/r3-qa-page.mjs';

const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom'),{build}=require('esbuild');
const capture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/r1-reviewed-e8e12588.capture.json.gz',import.meta.url))));
const storedTargets=JSON.parse(await readFile(new URL('./fixtures/r1-review-targets-through-430.json',import.meta.url),'utf8'));
const digest=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const origin='https://order-ia-portal.pages.dev';
const api='/api/ia/r3-qa/artifact';
const request=(id,width,hash,version='recorded')=>new Request(origin+api+'?'+new URLSearchParams({id,width:String(width),version,artifactHash:hash}));
const stripAdditions=(record,expected)=>Object.fromEntries(Object.keys(expected).map(key=>[key,record[key]]));
async function until(check,message){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail(message);}

test('the complete reviewed epoch reproduces every baseline response, including HTML, mount, QA fixture, source and all widths',async()=>{
  assert.equal(reviewedEpochMetadata.commit,'e8e12588f289a493b006c9272f2947eba34afb0b');
  assert.equal(reviewedEpochMetadata.tree,'e05c0cc88e49075e04874822a3e10ab97f5299ce');
  assert.equal(capture.inventory.length,550);
  assert.deepEqual(reviewedEpochMetadata.widths,[320,360,375,390,430,768,1024,1280,1440,1920]);
  assert.equal(Object.keys(capture.captures).length,reviewedEpochMetadata.recordCount);
  for(const [key,expected] of Object.entries(capture.captures)){
    const [id,width,hash]=key.split('|'),saved=await readReviewedEpochArtifact(id,Number(width),hash);
    assert.ok(saved,key);
    assert.equal(digest(JSON.stringify(saved.artifact)),expected,key+' canonical response bytes');
    assert.equal(saved.artifact.hash,hash,key);
    assert.equal(digest(saved.artifact.editable),saved.artifact.exportHash,key+' export bytes');
  }
  for(const row of capture.inventory)for(const width of reviewedEpochMetadata.widths){
    for(const hash of [row.hashes[width],row.contentHashes[width]]){
      const target={screen:row.screen,state:row.state,variant:row.variant,viewport:width,artifactHash:hash};
      assert.equal(await isReviewedEpochTarget(target,capture.release),true,row.id+' '+width);
    }
  }
});

test('all 919 original catalogue bodies remain content-addressed after current and previous frames are regenerated',async()=>{
  assert.equal(reviewedEpochMetadata.bodyCount,919);
  assert.equal(Object.keys(capture.bodyHashes).length,919);
  for(const [hash,expected] of Object.entries(capture.bodyHashes)){
    const body=await readReviewedEpochBody(hash);
    assert.equal(typeof body,'string',hash);
    assert.equal(Buffer.byteLength(body),expected.utf8Bytes,hash+' original UTF-8 byte length');
    assert.equal(digest(body),expected.sha256,hash+' original content digest');
  }
  assert.equal(await readReviewedEpochBody('missing'),null);
  assert.equal(await readReviewedEpochBody('0'.repeat(64)),null);
});

test('all 239 recorded targets keep their baseline availability and all 212 readable originals keep exact bytes without changing input JSON',async()=>{
  const before=JSON.stringify(storedTargets);
  assert.equal(storedTargets.cutoff,430);assert.equal(storedTargets.targets.length,239);
  assert.equal(storedTargets.excluded.length,2);
  assert.deepEqual(storedTargets.excluded.map(item=>item.target.screen),['SYNTHETIC','live-price-policy'],'synthetic/provider and live business audits are not catalogue artifacts');
  assert.equal(capture.targetChecks.length,212);assert.equal(capture.unavailableTargets.length,27);
  for(const item of capture.targetChecks){
    const target=clone(item.target),targetBefore=JSON.stringify(target),id=[target.screen,target.state,target.variant].join('/');
    assert.equal(await isR3ReviewTarget(target,item.release),true,id);
    const response=await serveR3Artifact(request(id,target.viewport,target.artifactHash),{});
    assert.equal(response.status,200,id+' '+target.artifactHash);
    const result=await response.json(),saved=await readReviewedEpochArtifact(id,target.viewport,target.artifactHash);
    assert.equal(digest(JSON.stringify(stripAdditions(result,saved.artifact))),item.sha256,id+' original response bytes');
    assert.equal(result.archivedSource.commit,reviewedEpochMetadata.commit);
    assert.equal(result.replayFrame,saved.replayFrame);
    assert.equal(JSON.stringify(target),targetBefore,'target/anchor identity is never rewritten');
  }
  assert.equal(JSON.stringify(storedTargets),before);
  assert.ok(capture.targetChecks.some(item=>item.last_cursor===430),'the latest recorded member feedback target is included');
  for(const item of capture.unavailableTargets){
    assert.ok(item.last_cursor<=156,'only pre-existing unavailable development targets are excluded');
    const target=item.target,id=[target.screen,target.state,target.variant].join('/');
    assert.equal(await isR3ReviewTarget(target,item.release),false,id+' is not silently remapped');
    const response=await serveR3Artifact(request(id,target.viewport,target.artifactHash),{});
    assert.equal(response.status,404);assert.deepEqual(await response.json(),item.error);
  }
});

test('epoch lookup enforces screen, state, variant, viewport, release and explicit hash, and returns independent fixture data',async()=>{
  const row=capture.inventory.find(row=>row.id==='onboarding/member-1/email');
  const target={screen:row.screen,state:row.state,variant:row.variant,viewport:390,artifactHash:row.hashes[390]};
  for(const changed of [{screen:'login'},{state:'member-2'},{variant:'compact'},{viewport:320},{artifactHash:'a'.repeat(64)}]){
    assert.equal(await isReviewedEpochTarget({...target,...changed},capture.release),false,JSON.stringify(changed));
  }
  assert.equal(await isReviewedEpochTarget(target,'another-release'),false);
  assert.equal(await readReviewedEpochArtifact(row.id,390,null),null);
  const original=await readReviewedEpochArtifact(row.id,390,target.artifactHash),expected=JSON.stringify(original.artifact.fixture);
  original.artifact.fixture.authenticated=false;original.artifact.source.files.push('not-a-source.mjs');
  const reread=await readReviewedEpochArtifact(row.id,390,target.artifactHash);
  assert.equal(JSON.stringify(reread.artifact.fixture),expected);
  assert.equal(reread.artifact.source.files.includes('not-a-source.mjs'),false);
  const response=await serveR3Artifact(new Request(request(row.id,390,target.artifactHash).url+'&unapproved=1'),{});
  assert.equal(response.status,404);
});

test('the archived canonical workspace boots through the real host order once, uses its old memory fixture and keeps position comments',async t=>{
  const row=capture.inventory.find(row=>row.id==='store-purchase/card/email');
  const response=await serveR3Artifact(request(row.id,390,row.hashes[390]),{}),document=await response.json();
  const messages=[],errors=[],network=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(document.html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),{url:origin+'/qa-frame',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window,parent={postMessage(message){messages.push(clone(message));}};
  t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});
  Object.defineProperty(w,'parent',{value:parent});Object.defineProperty(w,'crypto',{value:webcrypto});
  w.TextEncoder=TextEncoder;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
  w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
  w.fetch=async(...args)=>{network.push(args);throw Error('Historical controlled QA must not access a live API');};
  const nonce='epoch-runtime-test',shell=renderR3Qa(nonce),needle=')('+JSON.stringify(nonce)+',';
  const offset=shell.lastIndexOf(needle);assert.ok(offset>=0);
  const literal=/^"(?:\\.|[^"\\])*"/.exec(shell.slice(offset+needle.length));assert.ok(literal);
  const bootstrap=JSON.parse(literal[0]);
  w.__epochSession=w.JSON.parse(JSON.stringify({channel:randomUUID(),artifact:document.hash,screen:row.screen,state:row.state,variant:row.variant,version:document.version,fixture:document.fixture}));
  w.eval(document.mount);w.eval(document.qaRuntime);
  w.eval('('+bootstrap+')(__epochSession,('+document.replayFrame+'))');
  const root=w.document.getElementById('order-single'),button=root.querySelector('[data-purchase-card]');
  await until(()=>button&&!button.disabled,'the archived real purchase module receives its captured fixture');
  assert.equal(w.document.querySelectorAll('#r3-veil').length,1);
  assert.equal(w.document.querySelectorAll('.approval-draft-pin').length,1);
  assert.equal(messages.filter(message=>message.type==='ready').length,1,'the archived frame controller mounts once');
  assert.equal(messages.find(message=>message.type==='ready').artifact,document.hash);
  const before=clone(w.ORDER_APP_ADAPTER.fixture.inspect());button.click();
  await until(()=>root.querySelector('[data-purchase-status]').textContent.includes('카드 결제가 아직 연결되지 않았어요.'),'canonical provider failure is preserved');
  const after=clone(w.ORDER_APP_ADAPTER.fixture.inspect());
  assert.equal(after.data.purchases.find(row=>row.id===before.selectedPurchaseId).status,'AWAITING_CARD');
  assert.equal(after.source.storage,'frame-memory');assert.equal(after.source.persistent,false);
  assert.equal(network.length,0);assert.deepEqual(errors,[]);
});

test('the captured epoch is byte-identical after deployment bundling',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'reviewed-epoch-bundle-'));
  try{
    const output=join(directory,'worker.mjs');
    await build({stdin:{contents:"export {readReviewedEpochArtifact,readReviewedEpochBody,isReviewedEpochTarget} from './src/server/r3-qa-epoch-history.mjs';",resolveDir:process.cwd()},outfile:output,bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,keepNames:true,logLevel:'silent'});
    const worker=await import(pathToFileURL(output));
    for(const id of ['onboarding/guest-1/email','onboarding/member-1/email','price-workspace/consumer-products/email']){
      const row=capture.inventory.find(row=>row.id===id),hash=row.hashes[390];
      const native=await readReviewedEpochArtifact(id,390,hash),bundled=await worker.readReviewedEpochArtifact(id,390,hash);
      assert.deepEqual(bundled,native,id+' frozen response and replay source');
      assert.equal(await worker.isReviewedEpochTarget({screen:row.screen,state:row.state,variant:row.variant,viewport:390,artifactHash:hash},capture.release),true);
    }
    const bodyHash=Object.keys(capture.bodyHashes)[0];
    assert.equal(await worker.readReviewedEpochBody(bodyHash),await readReviewedEpochBody(bodyHash),'original raw body survives deployment bundling');
  }finally{await rm(directory,{recursive:true,force:true});}
});
