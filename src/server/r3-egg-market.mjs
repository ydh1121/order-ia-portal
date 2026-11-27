import {createPriceWorkspaceModel} from './r3-price-workspace-model.mjs';
import {PolicyError} from './order-engine/calculation/supply-policy.mjs';

const model=createPriceWorkspaceModel();
// The chart never selects the private document or any customer account. At most
// one published closing observation per Korean calendar day reaches the worker.
const closingRates=`
  WITH carried AS (
    SELECT effective_at,saved_at,revision,principal,market_projection
    FROM r3_price_workspace_event WHERE market_projection IS NOT NULL AND effective_at<?
    ORDER BY effective_at DESC,saved_at DESC,revision DESC,principal LIMIT 1
  ), changes AS (
    SELECT effective_at,saved_at,revision,principal,market_projection
    FROM r3_price_workspace_event WHERE market_projection IS NOT NULL AND effective_at>=? AND effective_at<=?
  ), ranked AS (
    SELECT effective_at,market_projection,
      row_number() OVER (PARTITION BY date(effective_at,'+9 hours') ORDER BY effective_at DESC,saved_at DESC,revision DESC,principal) day_rank
    FROM (SELECT * FROM carried UNION ALL SELECT * FROM changes)
  )
  SELECT effective_at AS effectiveAt,json_extract(market_projection,'$.shells') AS shells,
    json_extract(market_projection,'$.grades') AS grades,json_extract(market_projection,?) AS price
  FROM ranked WHERE day_rank=1 ORDER BY effective_at`;
export async function readEggMarket(db,query,now){
  let range;
  try{range=model.marketRange(query,now);}catch{throw new PolicyError('MARKET_FILTER_INVALID',400);}
  const start=new Date(range.from+'T00:00:00+09:00').toISOString();
  const close=new Date(range.to+'T23:59:59.999+09:00').toISOString(),stop=close<now?close:now;
  const first=await db.prepare('SELECT min(effective_at) AS firstAt FROM r3_price_workspace_event WHERE market_projection IS NOT NULL AND effective_at<=?').bind(now).first();
  const firstDate=first?.firstAt?model.marketDay(first.firstAt):null;
  async function read(shell,grade){
    const code=shell+'/'+grade;
    const {results}=await db.prepare(closingRates).bind(start,start,stop,'$.values."'+code+'"').all();
    return results.map(row=>({effectiveAt:row.effectiveAt,market:{shells:JSON.parse(row.shells),grades:JSON.parse(row.grades),values:{[code]:row.price}}}));
  }
  const shell=range.shell||'3',grade=range.grade||'xl';
  let entries=firstDate?await read(shell,grade):[];
  const chosen=model.marketSelection(range,entries);
  if(chosen.shell!==shell||chosen.grade!==grade)entries=await read(chosen.shell,chosen.grade);
  const carried=entries[0],code=chosen.shell+'/'+chosen.grade;
  if(range.to===range.today&&carried?.effectiveAt<start&&carried.market.values[code]!=null){
    // Repeated publications, or an intraday change reversed before close,
    // do not restart a plateau carried into the selected window.
    const row=await db.prepare(`WITH ranked AS (
      SELECT date(effective_at,'+9 hours') AS day,json_extract(market_projection,?) AS amount,
        row_number() OVER(PARTITION BY date(effective_at,'+9 hours') ORDER BY effective_at DESC,saved_at DESC,revision DESC,principal) day_rank
      FROM r3_price_workspace_event WHERE market_projection IS NOT NULL AND effective_at<?
    ), closes AS (SELECT day,amount FROM ranked WHERE day_rank=1)
    SELECT min(day) AS start FROM closes WHERE day>COALESCE((SELECT max(day) FROM closes WHERE amount IS NOT ?),'')`)
      .bind('$.values."'+code+'"',start,carried.market.values[code]).first();
    carried.runStart=row?.start;
  }
  return model.marketSeries(range,entries,now,firstDate);
}
