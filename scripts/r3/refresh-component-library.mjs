// Add navigable uses of shared primitives to the existing common/default review
// frame. Link only frames in this catalog and keep historical review identities.
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as data from '../../src/server/r3-ui/catalog.gen.mjs';
import {frameCode} from '../../src/server/r3-ui/runtime.gen.mjs';
const path=new URL('../../src/server/r3-ui/catalog.gen.mjs',import.meta.url);
const hash=s=>createHash('sha256').update(s).digest('hex');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const countBySpec=[
  ['입력','이메일·비밀번호',/<input\b[^>]*type="(?:password|email)"/i,['login/empty/email','signup/empty/email']],
  ['입력','선택·알림 스위치',/role="switch"/,['profile/notification/email','profile/menu/email']],
  ['선택','태그와 자동 추천',/class="[^"]*tag-field/,['search/suggestions/email','search/results/email']],
  ['선택','단일·복수 선택',/type="checkbox"/,['terms/required/email','drawer/info/email']],
  ['문서','파일 선택·오류',/type="file"/,['business/empty/email','proof/blocked/email']],
  ['화면 전환','패널·드로어',/role="dialog"/,['login/empty/email','drawer/booking/email']],
  ['피드백','목록 뼈대·데이터 표시',/class="[^"]*(skeleton|t-skel)/,['passes/loading/email','passes/grid/email']],
  ['피드백','버튼 처리 중',/class="[^"]*spinner/,['drawer/saving/email','signature/processing/email']],
  ['아이콘','오더 패스·브랜드 점',/class="[^"]*pass-dots/,['passes/empty/email','passes/loading/email','profile/default/email']]
];
const cache=new Map();
const body=row=>{if(!cache.has(row.current))cache.set(row.current,gunzipSync(Buffer.from(data.frames[row.current],'base64')).toString());return cache.get(row.current);};
const groups=new Map();
for(const [group,label,pattern,targets] of countBySpec){
  const used=data.catalog.filter(row=>row.screen!=='common'&&pattern.test(body(row)));
  const links=targets.map(id=>{const row=data.catalog.find(f=>f.id===id);if(!row)throw Error('Unknown component usage '+id);return '<button type="button" class="btn text" data-mf-go="'+row.screen+'" data-mf-state="'+row.state+'">'+esc(row.label)+' · '+esc(row.stateLabel)+'</button>';});
  const uses=[...new Set(used.map(r=>r.label))].map(esc);
  if(!groups.has(group))groups.set(group,[]);
  groups.get(group).push('<details><summary>'+esc(label)+' <small>사용 상태 '+used.length+'개</small></summary><div class="usage-links">'+links.join('')+'</div><p>'+uses.join(' · ')+'</p></details>');
}
const index='<section id="r3-component-library"><header><h1>공통 컴포넌트</h1><small>'+esc(data.release)+'</small></header>'+[...groups].map(([group,items])=>'<section><h2>'+esc(group)+'</h2>'+items.join('')+'</section>').join('')+'<style>#r3-component-library{padding:18px 14px;background:white}#r3-component-library header,#r3-component-library summary{display:flex;align-items:center;justify-content:space-between;gap:8px}#r3-component-library h1{font-size:24px}#r3-component-library h2{margin-top:20px;font-size:17px}#r3-component-library details{padding:8px 0;border-bottom:1px solid #e1e6ea}#r3-component-library summary{cursor:pointer}#r3-component-library small,#r3-component-library p{font-size:13px;color:#526070}#r3-component-library .usage-links{display:flex;gap:4px;flex-wrap:wrap}</style></section><!--r3-library-end-->';
const frames={...data.frames};
const catalog=data.catalog.map(row=>{
  if(row.id!=='common/default/email')return row;
  const old=body(row).replace(/<section id="r3-component-library">[\s\S]*?<!--r3-library-end-->/,'');
  const doc=old.replace(/^<main[^>]*>/,m=>m+index);
  const current=hash(doc);frames[current]=gzipSync(doc).toString('base64');
  const script=hash(frameCode.replace(/^function /,''));
  const hashes=Object.fromEntries(Object.keys(row.hashes).map(width=>[width,hash([row.id,'current',current,data.cssHash,width,script].join('|'))]));
  return {...row,current,hashes,authoredChange:true};
});
const used=new Set(catalog.flatMap(row=>[row.current,row.previous]));
const changes={catalog,frames:Object.fromEntries(Object.entries(frames).filter(([key])=>used.has(key)))};
const file=(await readFile(path,'utf8')).split('\n').map(line=>{const name=/^export const (\w+)=/.exec(line)?.[1];return Object.hasOwn(changes,name)?'export const '+name+'='+JSON.stringify(changes[name])+';':line;});
await writeFile(path,file.join('\n'));
