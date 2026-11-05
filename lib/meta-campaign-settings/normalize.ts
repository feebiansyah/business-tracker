import type { MetaAdSetSettings, MetaCampaignSettingsView } from "./types";

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const id = (value: unknown) => { const parsed = text(value); return parsed && /^[0-9]{1,100}$/.test(parsed) ? parsed : null; };
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const strings = (value: unknown) => Array.isArray(value) ? value.map(text).filter((item): item is string => item !== null) : [];

const LABELS: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network",
  feed: "Beranda", stream: "Beranda", facebook_reels: "Reels", reels: "Reels", story: "Story", stories: "Story",
  marketplace: "Marketplace", video_feeds: "Video Feed", search: "Pencarian", right_hand_column: "Kolom Kanan",
};
const COUNTRIES: Record<string, string> = { ID: "Indonesia" };

function gender(targeting: UnknownRecord | null) {
  if (!targeting) return "Tidak tersedia";
  if (targeting.genders === undefined) return "Tidak tersedia";
  const values = Array.isArray(targeting.genders) ? targeting.genders.filter((value): value is number => value === 1 || value === 2) : [];
  if (values.length === 2) return "Semua gender";
  if (values[0] === 1) return "Pria";
  if (values[0] === 2) return "Wanita";
  return "Tidak tersedia";
}

function age(targeting: UnknownRecord | null) {
  if (!targeting) return "Tidak tersedia";
  const min = number(targeting.age_min);
  const max = number(targeting.age_max);
  if (min === null && max === null) return "Tidak tersedia";
  if (min !== null && max !== null) return `${min}–${max} tahun`;
  return min !== null ? `${min}+ tahun` : `Maksimal ${max} tahun`;
}

function locationItems(value: unknown) {
  const source = record(value);
  if (!source) return [];
  const result = strings(source.countries).map((country) => COUNTRIES[country] ?? country);
  for (const key of ["country_groups", "regions", "cities", "zips", "geo_markets", "electoral_districts", "custom_locations"]) {
    const list = source[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const entry = record(item);
      const label = entry && (text(entry.name) ?? text(entry.key));
      if (label) result.push(label);
    }
  }
  return [...new Set(result)];
}

function locations(targeting: UnknownRecord | null) {
  if (!targeting) return "Tidak tersedia";
  const included = locationItems(targeting.geo_locations);
  const excluded = locationItems(targeting.excluded_geo_locations);
  if (!included.length && !excluded.length) return "Tidak tersedia";
  return [included.length ? included.join(", ") : "Tidak tersedia", excluded.length ? `Kecuali: ${excluded.join(", ")}` : ""].filter(Boolean).join(" · ");
}

function placements(targeting: UnknownRecord | null) {
  if (!targeting) return "Tidak tersedia";
  const platforms = strings(targeting.publisher_platforms);
  const positionKeys: Array<[string, string]> = [
    ["facebook_positions", "Facebook"], ["instagram_positions", "Instagram"], ["messenger_positions", "Messenger"], ["audience_network_positions", "Audience Network"],
    ["effective_facebook_positions", "Facebook"], ["effective_instagram_positions", "Instagram"], ["effective_messenger_positions", "Messenger"], ["effective_audience_network_positions", "Audience Network"],
  ];
  const result: string[] = [];
  for (const [key, platform] of positionKeys) for (const position of strings(targeting[key])) result.push(`${platform} ${LABELS[position] ?? position}`);
  if (result.length) return [...new Set(result)].join(", ");
  if (platforms.length) return `${platforms.map((platform) => LABELS[platform] ?? platform).join(", ")} · Posisi otomatis/Advantage+`;
  return "Otomatis/Advantage+";
}

function creativeKinds(value: unknown): Array<"Video" | "Gambar" | "Carousel"> {
  const creative = record(value);
  if (!creative) return [];
  const result: Array<"Video" | "Gambar" | "Carousel"> = [];
  const type = text(creative.object_type)?.toUpperCase();
  if (type === "VIDEO" || creative.video_id !== undefined) result.push("Video");
  if (["PHOTO", "IMAGE"].includes(type ?? "")) result.push("Gambar");
  if (type === "CAROUSEL") result.push("Carousel");
  const feed = record(creative.asset_feed_spec);
  if (feed && Array.isArray(feed.videos) && feed.videos.length) result.push("Video");
  if (feed && Array.isArray(feed.images) && feed.images.length) result.push("Gambar");
  const story = record(creative.object_story_spec);
  const linkData = story && record(story.link_data);
  if (linkData && Array.isArray(linkData.child_attachments) && linkData.child_attachments.length > 1) result.push("Carousel");
  if (story && record(story.video_data)) result.push("Video");
  if (story && record(story.photo_data)) result.push("Gambar");
  return [...new Set(result)];
}

function contentType(ads: UnknownRecord[]) {
  const kinds = [...new Set(ads.flatMap((ad) => creativeKinds(ad.creative)))];
  if (!kinds.length) return "Tidak tersedia";
  return kinds.length === 1 ? kinds[0] : `Campuran (${kinds.join(", ")})`;
}

function comparable(value: MetaAdSetSettings) {
  return JSON.stringify([value.contentType, value.placements, value.age, value.locations, value.gender]);
}

export function normalizeMetaCampaignSettings(input: { adSets: unknown[]; ads: unknown[]; complete: boolean; warnings?: string[] }): MetaCampaignSettingsView {
  const ads = input.ads.map(record).filter((value): value is UnknownRecord => value !== null);
  const adsByAdSet = new Map<string, UnknownRecord[]>();
  for (const ad of ads) {
    const adSetId = id(ad.adset_id);
    if (!adSetId) continue;
    const group = adsByAdSet.get(adSetId) ?? [];
    group.push(ad);
    adsByAdSet.set(adSetId, group);
  }
  const summaries = input.adSets.map(record).filter((value): value is UnknownRecord => value !== null).map((source): MetaAdSetSettings | null => {
    const adSetId = id(source.id);
    if (!adSetId) return null;
    const targeting = record(source.targeting);
    return {
      id: adSetId,
      name: text(source.name) ?? `Set Iklan ${adSetId}`,
      createdAt: text(source.created_time),
      configuredStatus: text(source.configured_status),
      effectiveStatus: text(source.effective_status),
      contentType: contentType(adsByAdSet.get(adSetId) ?? []),
      placements: placements(targeting), age: age(targeting), locations: locations(targeting), gender: gender(targeting),
    };
  }).filter((value): value is MetaAdSetSettings => value !== null).sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.POSITIVE_INFINITY;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.POSITIVE_INFINITY;
    return (Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime) - (Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime) || a.id.localeCompare(b.id, "en", { numeric: true });
  });
  const reference = summaries[0] ?? null;
  const differences = reference ? summaries.slice(1).filter((summary) => comparable(summary) !== comparable(reference)) : [];
  const complete = input.complete;
  return {
    reference,
    adSetCount: summaries.length,
    matchingAdSetCount: complete && reference ? summaries.length - differences.length : 0,
    differences,
    sameAcrossAll: complete && reference !== null && differences.length === 0,
    partial: !complete,
    warnings: (input.warnings ?? []).filter((warning) => typeof warning === "string" && warning.trim()).map((warning) => warning.slice(0, 500)),
  };
}
