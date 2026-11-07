import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { day, Decimal, loadTs } from "./sync-baseline.test.mjs";

const require=createRequire(import.meta.url), runtime=require("@prisma/client/runtime/library");
const Prisma={Decimal,...runtime,sql:runtime.sqltag};
const params={q:"",wl:null,from:"2026-11-03",sort:"startTime",dir:"asc",page:1,pageSize:25};
function fixture(mode="fix") {
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
    campaign:{count:async({where})=>{counts.push(where);return campaigns.filter(c=>matches(c,where)).length;},findFirst:async args=>{assert.equal(args.select.firstDeliveryDate,true);return campaigns.find(c=>c.id===args.where.id);}},
    campaignDailyMetric:{count:async()=>0,aggregate:async()=>({_sum:{spend:100}})},
    shopeeCommissionImport:{findMany:async()=>[]},
    $queryRaw:async query=>{
      sqls.push(query); if(!query.sql.includes("SELECT summary.*"))return [];
      assert.match(query.sql,/COALESCE\(c\.firstDeliveryDate, c\.startTime\) AS startTime/);
      assert.match(query.sql,/LEFT JOIN CampaignDailyMetric dm ON dm\.campaignId = c\.id\s+WHERE/);
      assert.match(query.sql,/ORDER BY summary\.startTime IS NULL ASC, summary\.startTime ASC/);
      const dates=query.values.filter(v=>v instanceof Date);
      if(dates.length){
        assert.match(query.sql,/AND COALESCE\(c\.firstDeliveryDate, c\.startTime\) >= \? AND COALESCE\(c\.firstDeliveryDate, c\.startTime\) < \?/);
        assert.equal(dates[0].toISOString(),"2026-11-03T00:00:00.000Z");assert.equal(dates[1].toISOString(),"2026-11-04T00:00:00.000Z");
      }else assert.doesNotMatch(query.sql,/AND COALESCE\(c\.firstDeliveryDate, c\.startTime\) >=/);
      return campaigns.filter(c=>matches(c,counts.at(-1))).map(c=>({...c,wlName:"WL",startTime:c.firstDeliveryDate??c.startTime,budget,days:10,totalSpend:100,costWithFee:105,totalCommission:200,profit:95,profitPercent:95/105*100,hasPendingNote:false}));
    },
  };
  return {api:loadTs("lib/filter/queries.ts",{"@/lib/prisma":{prisma:db},"@/lib/generated/prisma/client":{Prisma}}),counts,sqls,campaigns};
}

for(const mode of ["filter","fix","off-filter","off-fix"])test(`${mode} filters coalesced UTC dates without changing mode or all-history aggregates`,async()=>{
  const h=fixture(mode);const result=await h.api.getCampaignWorkspaceData(7,mode,params);
  assert.deepEqual(result.campaigns.map(c=>c.id),[1,2,4]);assert.equal(result.pagination.total,3);
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
  assert.equal(h.counts[1].metaAccount.shopeeAccountId,7);
  assert.equal(h.counts[1].metaStatus,"ACTIVE");
  assert.equal(h.counts[1].firstDeliveryDate,undefined);
  assert.equal(h.counts[1].startTime,undefined);
});

test("workspace and history show the delivery label without changing input or table layout",async()=>{
  const React=require("react"), {renderToStaticMarkup}=require("react-dom/server");
  const Link=({children,...props})=>React.createElement("a",props,children);
  const data={shopeeAccount:{id:7,name:"Shop"},metaAccounts:[{id:11,name:"WL"}],unresolvedBudgets:0,campaigns:[{id:1,name:"New campaign",wlName:"WL",startTime:"2026-11-03",budget:500000,days:10,totalSpend:100,costWithFee:105,totalCommission:200,profit:95,profitPercent:90,hasPendingNote:false}],pagination:{page:1,pageSize:25,pageCount:1,total:1}};
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
