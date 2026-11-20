// Preserve the actual supplemental bytes from a verified, separate checkout.
// Never regenerate the old release from a new source tree.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const source=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Pass the verified original checkout directory');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Original commit identity is required');
const {getQaSupplemental,qaMvpCss}=await import(pathToFileURL(resolve(source,'src/server/r3-qa-assets.mjs')));
const {cssGzip,cssHash}=await import(pathToFileURL(resolve(source,'src/server/r3-ui/catalog.gen.mjs')));
const release=await getQaSupplemental(),bodies={},scripts={},rows={};
const digest=value=>createHash('sha256').update(value).digest('hex');
const packed=value=>gzipSync(value).toString('base64');
for(const [id,doc] of release.documents){
  const body=digest(doc.body),script=digest(doc.mount);
  bodies[body]??=packed(doc.body);scripts[script]??=packed(doc.mount);
  rows[id]={row:doc.row,hashes:doc.hashes,body,script};
}
const values={supplementalHistoryCommit:commit,supplementalHistoryRows:rows,supplementalHistoryBodies:bodies,supplementalHistoryScripts:scripts,supplementalHistoryCssGzip:cssGzip,supplementalHistoryCssHash:cssHash,supplementalHistoryExtraCss:qaMvpCss};
await writeFile(new URL('../../src/server/r3-ui/supplemental-history.gen.mjs',import.meta.url),'// Exact supplemental review release from '+commit+'. Historical reads only.\n'+Object.entries(values).map(([key,value])=>'export const '+key+'='+JSON.stringify(value)+';').join('\n')+'\n');
console.log(JSON.stringify({commit,documents:release.documents.size,bodies:Object.keys(bodies).length,scripts:Object.keys(scripts).length,cssHash}));
