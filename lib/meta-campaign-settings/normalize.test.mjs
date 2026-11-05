import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMetaCampaignSettings } from "./normalize.ts";

const baseTargeting = {
  age_min: 20,
  age_max: 50,
  genders: [2],
  geo_locations: { countries: ["ID"], regions: [{ key: "3886", name: "Jawa Barat" }] },
  excluded_geo_locations: { cities: [{ key: "1", name: "Jakarta" }] },
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["feed", "facebook_reels"],
  instagram_positions: ["stream", "reels"],
};

test("uses oldest ad set then id as the presentation reference", () => {
  const result = normalizeMetaCampaignSettings({
    adSets: [
      { id: "20", name: "Baru", created_time: "2026-01-02T00:00:00Z", targeting: baseTargeting },
      { id: "11", name: "Tua B", created_time: "2026-01-01T00:00:00Z", targeting: baseTargeting },
      { id: "10", name: "Tua A", created_time: "2026-01-01T00:00:00Z", targeting: baseTargeting },
    ],
    ads: [], complete: true,
  });
  assert.equal(result.reference?.id, "10");
  assert.equal(result.sameAcrossAll, true);
  assert.equal(result.matchingAdSetCount, 3);
});

test("formats targeting and exclusions without extra lookup", () => {
  const result = normalizeMetaCampaignSettings({ adSets: [{ id: "1", name: "Utama", created_time: "2026-01-01", targeting: baseTargeting }], ads: [], complete: true });
  assert.equal(result.reference?.age, "20–50 tahun");
  assert.equal(result.reference?.gender, "Wanita");
  assert.match(result.reference?.locations ?? "", /Indonesia/);
  assert.match(result.reference?.locations ?? "", /Jawa Barat/);
  assert.match(result.reference?.locations ?? "", /Kecuali: Jakarta/);
  assert.match(result.reference?.placements ?? "", /Facebook Beranda/);
  assert.match(result.reference?.placements ?? "", /Instagram Reels/);
});

test("automatic placements and absent targeting remain honest", () => {
  const automatic = normalizeMetaCampaignSettings({ adSets: [{ id: "1", targeting: { age_min: 18, age_max: 65 } }], ads: [], complete: true });
  assert.equal(automatic.reference?.placements, "Otomatis/Advantage+");
  assert.equal(automatic.reference?.gender, "Tidak tersedia");
  const missing = normalizeMetaCampaignSettings({ adSets: [{ id: "2" }], ads: [], complete: true });
  assert.equal(missing.reference?.age, "Tidak tersedia");
  assert.equal(missing.reference?.gender, "Tidak tersedia");
  assert.equal(missing.reference?.locations, "Tidak tersedia");
});

test("classifies creative types per ad set and detects targeting differences", () => {
  const result = normalizeMetaCampaignSettings({
    adSets: [
      { id: "1", name: "A", created_time: "2026-01-01", targeting: baseTargeting },
      { id: "2", name: "B", created_time: "2026-01-02", targeting: { ...baseTargeting, age_max: 45 } },
    ],
    ads: [
      { id: "a", adset_id: "1", creative: { object_type: "VIDEO" } },
      { id: "b", adset_id: "1", creative: { object_type: "PHOTO" } },
      { id: "c", adset_id: "2", creative: { asset_feed_spec: { videos: [{ video_id: "9" }] } } },
    ], complete: true,
  });
  assert.equal(result.reference?.contentType, "Campuran (Video, Gambar)");
  assert.equal(result.differences.length, 1);
  assert.equal(result.differences[0].id, "2");
  assert.equal(result.differences[0].contentType, "Video");
  assert.equal(result.sameAcrossAll, false);
});

test("carousel and existing-post unknown are classified safely", () => {
  const carousel = normalizeMetaCampaignSettings({ adSets: [{ id: "1", targeting: baseTargeting }], ads: [{ id: "a", adset_id: "1", creative: { object_story_spec: { link_data: { child_attachments: [{}, {}] } } } }], complete: true });
  assert.equal(carousel.reference?.contentType, "Carousel");
  const unknown = normalizeMetaCampaignSettings({ adSets: [{ id: "1", targeting: baseTargeting }], ads: [{ id: "a", adset_id: "1", creative: { effective_object_story_id: "1_2" } }], complete: true });
  assert.equal(unknown.reference?.contentType, "Tidak tersedia");
  const dynamic = normalizeMetaCampaignSettings({ adSets: [{ id: "1", targeting: baseTargeting }], ads: [{ id: "a", adset_id: "1", creative: { asset_feed_spec: { videos: [{}], images: [{}] } } }], complete: true });
  assert.equal(dynamic.reference?.contentType, "Campuran (Video, Gambar)");
});

test("partial reads never claim every ad set is equal", () => {
  const result = normalizeMetaCampaignSettings({ adSets: [{ id: "1", targeting: baseTargeting }], ads: [], complete: false, warnings: ["Data iklan belum lengkap."] });
  assert.equal(result.partial, true);
  assert.equal(result.sameAcrossAll, false);
  assert.deepEqual(result.warnings, ["Data iklan belum lengkap."]);
});
