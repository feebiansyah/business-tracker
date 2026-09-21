import assert from "node:assert/strict";
import Decimal from "decimal.js";
import test from "node:test";
import { buildAdsterraCommissionUpsertQuery } from "./adsterra-persistence.ts";
test("TERRA commission upsert replaces commission only and preserves spend", () => { const query = buildAdsterraCommissionUpsertQuery([{ adsterraCampaignConfigId: 2, date: "2026-09-21", commission: new Decimal("100.125"), rowCount: 1 }]); const sql = String(query.sql).replace(/\s+/g, " "); assert.match(sql, /AdsterraCampaignDailyMetric/); assert.match(sql, /commissionIdr.*VALUES\(`commissionIdr`\)/); assert.doesNotMatch(sql, /spendUsd\s*=/); });
