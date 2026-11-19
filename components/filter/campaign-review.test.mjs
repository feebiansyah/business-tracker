import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "../../lib/filter/sync-baseline.test.mjs";

test("review color needs server acknowledgement for this reviewer, campaign and WIB day", () => {
  const { isCampaignReviewedToday } = loadTs("lib/filter/campaign-review-state.ts");
  const today = new Date("2026-11-19T16:59:59.999Z");
  const state = { userId: 1, businessDate: "2026-11-19", campaignIds: [] };
  const mark = { userId: 1, campaignId: 41, businessDate: "2026-11-19" };
  assert.equal(isCampaignReviewedToday(state, [], 41, today), false);
  assert.equal(isCampaignReviewedToday(state, [mark], 41, today), true);
  assert.equal(isCampaignReviewedToday(null, [mark], 41, today), false);
  assert.equal(isCampaignReviewedToday(state, [{ ...mark, userId: 2 }], 41, today), false);
  assert.equal(isCampaignReviewedToday(state, [mark], 42, today), false);
  assert.equal(isCampaignReviewedToday(state, [mark], 41, new Date("2026-11-19T17:00:00Z")), false);
});

test("only reviewer rows and their frozen Campaign cell receive the soft review background", () => {
  const require = createRequire(import.meta.url), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const { FilterTable } = loadTs("components/filter/filter-table.tsx", {
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/components/filter/sortable-header": loadTs("components/filter/sortable-header.tsx"),
    "@/components/filter/table-pagination": loadTs("components/filter/table-pagination.tsx"),
    "@/components/filter/campaign-history-modal": { CampaignHistoryModal: () => null },
    "@/components/filter/post-type-select": { PostTypeSelect: () => null },
    "@/components/meta-campaign-controls/campaign-manager-modal": { CampaignManagerModal: () => null, createCampaignPreviewStore: () => new Map() },
  });
  const campaign = { id: 41, metaCampaignId: "meta-41", name: "Campaign", wlName: "WL", startTime: null, budget: 1, days: 1, totalSpend: 1, costWithFee: 1.05, totalCommission: null, profit: null, profitPercent: null, hasPendingNote: false };
  for (const [reviewState, expected] of [
    [null, false],
    [{ userId: 1, businessDate: "2026-11-06", campaignIds: [] }, false],
    [{ userId: 1, businessDate: "2026-11-06", campaignIds: [41] }, true],
    [{ userId: 1, businessDate: "2026-11-05", campaignIds: [41] }, false],
  ]) {
    const html = renderToStaticMarkup(React.createElement(FilterTable, { mode: "filter", shopeeAccountId: 7, campaigns: [campaign], reviewState,
      pagination: { page: 1, pageCount: 1, total: 1, pageSize: 25 }, state: { q: "", wl: null, from: "", sort: "name", dir: "asc", page: 1, pageSize: 25 } }));
    const body = html.split("<tbody")[1];
    assert.equal((body.match(/bg-blue-50/g) || []).length, expected ? 2 : 0);
  }
});
