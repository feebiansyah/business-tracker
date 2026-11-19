import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTs,root } from "../filter/sync-baseline.test.mjs";

test("Settings actions authenticate before writing, use validated transactions and refresh shared navigation",async()=>{
  let allowed=false,writes=0,paths=[];
  const actions=loadTs("app/settings/overview-group-actions.ts",{
    "@/lib/auth/session":{requireUser:async()=>{if(!allowed)throw Error("login");return{id:1,role:"OPERATOR"};}},
    "@/lib/prisma":{prisma:{}},
    "@/lib/overview-groups/repository":{saveOverviewGroup:async(_,input)=>{writes++;assert.deepEqual(input,{id:undefined,name:"Abdan",memberIds:[1,2]});return 9;},deleteOverviewGroup:async()=>{writes++;}},
    "next/cache":{revalidatePath:(p,type)=>paths.push([p,type])},
  });
  const f=new FormData();f.set("name","Abdan");f.append("memberIds","1");f.append("memberIds","2");
  await assert.rejects(actions.saveOverviewGroupAction(f),/login/);assert.equal(writes,0);
  allowed=true;assert.equal((await actions.saveOverviewGroupAction(f)).success,true);assert.equal(writes,1);
  assert.ok(paths.some(([p,t])=>p==="/"&&t==="layout"));
});

test("combined route authenticates before any report read",async()=>{
  let reads=0;
  const {default:page}=loadTs("app/overview-gabungan/[id]/page.tsx",{
    "next/navigation":{notFound:()=>{throw Error("404");}},
    "@/lib/auth/session":{requireUser:async()=>{throw Error("login");}},
    "@/lib/prisma":{prisma:{}},
    "@/lib/overview-groups/report":{loadOverviewGroup:()=>{reads++;}},
    "@/components/overview-groups/group-report":{OverviewGroupReport:()=>null},
    "@/lib/overview-groups/traffic":{},
    "@/components/overview-groups/traffic-report":{GroupTrafficReport:()=>null},
  });
  await assert.rejects(page({params:Promise.resolve({id:"1"}),searchParams:Promise.resolve({})}),/login/);
  assert.equal(reads,0);
});

test("schema adds only disjoint group membership and safe foreign keys without creating groups",()=>{
  const s=readFileSync(root+"prisma/migrations/20261119100000_shopee_overview_groups/migration.sql","utf8");
  assert.match(s,/PRIMARY KEY \(`groupId`, `shopeeAccountId`\)/);
  assert.match(s,/UNIQUE INDEX .*\(`shopeeAccountId`\)/);
  assert.match(s,/REFERENCES `ShopeeAccount`\(`id`\) ON DELETE RESTRICT/);
  assert.match(s,/REFERENCES `ShopeeOverviewGroup`\(`id`\) ON DELETE CASCADE/);
  assert.doesNotMatch(s,/\b(INSERT|UPDATE|DELETE|DROP)\s+(INTO|FROM|TABLE)\b/i);
});
