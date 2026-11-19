import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {loadTs,root} from "../filter/sync-baseline.test.mjs";

test("group route keeps the branch's individual Traffic surface and reads member scope once for either role",async()=>{
  const trafficExpected=readFileSync(root+"app/shopee/[id]/page.tsx","utf8").includes("getShopeeClickaduOverview");
  for(const role of ["OPERATOR","REVIEWER"]){
    const calls=[];
    const group={id:7,name:"G",members:[1,2].map(id=>({shopeeAccountId:id,shopeeAccount:{id,name:"A"+id,metaAccounts:[]}}))};
    const {default:page}=loadTs("app/overview-gabungan/[id]/page.tsx",{
      "next/navigation":{notFound:()=>{throw Error("404");}},
      "@/lib/auth/session":{requireUser:async()=>{calls.push("auth");return{id:1,role};}},
      "@/lib/prisma":{prisma:{}},
      "@/lib/overview-groups/report":{
        loadOverviewGroup:async(_,id)=>{assert.equal(calls[0],"auth");assert.equal(id,7);return group;},
        getGroupPerformance:async(_,g)=>{assert.deepEqual(g.members.map(m=>m.shopeeAccountId),[1,2]);calls.push("performance");return{};},
        getGroupReminders:async(_,ids)=>{assert.deepEqual(ids,[1,2]);calls.push("reminders");return{};},
      },
      "@/components/overview-groups/group-report":{OverviewGroupReport:()=>null},
      "@/lib/overview-groups/traffic":{getGroupTrafficReport:async(_,ids)=>{assert.deepEqual(ids,[1,2]);calls.push("traffic");return[];}},
      "@/components/overview-groups/traffic-report":{GroupTrafficReport:()=>null},
    });
    await page({params:Promise.resolve({id:"7"}),searchParams:Promise.resolve({})});
    assert.equal(calls.filter(c=>c==="performance").length,1);
    assert.equal(calls.filter(c=>c==="reminders").length,1);
    assert.equal(calls.filter(c=>c==="traffic").length,trafficExpected?1:0);
    await assert.rejects(page({params:Promise.resolve({id:"bad"}),searchParams:Promise.resolve({})}),/404/);
  }
});
