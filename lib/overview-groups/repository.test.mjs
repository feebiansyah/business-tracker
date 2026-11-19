import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../filter/sync-baseline.test.mjs";

test("group repository validates membership, rolls back conflicts, updates atomically and deletes only group", async () => {
  const { saveOverviewGroup, deleteOverviewGroup } = loadTs("lib/overview-groups/repository.ts");
  let groups = [{ id: 7, name: "Before", members: [1, 2] }], next = 8, locks = [];
  const db = { $transaction: async (fn) => {
    const snapshot = structuredClone(groups);
    const tx = {
      $queryRaw: async (q,...args) => { const values=Array.isArray(q)?args:q.values,sql=Array.isArray(q)?q.join("?"):q.sql; locks.push(values); return sql.includes("ShopeeAccount") ? [1,2,3].filter(id=>values.includes(id)).map(id=>({id})) : groups.filter(g=>values.includes(g.id)).map(g=>({id:g.id})); },
      shopeeAccount: { count: async ({where}) => where.id.in.filter(id=>[1,2,3].includes(id)).length },
      shopeeOverviewGroup: {
        findUnique: async ({where}) => groups.find(g=>g.id===where.id) ?? null,
        create: async ({data}) => { const g={id:next++,name:data.name,members:[]};groups.push(g);return g; },
        update: async ({where,data}) => Object.assign(groups.find(g=>g.id===where.id),data),
        delete: async ({where}) => {groups=groups.filter(g=>g.id!==where.id);},
      },
      shopeeOverviewGroupMember: {
        findMany: async ({where}) => groups.flatMap(g=>g.members.map(shopeeAccountId=>({groupId:g.id,shopeeAccountId}))).filter(m=>where.shopeeAccountId.in.includes(m.shopeeAccountId)),
        deleteMany: async ({where}) => {groups.find(g=>g.id===where.groupId).members=[];},
        createMany: async ({data}) => {for(const m of data) groups.find(g=>g.id===m.groupId).members.push(m.shopeeAccountId);},
      },
    };
    try{return await fn(tx);}catch(e){groups=snapshot;throw e;}
  }};
  await assert.rejects(saveOverviewGroup(db,{name:"",memberIds:[1,2]}),/nama/i);
  await assert.rejects(saveOverviewGroup(db,{name:"X",memberIds:[1,1]}),/dua/i);
  await assert.rejects(saveOverviewGroup(db,{name:"X",memberIds:[2,3]}),/grup lain/i);
  assert.deepEqual(groups,[{id:7,name:"Before",members:[1,2]}]);
  await assert.rejects(saveOverviewGroup(db,{name:"X",memberIds:[3,999]}),/akun/i);
  await saveOverviewGroup(db,{id:7,name:"Abdan",memberIds:[3,1,1]});
  assert.deepEqual(groups,[{id:7,name:"Abdan",members:[1,3]}]);
  assert.ok(locks.length);
  await deleteOverviewGroup(db,7);
  assert.deepEqual(groups,[]);
});
