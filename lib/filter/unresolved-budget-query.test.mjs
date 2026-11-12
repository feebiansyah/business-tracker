import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {Decimal,loadTs} from "./sync-baseline.test.mjs";
const require=createRequire(import.meta.url),runtime=require("@prisma/client/runtime/library");
const Prisma={Decimal,...runtime,sql:runtime.sqltag};
const params={q:"",wl:null,from:"",sort:"name",dir:"asc",page:1,pageSize:25};

function fixture(count=1){
  const base={metaAccountId:11,metaAccount:{shopeeAccountId:7,name:"WL Satu",status:"ACTIVE"},metaStatus:"ACTIVE",firstDeliveryDate:null,startTime:new Date("2026-01-01Z")};
  const rows=Array.from({length:count},(_,i)=>({...base,id:i+1,name:`Campaign ${i+1}`,metaCampaignId:String(1000+i),effectiveDailyBudget:null}));
  rows.push({...base,id:999,name:"Akun lain",metaCampaignId:"9999",effectiveDailyBudget:null,metaAccount:{...base.metaAccount,shopeeAccountId:8}});
  const reads=[];
  const db={
    shopeeAccount:{findUnique:async()=>({id:7,name:"Shopee",metaAccounts:[{id:11,name:"WL Satu"},{id:12,name:"WL Dua"}]})},
    campaign:{
      count:async args=>{reads.push(["count",args]);return rows.filter(r=>r.metaAccount.shopeeAccountId===7&&(args.where.effectiveDailyBudget===null?r.effectiveDailyBudget===null:r.effectiveDailyBudget!==null)).length;},
      findMany:async args=>{reads.push(["details",args]);assert.deepEqual(args.where,{metaAccount:{shopeeAccountId:7},effectiveDailyBudget:null});assert.equal(args.select.metaAccountId,true);assert.equal(args.select.metaAccount,undefined);return rows.filter(r=>r.metaAccount.shopeeAccountId===7&&r.effectiveDailyBudget===null);},
    },
    $queryRaw:async query=>{reads.push(["valid",query]);return rows.filter(r=>r.metaAccount.shopeeAccountId===7&&r.effectiveDailyBudget!==null).map(r=>({...r,wlName:r.metaAccount.name,budget:r.effectiveDailyBudget,days:1,totalSpend:10,costWithFee:10.5,totalCommission:null,profit:null,profitPercent:null,hasPendingNote:false}));},
  };
  return{rows,reads,api:loadTs("lib/filter/queries.ts",{"@/lib/prisma":{prisma:db},"@/lib/generated/prisma/client":{Prisma}})};
}

for(const count of [1,80])test(`${count} unresolved budgets use one scoped bulk read with exact detail count`,async()=>{
  const h=fixture(count);const data=await h.api.getCampaignWorkspaceData(7,"fix",params);
  assert.equal(data.unresolvedBudgets,count);assert.equal(data.unresolvedBudgetCampaigns.length,count);
  assert.deepEqual(data.unresolvedBudgetCampaigns[0],{id:1,name:"Campaign 1",metaCampaignId:"1000",wlName:"WL Satu",status:"ACTIVE"});
  assert(!data.unresolvedBudgetCampaigns.some(c=>c.metaCampaignId==="9999"));assert.equal(data.campaigns.length,0);
  assert.equal(h.reads.filter(([kind])=>kind==="details").length,1);assert.equal(h.reads.length,3);
});

test("budget obtained by a later Sync disappears from unresolved without an extra write",async()=>{
  const h=fixture();await h.api.getCampaignWorkspaceData(7,"fix",params);
  h.rows[0].effectiveDailyBudget=250000;
  const data=await h.api.getCampaignWorkspaceData(7,"fix",params);
  assert.equal(data.unresolvedBudgets,0);assert.deepEqual(data.unresolvedBudgetCampaigns,[]);
  assert.equal(data.campaigns[0].id,1);assert.equal(data.campaigns[0].budget,250000);
});

test("WL labels use the scoped account's existing bulk data, not one query per WL",async()=>{
  const h=fixture(2);h.rows[1].metaAccountId=12;
  const data=await h.api.getCampaignWorkspaceData(7,"fix",params);
  assert.deepEqual(data.unresolvedBudgetCampaigns.map(c=>c.wlName),["WL Satu","WL Dua"]);
});

test("all four workspaces expose named unresolved details in a bounded native disclosure",async()=>{
  const React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
  const h=fixture(80),data=await h.api.getCampaignWorkspaceData(7,"fix",params);
  const {CampaignWorkspacePage}=loadTs("components/filter/campaign-workspace-page.tsx",{"next/link":{default:({children,...props})=>React.createElement("a",props,children)},"next/navigation":{notFound:()=>{throw new Error("missing");}},"@/components/filter/filter-table":{FilterTable:()=>null},"@/lib/filter/queries":{getCampaignWorkspaceData:async()=>data}});
  for(const mode of ["filter","fix","off-filter","off-fix"]){
    const html=renderToStaticMarkup(await CampaignWorkspacePage({mode,params:Promise.resolve({id:"7"}),searchParams:Promise.resolve({})}));
    assert.match(html,/<details/);assert.match(html,/80 campaign memiliki budget UNRESOLVED/);assert.match(html,/max-h-64 overflow-y-auto/);
    assert.match(html,/Budget belum tersedia dari Sync Meta/);assert.match(html,/WL Satu/);assert.match(html,/Meta Campaign ID: 1000/);
    assert.equal((html.match(/Meta Campaign ID:/g)||[]).length,80);assert.doesNotMatch(html,/9999/);
    assert.match(html,/Status: ACTIVE/);assert.match(html,/break-all/);
  }
});
