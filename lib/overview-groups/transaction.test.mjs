import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {loadTs} from "../filter/sync-baseline.test.mjs";

test("real fixture constraints serialize competing memberships, roll back failed edits and preserve account data on delete",async()=>{
  const {saveOverviewGroup,deleteOverviewGroup}=loadTs("lib/overview-groups/repository.ts");
  const sql=new DatabaseSync(":memory:");sql.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE ShopeeAccount(id INTEGER PRIMARY KEY);
    CREATE TABLE Campaign(id INTEGER PRIMARY KEY,shopeeAccountId INTEGER REFERENCES ShopeeAccount(id));
    CREATE TABLE ShopeeOverviewGroup(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT);
    CREATE TABLE ShopeeOverviewGroupMember(groupId INTEGER REFERENCES ShopeeOverviewGroup(id) ON DELETE CASCADE,
      shopeeAccountId INTEGER UNIQUE REFERENCES ShopeeAccount(id) ON DELETE RESTRICT,PRIMARY KEY(groupId,shopeeAccountId));
    INSERT INTO ShopeeAccount VALUES(1),(2),(3),(4);
    INSERT INTO Campaign VALUES(99,1);
  `);
  let tail=Promise.resolve(),fail=false;
  const tx={
    $queryRaw:async(q,...args)=>{const text=Array.isArray(q)?q.join("?"):q.sql,values=Array.isArray(q)?args:q.values;return sql.prepare(text.replace(" FOR UPDATE","")).all(...values);},
    shopeeOverviewGroup:{
      create:async({data})=>{const r=sql.prepare("INSERT INTO ShopeeOverviewGroup(name) VALUES(?)").run(data.name);return{id:Number(r.lastInsertRowid)};},
      update:async({where,data})=>{sql.prepare("UPDATE ShopeeOverviewGroup SET name=? WHERE id=?").run(data.name,where.id);return{id:where.id};},
      delete:async({where})=>sql.prepare("DELETE FROM ShopeeOverviewGroup WHERE id=?").run(where.id),
    },
    shopeeOverviewGroupMember:{
      findMany:async({where})=>sql.prepare(`SELECT * FROM ShopeeOverviewGroupMember WHERE shopeeAccountId IN (${where.shopeeAccountId.in.map(()=>"?")})`).all(...where.shopeeAccountId.in),
      deleteMany:async({where})=>sql.prepare("DELETE FROM ShopeeOverviewGroupMember WHERE groupId=?").run(where.groupId),
      createMany:async({data})=>{if(fail)throw Error("persist failed");for(const d of data)sql.prepare("INSERT INTO ShopeeOverviewGroupMember VALUES(?,?)").run(d.groupId,d.shopeeAccountId);},
    },
  };
  const db={$transaction:fn=>{
    const run=tail.then(async()=>{sql.exec("BEGIN IMMEDIATE");try{const r=await fn(tx);sql.exec("COMMIT");return r;}catch(e){sql.exec("ROLLBACK");throw e;}});
    tail=run.catch(()=>{});return run;
  }};
  const results=await Promise.allSettled([saveOverviewGroup(db,{name:"A",memberIds:[2,1]}),saveOverviewGroup(db,{name:"B",memberIds:[2,3]})]);
  assert.deepEqual(results.map(r=>r.status),["fulfilled","rejected"]);
  const id=results[0].value;
  fail=true;await assert.rejects(saveOverviewGroup(db,{id,name:"Changed",memberIds:[1,4]}),/belum dapat disimpan/);
  assert.equal(sql.prepare("SELECT name FROM ShopeeOverviewGroup").get().name,"A");
  assert.deepEqual(sql.prepare("SELECT shopeeAccountId FROM ShopeeOverviewGroupMember ORDER BY shopeeAccountId").all().map(m=>m.shopeeAccountId),[1,2]);
  fail=false;await deleteOverviewGroup(db,id);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM ShopeeOverviewGroupMember").get().n,0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM ShopeeAccount").get().n,4);
  assert.equal(sql.prepare("SELECT id FROM Campaign").get().id,99);
  sql.close();
});
