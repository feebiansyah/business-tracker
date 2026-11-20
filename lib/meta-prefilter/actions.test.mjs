import assert from "node:assert/strict";
import test from "node:test";
import {loadTs} from "../filter/sync-baseline.test.mjs";

test("manual AWAL rejects at 18:00 WIB, including resume, without touching the stored COMPLETE snapshot",async()=>{
  for(const [time,allowed] of [["2026-11-20T10:59:00Z",true],["2026-11-20T11:00:00Z",false],["2026-11-20T15:30:00Z",false]]){
    let writes=0;
    const stored={runId:"complete-existing",status:"COMPLETE"};
    class Clock extends Date { constructor(...args){super(...(args.length?args:[time]));} static now(){return Date.parse(time);} }
    const api=loadTs("app/shopee/[id]/prefilter/actions.ts",{__date:Clock,"@/lib/meta-prefilter/post-type":{},"@/lib/meta-prefilter/notes":{},"@/lib/auth/session":{requireUser:async()=>({id:1})},"@/lib/meta-prefilter/service":{runPrefilterBatch:async()=>{writes++;return{progress:{status:"RUNNING"},shouldContinue:true};},readPrefilterData:async()=>stored}});
    for(const runId of [undefined,"manual-resume"]){
      const result=await api.snapshotPrefilterAction(7,"AWAL",runId);
      assert.equal(result.success,allowed,time);
      if(!allowed)assert.equal(result.message,"Snapshot Awal tidak dapat diperbarui setelah pukul 18.00 WIB.");
    }
    assert.equal(writes,allowed?2:0);
    assert.strictEqual((await api.readPrefilterAction(7)).data,stored);
    assert.equal((await api.snapshotPrefilterAction(7,"AKHIR")).success,true);
  }
});

test("both PraFilter actions authenticate read-only; execution identity and click timestamp are server-owned",async()=>{
  const auth=[],requests=[];
  const api=loadTs("app/shopee/[id]/prefilter/actions.ts",{"@/lib/meta-prefilter/post-type":{},"@/lib/meta-prefilter/notes":{},"@/lib/auth/session":{requireUser:async options=>{auth.push(options);return{id:1};}},"@/lib/meta-prefilter/service":{runPrefilterBatch:async input=>{requests.push(input);return{progress:{status:"RUNNING"},shouldContinue:true};},readPrefilterData:async id=>({account:{id}})}});
  const result=await api.snapshotPrefilterAction(7,"AWAL");assert.equal(result.success,true);
  await api.readPrefilterAction(7);assert.deepEqual(auth,[{readOnly:true},{readOnly:true}]);
  assert.equal(requests[0].slot,"AWAL");assert.equal(requests[0].shopeeAccountId,7);assert(requests[0].receivedAt instanceof Date);assert.match(requests[0].owner,/^[\w-]{36}$/);
});

test("manual AWAL rechecks server time after authentication crosses 18:00 WIB",async()=>{
  let now="2026-11-20T10:59:59Z",calls=0;
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return Date.parse(now);} }
  const api=loadTs("app/shopee/[id]/prefilter/actions.ts",{__date:Clock,"@/lib/meta-prefilter/post-type":{},"@/lib/meta-prefilter/notes":{},"@/lib/auth/session":{requireUser:async()=>{now="2026-11-20T11:00:00Z";}},"@/lib/meta-prefilter/service":{runPrefilterBatch:async()=>{calls++;}}});
  assert.equal((await api.snapshotPrefilterAction(7,"AWAL")).success,false);
  assert.equal(calls,0);
});
test("authentication failure cannot start a snapshot or read its data",async()=>{
  let calls=0;const api=loadTs("app/shopee/[id]/prefilter/actions.ts",{"@/lib/meta-prefilter/post-type":{},"@/lib/meta-prefilter/notes":{savePrefilterNote:async()=>{calls++;}},"@/lib/auth/session":{requireUser:async()=>{throw new Error("unauthorized");}},"@/lib/meta-prefilter/service":{runPrefilterBatch:async()=>{calls++;},readPrefilterData:async()=>{calls++;}}});
  await assert.rejects(api.snapshotPrefilterAction(7,"AWAL"));await assert.rejects(api.readPrefilterAction(7));assert.equal(calls,0);
  await assert.rejects(api.savePrefilterNoteAction({}));assert.equal(calls,0);
});

test("note save authenticates, delegates only the scoped note and sanitizes failure",async()=>{
  let calls=0;
  const api=loadTs("app/shopee/[id]/prefilter/actions.ts",{"@/lib/meta-prefilter/post-type":{},"@/lib/auth/session":{requireUser:async options=>{assert.equal(options.readOnly,true);}},"@/lib/meta-prefilter/service":{},"@/lib/meta-prefilter/notes":{savePrefilterNote:async input=>{calls++;if(input.note==="fail")throw new Error("secret");return{metaCampaignId:input.metaCampaignId,note:input.note,completed:false};}}});
  assert.equal((await api.savePrefilterNoteAction({metaCampaignId:"123",note:"OK"})).success,true);
  const failed=await api.savePrefilterNoteAction({note:"fail"});assert.equal(failed.success,false);assert.doesNotMatch(failed.message,/secret/);assert.equal(calls,2);
});

test("post type action authenticates before scoped save and never runs snapshot/Meta",async()=>{
  const events=[];let fail=false;
  const api=loadTs("app/shopee/[id]/prefilter/actions.ts",{"@/lib/meta-prefilter/post-type":{savePrefilterPostType:async input=>{events.push(input);if(fail)throw Error("private DB error");return{manualType:input.manualType};}},"@/lib/meta-prefilter/notes":{},"@/lib/meta-prefilter/service":{},"@/lib/auth/session":{requireUser:async()=>events.push("auth")},"next/cache":{revalidatePath:()=>{}}});
  const input={shopeeAccountId:7,businessDate:"2026-11-14",metaCampaignId:"123",manualType:"VIDEO"};
  assert.deepEqual(await api.savePrefilterPostTypeAction(input),{success:true,manualType:"VIDEO"});assert.deepEqual(events,["auth",input]);
  fail=true;const result=await api.savePrefilterPostTypeAction(input);assert.equal(result.success,false);assert.doesNotMatch(result.message,/private/);
});
