import assert from "node:assert/strict";
import test from "node:test";
import { buildShopeeCommissionPreview } from "./preview.ts";
import { importShopeeCommissions, isTransientImportError } from "./importer.ts";

const bytes=new TextEncoder().encode(`Waktu Pemesanan,Tag_link2,Komisi Bersih Affiliate (Rp)\n2026-09-01 10:00:00,TAG-A,22985.94997\n2026-09-01 11:00:00,,5`);
const campaigns=[{id:10,name:"TAG-A"}];

async function confirmation(accountId=2){return (await buildShopeeCommissionPreview({shopeeAccountId:accountId,originalFilename:"x.csv",bytes},{accountExists:async()=>true,loadCampaigns:async()=>campaigns})).confirmation;}

function deps(overrides={}){const events=[];let transactions=0;return {events,get transactions(){return transactions},withTransaction:async work=>{transactions++;events.push("tx");return work({})},lockAccount:async()=>events.push("lock"),loadCampaigns:async()=>{events.push("load");return campaigns},persist:async(_tx,input)=>{events.push("persist");return {importId:1,matchedCount:input.matched.length,unmatchedCount:input.unmatched.length,matchedCommission:"22985.94997",unmatchedCommission:"0.00000",createdAt:"2026-09-01T00:00:00.000Z"}},...overrides};}

test("rejects changed file before transaction",async()=>{const d=deps();const c=await confirmation();await assert.rejects(importShopeeCommissions({shopeeAccountId:2,originalFilename:"x.csv",bytes:new TextEncoder().encode("changed"),confirmation:c},d),e=>e.code==="FILE_CHANGED");assert.equal(d.transactions,0)});
test("locks before one campaign load and persistence",async()=>{const d=deps();await importShopeeCommissions({shopeeAccountId:2,originalFilename:"x.csv",bytes,confirmation:await confirmation()},d);assert.deepEqual(d.events,["tx","lock","load","persist"])});
test("rejects stale matching without persistence",async()=>{const d=deps({loadCampaigns:async()=>[]});await assert.rejects(importShopeeCommissions({shopeeAccountId:2,originalFilename:"x.csv",bytes,confirmation:await confirmation()},d),e=>e.code==="PREVIEW_STALE");assert.equal(d.events.includes("persist"),false)});
test("retries only transient failures for three total attempts",async()=>{let n=0;const d=deps({withTransaction:async work=>{n++;if(n<3)throw Object.assign(new Error("deadlock"),{code:"P2034"});return work({})}});await importShopeeCommissions({shopeeAccountId:2,originalFilename:"x.csv",bytes,confirmation:await confirmation()},d);assert.equal(n,3);assert.equal(isTransientImportError({code:"P2034"}),true);assert.equal(isTransientImportError({code:1213}),true);assert.equal(isTransientImportError(new Error("ECONNRESET")),true);assert.equal(isTransientImportError(new Error("bad csv")),false)});
test("does not retry non-transient errors",async()=>{let n=0;const d=deps({withTransaction:async()=>{n++;throw new Error("programmer error")}});await assert.rejects(importShopeeCommissions({shopeeAccountId:2,originalFilename:"x.csv",bytes,confirmation:await confirmation()},d));assert.equal(n,1)});
test("account context prevents cross-Shopee confirmation reuse",async()=>{const d=deps();await assert.rejects(importShopeeCommissions({shopeeAccountId:3,originalFilename:"x.csv",bytes,confirmation:await confirmation(2)},d),e=>e.code==="PREVIEW_STALE");assert.equal(d.events.includes("persist"),false)});
