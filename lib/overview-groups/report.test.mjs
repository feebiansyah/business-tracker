import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { loadTs } from "../filter/sync-baseline.test.mjs";

test("bulk report aggregates before pagination, preserves member coverage, and avoids join fanout", async () => {
  const { getGroupPerformance, getGroupReminders } = loadTs("lib/overview-groups/report.ts");
  const sql=new DatabaseSync(":memory:");
  sql.exec(`
    CREATE TABLE ShopeeAccount(id INTEGER);
    INSERT INTO ShopeeAccount VALUES(1),(2),(3);
    CREATE TABLE MetaAccount(id INTEGER,shopeeAccountId INTEGER,name TEXT,accountId TEXT,status TEXT);
    CREATE TABLE Campaign(id INTEGER,metaAccountId INTEGER,metaStatus TEXT);
    CREATE TABLE MetaAccountDailySpend(metaAccountId INTEGER,date TEXT,spend NUMERIC);
    CREATE TABLE CampaignDailyMetric(campaignId INTEGER,date TEXT,commission NUMERIC,note TEXT,completed INTEGER);
    CREATE TABLE ShopeeCommissionImport(shopeeAccountId INTEGER,dateFrom TEXT,dateTo TEXT);
    CREATE TABLE MetaSyncRun(id TEXT,shopeeAccountId INTEGER);
    CREATE TABLE MetaSyncWlProgress(runId TEXT,metaAccountId INTEGER,accountId TEXT,status TEXT,phase TEXT,error TEXT);
    INSERT INTO MetaAccount VALUES(10,1,'WL A','a','ACTIVE'),(20,2,'WL B','b','INACTIVE'),(30,3,'Other','c','ACTIVE');
    INSERT INTO Campaign VALUES(1,10,'ACTIVE'),(2,10,'PAUSED'),(3,20,'PAUSED'),(4,30,'ACTIVE');
    INSERT INTO CampaignDailyMetric VALUES(1,'2026-11-01',100,' pending ',0),(2,'2026-11-01',200,' ',0),(3,'2026-11-01',300,'done',1),(4,'2026-11-01',999,'other',0);
    INSERT INTO ShopeeCommissionImport VALUES(1,'2026-11-01','2026-11-30');
  `);
  for(let i=1;i<=28;i++)sql.prepare("INSERT INTO MetaAccountDailySpend VALUES(?,?,?)").run(10,`2026-11-${String(i).padStart(2,"0")}`,100);
  sql.prepare("INSERT INTO MetaAccountDailySpend VALUES(?,?,?)").run(20,"2026-11-01",200);
  let calls=0;
  const db={$queryRaw:async(q)=>{calls++;return sql.prepare(q.sql).all(...q.values);}};
  const result=await getGroupPerformance(db,{id:7,name:"Combined",members:[{shopeeAccountId:1},{shopeeAccountId:2}]},{sort_7:"date",dir_7:"asc",pageSize_7:"25"},2);
  assert.equal(calls,2);
  assert.equal(result.performance.pagination.total,28);
  assert.equal(result.performance.days.length,25);
  assert.equal(result.performance.days[0].date,"2026-11-01");
  assert.equal(result.performance.days[0].budget,300); // not multiplied by two campaign rows
  assert.equal(result.performance.days[0].commission,600);
  assert.equal(result.performance.days[1].commission,null); // member 1 import cannot cover member 2
  assert.equal(result.performance.days[1].budget,null); // absent member spend stays unknown
  assert.equal(result.performance.summary.profit,285);
  assert.ok(Math.abs(result.performance.summary.profitPercent-90.476190476)<0.00001);
  assert.equal(result.incompleteDays,27);
  const second=await getGroupPerformance(db,{id:7,name:"Combined",members:[{shopeeAccountId:1},{shopeeAccountId:2}]},{sort_7:"date",dir_7:"asc",page_7:"2"},2);
  assert.equal(second.performance.days.length,3);
  assert.equal(second.performance.days[0].date,"2026-11-26");
  const reminders=await getGroupReminders(db,[1,2]);
  assert.equal(reminders.pendingNotes,1);
  assert.deepEqual(reminders.wls.map(w=>w.id),[20]);
  assert.equal(reminders.wls[0].shopeeAccountId,2);
  sql.close();
});
