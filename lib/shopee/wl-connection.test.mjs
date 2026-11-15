import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../filter/sync-baseline.test.mjs";
import { stateDb } from "../filter/meta-sync-state.test.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

function fixture() {
  const wls=[{id:190,accountId:"190000",name:"WL",shopeeAccountId:7},{id:191,accountId:"191000",name:"Other",shopeeAccountId:9}];
  const h=stateDb(wls),db=h.db,events=[],types=new Map();
  const campaigns=[{id:2107,metaCampaignId:"10001",metaAccountId:190},{id:2108,metaCampaignId:"10002",metaAccountId:190},{id:2200,metaCampaignId:"20001",metaAccountId:191}];
  const history=Object.freeze({metrics:[{campaignId:2107,spend:"100",note:"Keep",completed:true}],coverage:[{campaignId:2107,date:"2026-11-14"}],budget:[{campaignId:2107,budget:"200"}],imports:[{shopeeAccountId:7}],snapshots:[{shopeeAccountId:7}],checkpoint:"2026-11-14"});
  const matches=(r,w={})=>Object.entries(w).every(([k,v])=>k==="OR"?v.some(part=>matches(r,part)):v&&typeof v==="object"&&!(v instanceof Date)?"in"in v?v.in.includes(r[k]):"not"in v?r[k]!==v.not:false:r[k]===v);
  db.shopeeAccount.findUnique=async({where})=>[7,8,9].includes(where.id)?{id:where.id,metaAccounts:structuredClone(wls.filter(w=>w.shopeeAccountId===where.id))}:null;
  db.$queryRaw=async(strings,...values)=>{
    const sql=strings.join("?");events.push({sql,values});
    if(sql.includes("FROM ShopeeAccount"))return [7,8,9].includes(values[0])?[{id:values[0]}]:[];
    if(sql.includes("FROM MetaAccount"))return structuredClone(wls.filter(w=>w.id===values[0]));
    throw new Error("Unexpected SQL");
  };
  db.metaAccount={updateMany:async({where,data})=>{const wl=wls.find(w=>matches(w,where));if(!wl)return{count:0};Object.assign(wl,data);return{count:1};}};
  db.campaign={findMany:async({where})=>structuredClone(campaigns.filter(c=>matches(c,where))),findFirst:async({where})=>campaigns.find(c=>c.metaCampaignId===where.metaCampaignId&&wls.find(w=>w.id===c.metaAccountId)?.shopeeAccountId===where.metaAccount.shopeeAccountId)??null};
  const snapshots=new Map();
  db.metaPrefilterRun={findFirst:async({where})=>[...snapshots.values()].find(r=>matches(r,where))??null};
  const snapshotRows=[];db.metaPrefilterRow={findMany:async({where})=>snapshotRows.filter(r=>r.metaAccountId===where.metaAccountId&&(!where.run||r.shopeeAccountId===where.run.shopeeAccountId))};
  db.campaignPostTypeOverride={
    findMany:async({where})=>structuredClone([...types.values()].filter(r=>matches(r,where))),
    createMany:async({data})=>{for(const row of data){const key=row.shopeeAccountId+":"+row.metaCampaignId;if(types.has(key))throw new Error("duplicate");types.set(key,structuredClone(row));}return{count:data.length};},
    upsert:async({create,update})=>{const key=create.shopeeAccountId+":"+create.metaCampaignId;types.set(key,{...(types.get(key)??create),...update});return types.get(key);},
    deleteMany:async({where})=>{let count=0;for(const[k,v]of types)if(matches(v,where)){types.delete(k);count++;}return{count};},
  };
  const transaction=db.$transaction;
  db.$transaction=(work,options)=>transaction(async tx=>{
    const before=structuredClone({wls,types:[...types]});
    try{return await work(tx);}catch(e){wls.splice(0,wls.length,...before.wls);types.clear();for(const[k,v]of before.types)types.set(k,v);throw e;}
  },options);
  const addType=(account,id,type)=>types.set(account+":"+id,{shopeeAccountId:account,metaCampaignId:id,manualType:type,createdAt:new Date("2026-11-01Z"),updatedAt:new Date("2026-11-02Z")});
  const move=(destination=8,source=7)=>loadTs("lib/shopee/wl-connection.ts").moveWlConnection(db,190,source,destination);
  return{...h,db,wls,campaigns,types,history,snapshots,snapshotRows,events,addType,move};
}

test("move keeps campaign/history identity and transfers only this WL's manual types atomically; repeat is a no-op",async()=>{
  const h=fixture();h.addType(7,"10001","VIDEO");h.addType(7,"20001","GAMBAR_PRODUK");
  const before=structuredClone({campaigns:h.campaigns,history:h.history});
  await h.move();assert.equal(h.wls[0].shopeeAccountId,8);assert.equal(h.types.has("7:10001"),false);assert.equal(h.types.get("8:10001").manualType,"VIDEO");assert(h.types.has("7:20001"));
  const after=structuredClone([...h.types]);await h.move();assert.deepEqual([...h.types],after);
  assert.deepEqual(h.campaigns,before.campaigns);assert.deepEqual(h.history,before.history);assert.equal(h.wls[1].shopeeAccountId,9);
  assert.deepEqual(h.events.slice(0,2).map(e=>e.values[0]),[7,8]);assert(h.events[0].sql.includes("FOR UPDATE"));
});

test("same target override deduplicates; conflicting value rolls back the entire move",async()=>{
  for(const type of ["VIDEO","GAMBAR_PRODUK"]){
    const h=fixture();h.addType(7,"10001","VIDEO");h.addType(8,"10001",type);const before=structuredClone([...h.types]);
    if(type==="VIDEO"){await h.move();assert.equal(h.types.size,1);assert.equal(h.wls[0].shopeeAccountId,8);}
    else{await assert.rejects(h.move(),/konflik.*10001/i);assert.equal(h.wls[0].shopeeAccountId,7);assert.deepEqual([...h.types],before);}
  }
});

test("terminal Sync and snapshots remain historical at origin and do not block a move",async()=>{
  const h=fixture();h.runs.set("old-sync",{id:"old-sync",shopeeAccountId:7,activeShopeeAccountId:null,status:"COMPLETE"});
  h.progress.set("old-progress",{id:"old-progress",runId:"old-sync",metaAccountId:190,status:"SUCCEEDED",phase:"DONE"});
  h.snapshots.set("old-snapshot",{id:"old-snapshot",shopeeAccountId:7,activeShopeeAccountId:null,status:"PARTIAL"});
  const before=structuredClone({runs:[...h.runs],progress:[...h.progress],snapshots:[...h.snapshots]});
  await h.move();assert.deepEqual({runs:[...h.runs],progress:[...h.progress],snapshots:[...h.snapshots]},before);
});

test("invalid destination or stale ownership cannot mutate data; disconnect and reconnect stay available",async()=>{
  const h=fixture();await assert.rejects(h.move(999));await assert.rejects(h.move(8,9));assert.equal(h.wls[0].shopeeAccountId,7);
  await h.move(null);assert.equal(h.wls[0].shopeeAccountId,null);await h.move(8,null);assert.equal(h.wls[0].shopeeAccountId,8);
});

test("active, paused and stale-active Sync/snapshot on either account reject before mutation",async()=>{
  for(const kind of ["sync","snapshot"])for(const account of [7,8])for(const status of ["RUNNING","PAUSED_RATE_LIMIT","FAILED"]){
    const h=fixture();(kind==="sync"?h.runs:h.snapshots).set("busy",{id:"busy",shopeeAccountId:account,activeShopeeAccountId:status==="FAILED"?account:null,status});
    await assert.rejects(h.move(),/Sync|snapshot/i);assert.equal(h.wls[0].shopeeAccountId,7);
  }
});

test("an import holding the existing account lock finishes before the move; a Sync started first blocks it",async()=>{
  const h=fixture();let release,entered;const held=new Promise(r=>{release=r;}),ready=new Promise(r=>{entered=r;});
  const {lockShopeeAccount}=loadTs("lib/shopee-import/persistence.ts");
  const importing=h.db.$transaction(async tx=>{await lockShopeeAccount(tx,7);entered();await held;assert.equal(h.wls[0].shopeeAccountId,7);});
  await ready;let moved=false;const moving=h.move().then(()=>{moved=true;});await Promise.resolve();assert.equal(moved,false);release();await importing;await moving;assert.equal(h.wls[0].shopeeAccountId,8);
  const sync=loadTs("lib/filter/meta-sync-state.ts");await sync.startOrResumeMetaSyncRun(h.db,8,"2026-11-15",new Date());
  await assert.rejects(h.move(7,8),/Sync/i);
});

test("move committed before Sync creation yields the new scoped WL set",async()=>{
  const h=fixture();await h.move();
  const sync=loadTs("lib/filter/meta-sync-state.ts");await sync.startOrResumeMetaSyncRun(h.db,7,"2026-11-15",new Date());await sync.startOrResumeMetaSyncRun(h.db,8,"2026-11-15",new Date());
  const run8=[...h.runs.values()].find(r=>r.shopeeAccountId===8);
  assert.deepEqual([...h.progress.values()].filter(p=>p.runId===run8.id).map(p=>p.metaAccountId),[190]);
  assert.equal([...h.progress.values()].filter(p=>p.runId!==run8.id).length,0);
});

test("failure after type writes rolls back both override transfer and WL ownership",async()=>{
  const h=fixture();h.addType(7,"10001","VIDEO");const before=structuredClone([...h.types]);
  h.db.metaAccount.updateMany=async()=>{throw new Error("save failed");};
  await assert.rejects(h.move(),/save failed/);assert.equal(h.wls[0].shopeeAccountId,7);assert.deepEqual([...h.types],before);
});

test("snapshot-only manual type follows its WL without moving snapshots or creating Campaign",async()=>{
  const h=fixture();h.snapshotRows.push({metaCampaignId:"30001",metaAccountId:190,shopeeAccountId:7},{metaCampaignId:"20001",metaAccountId:190,shopeeAccountId:7});
  h.addType(7,"30001","VIDEO");h.addType(7,"20001","GAMBAR_PRODUK");const rows=structuredClone(h.snapshotRows);
  await h.move();assert.equal(h.types.get("8:30001").manualType,"VIDEO");assert(h.types.has("7:20001"),"current permanent ownership overrides old snapshot evidence");
  assert.deepEqual(h.snapshotRows,rows);assert.equal(h.campaigns.length,3);
});

test("a second move retains snapshot-only manual types although original snapshots stay at the first account",async()=>{
  const h=fixture();h.snapshotRows.push({metaCampaignId:"30001",metaAccountId:190,shopeeAccountId:7});h.addType(7,"30001","VIDEO");
  await h.move();await h.move(9,8);
  assert.equal(h.types.get("9:30001")?.manualType,"VIDEO");assert.equal(h.types.has("8:30001"),false);
  assert.equal(h.snapshotRows[0].shopeeAccountId,7);assert.equal(h.wls[0].shopeeAccountId,9);
});

test("type edit and move share account lock; stale origin cannot recreate an override after transfer",async()=>{
  const h=fixture();h.addType(7,"10001","VIDEO");let release,entered;
  const held=new Promise(r=>{release=r;}),ready=new Promise(r=>{entered=r;});
  const find=h.db.campaign.findFirst;h.db.campaign.findFirst=async q=>{entered();await held;return find(q);};
  const {saveCampaignPostType}=loadTs("lib/campaign-post-type/repository.ts",{"@/lib/prisma":{prisma:h.db}});
  const edit=saveCampaignPostType({shopeeAccountId:7,metaCampaignId:"10001",manualType:"GAMBAR_PRODUK"});
  await ready;const moving=h.move();release();await edit;await moving;
  assert.equal(h.types.get("8:10001").manualType,"GAMBAR_PRODUK");
  await assert.rejects(saveCampaignPostType({shopeeAccountId:7,metaCampaignId:"10001",manualType:"VIDEO"}),/Campaign tidak ditemukan/);
  assert.equal(h.types.has("7:10001"),false);
});

test("snapshot start holding the account lock publishes active identity before a waiting move can proceed",async()=>{
  const h=fixture();let release,entered;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{entered=r;});
  const {lockShopeeAccounts}=loadTs("lib/shopee/account-lock.ts");
  const snapshot=h.db.$transaction(async tx=>{await lockShopeeAccounts(tx,[8]);entered();await gate;h.snapshots.set("run",{id:"run",shopeeAccountId:8,activeShopeeAccountId:8,status:"RUNNING"});});
  await ready;const moving=assert.rejects(h.move(),/snapshot/i);release();await snapshot;await moving;assert.equal(h.wls[0].shopeeAccountId,7);
});

test("existing action shows sanitized conflicts and revalidates both accounts only after success",async()=>{
  const h=fixture(),paths=[];h.addType(7,"10001","VIDEO");h.addType(8,"10001","GAMBAR_PRODUK");
  const {updateMetaAccountShopeeConnection}=loadTs("app/shopee/actions.ts",{"@/lib/prisma":{prisma:h.db},"@/lib/auth/session":{requireUser:async()=>({id:1})},"next/cache":{revalidatePath:path=>paths.push(path)},"next/navigation":{redirect:path=>{throw new Error("redirect:"+path);}}});
  const form=new FormData();form.set("metaAccountId","190");form.set("originalShopeeAccountId","7");form.set("shopeeAccountId","8");
  assert.match((await updateMetaAccountShopeeConnection(null,form)).message,/Konflik Jenis/);assert.deepEqual(paths,[]);
  h.types.delete("8:10001");await assert.rejects(updateMetaAccountShopeeConnection(null,form),/redirect:\/wl/);
  assert.equal(h.wls[0].shopeeAccountId,8);assert(paths.includes("/shopee/7"));assert(paths.includes("/shopee/8"));
});

test("WL form keeps destination/unconnected options, explains history and shows conflict without a new flow",()=>{
  for(const pending of [false,true]){
    const {ShopeeConnectionForm}=loadTs("components/wl/shopee-connection-form.tsx",{react:{...React,useActionState:()=>[{message:"Konflik Jenis"},()=>{},pending]},"@/app/shopee/actions":{},"next/link":{default:({children,...props})=>React.createElement("a",props,children)},"@/components/ui/button":{Button:({asChild,children,...props})=>asChild?children:React.createElement("button",props,children)}});
    const html=renderToStaticMarkup(React.createElement(ShopeeConnectionForm,{metaAccountId:190,metaAccountName:"WL",currentShopeeAccountId:7,shopeeAccounts:[{id:7,name:"Abdan",shopId:null},{id:8,name:"Abdan2",shopId:null}]}));
    assert.match(html,/Belum terhubung/);assert.match(html,/histori|Histori/);assert.match(html,/riwayat import dan snapshot lama tetap/);
    assert.match(html,/name="originalShopeeAccountId" value="7"/);
    if(pending)assert.match(html,/<select[^>]*disabled/);else assert.match(html,/role="alert"[^>]*>Konflik Jenis/);
  }
});
