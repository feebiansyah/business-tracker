// Display-only DTOs: never used to build provider writes or analysis decisions.
export type CampaignDisplay = { dailyBudgetUsd: number | null; countryCpm: { country: string; amount: number }[] | null };
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function money(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function country(value: unknown) { return typeof value === "string" && /^[a-zA-Z]{2}$/.test(value) ? value.toUpperCase() : null; }
function countryPrices(rows: unknown, adsterra: boolean): CampaignDisplay["countryCpm"] {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) return null;
  const prices = new Map<string, number>();
  for (const value of rows) {
    const row = record(value);
    if (!row) return null;
    const amount = money(adsterra ? row.price : row.amount);
    // Clickadu documents country[]; actual GET uses countries[]. Do not infer
    // countries from targeting or use placement-country Custom Bid data.
    if (!adsterra && row.country !== undefined && row.countries !== undefined) return null;
    const countries = adsterra ? [row.country_code] : row.countries ?? row.country;
    if (amount === null || !Array.isArray(countries) || !countries.length || countries.length > 500) return null;
    for (const value of countries) {
      const code = country(value);
      if (!code || (prices.has(code) && prices.get(code) !== amount)) return null;
      prices.set(code, amount);
    }
  }
  return [...prices].map(([country, amount]) => ({ country, amount }));
}

export function parseClickaduCampaignDisplay(value: unknown): CampaignDisplay {
  const row = record(value);
  const model = typeof row?.rateModel === "string" ? row.rateModel.trim().toUpperCase() : "";
  return { dailyBudgetUsd: money(row?.dailyAmount), countryCpm: ["CPM", "SCPM", "SMARTCPM"].includes(model) ? countryPrices(row?.rates, false) : null };
}

export function parseAdsterraCampaignDisplays(value: unknown): Record<string, CampaignDisplay> {
  const body = record(value);
  // Observed bulk contract: items + itemCount, no pagination. An incomplete or
  // changed envelope is not silently treated as a complete page or zero budget.
  if (!body || !Array.isArray(body.items) || body.items.length > 5000 || body.itemCount !== body.items.length || "error" in body || "errors" in body) throw new Error("INVALID_CAMPAIGN_DISPLAY");
  const result: Record<string, CampaignDisplay> = {};
  for (const value of body.items) {
    const row = record(value);
    if (!row || typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id <= 0 || Object.hasOwn(result, row.id)) throw new Error("INVALID_CAMPAIGN_DISPLAY");
    result[String(row.id)] = { dailyBudgetUsd: money(row.daily_budget_limit), countryCpm: row.pricing_type === "CPM" ? countryPrices(row.pricing_settings, true) : null };
  }
  return result;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
export function displayBudgetUsd(value?: CampaignDisplay) { return value?.dailyBudgetUsd === null || value?.dailyBudgetUsd === undefined ? "—" : usd.format(value.dailyBudgetUsd); }
export function displayCountryCpm(value?: CampaignDisplay) { return value?.countryCpm?.length ? value.countryCpm.map(row => `${row.country} ${usd.format(row.amount)}`).join(" · ") : "—"; }
