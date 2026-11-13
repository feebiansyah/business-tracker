import assert from "node:assert/strict";
import test from "node:test";
import {loadTs} from "../filter/sync-baseline.test.mjs";

function fixture(){
  const saved=new Map(),calls=[];let revision=1;
  const db={metaPrefilterRun:{findFirst:async q=>{calls.push(q);return q.where.shopeeAccountId===7?{id:q.where.slot+revision}:null;}},metaPrefilterRow:{findFirst:async q=>q.where.metaCampaignId==="123"&&q.where.runId.in.length?{id:"snapshot-only"}:null},campaignPostTypeOverride:{upsert:async q=>{saved.set(q.create.shopeeAccountId+":"+q.create.metaCampaignId,q.create);return q.create;},deleteMany:async q=>{saved.delete(q.where.shopeeAccountId+":"+q.where.metaCampaignId);}},$transaction:fn=>fn(db)};
  const api=loadTs("lib/meta-prefilter/post-type.ts",{"@/lib/prisma":{prisma:db}});
  const input={shopeeAccountId:7,businessDate:"2026-11-14",metaCampaignId:"123",manualType:"GAMBAR_FEWFEED"};
  const save=patch=>api.savePrefilterPostType({...input,...patch},db,new Date("2026-11-14T03:00:00Z"));
  return {save,saved,calls,replace:()=>revision++};
}
test("PraFilter saves type without permanent Campaign and snapshot refresh does not own override",async()=>{
  const f=fixture();await f.save();f.replace();await f.save({manualType:"VIDEO"});
  assert.equal(f.saved.size,1);assert.equal(f.saved.get("7:123").manualType,"VIDEO");
  assert(f.calls.every(q=>q.where.status==="COMPLETE"&&q.where.shopeeAccountId===7&&q.where.businessDate.toISOString()==="2026-11-14T00:00:00.000Z"));
  await f.save({manualType:null});assert.equal(f.saved.size,0);
});
test("PraFilter rejects wrong account, stale date, absent snapshot target and invalid type",async()=>{
  const f=fixture();
  for(const patch of [{shopeeAccountId:8},{businessDate:"2026-11-13"},{metaCampaignId:"999"},{manualType:"UNKNOWN"}])await assert.rejects(f.save(patch));
  assert.equal(f.saved.size,0);
});
