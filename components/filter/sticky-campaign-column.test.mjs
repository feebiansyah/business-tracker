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
    assert.match(html,/<tbody[^>]*><tr class="odd:bg-white even:bg-slate-50"/);
    for(const [offset,color]of want.entries())assert(cells[8+offset][1].includes(color),`${mode}, profit ${profit}, percent ${profitPercent}, cell ${8+offset}: ${color}`);
  }
});

test("Overview and import history stripe data rows only, leaving empty states unchanged",()=>{
  const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
  const {ShopeePerformanceCard}=loadTs("components/dashboard/shopee-performance-card.tsx",{
    "next/link":{default:({children,...p})=>React.createElement("a",p,children)},
    "./dashboard-page-size-select":{DashboardPageSizeSelect:()=>null},
  });
  const {ImportHistoryTable}=loadTs("components/shopee-import/import-history-table.tsx");
  const day={date:"2026-11-18",budget:100,costWithFee:105,commission:200,profit:95,profitPercent:90.47};
  const state={from:"",to:"",accounts:{1:{sort:"date",dir:"asc",page:1,pageSize:25}}};
  const renderOverview=days=>renderToStaticMarkup(React.createElement(ShopeePerformanceCard,{account:{id:1,name:"Overview",wlCount:1,summary:day,days,state:state.accounts[1],pagination:{total:days.length,page:1,pageCount:1,pageSize:25}},dashboardState:state}));
  const row={id:1,createdAt:"2026-11-18T00:00:00Z",originalFilename:"import.csv",dateFrom:"2026-11-18",dateTo:"2026-11-18",csvRowCount:2,matchedCount:2,unmatchedCount:0,matchedCommission:"200",unmatchedCommission:"0"};
  for(const html of [renderOverview([day,{...day,date:"2026-11-19"}]),renderToStaticMarkup(React.createElement(ImportHistoryTable,{rows:[row,{...row,id:2}]}))]){
    const data=html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)[1];
    assert.equal((data.match(/class="odd:bg-white even:bg-slate-50"/g)||[]).length,2);
    assert.doesNotMatch(html.split("<tbody")[0],/odd:bg|even:bg/);
  }
  assert.doesNotMatch(renderOverview([]),/odd:bg|even:bg/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(ImportHistoryTable,{rows:[]})),/odd:bg|even:bg/);
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

test("history TOTAL includes spend from days whose commission is not imported", () => {
  const require = createRequire(import.meta.url), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const { CampaignDailyTable } = loadTs("components/filter/campaign-daily-table.tsx", {
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/app/shopee/[id]/filter/actions": {},
    "@/components/filter/sortable-header": loadTs("components/filter/sortable-header.tsx"),
  });
  const { buildDailyMetricView } = loadTs("lib/filter/view-model.ts");
  const render = rows => renderToStaticMarkup(React.createElement(CampaignDailyTable, {
    mode: "filter", shopeeAccountId: 7, campaignId: 41, rows,
    pagination: { total: rows.length, page: 1, pageCount: 1, pageSize: 25 },
    state: { sort: "date", dir: "asc", page: 1, pageSize: 25 }, compact: true,
  }));
  const row = (id, spend, commission, clickFp, shopeeClicks) => buildDailyMetricView({
    id, date: "2026-11-18", spend, commission, clickFp, shopeeClicks,
    cpcFp: clickFp ? spend / clickFp : null, note: "Not a total note", completed: false, commissionImported: commission !== null,
  });
  const rows = [row(1, 100, 210, 10, 2), row(2, 300, 630, 90, 18)];
  const before = JSON.stringify(rows), html = render(rows);
  assert.equal((html.match(/class="odd:bg-white even:bg-slate-50"/g)||[]).length,2);
  assert.doesNotMatch(render([]),/odd:bg|even:bg/);
  const footer = html.match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/)?.[1];
  assert(footer, "sticky TOTAL footer must be rendered");
  assert.doesNotMatch(footer,/odd:bg|even:bg/);
  const cells = [...footer.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
  assert.equal(cells.length, 13);
  assert.deepEqual(cells.map(c => c[2].replace(/<[^>]+>/g, "").replace(/\u00a0/g, " ")),
    ["TOTAL", "Rp 400", "Rp 420", "Rp 840", "Rp 420", "100.00%", "100", "20", "20.00%", "Rp 4", "Rp 42", "", ""]);
  assert.match(html, /<tfoot[^>]*sticky bottom-0/);
  assert.doesNotMatch(cells[3][1], /text-(emerald|red)/);
  assert.match(cells[4][1], /text-emerald-700/);
  assert.match(cells[5][1], /text-emerald-700/);
  assert.doesNotMatch(footer, /input|Not a total note/);
  assert.equal(JSON.stringify(rows), before);
  for (const [commission, color] of [[0, "text-red-700"], [105, "text-slate-600"], [null, "text-slate-600"]]) {
    const value = render([row(1, 100, commission, 0, 0)]).match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/)[1];
    const fields = [...value.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
    assert(fields[4][1].includes(color));
    assert(fields[5][1].includes(color));
    for (const i of [8, 9, 10]) assert.equal(fields[i][2], "—");
    assert.doesNotMatch(value, /NaN|Infinity/);
  }
  const missing = render([row(1, 100, null, null, null)]).match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/)[1];
  assert(missing.includes("Belum Import"));
  const values = [...missing.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
  for (const i of [4, 5, 6, 7, 8, 9, 10]) assert.equal(values[i][2], "—");
  const partial = render([row(1, 100, 210, 10, 2), row(2, 300, null, null, null)]).match(/<tfoot[^>]*>([\s\S]*?)<\/tfoot>/)[1];
  const known = [...partial.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
  assert.equal(known[4][2].replace(/\u00a0/g, " "), "-Rp 210");
  assert.equal(known[5][2], "-50.00%");
});
