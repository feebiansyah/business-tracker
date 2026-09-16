import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deleteShopeeAccount,
  renameShopeeAccount,
  ShopeeAccountManagementError,
} from "./account-management.ts";

function renameDb(count = 1) {
  const calls = [];
  return {
    calls,
    shopeeAccount: {
      async updateMany(args) {
        calls.push(args);
        return { count };
      },
    },
  };
}

function deleteDb({ account = { id: 7, name: "Hillsant", _count: { commissionImports: 0, clickImports: 0 } } } = {}) {
  const calls = [];
  const tx = {
    shopeeAccount: {
      async findUnique(args) {
        calls.push(["findUnique", args]);
        return account;
      },
      async delete(args) {
        calls.push(["deleteShopee", args]);
        return { id: 7 };
      },
    },
    metaAccount: {
      async updateMany(args) {
        calls.push(["detachMetaAccounts", args]);
        return { count: 2 };
      },
    },
  };
  return {
    calls,
    async $transaction(work) {
      calls.push(["transactionStart"]);
      const result = await work(tx);
      calls.push(["transactionCommit"]);
      return result;
    },
  };
}

test("rename trims the name and updates only the name field", async () => {
  const db = renameDb();
  const result = await renameShopeeAccount(db, 7, "  Hillsant Baru  ");

  assert.deepEqual(db.calls, [{ where: { id: 7 }, data: { name: "Hillsant Baru" } }]);
  assert.deepEqual(result, { id: 7, name: "Hillsant Baru" });
});

test("rename rejects an empty name", async () => {
  await assert.rejects(
    renameShopeeAccount(renameDb(), 7, "   "),
    (error) => error instanceof ShopeeAccountManagementError && error.message === "Nama Shopee wajib diisi.",
  );
});

test("rename rejects an account that no longer exists", async () => {
  await assert.rejects(
    renameShopeeAccount(renameDb(0), 404, "Nama Baru"),
    (error) => error instanceof ShopeeAccountManagementError && error.message === "Akun Shopee tidak ditemukan.",
  );
});

test("delete detaches WL and deletes only the Shopee account in one transaction", async () => {
  const db = deleteDb();
  const result = await deleteShopeeAccount(db, 7, "Hillsant");

  assert.deepEqual(result, { id: 7, name: "Hillsant", detachedMetaAccountCount: 2 });
  assert.deepEqual(db.calls.map(([name]) => name), ["transactionStart", "findUnique", "detachMetaAccounts", "deleteShopee", "transactionCommit"]);
  assert.deepEqual(db.calls[2][1], { where: { shopeeAccountId: 7 }, data: { shopeeAccountId: null } });
  assert.deepEqual(db.calls[3][1], { where: { id: 7 } });
  assert.equal(db.calls.some(([name]) => /campaign|metric|spend/i.test(name)), false);
});

test("delete requires an exact account-name confirmation", async () => {
  const db = deleteDb();
  await assert.rejects(
    deleteShopeeAccount(db, 7, "hillsant"),
    (error) => error instanceof ShopeeAccountManagementError && error.message === "Nama konfirmasi tidak sesuai.",
  );
  assert.equal(db.calls.some(([name]) => name === "detachMetaAccounts" || name === "deleteShopee"), false);
});

test("delete blocks commission import history", async () => {
  const db = deleteDb({ account: { id: 7, name: "Hillsant", _count: { commissionImports: 1, clickImports: 0 } } });
  await assert.rejects(deleteShopeeAccount(db, 7, "Hillsant"), /riwayat import Komisi\/Klik/);
  assert.equal(db.calls.some(([name]) => name === "detachMetaAccounts" || name === "deleteShopee"), false);
});

test("delete blocks click import history", async () => {
  const db = deleteDb({ account: { id: 7, name: "Hillsant", _count: { commissionImports: 0, clickImports: 1 } } });
  await assert.rejects(deleteShopeeAccount(db, 7, "Hillsant"), /riwayat import Komisi\/Klik/);
  assert.equal(db.calls.some(([name]) => name === "detachMetaAccounts" || name === "deleteShopee"), false);
});

test("schema preserves Meta data and cascades only traffic credentials/configs", async () => {
  const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model MetaAccount \{[\s\S]*shopeeAccountId\s+Int\?/);
  assert.match(schema, /model TrafficCredential \{[\s\S]*shopeeAccount\s+ShopeeAccount\s+@relation\([^\n]*onDelete: Cascade\)/);
  assert.match(schema, /model ClickaduCampaignConfig \{[\s\S]*shopeeAccount\s+ShopeeAccount\s+@relation\([^\n]*onDelete: Cascade\)/);
  assert.match(schema, /model AdsterraCampaignConfig \{[\s\S]*shopeeAccount\s+ShopeeAccount\s+@relation\([^\n]*onDelete: Cascade\)/);
  assert.match(schema, /model ShopeeCommissionImport \{[\s\S]*shopeeAccount\s+ShopeeAccount\s+@relation\([^\n]*onDelete: Restrict\)/);
  assert.match(schema, /model ShopeeClickImport \{[\s\S]*shopeeAccount\s+ShopeeAccount\s+@relation\([^\n]*onDelete: Restrict\)/);
});

test("server actions require authentication and the UI has guarded destructive confirmation", async () => {
  const actions = await readFile(new URL("../../app/shopee/actions.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../../components/shopee/account-management.tsx", import.meta.url), "utf8");

  for (const action of ["renameShopeeAccountAction", "deleteShopeeAccountAction"]) {
    const body = actions.match(new RegExp(`export async function ${action}\\([\\s\\S]*?\\n}`))?.[0] ?? "";
    assert.match(body, /await requireUser\(\)/);
  }
  assert.match(ui, /confirmation !== accountName/);
  assert.match(ui, /deleteInFlightRef\.current/);
  assert.match(ui, /Credential dan config Clickadu\/Adsterra akan dihapus permanen/);
});
