// Deliberately artificial review data. No operating orders or revenue are read here.
export const qaSalesFixture=[
  ['QA-B-1101','2026-11-02','business','B-01','첫 번째 매장',20,6000,120000,0,0],
  ['QA-B-1102','2026-11-10','business','B-01','첫 번째 매장',10,6000,30000,0,0],
  ['QA-B-1103','2026-11-15','business','B-01','첫 번째 매장',5,6000,30000,5,30000],
  ['QA-B-1104','2026-11-05','business','B-02','두 번째 매장',30,6200,186000,2,12400],
  ['QA-B-1105','2026-11-18','business','B-02','두 번째 매장',15,6200,0,0,0],
  ['QA-B-1001','2026-10-28','business','B-02','두 번째 매장',8,6200,49600,0,0],
  ['QA-C-1101','2026-11-03','campaign','G-2611-01','11월 동네장터',100,5800,580000,4,23200],
  ['QA-C-1102','2026-11-07','campaign','G-2611-01','11월 동네장터',50,5800,200000,0,0],
  ['QA-C-1103','2026-11-14','campaign','G-2611-02','11월 우리마을',80,5900,472000,10,59000],
  ['QA-C-1104','2026-11-19','campaign','G-2611-02','11월 우리마을',20,5900,0,20,0],
  ['QA-C-1001','2026-10-23','campaign','G-2610-01','10월 동네장터',60,5800,348000,0,0],
].map(([id,date,channel,targetId,target,trays,unitPrice,paid,cancelledTrays,refunded])=>({id,date,channel,targetId,target,trays,unitPrice,paid,cancelledTrays,refunded}));

export {salesReviewContent} from './product-ui/sales.mjs';
