import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {loadTs} from "../filter/sync-baseline.test.mjs";
const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
test("four Filter modes read overrides once for page IDs without changing campaign count or metrics",async()=>{
  const reads=[];
  const candidates=Array.from({length:100},(_,i)=>({id:i+1,metaCampaignId:String(1000+i),name:"Campaign "+i,metaAccountId:1,metaStatus:"ACTIVE",firstDeliveryDate:null,startTime:null}));
  const rows=candidates.slice(0,25).map(c=>({...c,wlName:"WL",startTime:null,budget:500000,days:10,totalSpend:123,costWithFee:129.15,totalCommission:200,profit:70.85,profitPercent:54.85,hasPendingNote:false}));
  const db={shopeeAccount:{findUnique:async()=>({id:7,name:"Shop",metaAccounts:[{id:1,name:"WL"}]})},campaign:{count:async()=>100,findMany:async q=>q.select.firstDeliveryDate?candidates:[]},$queryRaw:async()=>rows,campaignPostTypeOverride:{findMany:async q=>{reads.push(q);return[{metaCampaignId:"1000",manualType:"VIDEO"}];}}};
  const api=loadTs("lib/filter/queries.ts",{"@/lib/prisma":{prisma:db}});
  for(const mode of ["filter","fix","off-filter","off-fix"]){
    const data=await api.getCampaignWorkspaceData(7,mode,{q:"",wl:null,from:"",sort:"name",dir:"asc",page:1,pageSize:25});
    assert.equal(data.campaigns[0].metaCampaignId,"1000");assert.equal(data.campaigns[0].manualPostType,"VIDEO");assert.equal(data.campaigns[1].manualPostType,null);
    assert.equal(data.pagination.total,100);assert.equal(data.campaigns[0].totalSpend,123);assert.equal(data.campaigns[0].days,10);
  }
  assert.equal(reads.length,4);assert.equal(reads[0].where.shopeeAccountId,7);assert.equal(reads[0].where.metaCampaignId.in.length,25);
});
test("all four table modes offer one Jenis dropdown per row without changing name target",()=>{
  const actions={"@/app/shopee/[id]/filter/post-type-actions":{saveCampaignPostTypeAction:async()=>{throw Error("No write in SSR");}}};
  const stubs={...actions,"next/navigation":{useRouter:()=>({push:()=>{}})},"@/components/filter/campaign-history-modal":{CampaignHistoryModal:()=>null},"@/components/meta-campaign-controls/campaign-manager-modal":{CampaignManagerModal:()=>null,createCampaignPreviewStore:()=>new Map()}};
  for(const [key,file] of [["sortable-header","sortable-header"],["table-pagination","table-pagination"],["post-type-select","post-type-select"]])stubs["@/components/filter/"+key]=loadTs("components/filter/"+file+".tsx",actions);
  const {FilterTable}=loadTs("components/filter/filter-table.tsx",stubs);
  const campaign={id:42,metaCampaignId:"123",manualPostType:"GAMBAR_FEWFEED",name:"Campaign",wlName:"WL",startTime:null,budget:500000,days:1,totalSpend:1,costWithFee:1.05,totalCommission:null,profit:null,profitPercent:null,hasPendingNote:false};
  for(const mode of ["filter","fix","off-filter","off-fix"]){
    const html=renderToStaticMarkup(React.createElement(FilterTable,{mode,shopeeAccountId:7,campaigns:[campaign],pagination:{total:1,page:1,pageSize:25,pageCount:1},state:{q:"",wl:null,from:"",sort:"name",dir:"asc",page:1,pageSize:25}}));
    assert.match(html,/>Jenis<\/th>/);assert.match(html,/aria-label="Jenis Campaign"/);assert.match(html,/GAMBAR FEWFEED/);assert.match(html,/>Campaign<\/button>/);
  }
});
