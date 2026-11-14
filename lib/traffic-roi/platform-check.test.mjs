import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {loadTs} from "../filter/sync-baseline.test.mjs";
const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
const row=(date,tagLink1,platform)=>({date,tagLink1,platform});

test("latest date comes from entire CSV, not just sourceTag or analysis period",()=>{
  const {checkTrafficPlatform}=loadTs("lib/traffic-roi/platform-check.ts");
  const result=checkTrafficPlatform([row("2026-11-12","ADU","Instagram"),row("2026-11-14","OTHER","Facebook"),row("2026-11-13","ADU","Facebook")],"ADU");
  assert.deepEqual(result,{status:"UNAVAILABLE",latestDate:"2026-11-14",platforms:[],relatedRowCount:0,reason:"NO_RELATED_ROWS"});
});
test("latest matching rows normalize tag and platform; other dates/tags never affect status",()=>{
  const {checkTrafficPlatform}=loadTs("lib/traffic-roi/platform-check.ts");
  const rows=[row("2026-11-13","ADU","Instagram"),row("2026-11-14","OTHER",""),row("2026-11-14"," adu "," Facebook "),row("2026-11-14","ADU","facebook"),row("2026-11-14","ADU","FACEBOOK")];
  assert.deepEqual(checkTrafficPlatform(rows," aDu "),{status:"SAFE",latestDate:"2026-11-14",platforms:["Facebook"],relatedRowCount:3,reason:null});
  for(const platform of ["Instagram","", "   "]){const result=checkTrafficPlatform([...rows,row("2026-11-14","ADU",platform)],"ADU");assert.equal(result.status,"ATTENTION");assert.equal(result.relatedRowCount,4);assert.equal(result.platforms.length,2);}
});
test("missing optional header is unavailable with latest date and related count intact",()=>{
  const {checkTrafficPlatform}=loadTs("lib/traffic-roi/platform-check.ts");
  assert.deepEqual(checkTrafficPlatform([row("2026-11-14","ADU",undefined)],"ADU"),{status:"UNAVAILABLE",latestDate:"2026-11-14",platforms:[],relatedRowCount:1,reason:"MISSING_PLATFORM_HEADER"});
});

for(const provider of ["clickadu","adsterra"])test(`${provider} reuses uploaded CSV; Platform does not change ROI or candidates or request count`,async()=>{
  const api=loadTs(`lib/${provider}-roi/analyze.ts`);
  const build=api[provider==="clickadu"?"buildClickaduRoiAnalysis":"buildAdsterraRoiAnalysis"];
  const header="Waktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)";
  let reads=0;const deps={loadConfig:async()=>({id:7,campaignId:"77",label:null,sourceTag:"SRC",shopeeAccountId:2,lastBlacklistReplacedAt:null}),getStatistics:async()=>{reads++;return provider==="clickadu"?[{zone:"123",impressions:100,clicks:5,spent:"1",conversions:0,conversionsClicks:0,cpa:"0",cpc:"0.2",cpm:"1",ctr:"5",cr:"0"}]:[{placement:"123",impressions:100,clicks:5,spent:"1"}];}};
  const input={shopeeAccountId:2,configId:7,dateFrom:"2026-11-13",dateTill:"2026-11-14",fxRate:"10000",originalFilename:"same.csv"};
  const run=csv=>build({...input,bytes:new TextEncoder().encode(csv)},deps);
  const old=await run(header+"\n2026-11-14 10:00:00,SRC,123,2000");
  assert.equal(old.platformCheck.status,"UNAVAILABLE");assert.equal(old.platformCheck.reason,"MISSING_PLATFORM_HEADER");
  for(const platform of ["Facebook","Instagram",""]){
    const result=await run(header+",Platform\n2026-11-14 10:00:00,SRC,123,2000,"+platform);
    assert.deepEqual(result.analysis,old.analysis);if(provider==="clickadu")assert.deepEqual(result.csv,old.csv);
    assert.equal(result.platformCheck.status,platform==="Facebook"?"SAFE":"ATTENTION");
  }
  const later=await run(header+",Platform\n2026-11-14 10:00:00,SRC,123,2000,Facebook\n2026-11-15 00:00:00,OTHER,999,10,Facebook");
  assert.equal(later.platformCheck.latestDate,"2026-11-15");assert.equal(later.platformCheck.status,"UNAVAILABLE");assert.deepEqual(later.analysis,old.analysis);
  assert.equal(reads,5);
});

test("shared notice is informative only: exact copy, date, unique values and missing header",()=>{
  const {TrafficPlatformNotice}=loadTs("components/traffic-roi/platform-notice.tsx");
  for(const [status,reason,copy,color]of [["SAFE",null,"Platform tanggal terbaru: Facebook — aman.","emerald"],["ATTENTION",null,"Perhatian: Platform tanggal terbaru bukan Facebook. Ganti link Clickadu/Adsterra secara manual.","amber"],["UNAVAILABLE","MISSING_PLATFORM_HEADER","Platform tanggal terbaru belum dapat diperiksa.","amber"]]){
    const html=renderToStaticMarkup(React.createElement(TrafficPlatformNotice,{check:{status,reason,latestDate:"2026-11-14",platforms:status==="UNAVAILABLE"?[]:["Facebook",""],relatedRowCount:2}}));
    assert(html.includes(copy));assert.match(html,/14 Nov 2026/);assert(html.includes(color));assert.doesNotMatch(html,/<button|<table|<dialog|disabled/);
    if(status==="UNAVAILABLE")assert.match(html,/Kolom Platform tidak ditemukan/);else assert.match(html,/kosong/);
  }
});
