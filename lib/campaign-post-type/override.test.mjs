import assert from "node:assert/strict";
import test from "node:test";
import {loadTs} from "../filter/sync-baseline.test.mjs";

const load = db => loadTs("lib/campaign-post-type/repository.ts", {"@/lib/prisma":{prisma:db}});
test("manual overrides auto without changing it; missing manual falls back to auto or dash",()=>{
  const {resolvePostType}=loadTs("lib/campaign-post-type/model.ts");
  for(const [manual,auto,want] of [["VIDEO","GAMBAR/FEED","VIDEO"],["GAMBAR_FEWFEED","VIDEO","GAMBAR FEWFEED"],["GAMBAR_PRODUK","VIDEO","GAMBAR PRODUK"],[null,"VIDEO","VIDEO"],[null,"GAMBAR/FEED","GAMBAR/FEED"],[null,null,"—"],[null,"","—"]]) assert.equal(resolvePostType(manual,auto),want);
});

function fake(){
  const rows=new Map(),reads=[],writes=[];
  const db={campaign:{findFirst:async({where})=>where.metaAccount.shopeeAccountId===7&&where.metaCampaignId==="123"?{id:1}:null},campaignPostTypeOverride:{
    upsert:async q=>{writes.push(q);rows.set(q.create.shopeeAccountId+":"+q.create.metaCampaignId,q.create);return q.create;},
    deleteMany:async q=>{writes.push(q);rows.delete(q.where.shopeeAccountId+":"+q.where.metaCampaignId);return {count:1};},
    findMany:async q=>{reads.push(q);return [...rows.values()].filter(r=>r.shopeeAccountId===q.where.shopeeAccountId&&q.where.metaCampaignId.in.includes(r.metaCampaignId));},
  }};
  return {db,rows,reads,writes};
}
test("save/reset only changes scoped override; subsequent reads preserve it and are bulk",async()=>{
  const f=fake(),api=load(f.db);
  const input={shopeeAccountId:7,metaCampaignId:"123",manualType:"GAMBAR_PRODUK"};
  assert.equal((await api.saveCampaignPostType(input)).manualType,"GAMBAR_PRODUK");
  f.rows.set("8:123",{shopeeAccountId:8,metaCampaignId:"123",manualType:"VIDEO"});
  for(let i=0;i<2;i++) assert.deepEqual(await api.readPostTypeOverrides(7,["123",...Array.from({length:99},(_,n)=>String(1000+n))]),{"123":"GAMBAR_PRODUK"});
  assert.equal(f.reads.length,2);assert.equal(f.reads[0].where.metaCampaignId.in.length,100);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].update.manualType,"GAMBAR_PRODUK");
  await api.saveCampaignPostType({...input,manualType:null});
  assert.deepEqual(await api.readPostTypeOverrides(7,["123"]),{});
  assert.equal(f.rows.get("8:123").manualType,"VIDEO");
  const before=f.reads.length;assert.deepEqual(await api.readPostTypeOverrides(7,[]),{});assert.equal(f.reads.length,before);
});
test("invalid type/ID and cross-Shopee membership reject before any override write",async()=>{
  const f=fake(),api=load(f.db),input={shopeeAccountId:7,metaCampaignId:"123",manualType:"VIDEO"};
  for(const change of [{manualType:"FEED"},{manualType:""},{metaCampaignId:"bad"},{shopeeAccountId:0},{shopeeAccountId:8}]) await assert.rejects(()=>api.saveCampaignPostType({...input,...change}));
  assert.equal(f.writes.length,0);
});
