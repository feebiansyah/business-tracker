import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { loadTs } from "../filter/sync-baseline.test.mjs";
test("main Traffic report stays separated by origin with bounded bulk queries and existing conversion",async()=>{
  const {getGroupTrafficReport}=loadTs("lib/overview-groups/traffic.ts");
  const sql=new DatabaseSync(":memory:");
  for(const p of ["Clickadu","Adsterra"]) sql.exec(`CREATE TABLE ${p}CampaignConfig(id INTEGER,shopeeAccountId INTEGER,historySyncedThrough TEXT);CREATE TABLE ${p}CampaignDailyMetric(${p.toLowerCase()}CampaignConfigId INTEGER,date TEXT,spendUsd NUMERIC,commissionIdr NUMERIC);
  INSERT INTO ${p}CampaignConfig VALUES(1,1,'2026-11-18'),(2,2,NULL),(3,3,'2026-11-18');
  INSERT INTO ${p}CampaignDailyMetric VALUES(1,'2026-11-18',1,20000),(2,'2026-11-18',2,40000),(3,'2026-11-18',99,99999);`);
  let calls=0;const db={$queryRaw:async(q)=>{calls++;return sql.prepare(q.sql).all(...q.values);}};
  const result=await getGroupTrafficReport(db,[1,2],{});
  assert.equal(calls,6);
  for(const p of result){
    assert.equal(p.rows.length,2);assert.equal(p.total,2);
    assert.deepEqual(p.summary.map(s=>s.shopeeAccountId),[1,2]);
    assert.equal(p.rows[0].spendIdr,"19000");
    assert.equal(p.rows[0].profitIdr,"1000");
    assert.equal(p.summary[1].unsynced,1);
  }
  const sorted=await getGroupTrafficReport(db,[1,2],{clickaduSort:"spendUsd",clickaduDir:"desc",adsterraSort:"spendUsd",adsterraDir:"desc"});
  for(const p of sorted)assert.equal(p.rows[0].shopeeAccountId,2);
  for(const p of ["Clickadu","Adsterra"]) sql.prepare(`INSERT INTO ${p}CampaignConfig VALUES(4,1,NULL)`).run();
  const incomplete=await getGroupTrafficReport(db,[1,2],{});
  for(const p of incomplete){
    assert.equal(p.rows[0].spendIdr,null);
    assert.equal(p.summary[0].spendIdr,null);
    assert.equal(p.summary[0].profitIdr,null);
    assert.equal(p.summary[0].incompleteDays,1);
  }
  sql.close();
});
