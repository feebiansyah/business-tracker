import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { day, Decimal, loadTs } from "./sync-baseline.test.mjs";

const require=createRequire(import.meta.url), runtime=require("@prisma/client/runtime/library");
const Prisma={Decimal,...runtime,sql:runtime.sqltag};
const params={q:"",wl:null,from:"2026-11-03",sort:"startTime",dir:"asc",page:1,pageSize:25};
function fixture(mode="fix", now) {
  const active=!mode.startsWith("off"), budget=mode.endsWith("fix")?500000:100000;
  const base={metaStatus:active?"ACTIVE":"PAUSED",effectiveDailyBudget:budget,metaAccountId:11,metaAccount:{shopeeAccountId:7,status:"ACTIVE",name:"WL"}};
  const campaigns=[
    {...base,id:1,name:"Legacy",startTime:day("2026-11-03"),firstDeliveryDate:null},
    {...base,id:2,name:"Delivered",startTime:day("2026-11-01"),firstDeliveryDate:day("2026-11-03")},
    {...base,id:3,name:"Not delivered",startTime:day("2026-11-01"),firstDeliveryDate:null},
    {...base,id:4,name:"Late UTC",startTime:new Date("2026-11-03T23:59:59.999Z"),firstDeliveryDate:null},
    {...base,id:5,name:"Tomorrow",startTime:day("2026-11-04"),firstDeliveryDate:null},
    {...base,id:6,name:"No dates",startTime:null,firstDeliveryDate:null},
  ];
  function matches(row,where) {
    if(!where)return true;
    return Object.entries(where).every(([k,v])=>{
      if(k==="AND")return v.every(w=>matches(row,w));
      if(k==="OR")return v.some(w=>matches(row,w));
      const actual=row[k];
      if(v===null || typeof v!=="object" || v instanceof Date)return actual===v;
      if(["metaAccount"].includes(k))return matches(actual,v);
      return Object.entries(v).every(([op,x])=>op==="gte"?actual!==null&&actual>=x:op==="lt"?actual!==null&&actual<x:op==="not"?actual!==x:op==="contains"?actual.includes(x):false);
    });
  }
  const counts=[],sqls=[];
  const db={
    shopeeAccount:{findUnique:async()=>({id:7,name:"Shop",metaAccounts:[{id:11,name:"WL"}]})},
    campaign:{findMany:async({where})=>campaigns.filter(c=>matches(c,where)),count:async({where})=>{counts.push(where);return campaigns.filter(c=>matches(c,where)).length;},findFirst:async args=>{assert.equal(args.select.firstDeliveryDate,true);return campaigns.find(c=>c.id===args.where.id);}},
    campaignDailyMetric:{count:async()=>0,aggregate:async()=>({_sum:{spend:100}})},
    shopeeCommissionImport:{findMany:async()=>[]},
    $queryRaw:async query=>{
      sqls.push(query); if(!query.sql.includes("SELECT summary.*"))return [];
      assert.match(query.sql,/COALESCE\(c\.firstDeliveryDate, c\.startTime\) AS startTime/);
      assert.match(query.sql,/LEFT JOIN CampaignDailyMetric dm ON dm\.campaignId = c\.id\s+WHERE/);
      const order=query.sql.match(/ORDER BY summary\.(\w+) IS NULL ASC, summary\.\w+ (ASC|DESC), summary\.id ASC/);assert(order);
      const dates=query.values.filter(v=>v instanceof Date);
      const hasDateFilter=query.sql.includes("AND COALESCE(c.firstDeliveryDate, c.startTime) >=");
      if(hasDateFilter){
        assert.match(query.sql,/AND COALESCE\(c\.firstDeliveryDate, c\.startTime\) >= \? AND COALESCE\(c\.firstDeliveryDate, c\.startTime\) < \?/);
      }else assert.doesNotMatch(query.sql,/AND COALESCE\(c\.firstDeliveryDate, c\.startTime\) >=/);
      // Evaluate raw SQL's bound values separately from Prisma's count predicate.
      const [account,wl,,search]=query.values;
      const delivery=query.sql.includes("AND (c.firstDeliveryDate < ?") ? dates.slice(-2) : null;
      return campaigns.filter(c=>c.metaAccount.shopeeAccountId===account && (!wl || c.metaAccountId===wl) && (!search || c.name.includes(search))
        && (!hasDateFilter || (c.firstDeliveryDate??c.startTime)!==null && (c.firstDeliveryDate??c.startTime)>=dates[0] && (c.firstDeliveryDate??c.startTime)<dates[1])
        && (!delivery || (c.firstDeliveryDate!==null ? c.firstDeliveryDate<delivery[0] : c.startTime===null || c.startTime<delivery[1])))
        .map(c=>({...c,wlName:"WL",startTime:c.firstDeliveryDate??c.startTime,budget,days:10,totalSpend:100,costWithFee:105,totalCommission:200,profit:95,profitPercent:95/105*100,hasPendingNote:false}))
        .sort((a,b)=>a[order[1]]===null&&b[order[1]]!==null?1:b[order[1]]===null&&a[order[1]]!==null?-1:((a[order[1]]>b[order[1]]?1:a[order[1]]<b[order[1]]?-1:0)*(order[2]==="ASC"?1:-1)) || a.id-b.id)
        .slice(query.values.at(-1),query.values.at(-1)+query.values.at(-2));
    },
  };
  const Clock=class extends Date { constructor(...args){super(...(args.length?args:[now]));} };
  return {api:loadTs("lib/filter/queries.ts",{...(now?{__date:Clock}:{}),"@/lib/prisma":{prisma:db},"@/lib/generated/prisma/client":{Prisma}}),counts,sqls,campaigns};
}

for(const mode of ["filter","fix","off-filter","off-fix"])test(`${mode} only accepts delivery strictly before today WIB, including after the day changes`,async()=>{
  // 17:00 UTC is already the next WIB day, even though UTC still says Nov 11.
  const h=fixture(mode,"2026-11-11T17:00:00.000Z");const base=h.campaigns[0];
  h.campaigns.splice(0,h.campaigns.length,
    {...base,id:10,name:"Today",firstDeliveryDate:day("2026-11-12"),startTime:day("2026-11-01")},
    {...base,id:11,name:"Yesterday",firstDeliveryDate:day("2026-11-11")},
    {...base,id:12,name:"Fallback just before",firstDeliveryDate:null,startTime:new Date("2026-11-11T16:59:59.999Z")},
    {...base,id:13,name:"Fallback midnight",firstDeliveryDate:null,startTime:new Date("2026-11-11T17:00:00.000Z")},
    {...base,id:14,name:"Fallback end",firstDeliveryDate:null,startTime:new Date("2026-11-12T16:59:59.999Z")},
    {...base,id:15,name:"Fallback next day",firstDeliveryDate:null,startTime:new Date("2026-11-12T17:00:00.000Z")},
    {...base,id:16,name:"Unknown date",firstDeliveryDate:null,startTime:null},
    {...base,id:17,name:"Future delivery",firstDeliveryDate:day("2026-11-13"),startTime:day("2026-11-01")},
  );
  const result=await h.api.getCampaignWorkspaceData(7,mode,{...params,from:""});
  assert.deepEqual(result.campaigns.map(c=>c.id).sort((a,b)=>a-b),[11,12,16]);assert.equal(result.pagination.total,3);
  const query=h.sqls.at(-1);
  assert.match(query.sql,/c\.firstDeliveryDate < \?/);
  assert.match(query.sql,/c\.firstDeliveryDate IS NULL AND \(c\.startTime IS NULL OR c\.startTime < \?\)/);
  assert.doesNotMatch(query.sql,/c\.(firstDeliveryDate|startTime) >=/);
  assert.deepEqual(query.values.filter(v=>v instanceof Date).map(d=>d.toISOString()),["2026-11-12T00:00:00.000Z","2026-11-11T17:00:00.000Z"]);
  const tomorrow=fixture(mode,"2026-11-12T17:00:00.000Z");tomorrow.campaigns.splice(0,tomorrow.campaigns.length,...h.campaigns);
  const next=await tomorrow.api.getCampaignWorkspaceData(7,mode,{...params,from:""});
  assert.deepEqual(next.campaigns.map(c=>c.id).sort((a,b)=>a-b),[10,11,12,13,14,16]);assert.equal(next.pagination.total,6);
  assert.equal(next.campaigns.find(c=>c.id===10).startTime,"2026-11-12");
  const searched=await h.api.getCampaignWorkspaceData(7,mode,{...params,from:"",q:"Today",wl:11});
  assert.equal(searched.pagination.total,0);assert.equal(searched.campaigns.length,0);
  const dated=await h.api.getCampaignWorkspaceData(7,mode,{...params,from:"2026-11-12",q:"Today",wl:11});
  assert.equal(dated.pagination.total,0);
});

test("historical date/search/WL compose with sorting and clamped pagination unchanged",async()=>{
  const h=fixture();const base=h.campaigns[0];
  h.campaigns.splice(0,h.campaigns.length,...Array.from({length:30},(_,i)=>({...base,id:100+i,name:"Campaign "+String(i).padStart(2,"0")})));
  const result=await h.api.getCampaignWorkspaceData(7,"fix",{...params,q:"Campaign",wl:11,sort:"name",dir:"desc",page:3});
  assert.deepEqual(result.pagination,{page:2,pageSize:25,total:30,pageCount:2});
  assert.deepEqual(result.campaigns.map(c=>c.id),[104,103,102,101,100]);
  assert.match(h.sqls.at(-1).sql,/ORDER BY summary\.name IS NULL ASC, summary\.name DESC, summary\.id ASC/);
  assert.deepEqual(h.sqls.at(-1).values.slice(-2),[25,25]);
  const otherWl=await h.api.getCampaignWorkspaceData(7,"fix",{...params,wl:99});assert.equal(otherWl.pagination.total,0);assert.equal(otherWl.campaigns.length,0);
});

for(const mode of ["filter","fix","off-filter","off-fix"])test(`${mode} filters coalesced UTC dates without changing mode or all-history aggregates`,async()=>{
  const h=fixture(mode);const result=await h.api.getCampaignWorkspaceData(7,mode,params);
  assert.deepEqual(result.campaigns.map(c=>c.id),[1,2,4]);assert.equal(result.pagination.total,3);
  assert.match(h.sqls.at(-1).sql,/ORDER BY summary\.startTime IS NULL ASC, summary\.startTime ASC/);
  assert.deepEqual(h.sqls.at(-1).values.filter(v=>v instanceof Date).slice(0,2).map(d=>d.toISOString()),["2026-11-03T00:00:00.000Z","2026-11-04T00:00:00.000Z"]);
  assert.equal(result.campaigns[1].startTime,"2026-11-03"); assert.equal(result.campaigns[1].days,10);assert.equal(result.campaigns[1].totalSpend,100);assert.equal(result.campaigns[1].profit,95);
  const combined=await h.api.getCampaignWorkspaceData(7,mode,{...params,q:"Delivered",wl:11}); assert.equal(combined.pagination.total,1);
  const zero=await h.api.getCampaignWorkspaceData(7,mode,{...params,q:"missing"});assert.equal(zero.pagination.total,0);
});

test("history header uses delivery date and legacy startTime fallback without altering history",async()=>{
  const h=fixture();const history={sort:"date",dir:"desc",page:1,pageSize:25};
  assert.equal((await h.api.getCampaignWorkspaceDetail(7,"fix",2,history)).campaign.startDate,"2026-11-03");
  assert.equal((await h.api.getCampaignWorkspaceDetail(7,"fix",1,history)).campaign.startDate,"2026-11-03");
});

test("empty date leaves all campaigns, null dates and baseline scope visible",async()=>{
  const h=fixture();const result=await h.api.getCampaignWorkspaceData(7,"fix",{...params,from:""});
  assert.equal(result.pagination.total,6);assert.equal(result.campaigns[5].startTime,null);
  const scope=h.counts[0].metaAccount ? h.counts[0] : h.counts[0].AND[0];
  assert.equal(scope.metaAccount.shopeeAccountId,7);
  assert.equal(scope.metaStatus,"ACTIVE");
  assert.equal(h.counts[0].firstDeliveryDate,undefined);
  assert.equal(h.counts[0].startTime,undefined);
});

test("workspace and history show the delivery label without changing input or table layout",async()=>{
  const React=require("react"), {renderToStaticMarkup}=require("react-dom/server");
  const Link=({children,...props})=>React.createElement("a",props,children);
  const data={shopeeAccount:{id:7,name:"Shop"},metaAccounts:[{id:11,name:"WL"}],unresolvedBudgets:0,duplicateCampaignNames:[],campaigns:[{id:1,name:"New campaign",wlName:"WL",startTime:"2026-11-03",budget:500000,days:10,totalSpend:100,costWithFee:105,totalCommission:200,profit:95,profitPercent:90,hasPendingNote:false}],pagination:{page:1,pageSize:25,pageCount:1,total:1}};
  const stubs={"next/link":{default:Link},"next/navigation":{useRouter:()=>({push:()=>{}})},"@/components/filter/campaign-history-modal":{CampaignHistoryModal:()=>null},"@/components/meta-campaign-controls/campaign-manager-modal":{CampaignManagerModal:()=>null,createCampaignPreviewStore:()=>new Map()},"@/lib/filter/queries":{getCampaignWorkspaceData:async()=>data}};
  stubs["@/components/filter/sortable-header"]=loadTs("components/filter/sortable-header.tsx");
  stubs["@/components/filter/table-pagination"]=loadTs("components/filter/table-pagination.tsx");
  stubs["@/components/filter/filter-table"]=loadTs("components/filter/filter-table.tsx",stubs);
  const {CampaignWorkspacePage}=loadTs("components/filter/campaign-workspace-page.tsx",stubs);
  const html=renderToStaticMarkup(await CampaignWorkspacePage({mode:"fix",params:Promise.resolve({id:"7"}),searchParams:Promise.resolve({from:"2026-11-03"})}));
  assert.match(html,/Tanggal Mulai Tayang<input(?=[^>]*type="date")(?=[^>]*name="from")/);
  assert.match(html,/Tanggal Mulai Tayang<span/);
  assert.match(html,/03 Nov 2026/);
  assert.match(html,/overflow-auto overscroll-contain/);
  assert.equal((html.match(/type="date"/g)??[]).length,1);
  const {CampaignDailyDetail}=loadTs("components/filter/campaign-daily-detail.tsx",{"@/components/filter/campaign-daily-table":{CampaignDailyTable:()=>null}});
  assert.match(renderToStaticMarkup(React.createElement(CampaignDailyDetail,{mode:"fix",shopeeAccountId:7,detail:{campaign:{id:1,wlName:"WL",budget:500000,status:"ACTIVE",startDate:"2026-11-03",totalSpend:100},dailyMetrics:[],pagination:data.pagination,state:{sort:"date",dir:"desc",page:1,pageSize:25}}})),/Tanggal Mulai Tayang/);
});
