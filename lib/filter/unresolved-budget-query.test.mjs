import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {Decimal,loadTs} from "./sync-baseline.test.mjs";
const require=createRequire(import.meta.url),runtime=require("@prisma/client/runtime/library");
const Prisma={Decimal,...runtime,sql:runtime.sqltag};
const params={q:"",wl:null,from:"",sort:"name",dir:"asc",page:1,pageSize:25};

function fixture(count=1){
  const matches=(row,where)=>Object.entries(where).every(([key,value])=>{
    if(key==="AND")return value.every(w=>matches(row,w));
    if(key==="OR")return value.some(w=>matches(row,w));
    if(key==="metaAccount")return matches(row.metaAccount,value);
    if(value&&typeof value==="object"&&"not"in value)return row[key]!==null&&row[key]!==value.not;
    return row[key]===value;
  });
  const base={metaAccountId:11,metaAccount:{shopeeAccountId:7,name:"WL Satu",status:"ACTIVE"},metaStatus:"ACTIVE",firstDeliveryDate:null,startTime:new Date("2026-01-01Z")};
  const rows=Array.from({length:count},(_,i)=>({...base,id:i+1,name:`Campaign ${i+1}`,metaCampaignId:String(1000+i),effectiveDailyBudget:null}));
  rows.push({...base,id:999,name:"Akun lain",metaCampaignId:"9999",effectiveDailyBudget:null,metaAccount:{...base.metaAccount,shopeeAccountId:8}});
  const reads=[];
  const db={
    shopeeAccount:{findUnique:async()=>({id:7,name:"Shopee",metaAccounts:[{id:11,name:"WL Satu"},{id:12,name:"WL Dua"}]})},
    campaign:{
      count:async args=>{reads.push(["count",args]);return rows.filter(r=>r.metaAccount.shopeeAccountId===7&&(args.where.effectiveDailyBudget===null?r.effectiveDailyBudget===null:r.effectiveDailyBudget!==null)).length;},
      findMany:async args=>{const kind=args.select.firstDeliveryDate?"names":"details";reads.push([kind,args]);if(kind==="names")assert.deepEqual(args.where,{metaAccount:{shopeeAccountId:7}});else assert.equal(args.where.effectiveDailyBudget,null);assert.equal(args.select.metaAccountId,true);assert.equal(args.select.metaAccount,undefined);return rows.filter(r=>matches(r,args.where));},
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
  assert.equal(h.reads.filter(([kind])=>kind==="details").length,1);assert.equal(h.reads.filter(([kind])=>kind==="names").length,1);assert.equal(h.reads.length,4);
});

test("unresolved groups follow campaign and WL status without leaking another Shopee or adding queries",async()=>{
  const h=fixture(),base=h.rows[0];
  h.rows.push({...base,id:2,metaStatus:"PAUSED"},{...base,id:3,metaStatus:null},{...base,id:4,metaAccount:{...base.metaAccount,status:"INACTIVE"}},{...base,id:5,metaStatus:"PAUSED",metaAccount:{...base.metaAccount,status:"INACTIVE"}},{...base,id:1000,metaStatus:"PAUSED",metaAccount:{...base.metaAccount,shopeeAccountId:8}});
  for(const mode of ["filter","fix","off-filter","off-fix"]){
    const data=await h.api.getCampaignWorkspaceData(7,mode,params);
    const expected=mode.startsWith("off")?[2,3,4,5]:[1];
    assert.deepEqual(data.unresolvedBudgetCampaigns.map(c=>c.id),expected);
    assert.equal(data.unresolvedBudgets,expected.length);
  }
  assert.equal(h.reads.filter(([kind])=>kind==="details").length,4);assert.equal(h.reads.length,16);
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

test("duplicate import names span WL/status but not Shopee and disappear after rename",async()=>{
  const h=fixture(2);
  h.rows[0].name=" MASAKAMPLOP ";
  h.rows[1].name="masakamplop";h.rows[1].metaStatus="PAUSED";h.rows[1].metaAccountId=12;
  h.rows[1].firstDeliveryDate=new Date("2026-11-05Z");
  h.rows.find(r=>r.id===999).name="MASAKAMPLOP";
  for(const mode of ["filter","fix","off-filter","off-fix"]){
    const data=await h.api.getCampaignWorkspaceData(7,mode,params);
    assert.equal(data.duplicateCampaignNames.length,1);
    assert.equal(data.duplicateCampaignNames[0].name,"MASAKAMPLOP");
    assert.deepEqual(data.duplicateCampaignNames[0].campaigns.map(c=>[c.metaCampaignId,c.wlName,c.status,c.startDate]),[["1000","WL Satu","ACTIVE","2026-01-01"],["1001","WL Dua","PAUSED","2026-11-05"]]);
  }
  h.rows[1].name="Nama unik";
  assert.deepEqual((await h.api.getCampaignWorkspaceData(7,"filter",params)).duplicateCampaignNames,[]);
});

test("name normalization agrees with both real import matchers, not SQL collation",async()=>{
  const {matchCommissionAggregates}=loadTs("lib/shopee-import/matching.ts");
  const {matchClickAggregates}=loadTs("lib/shopee-click-import/matching.ts");
  for(const [a,b,duplicate] of [[" Foo ","fOO",true],["Straße","STRASSE",true],["A  B","A B",false],["café","cafe",false]]){
    const h=fixture(2);h.rows[0].name=a;h.rows[1].name=b;
    const key=a.trim().toUpperCase(),aggregate={date:"2026-11-05",tagLink2:a,normalizedTagLink2:key,commission:new Decimal(1),rowCount:1,clickCount:1};
    assert.equal(matchCommissionAggregates([aggregate],h.rows.slice(0,2)).unmatched.some(r=>r.reason==="AMBIGUOUS_CAMPAIGN_NAME"),duplicate);
    assert.equal(matchClickAggregates([aggregate],h.rows.slice(0,2)).unmatched.some(r=>r.reason==="AMBIGUOUS_CAMPAIGN_NAME"),duplicate);
    assert.equal((await h.api.getCampaignWorkspaceData(7,"filter",params)).duplicateCampaignNames.length,duplicate?1:0);
  }
});

test("same physical Meta ID does not create a duplicate group and unique names stay clear",async()=>{
  const h=fixture(2);h.rows[1].name=h.rows[0].name;h.rows[1].metaCampaignId=h.rows[0].metaCampaignId;
  assert.deepEqual((await h.api.getCampaignWorkspaceData(7,"filter",params)).duplicateCampaignNames,[]);
  h.rows[1].name="Unique";h.rows[1].metaCampaignId="2000";
  assert.deepEqual((await h.api.getCampaignWorkspaceData(7,"filter",params)).duplicateCampaignNames,[]);
});

test("duplicate alert shows groups, scoped identities and dates in all workspaces without changing unresolved",async()=>{
  const React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
  const h=fixture(80);for(const row of h.rows)row.name="DUPLICATE";
  h.rows[1].metaStatus="PAUSED";let data;
  const {CampaignWorkspacePage}=loadTs("components/filter/campaign-workspace-page.tsx",{"next/link":{default:({children,...props})=>React.createElement("a",props,children)},"next/navigation":{notFound:()=>{throw new Error("missing");}},"@/components/filter/filter-table":{FilterTable:()=>null},"@/lib/filter/queries":{getCampaignWorkspaceData:async()=>data}});
  for(const mode of ["filter","fix","off-filter","off-fix"]){
    data=await h.api.getCampaignWorkspaceData(7,mode,params);
    const html=renderToStaticMarkup(await CampaignWorkspacePage({mode,params:Promise.resolve({id:"7"}),searchParams:Promise.resolve({})}));
    assert.match(html,/1 nama campaign ganda berisiko membuat import ambigu\. Lihat detail\./);
    assert.match(html,/Ubah salah satu nama campaign agar unik, lalu Sync Meta\./);
    assert.match(html,/Mulai tayang: 2026-01-01/);assert.match(html,/Status: PAUSED/);assert.doesNotMatch(html,/9999/);
    assert.equal((html.match(/max-h-64 overflow-y-auto/g)||[]).length,2);
    assert.equal(h.reads.filter(([kind])=>kind==="names").length,["filter","fix","off-filter","off-fix"].indexOf(mode)+1);
  }
});

test("all four workspaces expose named unresolved details in a bounded native disclosure",async()=>{
  const React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
  const h=fixture(80);let data;
  const {CampaignWorkspacePage}=loadTs("components/filter/campaign-workspace-page.tsx",{"next/link":{default:({children,...props})=>React.createElement("a",props,children)},"next/navigation":{notFound:()=>{throw new Error("missing");}},"@/components/filter/filter-table":{FilterTable:()=>null},"@/lib/filter/queries":{getCampaignWorkspaceData:async()=>data}});
  for(const mode of ["filter","fix","off-filter","off-fix"]){
    const status=mode.startsWith("off")?"PAUSED":"ACTIVE";
    for(const row of h.rows)row.metaStatus=status;
    data=await h.api.getCampaignWorkspaceData(7,mode,params);
    const html=renderToStaticMarkup(await CampaignWorkspacePage({mode,params:Promise.resolve({id:"7"}),searchParams:Promise.resolve({})}));
    assert.match(html,/<details/);assert.match(html,/80 campaign memiliki budget UNRESOLVED/);assert.match(html,/max-h-64 overflow-y-auto/);
    assert.match(html,/Kategori Filter\/Fix belum dapat ditentukan karena budget belum tersedia\./);assert.match(html,/WL Satu/);assert.match(html,/Meta Campaign ID: 1000/);
    assert.equal((html.match(/Meta Campaign ID:/g)||[]).length,80);assert.doesNotMatch(html,/9999/);
    assert.match(html,new RegExp(`Status: ${status}`));assert.match(html,/break-all/);
  }
});
