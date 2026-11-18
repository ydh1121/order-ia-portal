// Write the very same editable payload the authenticated QA page downloads.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {serveR3Artifact} from '../../src/server/r3-qa-page.mjs';
const out=process.argv[2], endpoint='https://fixture.invalid/api/ia/r3-qa/artifact';
if(!out)throw Error('Supply an empty private output directory.');
const list=await(await serveR3Artifact(new Request(endpoint))).json();
const manifest=[];
for(const width of [390,1440]){
  const dir=join(out,String(width));await mkdir(dir,{recursive:true});
  for(const row of list.items){
    const u=new URL(endpoint);u.search=new URLSearchParams({id:row.id,width:String(width),version:'current'});
    const a=await(await serveR3Artifact(new Request(u))).json();
    const file=row.id.replaceAll('/','__')+'.html';await writeFile(join(dir,file),a.editable);
    manifest.push({release:a.release,screen:row.screen,state:row.state,variant:row.variant,viewport:width,file:width+'/'+file,artifactHash:a.hash,sha256:a.exportHash,bytes:Buffer.byteLength(a.editable)});
  }
}
await writeFile(join(out,'manifest.json'),JSON.stringify({release:list.release,frames:manifest},null,2)+'\n');
console.log(JSON.stringify({release:list.release,frames:manifest.length}));
