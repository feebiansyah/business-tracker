import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../filter/sync-baseline.test.mjs";
const api=()=>loadTs("lib/meta-prefilter/model.ts");
test("business date is today in Jakarta, not UTC yesterday",()=>{
  assert.equal(api().businessDate(new Date("2026-11-06T17:00:00Z")),"2026-11-07");
  assert.equal(api().businessDate(new Date("2026-11-06T16:59:59Z")),"2026-11-06");
});
test("only positive today's insights survive; zero click CPC is null",()=>{
  const {readInsight,cpc}=api();
  assert.equal(readInsight({campaign_id:"123",spend:"0",date_start:"2026-11-07",date_stop:"2026-11-07"},"2026-11-07"),null);
  const row=readInsight({campaign_id:"123",spend:"12.50",inline_link_clicks:"5",date_start:"2026-11-07",date_stop:"2026-11-07"},"2026-11-07");
  assert.equal(cpc(row.spend,row.clicks),"2.5");assert.equal(cpc("10",0n),null);assert.equal(cpc("10",null),null);
  assert.throws(()=>readInsight({campaign_id:"123",spend:"5",date_start:"2026-11-06",date_stop:"2026-11-06"},"2026-11-07"));
  assert.throws(()=>readInsight({campaign_id:"123",spend:"invalid",date_start:"2026-11-07",date_stop:"2026-11-07"},"2026-11-07"));
});
