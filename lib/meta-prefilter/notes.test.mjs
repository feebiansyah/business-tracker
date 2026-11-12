import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../filter/sync-baseline.test.mjs";

function fixture() {
  const notes = new Map(), calls = [];
  const rows = [{ runId: "awal", metaCampaignId: "123" }, { runId: "akhir", metaCampaignId: "456" }];
  const db = {
    shopeeAccount: { findUnique: async ({where}) => [7,8].includes(where.id) ? { id: where.id } : null },
    metaPrefilterRun: { findFirst: async ({where}) => { calls.push(where); return { id: (where.slot === "AWAL" ? "awal" : "akhir") + (where.shopeeAccountId === 7 ? "" : where.shopeeAccountId) }; } },
    metaPrefilterRow: { findFirst: async ({where}) => rows.find(r => where.runId.in.includes(r.runId) && r.metaCampaignId === where.metaCampaignId) ?? null },
    metaPrefilterNote: { upsert: async ({where, create, update}) => {
      const key = JSON.stringify(where.shopeeAccountId_businessDate_metaCampaignId);
      const result = { ...(notes.get(key) ?? create), ...update };
      notes.set(key, result); return {metaCampaignId:result.metaCampaignId,note:result.note,completed:result.completed};
    } },
    $transaction: fn => fn(db),
  };
  const api = loadTs("lib/meta-prefilter/notes.ts", { "@/lib/prisma": {prisma: db} });
  const save = (patch = {}) => api.savePrefilterNote({shopeeAccountId:7, businessDate:"2026-11-12", metaCampaignId:"123", note:"Periksa", completed:false, ...patch}, db, new Date("2026-11-12T03:00:00Z"));
  return {api, db, notes, rows, calls, save};
}

test("daily notes survive snapshot replacement, use logical scope, and never touch snapshot or Meta writes", async () => {
  const h = fixture();
  assert.deepEqual(await h.save(), {metaCampaignId:"123", note:"Periksa", completed:false});
  h.rows[0].runId = "akhir"; // Replacing a snapshot does not own/delete the note.
  await h.save({completed:true});
  assert.equal(h.notes.size,1); assert.equal([...h.notes.values()][0].completed,true);
  await h.save({note:"   ",completed:false});
  assert.equal([...h.notes.values()][0].note,"");
  await h.save({metaCampaignId:"456"}); assert.equal(h.notes.size,2);
  assert(h.calls.every(w => w.shopeeAccountId === 7 && w.status === "COMPLETE" && w.businessDate.toISOString() === "2026-11-12T00:00:00.000Z"));
});

test("note validation rejects stale dates, other accounts, unknown campaigns and invalid values before writing", async () => {
  const h = fixture();
  for (const patch of [{shopeeAccountId:8}, {businessDate:"2026-11-11"}, {metaCampaignId:"999"}, {metaCampaignId:"../123"}, {note:"a".repeat(2001)}, {completed:"false"}, {note:null}]) {
    await assert.rejects(h.save(patch));
  }
  assert.equal(h.notes.size,0);
});

test("separate WIB days preserve independent notes; failed persistence never claims success", async () => {
  const h = fixture(); await h.save();
  await h.api.savePrefilterNote({shopeeAccountId:7,businessDate:"2026-11-13",metaCampaignId:"123",note:"Besok",completed:false},h.db,new Date("2026-11-13T03:00:00Z"));
  assert.equal(h.notes.size,2);
  h.rows.push({runId:"awal8",metaCampaignId:"123"});
  await h.save({shopeeAccountId:8,note:"Akun lain"});
  assert.equal(h.notes.size,3);assert.equal([...h.notes.values()][0].note,"Periksa");
  h.db.metaPrefilterNote.upsert = async () => { throw new Error("DB unavailable"); };
  await assert.rejects(h.save({completed:true}));
  assert.equal([...h.notes.values()][0].completed,false);
});
