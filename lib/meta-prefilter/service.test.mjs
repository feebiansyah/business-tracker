import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../filter/sync-baseline.test.mjs";

function fixture({wlCount=1,campaignCount=1}={}) {
  let instant=new Date("2026-11-07T03:17:42Z"),serial=0,mode="ok",gate;
  const runs=new Map(),rows=new Map(),campaigns=new Map(),calls=[],reads=[];
  const wls=Array.from({length:wlCount},(_,i)=>({id:i+1,accountId:String(i+100),name:"WL "+(i+1)}));
  const copy=v=>structuredClone(v);
  function match(row,where={}) {
    return Object.entries(where).every(([k,v])=>{
      if(k==="OR")return v.some(w=>match(row,w)); if(k==="AND")return v.every(w=>match(row,w));
      if(k==="run")return match(runs.get(row.runId),v);
      if(k==="rows")return ![...rows.values()].some(r=>r.runId===row.id && match(r,v.none));
      const actual=row[k];
      if(v instanceof Date)return +actual===+v;
      if(v && typeof v==="object")return Object.entries(v).every(([op,x])=>op==="in"?x.includes(actual):op==="notIn"?!x.includes(actual):op==="not"?actual!==x:op==="lte"?actual<=x:op==="lt"?actual<x:op==="gt"?actual!==null&&actual>x:op==="gte"?actual!==null&&actual>=x:false);
      return actual===v;
    });
  }
  function model(map,defaults={}){
    return {
      async findMany(args={}){calls.push([map===runs?"run.read":"row.read",args]);let found=[...map.values()].filter(r=>match(r,args.where));for(const part of [...(Array.isArray(args.orderBy)?args.orderBy:args.orderBy?[args.orderBy]:[])].reverse())for(const [k,dir]of Object.entries(part))found.sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*(dir==="desc"?-1:1));return copy(args.take?found.slice(0,args.take):found);},
      async findFirst(args){return(await this.findMany(args))[0]??null;},async findUnique(args){return this.findFirst(args);},
      async create({data}){if(data.activeShopeeAccountId!=null&&[...map.values()].some(r=>r.activeShopeeAccountId===data.activeShopeeAccountId))throw Object.assign(new Error("duplicate"),{code:"P2002"});const r={id:"run"+(++serial),...defaults,...copy(data)};map.set(r.id,r);return copy(r);},
      async createMany({data}){calls.push(["row.createMany",data.length]);for(const d of data){if([...map.values()].some(r=>r.runId===d.runId&&r.metaCampaignId===d.metaCampaignId))throw new Error("duplicate campaign");await this.create({data:d});}return{count:data.length};},
      async updateMany({where,data}){let count=0;for(const row of map.values())if(match(row,where)){for(const[k,v]of Object.entries(data))row[k]=v&&typeof v==="object"&&"increment"in v?row[k]+v.increment:copy(v);count++;}return{count};},
      async update(args){await this.updateMany(args);return this.findFirst({where:args.where});},
      async deleteMany({where}){calls.push([map===runs?"run.delete":"row.delete",where]);let count=0;for(const[k,r]of map)if(match(r,where)){map.delete(k);count++;}return{count};},
    };
  }
  let tail=Promise.resolve();
  const db={shopeeAccount:{findUnique:async({where})=>where.id===7?{id:7,name:"Shop",metaAccounts:copy(wls)}:null},metaPrefilterRun:model(runs,{generation:0,pages:0,usagePercent:0,status:"RUNNING",leaseOwner:null,leaseExpiresAt:null,error:null,finishedAt:null,createdAt:instant}),metaPrefilterRow:model(rows,{spend:null,clicks:null,configuredStatus:null,effectiveStatus:null}),$transaction:fn=>{const work=tail.then(async()=>{const before=[copy([...runs]),copy([...rows])];try{return await fn(db);}catch(e){runs.clear();rows.clear();for(const[k,v]of before[0])runs.set(k,v);for(const[k,v]of before[1])rows.set(k,v);throw e;}});tail=work.catch(()=>{});return work;}};
  db.campaign={findMany:async args=>{calls.push(["campaign.read",args]);return copy([...campaigns.values()].filter(c=>match(c,args.where)));}};
  class ApiError extends Error{constructor(message,code){super(message);this.code=code;}}
  class Pause extends Error{constructor(reason){super(reason);this.reason=reason;}}
  const clientFactory=()=>({restoreSyncUsagePercent(){},getSyncUsagePercent:()=>0,waitBetweenAccounts:async()=>{},getSyncPage:async(kind,id,range,options)=>{
    reads.push({kind,id,range,after:options.after});if(gate)await gate;
    if(mode==="deny"&&id==="100")throw new ApiError("credential must never leak",200);
    if(mode==="fail")throw new ApiError("secret raw provider body",999);
    if(mode==="rate")throw new ApiError("limit",17);
    const offset=Number(options.after??0),end=Math.min(offset+100,campaignCount);
    const data=Array.from({length:end-offset},(_,i)=>{const cid=id+String(offset+i+1).padStart(4,"0");return kind==="campaigns"?{id:cid,name:"Campaign "+cid,status:"ACTIVE",effective_status:"ACTIVE"}:{campaign_id:cid,campaign_name:"Campaign "+cid,spend:mode==="zero"?"0":"100",inline_link_clicks:"10",date_start:range.since,date_stop:range.until};});
    return{data,...(end<campaignCount?{after:String(end)}:{})};
  }});
  const api=loadTs("lib/meta-prefilter/service.ts",{__date:Date,"@/lib/prisma":{prisma:db},"@/lib/meta/client":{MetaGraphClient:class{},MetaApiError:ApiError,MetaSyncPauseError:Pause}});
  const step=(slot="AWAL",runId)=>api.runPrefilterBatch({shopeeAccountId:7,slot,runId,owner:"owner"+(++serial),receivedAt:new Date(instant),startedAt:Date.now()},{db,clientFactory,now:()=>new Date(instant)});
  const finish=async(slot="AWAL")=>{let r=await step(slot),units=1;while(r.shouldContinue&&units<2000){const before=reads.length;r=await step(slot,r.progress.runId);assert(reads.length-before<=1);units++;}assert(units<2000);return r;};
  return{db,runs,rows,campaigns,reads,calls,wls,api,step,finish,read:()=>api.readPrefilterData(7,db,new Date(instant)),setMode:v=>{mode=v;},setGate:v=>{gate=v;},advance:ms=>{instant=new Date(+instant+ms);}};
}

test("old spend-positive and legacy campaigns are excluded; only new or eligible first-day campaigns publish",async()=>{
  const h=fixture({campaignCount:6});
  for(const [suffix,eligible,date]of [[1,true,"2026-11-06"],[2,false,null],[3,true,null],[4,true,"2026-11-07"],[6,false,"2026-11-07"]])h.campaigns.set("100000"+suffix,{metaCampaignId:"100000"+suffix,metaAccountId:1,firstDeliveryEligible:eligible,firstDeliveryDate:date?new Date(date+"T00:00:00Z"):null});
  await h.finish();
  assert.deepEqual((await h.read()).snapshots.AWAL.rows.map(r=>r.metaCampaignId),["1000003","1000004","1000005"]);
  const lookups=h.calls.filter(c=>c[0]==="campaign.read");assert.equal(lookups.length,2);assert.equal(lookups[0][1].where.metaCampaignId.in.length,6);assert.equal(lookups[1][1].where.metaCampaignId.in.length,3);
  assert.equal(h.campaigns.get("1000001").firstDeliveryDate.toISOString(),"2026-11-06T00:00:00.000Z");
});

test("a previously published snapshot cannot keep showing a permanent legacy campaign",async()=>{
  const h=fixture();await h.finish();
  h.campaigns.set("1000001",{metaCampaignId:"1000001",firstDeliveryEligible:false,firstDeliveryDate:null});
  assert.equal((await h.read()).snapshots.AWAL.rows.length,0);
  assert.equal(h.rows.size,1); // Read filtering does not rewrite stored snapshots or campaign data.
});

test("two independent slots retain actual click timestamps; zero spend excluded, refresh replaces atomically",async()=>{
  const h=fixture();await h.finish();const old=(await h.read()).snapshots.AWAL;
  assert.equal(old.requestedAt,"2026-11-07T03:17:42.000Z");assert.equal(old.rows.length,1);assert.equal(old.rows[0].cpc,"10");
  h.advance(60000);await h.finish("AKHIR");assert.equal((await h.read()).snapshots.AKHIR.requestedAt,"2026-11-07T03:18:42.000Z");
  h.setMode("zero");let r=await h.step();assert.equal((await h.read()).snapshots.AWAL.runId,old.runId);
  while(r.shouldContinue)r=await h.step("AWAL",r.progress.runId);
  const state=await h.read();assert.equal(state.snapshots.AWAL.rows.length,0);assert.equal(state.snapshots.AKHIR.rows.length,1);
});
test("failed refresh and rate pause keep previous COMPLETE; resume is explicit",async()=>{
  const h=fixture();await h.finish();const old=(await h.read()).snapshots.AWAL.runId;
  h.setMode("fail");const failed=await h.finish();assert.equal(failed.progress.status,"FAILED");assert.equal((await h.read()).snapshots.AWAL.runId,old);assert.doesNotMatch(failed.progress.message,/secret/);
  h.setMode("rate");const paused=await h.finish();assert.equal(paused.progress.status,"PAUSED_RATE_LIMIT");assert.equal((await h.read()).snapshots.AWAL.runId,old);
  h.setMode("ok");await h.finish();assert.notEqual((await h.read()).snapshots.AWAL.runId,old);
});
test("concurrent caller cannot fetch while a live unit owns the lease; expired lease can resume",async()=>{
  const h=fixture();let release;h.setGate(new Promise(r=>{release=r;}));
  const pending=h.step();while(!h.reads.length)await new Promise(r=>setTimeout(r,1));
  const blocked=await h.step("AKHIR");assert.equal(blocked.blocked,true);assert.equal(h.reads.length,1);
  release();await pending;h.setGate(null);
  const run=[...h.runs.values()][0];run.leaseOwner="crashed";run.leaseExpiresAt=new Date("2026-11-07T03:00:00Z");
  await h.finish();assert.equal((await h.read()).snapshots.AWAL.rows.length,1);
});
test("61 WL with 101 campaigns are paged one request/unit with bulk row writes and no history writes",async()=>{
  const h=fixture({wlCount:61,campaignCount:101});await h.finish();
  assert.equal(h.reads.length,244);assert.equal((await h.read()).snapshots.AWAL.rows.length,6161);
  const classification=h.calls.filter(c=>c[0]==="campaign.read");
  assert.equal(classification.length,123); // 122 insight pages + one bulk snapshot read.
  assert(classification.slice(0,-1).every(c=>c[1].where.metaCampaignId.in.length<=100));
  assert(h.calls.filter(c=>c[0]==="row.createMany").every(c=>c[1]<=100));
  assert(h.reads.every(r=>r.kind==="campaigns"||(r.kind==="insights"&&r.range.since==="2026-11-07"&&r.range.until==="2026-11-07")));
});
test("inaccessible WL is reported as PARTIAL; successful staging is safe and last COMPLETE remains",async()=>{
  const h=fixture({wlCount:2});await h.finish();const old=(await h.read()).snapshots.AWAL;
  h.setMode("deny");const r=await h.finish();
  assert.equal(r.progress.status,"PARTIAL");assert.equal(r.progress.skipped.length,1);
  const snap=(await h.read()).snapshots.AWAL;assert.equal(snap.runId,old.runId);assert.equal(snap.rows.length,2);
  const staged=[...h.rows.values()].filter(row=>row.runId===r.progress.runId);
  assert.equal(staged.length,1);assert.equal(staged[0].metaAccountId,2);
});
test("day rollover expires unfinished work; old snapshots hidden and lazy cleanup bounded",async()=>{
  const h=fixture({campaignCount:101});await h.finish();const old=(await h.read()).snapshots.AWAL.runId;
  const r=await h.step("AKHIR");h.advance(86400000);const expired=await h.step("AKHIR",r.progress.runId);
  assert.equal(expired.progress.status,"EXPIRED");assert.equal((await h.read()).snapshots.AWAL,null);
  await h.finish();assert(h.calls.filter(c=>c[0]==="row.delete"&&c[1].id).every(c=>c[1].id.in.length<=100));
  assert([...h.rows.values()].filter(r=>r.runId===old).length<=1);
});

test("WL scope drift fails closed and preserves the last COMPLETE",async()=>{
  const h=fixture();await h.finish();const old=(await h.read()).snapshots.AWAL.runId;
  const start=await h.step();h.wls.push({id:2,name:"New WL",accountId:"999"});
  const result=await h.step("AWAL",start.progress.runId);
  assert.equal(result.progress.status,"FAILED");assert.equal((await h.read()).snapshots.AWAL.runId,old);
});
test("late old generation cannot persist a page or release another owner's lease",async()=>{
  const h=fixture();let release;h.setGate(new Promise(r=>{release=r;}));const pending=h.step();
  while(!h.reads.length)await new Promise(r=>setTimeout(r,1));
  const run=[...h.runs.values()][0];run.generation++;run.leaseOwner="replacement";
  release();await pending;
  assert.equal(h.rows.size,0);assert.equal(h.runs.get(run.id).leaseOwner,"replacement");
});
test("midnight during an awaited Meta page cannot publish yesterday",async()=>{
  const h=fixture();h.advance(Date.parse("2026-11-07T16:59:59Z")-Date.parse("2026-11-07T03:17:42Z"));
  let release;h.setGate(new Promise(r=>{release=r;}));const pending=h.step();
  while(!h.reads.length)await new Promise(r=>setTimeout(r,1));h.advance(2000);release();
  const result=await pending;assert.equal(result.progress.status,"EXPIRED");assert.equal(h.rows.size,0);assert.equal((await h.read()).snapshots.AWAL,null);
});

test("COMPLETE headers and rows share one repeatable-read snapshot against concurrent cleanup",async()=>{
  const h=fixture();await h.finish();
  const transaction=h.db.$transaction, find=h.db.metaPrefilterRow.findMany;let coherent=false;
  h.db.$transaction=(fn,options)=>transaction(async tx=>{coherent=options?.isolationLevel==="RepeatableRead";try{return await fn(tx);}finally{coherent=false;}});
  h.db.metaPrefilterRow.findMany=async args=>{if(args.where?.runId?.in)assert.equal(coherent,true,"published rows must be read with their headers, not after cleanup can interleave");return find(args);};
  assert.equal((await h.read()).snapshots.AWAL.rows.length,1);
});
