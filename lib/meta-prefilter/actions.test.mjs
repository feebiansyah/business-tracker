import assert from "node:assert/strict";
import test from "node:test";
import {loadTs} from "../filter/sync-baseline.test.mjs";

test("both PraFilter actions authenticate read-only; execution identity and click timestamp are server-owned",async()=>{
  const auth=[],requests=[];
  const api=loadTs("app/shopee/[id]/prefilter/actions.ts",{"@/lib/auth/session":{requireUser:async options=>{auth.push(options);return{id:1};}},"@/lib/meta-prefilter/service":{runPrefilterBatch:async input=>{requests.push(input);return{progress:{status:"RUNNING"},shouldContinue:true};},readPrefilterData:async id=>({account:{id}})}});
  const result=await api.snapshotPrefilterAction(7,"AWAL");assert.equal(result.success,true);
  await api.readPrefilterAction(7);assert.deepEqual(auth,[{readOnly:true},{readOnly:true}]);
  assert.equal(requests[0].slot,"AWAL");assert.equal(requests[0].shopeeAccountId,7);assert(requests[0].receivedAt instanceof Date);assert.match(requests[0].owner,/^[\w-]{36}$/);
});
test("authentication failure cannot start a snapshot or read its data",async()=>{
  let calls=0;const api=loadTs("app/shopee/[id]/prefilter/actions.ts",{"@/lib/auth/session":{requireUser:async()=>{throw new Error("unauthorized");}},"@/lib/meta-prefilter/service":{runPrefilterBatch:async()=>{calls++;},readPrefilterData:async()=>{calls++;}}});
  await assert.rejects(api.snapshotPrefilterAction(7,"AWAL"));await assert.rejects(api.readPrefilterAction(7));assert.equal(calls,0);
});
