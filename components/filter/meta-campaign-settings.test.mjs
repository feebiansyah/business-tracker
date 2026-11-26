import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "../../lib/filter/sync-baseline.test.mjs";
import { createMetaSettingsRequestGate } from "./meta-campaign-settings-state.ts";

test("request gate blocks concurrent reads and ignores a late response", () => {
  const gate = createMetaSettingsRequestGate();
  const first = gate.begin();
  assert.equal(typeof first, "number");
  assert.equal(gate.begin(), null);
  assert.equal(gate.isCurrent(first), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(first), false);
  const second = gate.begin();
  assert.equal(gate.isCurrent(second), true);
  gate.finish(second);
  assert.equal(gate.begin() !== null, true);
});

test("settings UI loads through the read-only action and renders direct information", async () => {
  const source = await readFile(new URL("./meta-campaign-settings.tsx", import.meta.url), "utf8");
  assert.match(source, /getMetaCampaignSettingsAction/);
  assert.match(source, /Baca ulang/);
  assert.match(source, /Jenis konten/);
  assert.match(source, /Penempatan/);
  assert.match(source, /Umur/);
  assert.match(source, /Lokasi/);
  assert.match(source, /Gender/);
  assert.match(source, /isContentTypeWarning/);
  assert.match(source, /visibleWarnings/);
  assert.match(source, /showPartialNotice/);
  assert.match(source, /warnings\.length === 0/);
  assert.doesNotMatch(source, /\{result\.data\.partial \? <div/);
  assert.doesNotMatch(source, /<details/);
});

test("history modal always mounts settings in the unified layout without tabs", async () => {
  const source = await readFile(new URL("./campaign-history-modal.tsx", import.meta.url), "utf8");
  assert.match(source, /Histori Harian/);
  assert.doesNotMatch(source, /Pengaturan Meta|settingsDetails/);
  assert.doesNotMatch(source, /activeTab|role="tab/);
  assert.match(source, /metaSettings=\{/);
  assert.match(source, /CampaignDailyDetail/);
});

test("compact settings show only five representative values without ad-set cards or controls",()=>{
  const require=createRequire(import.meta.url),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
  const reference={id:"111",name:"Reference",contentType:"VIDEO",placements:"Feed",age:"18–65",locations:"Indonesia",gender:"Semua"};
  const result={success:true,target:{shopeeName:"Shop",wlName:"WL"},manualPostType:null,data:{adSetCount:2,reference,differences:[{...reference,id:"222",name:"Difference",age:"25–55"}],sameAcrossAll:false,partial:false,warnings:[]}};
  let state=0;
  const {MetaCampaignSettings}=loadTs("components/filter/meta-campaign-settings.tsx",{react:{...React,useState:()=>[state++===0?result:false,()=>{}]},"@/app/shopee/[id]/filter/meta-settings-actions":{}});
  const html=renderToStaticMarkup(React.createElement(MetaCampaignSettings,{mode:"filter",shopeeAccountId:7,campaignId:1,compact:true}));
  for(const text of ["VIDEO","Feed","18–65","Indonesia","Semua","Jenis konten","Penempatan","Umur","Lokasi","Gender"])assert(html.includes(text),text);
  for(const text of ["Pengaturan Meta","Data sebagian","Baca ulang","Reference","Difference","111","222","25–55","Set Iklan","Acuan","Shopee:","WL:"])assert(!html.includes(text),text);
  assert.doesNotMatch(html,/<details|role="tab|<img/);
});
