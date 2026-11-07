import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { Decimal, day, loadTs } from "./sync-baseline.test.mjs";

const require = createRequire(import.meta.url);
const { sqltag: sql, join, raw, empty } = require("@prisma/client/runtime/library");
const Prisma = { Decimal, sql, join, raw, empty };
const metadata = id => ({ metaCampaignId: id, name: id, metaAccountId: 1, startTime: day("2026-11-01"), metaStatus: "ACTIVE", effectiveStatus: "ACTIVE", effectiveDailyBudget: 500000, budgetSource: "CAMPAIGN" });

function fixture() {
  const campaigns = new Map([["legacy", { id: 1, ...metadata("legacy"), firstDeliveryEligible: false, firstDeliveryDate: null }]]);
  const rows = new Map(), bulk = [], events = []; let fail = false;
  const db = {
    campaign: {
      upsert: async args => { const old = campaigns.get(args.where.metaCampaignId); const result = old ? Object.assign(old,args.update) : { id: campaigns.size+1, firstDeliveryDate: null, ...args.create }; campaigns.set(result.metaCampaignId,result); return result; },
      updateMany: async () => { events.push("checkpoint"); },
    },
    campaignDailyMetric: { upsert: async args => { if (fail) throw new Error("fake persist failure"); const row={...args.create,spend:args.create.spend == null ? null : new Decimal(args.create.spend).toDecimalPlaces(2).toFixed(2)}; rows.set(row.campaignId+":"+row.date.toISOString(),{...rows.get(row.campaignId+":"+row.date.toISOString()),...row}); events.push("metric"); } },
    $executeRaw: async query => {
      bulk.push(query); events.push("delivery");
      assert.match(query.sql,/UPDATE Campaign/);
      assert.match(query.sql,/MIN\(.*date\)/);
      assert.match(query.sql,/spend > 0/);
      assert.match(query.sql,/firstDeliveryEligible = (true|1)/);
      assert.match(query.sql,/firstDeliveryDate IS NULL/);
      const ids=query.values.filter(v=>typeof v==="number"), through=query.values.find(v=>v instanceof Date);
      for(const c of campaigns.values()) if(ids.includes(c.id) && c.firstDeliveryEligible && !c.firstDeliveryDate) {
        const dates=[...rows.values()].filter(r=>r.campaignId===c.id && new Decimal(r.spend??0).gt(0) && (!through || r.date<=through)).map(r=>r.date).sort((a,b)=>a-b);
        if(dates.length)c.firstDeliveryDate=dates[0];
      }
      return 1;
    },
  };
  const api=loadTs("lib/filter/persistence.ts",{"@/lib/prisma":{prisma:db},"@/lib/generated/prisma/client":{Prisma}});
  const insight=(id,date,spend)=>({campaign_id:id,date_start:date,date_stop:date,spend});
  const persist=(insights,final=true)=>api.persistInsightChunk(new Map([...campaigns].map(([id,c])=>[id,c.id])),insights,[...campaigns.values()].map(c=>c.id),"2026-11-07",{db,advanceCheckpoint:final});
  return {campaigns,rows,bulk,events,db,api,insight,persist,setFail:value=>{fail=value;}};
}

test("only campaign create opts in; metadata refresh never enables legacy campaigns",async()=>{
  const h=fixture(); await h.api.upsertCampaignMetadata(metadata("legacy"),h.db);
  const created=await h.api.upsertCampaignMetadata(metadata("new"),h.db);
  assert.equal(h.campaigns.get("legacy").firstDeliveryEligible,false);
  assert.equal(created.firstDeliveryEligible,true); assert.equal(created.firstDeliveryDate,null);
});

test("final page chooses earliest positive spend across out-of-order pages once; legacy and zero stay untouched",async()=>{
  const h=fixture(); await h.api.upsertCampaignMetadata(metadata("new"),h.db);
  await h.persist([h.insight("new","2026-11-06","1"),h.insight("legacy","2026-11-01","10")],false);
  assert.equal(h.bulk.length,0); assert.equal(h.campaigns.get("new").firstDeliveryDate,null);
  await h.persist([h.insight("new","2026-11-01","0"),h.insight("new","2026-11-03","0.01")]);
  assert.equal(h.campaigns.get("new").firstDeliveryDate.toISOString(),"2026-11-03T00:00:00.000Z");
  assert.equal(h.campaigns.get("legacy").firstDeliveryDate,null);
  assert(h.events.indexOf("delivery")>h.events.lastIndexOf("metric"));
  await h.persist([h.insight("new","2026-11-02","100")]);
  assert.equal(h.campaigns.get("new").firstDeliveryDate.toISOString(),"2026-11-03T00:00:00.000Z");
});

test("zero spend and failed page never assign a date; a later successful positive page does",async()=>{
  const h=fixture(); await h.api.upsertCampaignMetadata(metadata("new"),h.db);
  await h.persist([h.insight("new","2026-11-01","0")]); assert.equal(h.campaigns.get("new").firstDeliveryDate,null);
  h.setFail(true); const before=h.bulk.length;
  await assert.rejects(h.persist([h.insight("new","2026-11-02","1")])); assert.equal(h.bulk.length,before); assert.equal(h.campaigns.get("new").firstDeliveryDate,null);
  h.setFail(false); await h.persist([h.insight("new","2026-11-02","1")]); assert.equal(h.campaigns.get("new").firstDeliveryDate.toISOString(),"2026-11-02T00:00:00.000Z");
});

test("500 campaigns use one bulk delivery update, with no campaign read per row",async()=>{
  const h=fixture(); for(let i=0;i<500;i++)await h.api.upsertCampaignMetadata(metadata("new"+i),h.db);
  await h.persist(Array.from({length:500},(_,i)=>h.insight("new"+i,"2026-11-04","2")));
  assert.equal(h.bulk.length,1); assert.equal(h.bulk[0].values.filter(v=>typeof v==="number").length,501);
  assert.equal([...h.campaigns.values()].filter(c=>c.firstDeliveryDate).length,500);
});

test("an empty final page establishes delivery from earlier pages only after their persist succeeded",async()=>{
  const h=fixture(); await h.api.upsertCampaignMetadata(metadata("new"),h.db);
  await h.persist([h.insight("new","2026-11-04","2")],false);
  await h.persist([]);
  assert.equal(h.campaigns.get("new").firstDeliveryDate.toISOString(),"2026-11-04T00:00:00.000Z");
  const established=h.campaigns.get("new").firstDeliveryDate;
  await h.api.upsertCampaignMetadata(metadata("new"),h.db);
  assert.equal(h.campaigns.get("new").firstDeliveryDate,established);
});

test("delivery update failure cannot advance the range checkpoint",async()=>{
  const h=fixture(); await h.api.upsertCampaignMetadata(metadata("new"),h.db);
  h.db.$executeRaw=async()=>{throw new Error("fake delivery persist failure");};
  await assert.rejects(h.persist([h.insight("new","2026-11-04","1")]));
  assert.equal(h.events.includes("checkpoint"),false);
  assert.equal(h.campaigns.get("new").firstDeliveryDate,null);
});

test("migration is additive and leaves existing campaigns ineligible without backfill",()=>{
  const migration=readFileSync(new URL("../../prisma/migrations/20261107090000_add_campaign_first_delivery/migration.sql",import.meta.url),"utf8");
  assert.match(migration,/ADD COLUMN `firstDeliveryDate` DATE NULL/);
  assert.match(migration,/ADD COLUMN `firstDeliveryEligible` BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(migration,/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});
