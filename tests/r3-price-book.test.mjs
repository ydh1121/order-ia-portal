import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPriceBookModel} from '../src/server/r3-price-book-model.mjs';
import {createPriceMatrixModel} from '../src/server/order-engine/calculation/price-matrix.mjs';
import {personalPrice} from '../src/server/r3-personal-price.mjs';
import {signedWorkspace} from './r3-business-identities.fixture.mjs';
const matrix=createPriceMatrixModel(),model=createPriceBookModel(matrix),day='2026-11-19';
const rows=readFileSync(new URL('./fixtures/egg-price-reference-20261109.tsv',import.meta.url),'utf8').trim().split('\n').slice(1).map(s=>s.split('\t'));
const grades=[['king','왕란'],['xl','특란'],['large','대란'],['medium','중란']].map(([id,name])=>({id,name}));
const original={name:'권희상회 단가표 2026.11.09 참고',supplierName:null,originName:null,productName:null,shell:null,packSize:null,minimumOrder:10,matrix:{schema:1,grades,rows:rows.map(r=>({min:Number(r[0]),max:r[1]===''?null:Number(r[1]),cells:r.slice(2)}))}};
const savedDraft=book=>{const current=model.selected(book);return {...original,packSize:current.shell.basePackSize,shell:current.shell.key==='unspecified'?null:current.shell.key,matrix:current.matrix,priceBook:book};};
const request=(revision,book)=>({action:'save',requestKey:crypto.randomUUID(),expectedRevision:revision,draft:savedDraft(book)});
const actor={id:'price-review-owner',role:'OWNER',email:'price-review-owner@example.invalid'},now='2026-11-19T09:00:00.000Z';

test('legacy 19 x 8 matrix is preserved under its unknown shell, with blank 1–4 shells and no zero-price invention',()=>{
 const b=model.fromDraft(original,day),s=model.selected(b);assert.equal(b.activeShell,'unspecified');assert.equal(s.version.date,'2026-11-09');
 assert.deepEqual(s.matrix,original.matrix);assert.equal(s.matrix.rows.flatMap(r=>r.cells).length,152);
 for(const shell of s.version.shells.filter(s=>s.key!=='unspecified'))assert(shell.matrix.rows.every(r=>r.cells.every(c=>c==='')));
 assert.deepEqual(model.normalize(b),b);
});

test('date fork remains independent, immutable source values survive database CAS save/reload and an old tab is rejected',async()=>{
 const f=signedWorkspace(),db=f.env.ORDER_QA_DB,b=model.fromDraft(original,day);
 const first=await personalPrice(db,actor,request(0,b),now);assert.deepEqual(first.draft.matrix,original.matrix);
 const before=JSON.stringify(b.versions[0]);model.cloneVersion(b,'v20261120','2026-11-20','11월 20일');
 model.selected(b).matrix.rows[0].cells[0]='7000';assert.equal(JSON.stringify(b.versions[1]),before);
 const next=await personalPrice(db,actor,request(1,b),now);assert.equal(next.revision,2);
 const reopened=await personalPrice(db,actor,null,now);assert.equal(reopened.draft.priceBook.versions.length,2);
 assert.deepEqual(reopened.draft.priceBook.versions[1].shells.find(s=>s.key==='unspecified').matrix,original.matrix);
 assert.equal(reopened.draft.matrix.rows[0].cells[0],'7000');
 await assert.rejects(()=>personalPrice(db,actor,request(1,b),now),e=>e.status===409);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM r3_personal_price_edit').get().n,2);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM r3_price_version').get().n,0);
 assert.deepEqual((await personalPrice(db,{...actor,email:'another@example.invalid'},null,now)).draft,null);
});

test('tree drag order keeps cell/grade association and range boundaries while illegal levels and cycles are refused',()=>{
 const b=model.fromDraft(original,day),s=model.selected(b),firstPrices=s.matrix.rows.map(r=>r.cells.slice());
 model.move(b,{kind:'grade',id:'king'},{kind:'grade',id:'large'},'after');assert.deepEqual(s.matrix.grades.map(g=>g.id),['xl','large','king','medium']);
 assert.deepEqual(s.matrix.rows.map(r=>r.cells.slice(4,6)),firstPrices.map(r=>r.slice(0,2)));
 model.move(b,{kind:'range',id:'1:10'},{kind:'range',id:'21:30'},'after');assert.equal(s.shell.rowOrder[2],'1:10');assert.equal(s.matrix.rows[0].min,1);assert.equal(s.matrix.rows[0].max,10);
 assert.throws(()=>model.move(b,{kind:'grade',id:'king'},{kind:'shell',id:'2'}),/PRICE_TREE_LEVEL/);
 s.version.packages=[{id:'tray',name:'한 판',parentId:null,eggs:30,trays:1,rules:[]},{id:'box',name:'한 상자',parentId:null,eggs:180,trays:6,rules:[]}];
 model.move(b,{kind:'package',id:'tray'},{kind:'package',id:'box'},'inside');assert.equal(s.version.packages[0].parentId,'box');
 assert.throws(()=>model.move(b,{kind:'package',id:'box'},{kind:'package',id:'tray'},'inside'),/PRICE_PACK_CYCLE/);assert.equal(s.version.packages[1].parentId,null);
 assert.throws(()=>model.move(b,{kind:'package',id:'box'},{kind:'package',id:'tray'},'before'),/PRICE_PACK_CYCLE/);assert.equal(s.version.packages.find(p=>p.id==='box').parentId,null);
});

test('packaging rules preview preserves all manual prices, independent tables and subsequent cell overrides',()=>{
 const b=model.fromDraft({...original,packSize:30},day),s=model.selected(b);s.version.packages.push({id:'tray30',name:'30구 한 판',parentId:null,eggs:30,trays:1,rules:[{min:1,max:20,fee:'210'},{min:21,max:null,fee:'190'}]});
 let preview=model.packagingPreview(b,'tray30');assert.equal(preview.changes.length,0);assert.equal(preview.kept.length,152/2);
 const legacy=JSON.stringify(s.shell.matrix);model.select(b,b.activeVersion,b.activeShell,'tray30');
 preview=model.packagingPreview(b,'tray30');assert.equal(preview.changes.length,76);assert.equal(preview.changes[0].price,'6190');model.applyPackaging(b,preview);
 let active=model.selected(b);assert.equal(active.matrix.rows[0].cells[1],'+210');assert.equal(active.matrix.rows[2].cells[1],'+190');assert.equal(JSON.stringify(active.shell.matrix),legacy);
 const edited=model.copy(active.matrix);edited.rows[0].cells[1]='6500';model.capture(b,edited);active.version.packages[0].rules[0].fee='220';
 preview=model.packagingPreview(b,'tray30');assert.equal(preview.kept.length,1);assert(!preview.changes.some(x=>x.r===0&&x.c===1));model.applyPackaging(b,preview);assert.equal(model.selected(b).matrix.rows[0].cells[1],'6500');
 const overwrite=model.packagingPreview(b,'tray30',{overwrite:true});assert(overwrite.changes.some(x=>x.r===0&&x.c===1));
 model.selected(b).matrix.rows[0].cells[0]='6000';assert.throws(()=>model.applyPackaging(b,overwrite),/PRICE_PREVIEW_STALE/);
});

test('server rejects forged selections, prototypes, invalid dates and overlapping packaging tiers',async()=>{
 const b=model.fromDraft(original,day),f=signedWorkspace();
 const mismatch=request(0,b);mismatch.draft.matrix=model.copy(original.matrix);mismatch.draft.matrix.rows[0].cells[0]='9999';
 await assert.rejects(()=>personalPrice(f.env.ORDER_QA_DB,actor,mismatch,now),e=>e.code==='PRICE_BOOK_SELECTION'||e.message==='PRICE_BOOK_SELECTION');
 const invalid=model.copy(b);invalid.versions[0].date='2026-02-30';assert.throws(()=>model.normalize(invalid));
 const p={id:'__proto__',name:'잘못된 포장',parentId:null,eggs:30,trays:1,rules:[]};invalid.versions[0].date=day;invalid.versions[0].packages.push(p);assert.throws(()=>model.normalize(invalid));
 p.id='normal';p.rules=[{min:1,max:10,fee:'210'},{min:10,max:null,fee:'190'}];assert.throws(()=>model.normalize(invalid),/PRICE_PACK_INVALID/);
});

test('base pack metadata survives alternate packaging and date forks',()=>{
 const b=model.fromDraft({...original,packSize:30},day),v=model.selected(b).version;
 v.packages.push({id:'ten',name:'10구',eggs:10,trays:1,parentId:null,rules:[]});
 model.select(b,b.activeVersion,b.activeShell,'ten');assert.equal(model.selected(b).shell.basePackSize,30);
 model.select(b,b.activeVersion,b.activeShell,'base');assert.equal(model.selected(b).shell.basePackSize,30);
 model.cloneVersion(b,'next','2026-11-20','다음');assert.equal(model.selected(b).shell.basePackSize,30);
});

test('pack-specific range tree ordering survives normalization and is independent of base bands',()=>{
 const b=model.fromDraft(original,day),v=model.selected(b).version;v.packages.push({id:'custom',name:'별도 포장',parentId:null,eggs:30,trays:1,rules:[]});
 model.select(b,b.activeVersion,b.activeShell,'custom');const s=model.selected(b);s.matrix.rows=[{min:1,max:10,cells:Array(8).fill('')},{min:11,max:null,cells:Array(8).fill('')}];
 model.move(b,{kind:'range',id:'11:*'},{kind:'range',id:'1:10'},'before');assert.deepEqual(model.selected(model.normalize(b)).rowOrder,['11:*','1:10']);
 model.select(b,b.activeVersion,b.activeShell,'base');assert.equal(model.selected(b).matrix.rows.length,19);assert.deepEqual(model.selected(b).rowOrder,[]);
});

test('changing packaging cannot silently convert or copy a different egg-count price',()=>{
 const b=model.fromDraft({...original,packSize:30},day),v=model.selected(b).version;v.packages.push({id:'ten',name:'10구 포장',parentId:null,eggs:10,trays:1,rules:[]},{id:'box',name:'6판 한 상자',parentId:null,eggs:180,trays:6,rules:[]});
 model.select(b,b.activeVersion,b.activeShell,'ten');assert(model.selected(b).matrix.rows.every(r=>r.cells.every(v=>v==='')));assert.equal(model.selected(b).shell.basePackSize,30);
 model.select(b,b.activeVersion,b.activeShell,'box');assert.equal(model.selected(b).matrix.rows[0].cells[0],original.matrix.rows[0].cells[0]);assert.equal(model.selected(b).matrix.rows[0].cells[1],'');
 assert.deepEqual(model.selected(b).shell.matrix,original.matrix);
});

test('saved alternate-package prices cannot be imported as the base unit; equal-unit boxes and base prices remain usable',async()=>{
 const f=signedWorkspace(),db=f.env.ORDER_QA_DB,who={id:'supplier',role:'BUSINESS',email:'supplier@example.invalid'};
 const definition={supplierName:'등록 공급처',originName:'출고장',productName:'계란',shells:['4'],packSizes:[30],grades};
 f.db.prepare("UPDATE r3_price_catalog SET definition=? WHERE supplier_id='farm'").run(JSON.stringify(definition));
 const b=model.fromDraft({...original,packSize:30},day),v=model.selected(b).version;
 v.packages.push({id:'ten',name:'10구',parentId:null,eggs:10,trays:1,rules:[]},{id:'unknown',name:'구수 미지정',parentId:null,eggs:null,trays:1,rules:[]},{id:'box',name:'30구 여섯 판',parentId:null,eggs:180,trays:6,rules:[]});
 const prepare={action:'prepare-import',supplierId:'farm',originId:'dep',productId:'sku',shell:'4',packSize:30};
 model.select(b,b.activeVersion,b.activeShell,'ten');model.selected(b).matrix.rows[0].cells[0]='2000';
 await personalPrice(db,who,request(0,b),now);
 await assert.rejects(()=>personalPrice(db,who,{...prepare,expectedRevision:1},now),e=>e.status===422&&e.message==='PERSONAL_PACKAGE_UNIT_MISMATCH');
 model.select(b,b.activeVersion,b.activeShell,'unknown');await personalPrice(db,who,request(1,b),now);
 await assert.rejects(()=>personalPrice(db,who,{...prepare,expectedRevision:2},now),e=>e.message==='PERSONAL_PACKAGE_UNIT_MISMATCH');
 model.select(b,b.activeVersion,b.activeShell,'box');await personalPrice(db,who,request(2,b),now);
 const box=await personalPrice(db,who,{...prepare,expectedRevision:3},now);assert.equal(box.packSize,30);assert.equal(box.matrix.rows[0].cells[0],original.matrix.rows[0].cells[0]);
 model.select(b,b.activeVersion,b.activeShell,'base');await personalPrice(db,who,request(3,b),now);
 const base=await personalPrice(db,who,{...prepare,expectedRevision:4},now);assert.deepEqual(base.matrix,original.matrix);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM r3_price_version').get().n,0);
});
