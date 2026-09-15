import assert from "node:assert/strict";
import test from "node:test";
import { parseAdsterraConfigInput } from "./config-input.ts";

test("Adsterra config trims campaign and normalizes source tag", () => {
  assert.deepEqual(parseAdsterraConfigInput({ campaignId: " 77 ", label: " Terra ", sourceTag: " terra " }), { campaignId: "77", label: "Terra", sourceTag: "TERRA" });
});

test("Adsterra config rejects empty campaign and source", () => {
  assert.throws(() => parseAdsterraConfigInput({ campaignId: "", label: "", sourceTag: "TERRA" }), /Campaign ID wajib/);
  assert.throws(() => parseAdsterraConfigInput({ campaignId: "77", label: "", sourceTag: " " }), /Tag Link 1 wajib/);
});
