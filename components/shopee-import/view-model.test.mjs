import assert from "node:assert/strict";
import test from "node:test";
import { formatImportDateRange, formatImportRupiah, importReasonLabel, paginateUnmatched, reduceImportState } from "./view-model.ts";

test("formats whole Rupiah without changing the source decimal",()=>{const value="27419.70000";assert.equal(formatImportRupiah(value).replace(/\s/g," "),"Rp 27.420");assert.equal(value,"27419.70000")});
test("formats detected date ranges",()=>assert.equal(formatImportDateRange("2026-09-01","2026-09-03"),"1 Sep 2026 – 3 Sep 2026"));
test("maps unmatched reasons for users",()=>{assert.equal(importReasonLabel("CAMPAIGN_NOT_FOUND"),"Campaign tidak ditemukan");assert.equal(importReasonLabel("AMBIGUOUS_CAMPAIGN_NAME"),"Nama campaign ditemukan lebih dari satu")});
test("pagination clamps after unmatched data changes",()=>{const rows=Array.from({length:26},(_,id)=>({id}));assert.deepEqual(paginateUnmatched(rows,2,25),{rows:[{id:25}],page:2,pageCount:2});assert.equal(paginateUnmatched(rows.slice(0,2),2,25).page,1)});
test("changing file clears preview confirmation, receipt, and errors",()=>{const state={phase:"previewed",file:{name:"old.csv"},preview:{confirmation:{fileSha256:"a",matchDigest:"b"}},receipt:null,error:"old"};const next=reduceImportState(state,{type:"FILE_CHANGED",file:{name:"new.csv"}});assert.equal(next.phase,"idle");assert.equal(next.preview,null);assert.equal(next.receipt,null);assert.equal(next.error,null);assert.equal("rawCsv" in next,false)});
test("success and stale failures are explicit UI states",()=>{const importing={phase:"importing",file:{},preview:{},receipt:null,error:null};assert.equal(reduceImportState(importing,{type:"IMPORT_SUCCEEDED",receipt:{importId:1}}).phase,"success");const stale=reduceImportState(importing,{type:"FAILED",message:"Preview sudah tidak berlaku."});assert.equal(stale.phase,"error");assert.match(stale.error,/Preview ulang/i)});
