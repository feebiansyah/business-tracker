import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "../../lib/filter/sync-baseline.test.mjs";

test("financial text colors are shared by all modes; zero/missing stay neutral and percent follows profit",()=>{
  const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
  const {FilterTable}=loadTs("components/filter/filter-table.tsx",{
    "next/navigation":{useRouter:()=>({push(){}})},
    "@/components/filter/sortable-header":loadTs("components/filter/sortable-header.tsx"),
    "@/components/filter/table-pagination":loadTs("components/filter/table-pagination.tsx"),
    "@/components/filter/campaign-history-modal":{CampaignHistoryModal:()=>null},
    "@/components/filter/post-type-select":{PostTypeSelect:()=>null},
    "@/components/meta-campaign-controls/campaign-manager-modal":{createCampaignPreviewStore:()=>new Map(),CampaignManagerModal:()=>null},
  });
  const base={id:1,metaCampaignId:"123",name:"Campaign",wlName:"WL",startTime:null,budget:1000,days:1,totalSpend:100,costWithFee:105};
  for(const mode of ["filter","fix","off-filter","off-fix"])for(const [totalCommission,profit,profitPercent,want]of [
    [200,100,50,["text-slate-600","text-emerald-700","text-emerald-700"]],
    [10,-100,-50,["text-slate-600","text-red-700","text-red-700"]],
    [0,0,0,["text-slate-600","text-slate-600","text-slate-600"]],
    [null,null,null,["text-slate-600","text-slate-600","text-slate-600"]],
    [200,100,0,["text-slate-600","text-emerald-700","text-slate-600"]],
    [200,-100,50,["text-slate-600","text-red-700","text-red-700"]],
  ]){
    const html=renderToStaticMarkup(React.createElement(FilterTable,{mode,shopeeAccountId:7,campaigns:[{...base,totalCommission,profit,profitPercent}],pagination:{page:1,pageCount:1,total:1,pageSize:25},state:{q:"",wl:null,from:"",sort:"name",dir:"asc",page:1,pageSize:25}}));
    const cells=[...html.split("<tbody")[1].matchAll(/<td\b([^>]*)>/g)];
    for(const [offset,color]of want.entries())assert(cells[8+offset][1].includes(color),`${mode}, profit ${profit}, percent ${profitPercent}, cell ${8+offset}: ${color}`);
  }
});

test("daily history commission stays neutral while profit and percentage share profit sign",()=>{
  const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
  const {CampaignDailyTable}=loadTs("components/filter/campaign-daily-table.tsx",{
    "next/navigation":{useRouter:()=>({push(){},refresh(){}})},
    "@/app/shopee/[id]/filter/actions":{},
    "@/components/filter/sortable-header":loadTs("components/filter/sortable-header.tsx"),
    "@/components/filter/table-pagination":loadTs("components/filter/table-pagination.tsx"),
  });
  for(const [profit,profitPercent,color]of [[100,50,"text-emerald-700"],[-100,-50,"text-red-700"],[0,0,"text-slate-600"],[null,null,"text-slate-600"],[-100,50,"text-red-700"]]){
    const row={id:1,date:"2026-11-18",spend:100,costWithFee:105,commission:200,commissionImported:true,profit,profitPercent,note:"",completed:false,clickFp:1,shopeeClicks:1,clickPercent:100,cpcFp:100,cpcShopee:100};
    const html=renderToStaticMarkup(React.createElement(CampaignDailyTable,{mode:"filter",shopeeAccountId:7,campaignId:1,rows:[row],pagination:{page:1,pageCount:1,total:1,pageSize:25},state:{sort:"date",dir:"desc",page:1,pageSize:25}}));
    const cells=[...html.split("<tbody")[1].matchAll(/<td\b([^>]*)>/g)];
    assert.doesNotMatch(cells[3][1],/text-(emerald|red)|bg-/);
    for(const i of [4,5]){assert(cells[i][1].includes(color));assert.doesNotMatch(cells[i][1],/bg-/);}
  }
});

test("shared workspace table freezes only the Campaign column", async () => {
  const [table, header] = await Promise.all([
    readFile(new URL("./filter-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("./sortable-header.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(table, /column\.key === "name"/);
  assert.match(table, /sticky left-0/);
  assert.match(header, /className/);
  assert.doesNotMatch(table, /campaign\.wlName[\s\S]{0,100}sticky left-0/);
});

test("WL column keeps a readable width without hiding the full name", async () => {
  const table = await readFile(new URL("./filter-table.tsx", import.meta.url), "utf8");
  assert.match(table, /column\.key === "wlName"[^\n]+min-w-44/);
  assert.match(table, /min-w-44[^\n]+whitespace-normal[^\n]+campaign\.wlName/);
  assert.doesNotMatch(table, /campaign\.wlName[^\n]+truncate/);
});

test("all four routes continue to use the shared campaign workspace", async () => {
  for (const mode of ["filter", "fix", "off-filter", "off-fix"]) {
    const source = await readFile(new URL(`../../app/shopee/[id]/${mode}/page.tsx`, import.meta.url), "utf8");
    assert.match(source, /CampaignWorkspacePage/);
  }
});
