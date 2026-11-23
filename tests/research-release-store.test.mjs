import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,rm,readdir,mkdir} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {RESEARCH_RELEASE_FORMAT,RESEARCH_RELEASE_NONCE,RESEARCH_RELEASE_FULL_ROWS,RESEARCH_RELEASE_ROW_IDENTITIES,researchReleaseRowIdentities,createResearchReleaseStore,serveResearchReleaseAsset,renderResearchReleaseApplication} from '../src/server/research-app/release-store.mjs';
import {collectResearchRelease,encodeResearchRelease,sealResearchRelease,verifyResearchReleaseFiles,researchReleaseRuntimeIndexSource,syncResearchReleaseRuntimeIndex} from '../scripts/seal-research-release.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const configFrom=html=>JSON.parse(/id="order-app-config">([\s\S]*?)<\/script>/.exec(html)[1]);
const row=(screen,state)=>({id:screen+'/'+state+'/email',screen,state,variant:'email',title:screen+' '+state,phase:'mvp'});
function pack(version='first'){
  const sources={'src/server/research-app/application.mjs':hash(version)},digest=hash(JSON.stringify(sources)),base='/ia/research-assets/'+digest+'/';
  const build={format:'order-research-build/v1',digest,sources},initial={screen:'onboarding',state:'guest-1',variant:'email',mode:'simple'};
  const config={build:digest,assetBase:base,initial,inspect:false,inspection:null};
  return {format:RESEARCH_RELEASE_FORMAT,build,rows:[row('onboarding','guest-1'),row('q2','filled')],
    shell:{nonce:RESEARCH_RELEASE_NONCE,html:'<!doctype html><html><head><script nonce="'+RESEARCH_RELEASE_NONCE+'">window.release='+JSON.stringify(version)+';</script></head><body><header>Order.</header><script type="application/json" id="order-app-config">'+JSON.stringify(config)+'</script><script type="module" nonce="'+RESEARCH_RELEASE_NONCE+'">import "'+base+'research/application.mjs";</script></body></html>'},
    assets:{'research/application.mjs':{body:'export const version='+JSON.stringify(version)+';',type:'text/javascript; charset=utf-8'},'web/styles.css':{body:'body{color:'+ (version==='first'?'red':'blue')+'}',type:'text/css; charset=utf-8'}}};
}
function fixture(...packs){
  const index={},files=new Map(),calls=[];
  for(const value of packs){const encoded=encodeResearchRelease(value);index[value.build.digest]=encoded.entry;files.set(value.build.digest,encoded.bytes);}
  const env={ASSETS:{fetch:async request=>{const url=new URL(request.url);calls.push({path:url.pathname,method:request.method,origin:url.origin});const build=/^\/ia\/research-releases\/([a-f0-9]{64})\.json.gz$/.exec(url.pathname)?.[1];return files.has(build)?new Response(files.get(build),{headers:{'Content-Type':'application/gzip'}}):new Response(null,{status:404});}}};
  return {index,files,calls,env,store:createResearchReleaseStore(index)};
}

test('the compact Worker index preserves immutable pack identities and projects every original route after deployment-style bundling',async()=>{
  const {researchReleases:authoritative}=await import('../src/server/research-app/releases.gen.mjs');
  const {researchReleases:runtime}=await import('../src/server/research-release-runtime-index.gen.mjs');
  const source=await readFile(new URL('../src/server/research-release-runtime-index.gen.mjs',import.meta.url),'utf8');
  assert.deepEqual(Object.keys(runtime),Object.keys(authoritative));
  for(const [build,entry]of Object.entries(authoritative)){
    const {rowsGzip:originalRows,rowsFormat:originalFormat,...original}=entry,{rowsGzip,rowsFormat,...actual}=runtime[build];assert.deepEqual(actual,original,'pack hashes, byte lengths and remaining metadata are exact');assert.equal(rowsFormat,RESEARCH_RELEASE_ROW_IDENTITIES);assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(rowsGzip,'base64'))),researchReleaseRowIdentities(JSON.parse(gunzipSync(Buffer.from(originalRows,'base64')))));
  }
  assert.equal(source,researchReleaseRuntimeIndexSource(authoritative));
  assert.ok(Buffer.byteLength(source)<Buffer.byteLength(JSON.stringify(authoritative)),'shared row strings reduce the actual source imported by the Worker');
  const {transform}=createRequire(new URL('./build-tools/package.json',import.meta.url))('esbuild');
  const bundled=await transform(source,{format:'esm',target:'es2022',minify:true,keepNames:true});
  const restored=(await import('data:text/javascript;base64,'+Buffer.from(bundled.code).toString('base64'))).researchReleases;
  assert.deepEqual(restored,runtime);assert.equal(JSON.stringify(restored),JSON.stringify(runtime));
  assert.equal((await syncResearchReleaseRuntimeIndex({check:true})).changed,false);
});

test('every published artifact identity and full archive metadata survive runtime-only row projection',async()=>{
  const indexPath=new URL('../src/server/research-app/releases.gen.mjs',import.meta.url),before=await readFile(indexPath);
  const {researchReleases:authoritative}=await import('../src/server/research-app/releases.gen.mjs'),{researchReleases:runtime}=await import('../src/server/research-release-runtime-index.gen.mjs');
  const store=createResearchReleaseStore(runtime,{maxCachedReleases:1}),base=new URL('../public/ia/research-releases/',import.meta.url);let checked=0;
  for(const [build,entry]of Object.entries(authoritative)){
    const bytes=await readFile(new URL(build+'.json.gz',base));assert.equal(hash(bytes),entry.packSha256);assert.equal(bytes.length,entry.bytes);
    const original=JSON.parse(gunzipSync(bytes)),env={ASSETS:{fetch:async()=>new Response(bytes)}};const saved=await store.read(build,env,'https://archive.example');assert.deepEqual(saved.rows,original.rows,'titles, fixtures, pins and all metadata are read from the original checksummed pack');
    const rows=JSON.parse(gunzipSync(Buffer.from(entry.rowsGzip,'base64')));
    for(const row of rows)await Promise.all([320,360,375,390,430,768,1024,1280,1440,1920].flatMap(width=>['simple','detailed'].map(async mode=>{const identity=['order-research-application/v1',build,row.id,width];if(mode==='detailed')identity.push(mode);assert.equal(await store.artifactHash(build,row.id,width,mode),hash(JSON.stringify(identity)));checked++;})));
    assert.equal(hash(await readFile(new URL(build+'.json.gz',base))),entry.packSha256);
  }
  assert.ok(checked>10000);assert.deepEqual(await readFile(indexPath),before,'the append-only authoritative index is never rewritten');
});

test('runtime index generation is read-only in check mode and appends exact historical entries without changing packs',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'order-release-runtime-index-')),files=join(directory,'packs'),indexPath=join(directory,'releases.gen.mjs'),runtimeIndexPath=join(directory,'runtime-index.gen.mjs');
  const options={directory:files,indexPath},runtimeOptions={indexPath,runtimeIndexPath};
  const load=async()=> (await import('data:text/javascript;base64,'+(await readFile(runtimeIndexPath)).toString('base64'))).researchReleases;
  try{
    await assert.rejects(syncResearchReleaseRuntimeIndex({...runtimeOptions,check:true}),/INDEX_MISSING/);assert.deepEqual(await readdir(directory),[]);
    const old=pack('first'),next=pack('second');
    await sealResearchRelease(old,options);
    const oldPath=join(files,old.build.digest+'.json.gz'),oldPack=await readFile(oldPath),originalIndex=await readFile(indexPath);
    await assert.rejects(syncResearchReleaseRuntimeIndex({...runtimeOptions,check:true}),/RUNTIME_INDEX_STALE/);
    assert.deepEqual(await readFile(indexPath),originalIndex);assert.deepEqual((await readdir(directory)).sort(),['packs','releases.gen.mjs']);
    const first=await syncResearchReleaseRuntimeIndex(runtimeOptions);assert.equal(first.releases,1);assert.equal(first.uniqueRows,1);assert.equal(first.changed,true);
    const previous=await readFile(runtimeIndexPath),originalEntry=(await load())[old.build.digest];
    assert.deepEqual(originalEntry,encodeResearchRelease(old).entry);assert.deepEqual(await readFile(indexPath),originalIndex);assert.deepEqual(await readFile(oldPath),oldPack);
    assert.equal((await syncResearchReleaseRuntimeIndex({...runtimeOptions,check:true})).checked,true);assert.deepEqual(await readFile(runtimeIndexPath),previous);
    await writeFile(runtimeIndexPath,previous.toString('utf8').replace(originalEntry.packSha256,'0'.repeat(64)));
    const damaged=await readFile(runtimeIndexPath);
    await assert.rejects(syncResearchReleaseRuntimeIndex({...runtimeOptions,check:true}),/RUNTIME_INDEX_STALE/);assert.deepEqual(await readFile(runtimeIndexPath),damaged,'check mode cannot silently repair changed data');
    await syncResearchReleaseRuntimeIndex(runtimeOptions);assert.deepEqual(await readFile(runtimeIndexPath),previous);
    await sealResearchRelease(next,options);const appendedIndex=await readFile(indexPath);
    await assert.rejects(syncResearchReleaseRuntimeIndex({...runtimeOptions,check:true}),/RUNTIME_INDEX_STALE/);assert.deepEqual(await readFile(runtimeIndexPath),previous);
    await writeFile(indexPath+'.lock','another-sealer\n');
    await assert.rejects(syncResearchReleaseRuntimeIndex(runtimeOptions),/INDEX_BUSY/);assert.deepEqual(await readFile(runtimeIndexPath),previous);
    await rm(indexPath+'.lock');
    const second=await syncResearchReleaseRuntimeIndex(runtimeOptions);assert.equal(second.releases,2);assert.equal(second.uniqueRows,1,'identical row identities share one string across distinct source builds');
    const runtime=await load();assert.deepEqual(runtime[old.build.digest],originalEntry);assert.deepEqual(runtime[next.build.digest],encodeResearchRelease(next).entry);
    assert.deepEqual(await readFile(indexPath),appendedIndex);assert.deepEqual(await readFile(oldPath),oldPack);
    const f=fixture(old,next),store=createResearchReleaseStore(runtime);
    for(const original of [old,next]){
      assert.deepEqual(await store.read(original.build.digest,f.env,'https://order.example'),original,'each source build reads its own immutable payload after the runtime index is reconstructed');
      for(const mode of ['simple','detailed'])assert.equal(await store.artifactHash(original.build.digest,'q2/filled/email',390,mode),await f.store.artifactHash(original.build.digest,'q2/filled/email',390,mode));
    }
    assert.equal((await syncResearchReleaseRuntimeIndex({...runtimeOptions,check:true})).changed,false);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('new indexes contain only explicit route identities while all formats preserve full immutable pack rows and recorded targets',async()=>{
  const original=pack();
  for(const value of original.rows)value.hashes=Object.fromEntries([320,360,375,390,430,768,1024,1280,1440,1920].map(width=>[width,hash(value.id+'/'+width)]));
  const compact=encodeResearchRelease(original),legacy=encodeResearchRelease(original,{rowsFormat:null}),full=encodeResearchRelease(original,{rowsFormat:RESEARCH_RELEASE_FULL_ROWS});
  assert.equal(compact.entry.rowsFormat,RESEARCH_RELEASE_ROW_IDENTITIES);assert.equal(Object.hasOwn(legacy.entry,'rowsFormat'),false);
  const indexed=JSON.parse(gunzipSync(Buffer.from(compact.entry.rowsGzip,'base64')));
  assert.deepEqual(indexed,researchReleaseRowIdentities(original.rows));assert.ok(indexed.every(value=>Object.keys(value).join(',')==='id,screen,state,variant'));
  assert.ok(compact.entry.rowsGzip.length<legacy.entry.rowsGzip.length/2,'per-width catalog hashes are not duplicated in a new Worker index');
  assert.deepEqual(compact.bytes,legacy.bytes);assert.deepEqual(compact.bytes,full.bytes,'index compaction never changes sealed pack bytes');
  assert.deepEqual(JSON.parse(gunzipSync(compact.bytes)).rows,original.rows);
  for(const encoded of [legacy,full,compact]){
    const f=fixture(original),build=original.build.digest;f.index[build]=encoded.entry;
    const id='q2/filled/email',artifact=await f.store.artifactHash(build,id,390),target=await f.store.findTarget({rowId:id,width:390,hash:artifact});
    for(const key of ['id','screen','state','variant'])assert.equal(target.row[key],original.rows[1][key]);
    assert.equal(target.build,build);assert.equal(await f.store.findTarget({rowId:id,width:430,hash:artifact}),null);
    const release=await f.store.read(build,f.env,'https://order.example');assert.deepEqual(release.rows,original.rows);
    const parameters=new URLSearchParams({screen:target.row.screen,state:target.row.state,variant:target.row.variant,inspect:'1',channel:'12345678-1234-1234-1234-123456789abc',artifact,width:'390'});
    const config=configFrom(await renderResearchReleaseApplication(release,'a'.repeat(36),parameters));assert.equal(config.inspection.version,'recorded');assert.equal(config.inspection.artifact,artifact);
  }
});

test('row format declarations, compact shape, full metadata and projected route identities remain bound to the checksummed pack',async()=>{
  const original=pack(),build=original.build.digest,rowsGzip=rows=>gzipSync(JSON.stringify(rows),{level:9,mtime:0}).toString('base64');
  for(const rowsFormat of [null,'unknown/v1',42]){
    const f=fixture(original);f.index[build]={...f.index[build],rowsFormat};
    await assert.rejects(f.store.rows(build),/INDEX_INVALID/);await assert.rejects(f.store.read(build,f.env,'https://order.example'),/INDEX_INVALID/);
  }
  const wrongShape=fixture(original);wrongShape.index[build]={...wrongShape.index[build],rowsGzip:rowsGzip(original.rows)};
  await assert.rejects(wrongShape.store.read(build,wrongShape.env,'https://order.example'),/ROW_INVALID/);
  const extra=fixture(original),identities=researchReleaseRowIdentities(original.rows);identities[0].hashes={390:'a'.repeat(64)};
  extra.index[build]={...extra.index[build],rowsGzip:rowsGzip(identities)};await assert.rejects(extra.store.read(build,extra.env,'https://order.example'),/ROW_INVALID/);
  const switched=fixture(original);switched.index[build]={...switched.index[build],rowsGzip:rowsGzip(researchReleaseRowIdentities([row('q1','before'),original.rows[1]]))};
  await assert.rejects(switched.store.read(build,switched.env,'https://order.example'),/ROWS_MISMATCH/);
  const untagged=fixture(original);delete untagged.index[build].rowsFormat;await assert.rejects(untagged.store.read(build,untagged.env,'https://order.example'),/ROWS_MISMATCH/);
  for(const rowsFormat of [null,RESEARCH_RELEASE_FULL_ROWS]){
    const f=fixture(original),rows=structuredClone(original.rows);rows[0].title='changed metadata with the same route';
    f.index[build]={...encodeResearchRelease(original,{rowsFormat}).entry,rowsGzip:rowsGzip(rows)};
    await assert.rejects(f.store.read(build,f.env,'https://order.example'),/ROWS_MISMATCH/);
  }
  const next=pack('different-build'),swapped=fixture(original,next),other=swapped.index[next.build.digest];
  swapped.index[build]={...swapped.index[build],packSha256:other.packSha256,bytes:other.bytes};swapped.files.set(build,swapped.files.get(next.build.digest));
  await assert.rejects(swapped.store.read(build,swapped.env,'https://order.example'),/SOURCE_IDENTITY_MISMATCH/);
});

test('a legacy full-row archive is checked unchanged and remains byte-identical when a compact release is appended',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'order-release-formats-')),files=join(directory,'packs'),indexPath=join(directory,'releases.gen.mjs'),options={directory:files,indexPath};
  try{
    const old=pack('legacy'),next=pack('compact'),oldEncoded=encodeResearchRelease(old,{rowsFormat:null}),oldIndex={[old.build.digest]:oldEncoded.entry};
    const before='// Original index, preserved during read-only checks.\nexport const researchReleases='+JSON.stringify(oldIndex)+';\n',oldPath=join(files,old.build.digest+'.json.gz');
    await mkdir(files);await writeFile(oldPath,oldEncoded.bytes);await writeFile(indexPath,before);
    assert.equal((await sealResearchRelease(old,{...options,check:true})).checked,true);assert.equal((await sealResearchRelease(old,options)).sealed,false);
    assert.equal(await readFile(indexPath,'utf8'),before);assert.deepEqual(await readFile(oldPath),oldEncoded.bytes);
    await sealResearchRelease(next,options);
    const after=await readFile(indexPath,'utf8'),index=JSON.parse(after.split('export const researchReleases=')[1].slice(0,-2));
    assert.deepEqual(index[old.build.digest],oldEncoded.entry);assert.ok(after.includes(JSON.stringify(oldEncoded.entry)),'old compressed row bytes and metadata are preserved verbatim');
    assert.equal(index[next.build.digest].rowsFormat,RESEARCH_RELEASE_ROW_IDENTITIES);assert.deepEqual(await readFile(oldPath),oldEncoded.bytes);
    await verifyResearchReleaseFiles(index,files);assert.equal((await sealResearchRelease(old,{...options,check:true})).checked,true);
    assert.equal(await readFile(indexPath,'utf8'),after);assert.equal((await sealResearchRelease(next,{...options,check:true})).checked,true);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('an old build reads only its sealed private pack and serves its original bytes after a newer release exists',async()=>{
  const old=pack('first'),next=pack('second'),f=fixture(old,next);
  const release=await f.store.read(old.build.digest,f.env,'https://order.example/ia?view=qa-lab');
  assert.equal(release.build.digest,old.build.digest);assert.deepEqual(f.calls,[{path:'/ia/research-releases/'+old.build.digest+'.json.gz',method:'GET',origin:'https://order.example'}]);
  assert.equal(await serveResearchReleaseAsset(release,'research/application.mjs').text(),old.assets['research/application.mjs'].body);
  assert.equal(serveResearchReleaseAsset(release,'../research/application.mjs').status,404);assert.equal(serveResearchReleaseAsset(release,'web/new-version-only.mjs').status,404);
  assert.equal(await f.store.read(old.build.digest,f.env,'https://order.example'),release);assert.equal(f.calls.length,1,'a verified immutable pack can be cached');
  assert.equal(await f.store.read('e'.repeat(64),f.env,'https://order.example'),null);assert.equal(f.calls.length,1);
  assert.equal(Object.isFrozen(release.assets),true);
});

test('pack checksum, source identity, row index and unavailable storage fail closed without a current-build fallback',async()=>{
  const original=pack(),f=fixture(original),build=original.build.digest,correct=f.files.get(build);
  f.files.set(build,Buffer.concat([correct.subarray(0,-1),Buffer.from([correct.at(-1)^255])]));
  await assert.rejects(f.store.read(build,f.env,'https://order.example'),/CHECKSUM_MISMATCH/);
  f.files.set(build,correct);assert.equal((await f.store.read(build,f.env,'https://order.example')).build.digest,build);assert.equal(f.calls.length,2,'failed reads are retryable');
  await assert.rejects(createResearchReleaseStore(f.index).read(build,{},'https://order.example'),/BINDING_REQUIRED/);
  const changed=structuredClone(original);changed.build.sources['src/server/research-app/application.mjs']='f'.repeat(64);const forged=fixture(changed);
  await assert.rejects(forged.store.read(build,forged.env,'https://order.example'),/SOURCE_IDENTITY_MISMATCH/);
  const mismatch=fixture(original);mismatch.index[build]={...mismatch.index[build],rowsGzip:encodeResearchRelease({...original,rows:[row('q1','before')]}).entry.rowsGzip};
  await assert.rejects(mismatch.store.read(build,mismatch.env,'https://order.example'),/ROWS_MISMATCH/);
  const unavailable=fixture(original);unavailable.files.clear();await assert.rejects(unavailable.store.read(build,unavailable.env,'https://order.example'),/NOT_AVAILABLE/);
});

test('private pack requests use Workers-compatible manual redirects and reject every redirect without following it',async()=>{
  const original=pack(),build=original.build.digest;
  for(const status of [301,302,303,307,308]){
    const f=fixture(original),requests=[];let redirect=true;
    const env={ASSETS:{fetch:async request=>{
      assert.equal(request.redirect,'manual','Workers rejects the Fetch-standard error mode before a request is sent');
      assert.equal(request.method,'GET');assert.equal(request.headers.get('Accept-Encoding'),'identity');
      assert.equal(request.headers.has('Cookie'),false);assert.equal(request.headers.has('Authorization'),false);
      requests.push(request.url);
      return redirect?new Response(null,{status,headers:{Location:'https://other.example/release'}}):f.env.ASSETS.fetch(request);
    }}};
    await assert.rejects(f.store.read(build,env,'https://order.example'),/RESEARCH_RELEASE_NOT_AVAILABLE/);
    assert.deepEqual(requests,['https://order.example/ia/research-releases/'+build+'.json.gz']);
    redirect=false;assert.equal((await f.store.read(build,env,'https://order.example')).build.digest,build);
    assert.equal(requests.length,2,'a rejected redirect must not poison the verified-release cache');
  }
});

test('archive memory cache is bounded while simultaneous reads of one build share a verified fetch',async()=>{
  const packs=[pack('first'),pack('second'),pack('third')],f=fixture(...packs);
  const [a,b]=await Promise.all([f.store.read(packs[0].build.digest,f.env,'https://order.example'),f.store.read(packs[0].build.digest,f.env,'https://order.example')]);assert.equal(a,b);assert.equal(f.calls.length,1);
  for(const current of packs.slice(1))await f.store.read(current.build.digest,f.env,'https://order.example');
  assert.equal(f.calls.length,3);await f.store.read(packs[0].build.digest,f.env,'https://order.example');assert.equal(f.calls.length,4,'least recent immutable pack is loaded again instead of retaining every release');
});

test('recorded targets bind row, width and build and archived rendering changes only nonce and route config',async()=>{
  const original=pack(),f=fixture(original),build=original.build.digest,id='q2/filled/email',width=390;
  const artifact=await f.store.artifactHash(build,id,width);
  assert.equal(artifact,hash(JSON.stringify(['order-research-application/v1',build,id,width])));
  assert.equal((await f.store.findTarget({rowId:id,width,hash:artifact})).build,build);
  assert.equal(await f.store.findTarget({rowId:id,width:430,hash:artifact}),null);assert.equal(await f.store.findTarget({rowId:'q2/missing/email',width,hash:artifact}),null);
  assert.equal(await f.store.artifactHash(build,id,391),null);
  const release=await f.store.read(build,f.env,'https://order.example'),nonce='a'.repeat(36),channel='12345678-1234-1234-1234-123456789abc';
  const parameters=new URLSearchParams({screen:'q2',state:'filled',variant:'email',mode:'simple',inspect:'1',channel,artifact,width:String(width)});
  const html=await renderResearchReleaseApplication(release,nonce,parameters);
  assert.equal(html.includes('nonce="'+RESEARCH_RELEASE_NONCE+'"'),false);assert.equal(html.match(new RegExp('nonce="'+nonce+'"','g')).length,2);
  assert.ok(html.includes('window.release="first";'));assert.ok(html.includes('/ia/research-assets/'+build+'/research/application.mjs'));
  const config=JSON.parse(/id="order-app-config">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(config.initial.screen,'q2');assert.equal(config.initial.mode,'simple');assert.equal(config.inspection.version,'recorded');assert.equal(config.inspection.artifact,artifact);assert.equal(Object.hasOwn(config.inspection,'mode'),false);
  parameters.set('version','current');
  assert.equal(configFrom(await renderResearchReleaseApplication(release,nonce,parameters)).inspection.version,'recorded','an untrusted URL cannot relabel an archived release');
  assert.equal(configFrom(await renderResearchReleaseApplication(release,nonce,parameters,{inspectionVersion:'current',currentBuild:build})).inspection.version,'current');
  await assert.rejects(renderResearchReleaseApplication(release,nonce,parameters,{inspectionVersion:'current'}),/INSPECTION_VERSION_INVALID/);
  await assert.rejects(renderResearchReleaseApplication(release,nonce,parameters,{inspectionVersion:'current',currentBuild:'0'.repeat(64)}),/INSPECTION_VERSION_INVALID/);
  await assert.rejects(renderResearchReleaseApplication(release,nonce,parameters,{inspectionVersion:'future',currentBuild:build}),/INSPECTION_VERSION_INVALID/);
  parameters.set('artifact','0'.repeat(64));await assert.rejects(renderResearchReleaseApplication(release,nonce,parameters),/INVALID_RESEARCH_INSPECTION/);
  parameters.delete('inspect');parameters.set('state','unknown');await assert.rejects(renderResearchReleaseApplication(release,nonce,parameters),/ROUTE_NOT_FOUND/);
  await assert.rejects(renderResearchReleaseApplication(release,'"><script>bad</script>'),/NONCE_INVALID/);
});

test('simple historical hashes remain exact while detailed mode is explicit in target lookup and sealed inspection',async()=>{
  const original=pack(),build=original.build.digest,id='q2/filled/email',width=390,nonce='a'.repeat(36),channel='12345678-1234-1234-1234-123456789abc';
  for(const rowsFormat of [null,RESEARCH_RELEASE_ROW_IDENTITIES]){
    const f=fixture(original);f.index[build]=encodeResearchRelease(original,{rowsFormat}).entry;
    const simple=await f.store.artifactHash(build,id,width),detailed=await f.store.artifactHash(build,id,width,'detailed');
    assert.equal(simple,hash(JSON.stringify(['order-research-application/v1',build,id,width])));
    assert.equal(simple,await f.store.artifactHash(build,id,width,'simple'));assert.notEqual(detailed,simple);
    assert.equal(detailed,hash(JSON.stringify(['order-research-application/v1',build,id,width,'detailed'])));
    const legacy=await f.store.findTarget({rowId:id,width,hash:simple});assert.equal(Object.hasOwn(legacy,'mode'),false);
    assert.equal(await f.store.findTarget({rowId:id,width,hash:detailed}),null,'absence never reverse-infers detailed mode');
    assert.equal(await f.store.findTarget({rowId:id,width,hash:simple,mode:'detailed'}),null);
    assert.equal((await f.store.findTarget({rowId:id,width,hash:detailed,mode:'detailed'})).mode,'detailed');
    for(const mode of ['',null,'unknown']){
      await assert.rejects(f.store.artifactHash(build,id,width,mode),/INVALID_RESEARCH_MODE/);
      await assert.rejects(f.store.findTarget({rowId:id,width,hash:simple,mode}),/INVALID_RESEARCH_MODE/);
    }
    const release=await f.store.read(build,f.env,'https://order.example'),parameters=new URLSearchParams({screen:'q2',state:'filled',variant:'email',inspect:'1',channel,artifact:simple,width:String(width)});
    const old=configFrom(await renderResearchReleaseApplication(release,nonce,parameters));assert.equal(old.initial.mode,'simple');assert.equal(Object.hasOwn(old.inspection,'mode'),false);
    parameters.set('mode','detailed');await assert.rejects(renderResearchReleaseApplication(release,nonce,parameters),/INVALID_RESEARCH_INSPECTION/);
    parameters.set('artifact',detailed);const current=configFrom(await renderResearchReleaseApplication(release,nonce,parameters));assert.equal(current.initial.mode,'detailed');assert.equal(current.inspection.mode,'detailed');
    parameters.delete('mode');await assert.rejects(renderResearchReleaseApplication(release,nonce,parameters),/INVALID_RESEARCH_INSPECTION/);
    parameters.set('mode','invalid');await assert.rejects(renderResearchReleaseApplication(release,nonce,parameters),/INVALID_RESEARCH_MODE/);
    assert.deepEqual(release.rows,original.rows,'mode identity never rewrites a historical row or pack');
  }
});

test('sealing is append-only, reproducible, read-only in check mode and detects damaged old packs',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'order-research-release-')),files=join(directory,'packs'),indexPath=join(directory,'releases.gen.mjs'),options={directory:files,indexPath};
  try{
    const old=pack('first'),next=pack('second');
    await assert.rejects(sealResearchRelease(old,{...options,check:true}),/NOT_SEALED/);assert.deepEqual(await readdir(directory),[]);
    const a=await sealResearchRelease(old,options);assert.equal(a.sealed,true);const oldPath=join(files,old.build.digest+'.json.gz'),before=await readFile(oldPath);
    assert.equal((await sealResearchRelease(old,options)).sealed,false);assert.equal((await sealResearchRelease(old,{...options,check:true})).checked,true);
    await sealResearchRelease(next,options);assert.deepEqual(await readFile(oldPath),before);
    const index=JSON.parse((await readFile(indexPath,'utf8')).split('export const researchReleases=')[1].slice(0,-2));assert.equal(Object.keys(index).length,2);await verifyResearchReleaseFiles(index,files);
    const different=structuredClone(old);different.assets['research/application.mjs'].body='changed under the same digest';await assert.rejects(sealResearchRelease(different,options),/IMMUTABLE_COLLISION/);assert.deepEqual(await readFile(oldPath),before);
    await writeFile(oldPath,Buffer.from('not the sealed gzip'));await assert.rejects(sealResearchRelease(next,{...options,check:true}),/ARCHIVE_CHANGED/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('collection snapshots actual served assets and rejects an incomplete dependency inventory',async()=>{
  const original=pack(),base='/ia/research-assets/'+original.build.digest+'/';
  const page={researchBuild:original.build,listResearchRows:()=>original.rows,listResearchAssetPaths:()=>Object.keys(original.assets),
    serveResearchAsset:async path=>{assert.ok(path.startsWith(base));const asset=original.assets[path.slice(base.length)];return asset?new Response(asset.body,{headers:{'Content-Type':asset.type}}):new Response(null,{status:404});},
    renderResearchApplication:async nonce=>{assert.equal(nonce,RESEARCH_RELEASE_NONCE);return original.shell.html;}};
  const collected=await collectResearchRelease(page);assert.deepEqual(collected,original);assert.equal(hash(encodeResearchRelease(collected).bytes),hash(encodeResearchRelease(await collectResearchRelease(page)).bytes));
  original.assets['research/application.mjs'].body="import './missing.mjs';";await assert.rejects(collectResearchRelease(page),/DEPENDENCY_MISSING/);
});

test('current Worker assets, page and HTML exports use the same sealed Node bytes even after raw serializer cache is populated',async()=>{
  const source=await import('../src/server/research-app/page.mjs');
  const current=source.researchBuild,base=source.researchAssetBase,rows=(await source.listResearchRows()).filter(value=>['onboarding/guest-1/email','q1/before/email','q2/empty/email','q2/filled/email','notifications/list/email'].includes(value.id));
  assert.equal(rows.length,5);
  const assetNames=['research/bootstrap.js','research/quote-integrations.mjs','bridge/business-directory.mjs'],assets={};
  for(const name of assetNames){const response=await source.serveResearchAsset(base+name);assert.equal(response.status,200);assets[name]={body:await response.text(),type:response.headers.get('Content-Type')};}
  const html=await source.renderResearchApplication(RESEARCH_RELEASE_NONCE,new URLSearchParams({screen:'onboarding',state:'guest-1'}));
  const original={format:RESEARCH_RELEASE_FORMAT,build:current,rows,shell:{nonce:RESEARCH_RELEASE_NONCE,html:html.replace('<head>','<head><!-- sealed-node-shell -->')},assets};
  const previous=pack('previous'),f=fixture(original,previous),directory=await mkdtemp(join(tmpdir(),'order-worker-release-'));
  try{
    const {build}=createRequire(new URL('./build-tools/package.json',import.meta.url))('esbuild'),output=join(directory,'worker.mjs');
    await build({entryPoints:[fileURLToPath(new URL('../src/server/research-app/page.mjs',import.meta.url))],outfile:output,bundle:true,platform:'node',format:'esm',target:'es2022',keepNames:true,logLevel:'silent',plugins:[{
      name:'immutable-release-index-fixture',setup(builder){
        builder.onResolve({filter:/^\.\.\/research-release-runtime-index\.gen\.mjs$/},()=>({path:'index',namespace:'sealed-fixture'}));
        builder.onLoad({filter:/.*/,namespace:'sealed-fixture'},()=>({contents:'export const researchReleases='+JSON.stringify(f.index)+';',loader:'js'}));
      }
    }]});
    const worker=await import(pathToFileURL(output).href),raw={};
    for(const name of assetNames)raw[name]=await (await worker.serveResearchAsset(base+name)).text();
    assert.ok(assetNames.some(name=>raw[name]!==assets[name].body),'the regression must exercise a real Function.toString change caused by bundling');
    const bytes=f.files.get(current.digest);f.files.delete(current.digest);
    await assert.rejects(worker.serveResearchAsset(base+assetNames[0],f.env,'https://worker.example'),/NOT_AVAILABLE/);
    await assert.rejects(worker.renderResearchApplication('a'.repeat(36),new URLSearchParams(),f.env,'https://worker.example'),/NOT_AVAILABLE/);
    f.files.set(current.digest,bytes);
    await assert.rejects(worker.serveResearchAsset(base+assetNames[0],{},'https://worker.example'),/BINDING_REQUIRED/);
    await assert.rejects(worker.renderResearchApplication('a'.repeat(36),new URLSearchParams(),null,'https://worker.example'),/BINDING_REQUIRED/);
    for(const name of assetNames){
      const served=await worker.serveResearchAsset(base+name,f.env,'https://worker.example');
      assert.equal(await served.text(),assets[name].body,name);assert.equal(served.headers.get('X-Order-Research-Build'),current.digest);
      assert.equal(await (await worker.serveResearchAsset(base+name)).text(),raw[name],'no-environment collection remains available even after sealing');
    }
    assert.equal((await worker.serveResearchAsset(base+'research/quote-document.html',f.env,'https://worker.example')).status,404,'a missing sealed asset must not fall back to a current generator');
    assert.ok(f.calls.every(call=>call.origin==='https://worker.example'));
    const nonce='a'.repeat(36),parameters=new URLSearchParams({screen:'q2',state:'filled',variant:'email',mode:'detailed'});
    const sealed=await worker.renderResearchApplication(nonce,parameters,f.env,'https://worker.example');
    assert.equal(sealed,await renderResearchReleaseApplication(original,nonce,parameters));assert.ok(sealed.includes('<!-- sealed-node-shell -->'));
    for(const input of [{screen:'q2'},{screen:'detailed-r3'},{screen:'notifications'}]){
      const direct=new URLSearchParams(input),rawInitial=configFrom(await source.renderResearchApplication(nonce,direct)).initial,sealedInitial=configFrom(await worker.renderResearchApplication(nonce,direct,f.env,'https://worker.example')).initial;
      for(const key of ['screen','state','variant','mode'])assert.equal(sealedInitial[key],rawInitial[key],'current route defaults remain available after sealing: '+key);
    }
    const selected=rows.find(value=>value.id==='q2/filled/email'),artifact=await worker.researchArtifactHash(selected,390,'detailed');
    parameters.set('inspect','1');parameters.set('channel','12345678-1234-1234-1234-123456789abc');parameters.set('artifact',artifact);parameters.set('width','390');
    const currentInspection=configFrom(await worker.renderResearchApplication(nonce,parameters,f.env,'https://worker.example')).inspection;
    assert.equal(currentInspection.version,'current');assert.equal(currentInspection.mode,'detailed');
    parameters.set('build',current.digest);parameters.set('version','recorded');
    assert.equal(configFrom(await worker.renderResearchApplication(nonce,parameters,f.env,'https://worker.example')).inspection.version,'recorded');
    parameters.set('artifact','0'.repeat(64));await assert.rejects(worker.renderResearchApplication(nonce,parameters,f.env,'https://worker.example'),/INVALID_RESEARCH_INSPECTION/);
    parameters.set('build',previous.build.digest);parameters.set('version','current');
    parameters.set('artifact',await f.store.artifactHash(previous.build.digest,selected.id,390,'detailed'));
    assert.equal(configFrom(await worker.renderResearchApplication(nonce,parameters,f.env,'https://worker.example')).inspection.version,'recorded');
    assert.equal(await worker.archivedResearchArtifact(selected.id,390,parameters.get('artifact'),f.env,'https://worker.example'),null);
    const archived=await worker.archivedResearchArtifact(selected.id,390,parameters.get('artifact'),f.env,'https://worker.example','detailed');
    assert.equal(archived.application.build,previous.build.digest);assert.equal(archived.version,'recorded');assert.equal(archived.hash,parameters.get('artifact'));
    assert.equal(configFrom(archived.html).initial.screen,'q2','the actual archived artifact route needs only compact index identity');
    assert.equal(configFrom(archived.html).initial.mode,'detailed');assert.equal(archived.mode,'detailed');assert.equal(new URL(archived.application.url,'https://worker.example').searchParams.get('mode'),'detailed');
    const detailedExport=await worker.researchArtifact(selected,390,f.env,'https://worker.example','detailed');
    assert.equal(detailedExport.mode,'detailed');assert.equal(detailedExport.hash,artifact);assert.equal(configFrom(detailedExport.html).initial.mode,'detailed');
    assert.equal(new URL(detailedExport.application.url,'https://worker.example').searchParams.get('mode'),'detailed');
    const exported=await worker.researchArtifact(selected,390,f.env,'https://worker.example'),exportParameters=new URL(exported.application.url,'https://worker.example').searchParams;
    assert.equal(Object.hasOwn(exported,'mode'),false);assert.notEqual(exported.hash,detailedExport.hash);
    assert.equal(exported.html,await renderResearchReleaseApplication(original,'0123456789abcdef0123456789abcdef',exportParameters));
    assert.ok(exported.editable.includes('<!-- sealed-node-shell -->'));assert.equal(exported.exportHash,hash(exported.editable));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('the unsealed current renderer binds inspection channel, exact catalog row, approved width and artifact hash',async()=>{
  const page=await import('../src/server/research-app/page.mjs'),nonce='b'.repeat(36),selected=(await page.listResearchRows()).find(value=>value.id==='q2/filled/email');
  assert.ok(selected);
  const parameters=new URLSearchParams({screen:selected.screen,state:selected.state,variant:selected.variant,mode:'detailed',inspect:'1',channel:'12345678-1234-1234-1234-123456789abc',width:'390',artifact:await page.researchArtifactHash(selected,390,'detailed')});
  const inspection=configFrom(await page.renderResearchApplication(nonce,parameters)).inspection;assert.equal(inspection.version,'current');assert.equal(inspection.mode,'detailed');
  for(const [key,value]of [['channel','a'.repeat(36)],['artifact','0'.repeat(64)],['width','430']]){
    const invalid=new URLSearchParams(parameters);invalid.set(key,value);await assert.rejects(page.renderResearchApplication(nonce,invalid),/INVALID_RESEARCH_INSPECTION/,key);
  }
  const wrongMode=new URLSearchParams(parameters);wrongMode.set('mode','simple');await assert.rejects(page.renderResearchApplication(nonce,wrongMode),/INVALID_RESEARCH_INSPECTION/);
  wrongMode.delete('mode');await assert.rejects(page.renderResearchApplication(nonce,wrongMode),/INVALID_RESEARCH_INSPECTION/);
  wrongMode.set('artifact',await page.researchArtifactHash(selected,390));assert.equal(Object.hasOwn(configFrom(await page.renderResearchApplication(nonce,wrongMode)).inspection,'mode'),false);
  wrongMode.set('mode','unknown');await assert.rejects(page.renderResearchApplication(nonce,wrongMode),/INVALID_RESEARCH_MODE/);
  const width=new URLSearchParams(parameters);width.set('width','391');width.set('artifact',await page.researchArtifactHash(selected,391,'detailed'));
  await assert.rejects(page.renderResearchApplication(nonce,width),/INVALID_RESEARCH_INSPECTION/);
  const route=new URLSearchParams(parameters);route.set('state','not-in-catalog');route.set('artifact',await page.researchArtifactHash({...selected,id:'q2/not-in-catalog/email'},390,'detailed'));
  await assert.rejects(page.renderResearchApplication(nonce,route),/INVALID_RESEARCH_INSPECTION/);
});
