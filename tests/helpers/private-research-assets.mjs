// Server-binding adapter for private immutable release packs in browser tests.
// HTTP requests still go through the real /ia handler, which rejects this path.
import {lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const releases=fileURLToPath(new URL('../../public/ia/research-releases/',import.meta.url));
export function createPrivateResearchAssets(directory=releases){
  return {async fetch(request){
    const url=new URL(request.url),match=/^\/ia\/research-releases\/([a-f0-9]{64})\.json\.gz$/.exec(url.pathname);
    if(request.method!=='GET'||url.search||!match)return new Response(null,{status:404});
    const path=join(directory,match[1]+'.json.gz');
    try{
      if(!(await lstat(path)).isFile())return new Response(null,{status:404});
      // The real release store separately verifies the trusted index, size,
      // compressed checksum and full source/row identity before using bytes.
      return new Response(await readFile(path),{headers:{'Content-Type':'application/gzip','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return new Response(null,{status:404});throw error;}
  }};
}
