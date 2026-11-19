import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPriceMatrixModel} from '../src/server/order-engine/calculation/price-matrix.mjs';

test('19 reference bands select all eight November 9 example prices, including asymmetric boundaries',()=>{
  const path=new URL('./fixtures/egg-price-reference-20261109.tsv',import.meta.url);
  const [heading,...records]=readFileSync(path,'utf8').trimEnd().split('\n').map(row=>row.split('\t'));
  const grades=['왕란','특란','대란','중란'].map((name,i)=>({id:'size-'+i,name}));
  assert.deepEqual(heading.slice(2),grades.flatMap(g=>[g.name+' 원란',g.name+' 포장']));
  const rows=records.map(([start,end,...cells])=>({min:Number(start),max:end?Number(end):null,cells}));
  const matrix={schema:1,grades,rows};
  const calculator=createPriceMatrixModel();
  assert.deepEqual(calculator.errors(matrix),[]);
  assert.deepEqual(calculator.emptyRows(grades.length).map(r=>[r.min,r.max]),rows.map(r=>[r.min,r.max]));
  const boundaryReference=[[30,5980],[31,5970],[100,5950],[101,5940],[150,5940],[151,5920],[500,5800],[501,5780]];
  for(const [qty,expected] of boundaryReference){
    assert.equal(calculator.select(matrix,qty,'size-0','raw').price,String(expected));
    assert.equal(calculator.select(matrix,qty,'size-0','packed').price,String(expected+210));
  }
  assert.equal(rows.length*grades.length*2,152);
  for(const row of rows)for(const [i,g] of grades.entries()){
    assert.equal(calculator.select(matrix,row.min,g.id,'raw').price,row.cells[i*2]);
    assert.equal(calculator.select(matrix,row.max??5000,g.id,'packed').price,row.cells[i*2+1]);
    assert.equal(Number(row.cells[i*2+1])-Number(row.cells[i*2]),210);
  }
});
