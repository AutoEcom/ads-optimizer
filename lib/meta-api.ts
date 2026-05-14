import { createHmac } from "node:crypto";

import type { CampaignMetrics, MetaPlacement } from "@/types";

type MetaCampaign = {
  id: string;
  name: string;
  status?: string;
  objective?: string;
  /** Минимални единици на валутата (както в Graph API). */
  daily_budget?: string;
};

type MetaInsights = {
  spend?: string;
  clicks?: string;
  impressions?: string;
  cpc?: string;
  ctr?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ value: string }>;
};

type MetaAdCreativeRow = {
  ad_id?: string;
  ad_name?: string;
  creative_id?: string;
  image_hash?: string;
  video_asset?: string;
  spend?: string;
  ctr?: string;
  purchase_roas?: Array<{ value?: string }>;
};

const META_API_VERSION = process.env.META_MARKETING_API_VERSION ?? "v21.0";
const META_APP_SECRET = process.env.META_APP_SECRET ?? "";

type MetaGraphErrorBody = {
  error?: { message?: string; error_user_msg?: string; error_user_title?: string; code?: number };
};

export async function readMetaGraphFailureMessage(response: Response): Promise<string> {
  try {
    const j = (await response.clone().json()) as MetaGraphErrorBody;
    const m = j.error?.error_user_msg ?? j.error?.message;
    if (m) return m;
  } catch {
    // ignore JSON parse errors
  }
  return `Meta Graph API грешка (HTTP ${response.status}).`;
}

/** Meta appsecret_proof = HMAC_SHA256(access_token, META_APP_SECRET). */
export function generateMetaAppSecretProof(accessToken: string): string | null {
  const token = accessToken.trim();
  if (!token || !META_APP_SECRET) return null;
  return createHmac("sha256", META_APP_SECRET).update(token).digest("hex");
}

/** Добавя `access_token` + `appsecret_proof` като query params към Graph URL. */
export function attachMetaAuthToUrl(url: URL, accessToken: string) {
  url.searchParams.set("access_token", accessToken);
  const proof = generateMetaAppSecretProof(accessToken);
  if (proof) {
    url.searchParams.set("appsecret_proof", proof);
  }
}

function attachMetaAuthToPayload(payload: URLSearchParams, accessToken: string) {
  payload.set("access_token", accessToken);
  const proof = generateMetaAppSecretProof(accessToken);
  if (proof) {
    payload.set("appsecret_proof", proof);
  }
}

async function metaPost(url: URL, payload: URLSearchParams) {
  return fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
    cache: "no-store"
  });
}

/** Нормализира ad account id към вид act_XXX за сравнение. */
export function normalizeMetaAdAccountId(id: string): string {
  const t = id.trim();
  if (t.startsWith("act_")) return t;
  return `act_${t.replace(/^act_/, "")}`;
}

export function metaAdAccountsMatch(userAdAccountId: string, campaignAccountId: string | null): boolean {
  if (!campaignAccountId) return false;
  return normalizeMetaAdAccountId(userAdAccountId) === normalizeMetaAdAccountId(campaignAccountId);
}

/** Връща account_id на кампанията (act_...) за проверка срещу свързания акаунт на потребителя. */
export async function fetchCampaignAdAccountId(
  accessToken: string,
  campaignId: string
): Promise<{ accountId: string | null; errorMessage?: string }> {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${campaignId}`);
  url.searchParams.set("fields", "account_id");
  attachMetaAuthToUrl(url, accessToken);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!res.ok) {
    return { accountId: null, errorMessage: await readMetaGraphFailureMessage(res) };
  }
  const json = (await res.json()) as { account_id?: string; error?: MetaGraphErrorBody["error"] };
  if (json.error?.message) {
    return { accountId: null, errorMessage: json.error.error_user_msg ?? json.error.message };
  }
  const aid = json.account_id != null ? String(json.account_id) : null;
  return { accountId: aid };
}

/**
 * Задава дневен бюджет на кампанията (Graph `daily_budget` в минимални единици на валутата на акаунта, напр. центове за EUR).
 * @param dailyBudgetMajor — сума в основна валута (напр. 25.50 EUR).
 */
export async function updateCampaignDailyBudget(
  accessToken: string,
  campaignId: string,
  dailyBudgetMajor: number
): Promise<void> {
  if (!Number.isFinite(dailyBudgetMajor) || dailyBudgetMajor <= 0) {
    throw new Error("Невалиден дневен бюджет. Очаква се положително число в основна валута на акаунта.");
  }
  const minor = Math.max(1, Math.round(dailyBudgetMajor * 100));
  const updateUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${campaignId}`);
  const payload = new URLSearchParams();
  payload.set("daily_budget", String(minor));
  attachMetaAuthToPayload(payload, accessToken);

  const response = await metaPost(updateUrl, payload);

  if (response.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!response.ok) {
    throw new Error(await readMetaGraphFailureMessage(response));
  }
}

/**
 * Чете текущия дневен бюджет на кампанията (Graph `daily_budget` в минимални единици → основна валута).
 */
export async function fetchCampaignDailyBudgetMajor(
  accessToken: string,
  campaignId: string
): Promise<number | null> {
  const cid = campaignId.trim();
  if (!cid) return null;
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${cid}`);
  url.searchParams.set("fields", "daily_budget");
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!res.ok) return null;
  const json = (await res.json()) as { daily_budget?: string; error?: MetaGraphErrorBody["error"] };
  if (json.error?.message) return null;
  const raw = json.daily_budget;
  if (raw == null || String(raw).trim() === "") return null;
  const minor = Number(raw);
  if (!Number.isFinite(minor) || minor <= 0) return null;
  return Number((minor / 100).toFixed(2));
}

/** Чете `name` и `status` на кампанията (верификация след pause/rename). */
export async function fetchCampaignNameAndStatus(
  accessToken: string,
  campaignId: string
): Promise<{ name: string | null; status: string | null; raw?: unknown }> {
  const cid = campaignId.trim();
  if (!cid) return { name: null, status: null };
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${cid}`);
  url.searchParams.set("fields", "name,status");
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!res.ok) {
    return { name: null, status: null, raw: { httpStatus: res.status } };
  }
  const json = (await res.json()) as { name?: string; status?: string; error?: MetaGraphErrorBody["error"] };
  if (json.error?.message) {
    return { name: null, status: null, raw: json.error };
  }
  return {
    name: json.name != null ? String(json.name) : null,
    status: json.status != null ? String(json.status) : null,
    raw: { name: json.name, status: json.status }
  };
}

export async function updateCampaignNameMeta(
  accessToken: string,
  campaignId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Името на кампанията не може да е празно.");
  }
  const updateUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${campaignId}`);
  const payload = new URLSearchParams();
  payload.set("name", trimmed);
  attachMetaAuthToPayload(payload, accessToken);

  const response = await metaPost(updateUrl, payload);

  if (response.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!response.ok) {
    throw new Error(await readMetaGraphFailureMessage(response));
  }
}

async function fetchMetaAccountTotalSpend(normalizedAccount: string, accessToken: string): Promise<number> {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${normalizedAccount}/insights`);
  url.searchParams.set("fields", "spend");
  url.searchParams.set("date_preset", "last_30d");
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!res.ok) return 0;
  const json = (await res.json()) as { data?: Array<{ spend?: string }> };
  return Number(json.data?.[0]?.spend ?? 0);
}

export async function fetchMetaCampaigns(
  accessToken: string,
  adAccountId: string,
  targetCpa: number
): Promise<{ campaigns: CampaignMetrics[]; currencyCode: string; totalSpend: number }> {
  const normalizedAccount = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${normalizedAccount}/campaigns`;

  const accountUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${normalizedAccount}`);
  accountUrl.searchParams.set("fields", "currency");
  attachMetaAuthToUrl(accountUrl, accessToken);

  const accountResponse = await fetch(accountUrl.toString(), { cache: "no-store" });
  if (accountResponse.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  const accountPayload = (await accountResponse.json()) as { currency?: string };
  const currencyCode = accountPayload.currency ?? "EUR";

  const campaignsUrl = new URL(baseUrl);
  campaignsUrl.searchParams.set("fields", "id,name,status,objective,daily_budget");
  campaignsUrl.searchParams.set("limit", "100");
  attachMetaAuthToUrl(campaignsUrl, accessToken);

  const campaignsResponse = await fetch(campaignsUrl.toString(), { cache: "no-store" });
  if (campaignsResponse.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!campaignsResponse.ok) {
    throw new Error("Неуспешно зареждане на кампании от Meta.");
  }

  const campaignsPayload = (await campaignsResponse.json()) as { data?: MetaCampaign[]; error?: { message?: string } };
  if (!campaignsPayload.data) {
    throw new Error(campaignsPayload.error?.message ?? "Липсват данни за Meta кампаниите.");
  }

  const rawMetaResponse: Record<string, unknown> = {
    campaigns: campaignsPayload.data
  };

  const [accountTotalSpend, results] = await Promise.all([
    fetchMetaAccountTotalSpend(normalizedAccount, accessToken),
    Promise.all(
      campaignsPayload.data.map(async (campaign) => {
      const [insights, platformSpend] = await Promise.all([
        fetchCampaignInsights(campaign.id, accessToken),
        fetchPublisherPlatformBreakdown(campaign.id, accessToken)
      ]);
      rawMetaResponse[campaign.id] = insights;
      const metaPlacement = inferMetaPlacement(platformSpend);
      const conversions = extractConversions(insights.actions, insights.action_values);
      const spend = Number(insights.spend ?? 0);
      const roas = extractRoas(insights.purchase_roas);
      const calculatedCpa = conversions > 0 ? spend / conversions : 0;
      const parsedFrequency = insights.frequency ? Number(insights.frequency) : NaN;
      const fallbackFrequency = Number((1 + Math.min(4, spend / Math.max(25, conversions + 1))).toFixed(2));
      const frequency = Number.isFinite(parsedFrequency) ? parsedFrequency : fallbackFrequency;

      const rawDaily = campaign.daily_budget;
      const dailyMinor = rawDaily != null && String(rawDaily).trim() !== "" ? Number(rawDaily) : NaN;
      const dailyBudgetMajor =
        Number.isFinite(dailyMinor) && dailyMinor > 0 ? Number((dailyMinor / 100).toFixed(2)) : undefined;

      return {
        id: campaign.id,
        platform: "Meta",
        campaignName: campaign.name,
        currencyCode,
        spend,
        ...(dailyBudgetMajor != null ? { dailyBudgetMajor } : {}),
        conversions,
        cpa: Number(calculatedCpa.toFixed(2)),
        roas,
        ctr: Number(insights.ctr ?? 0),
        impressions: Number(insights.impressions ?? 0),
        frequency,
        targetCpa,
        metaPlacement
      } satisfies CampaignMetrics;
      })
    )
  ]);

  const summedCampaignSpend = results.reduce((sum, c) => sum + c.spend, 0);
  const totalSpend = Math.max(accountTotalSpend, summedCampaignSpend);

  console.log(JSON.stringify(rawMetaResponse, null, 2));
  console.log(
    JSON.stringify(
      {
        conversionActions: Object.fromEntries(
          campaignsPayload.data.map((campaign) => {
            const insights = rawMetaResponse[campaign.id] as MetaInsights | undefined;
            const filtered = filterConversionActions(insights?.actions, insights?.action_values);
            return [campaign.id, filtered];
          })
        )
      },
      null,
      2
    )
  );

  return { campaigns: results, currencyCode, totalSpend: Number(totalSpend.toFixed(2)) };
}

export async function updateCampaignStatus(
  accessToken: string,
  campaignId: string,
  status: "PAUSED" | "ACTIVE"
) {
  const updateUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${campaignId}`);
  const payload = new URLSearchParams();
  payload.set("status", status);
  attachMetaAuthToPayload(payload, accessToken);

  const response = await metaPost(updateUrl, payload);

  if (response.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }

  if (!response.ok) {
    throw new Error(await readMetaGraphFailureMessage(response));
  }
}

/** Дублира ad set в същата кампания. */
export async function duplicateAdSet(
  accessToken: string,
  adSetId: string,
  renameSuffix = "Copy"
): Promise<{ newAdSetId: string | null }> {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${adSetId}/copies`);
  const payload = new URLSearchParams();
  payload.set("rename_options", JSON.stringify({ rename_suffix: ` ${renameSuffix}` }));
  attachMetaAuthToPayload(payload, accessToken);
  const res = await metaPost(url, payload);
  if (res.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!res.ok) throw new Error(await readMetaGraphFailureMessage(res));
  const json = (await res.json()) as { copied_adset_id?: string; id?: string };
  return { newAdSetId: json.copied_adset_id ?? json.id ?? null };
}

/** Включва/изключва Advantage+ audience в ad set targeting. */
export async function toggleAdvantagePlusAudience(
  accessToken: string,
  adSetId: string,
  enabled: boolean
): Promise<void> {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${adSetId}`);
  const payload = new URLSearchParams();
  payload.set("targeting_automation", JSON.stringify({ advantage_audience: enabled }));
  attachMetaAuthToPayload(payload, accessToken);
  const res = await metaPost(url, payload);
  if (res.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!res.ok) throw new Error(await readMetaGraphFailureMessage(res));
}

/** Масово rename на кампании по префикс. */
export async function bulkRenameCampaigns(
  accessToken: string,
  campaignIds: string[],
  prefix: string
): Promise<{ updated: number }> {
  let updated = 0;
  const safePrefix = prefix.trim();
  for (const cidRaw of campaignIds) {
    const cid = cidRaw.trim();
    if (!cid) continue;
    const getUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${cid}`);
    getUrl.searchParams.set("fields", "name");
    attachMetaAuthToUrl(getUrl, accessToken);
    const getRes = await fetch(getUrl.toString(), { cache: "no-store" });
    if (!getRes.ok) continue;
    const current = (await getRes.json()) as { name?: string };
    const nextName = `${safePrefix}${current.name ? ` ${current.name}` : ""}`.trim();
    if (!nextName) continue;
    await updateCampaignNameMeta(accessToken, cid, nextName);
    updated += 1;
  }
  return { updated };
}

/** Creative performance по ad creative (CTR/ROAS/Spend). */
export async function fetchCreativePerformance(
  accessToken: string,
  adAccountId: string
): Promise<
  Array<{ adId: string; adName: string; creativeKey: string; ctr: number; roas: number; spend: number }>
> {
  const normalizedAccount = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${normalizedAccount}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set("fields", "ad_id,ad_name,creative_id,image_hash,video_asset,ctr,spend,purchase_roas");
  url.searchParams.set("date_preset", "last_30d");
  attachMetaAuthToUrl(url, accessToken);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (!res.ok) throw new Error(await readMetaGraphFailureMessage(res));
  const payload = (await res.json()) as { data?: MetaAdCreativeRow[] };
  return (payload.data ?? []).map((row) => ({
    adId: String(row.ad_id ?? ""),
    adName: String(row.ad_name ?? "Ad"),
    creativeKey: String(row.image_hash ?? row.video_asset ?? row.creative_id ?? "unknown"),
    ctr: Number(row.ctr ?? 0),
    roas: Number(row.purchase_roas?.[0]?.value ?? 0),
    spend: Number(row.spend ?? 0)
  }));
}

async function fetchCampaignInsights(campaignId: string, accessToken: string): Promise<MetaInsights> {
  const insightsUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${campaignId}/insights`);
  insightsUrl.searchParams.set(
    "fields",
    "spend,clicks,impressions,actions,action_values,cpc,ctr,frequency,purchase_roas"
  );
  insightsUrl.searchParams.set("date_preset", "last_30d");
  attachMetaAuthToUrl(insightsUrl, accessToken);

  const insightsResponse = await fetch(insightsUrl.toString(), { cache: "no-store" });
  if (!insightsResponse.ok) {
    return {};
  }

  const payload = (await insightsResponse.json()) as { data?: MetaInsights[] };
  return payload.data?.[0] ?? {};
}

async function fetchPublisherPlatformBreakdown(
  campaignId: string,
  accessToken: string
): Promise<Record<string, number>> {
  const insightsUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${campaignId}/insights`);
  insightsUrl.searchParams.set("fields", "spend");
  insightsUrl.searchParams.set("breakdowns", "publisher_platform");
  insightsUrl.searchParams.set("date_preset", "last_30d");
  attachMetaAuthToUrl(insightsUrl, accessToken);

  const insightsResponse = await fetch(insightsUrl.toString(), { cache: "no-store" });
  if (!insightsResponse.ok) {
    return {};
  }

  const payload = (await insightsResponse.json()) as {
    data?: Array<{ spend?: string; publisher_platform?: string }>;
  };
  const spends: Record<string, number> = {};
  for (const row of payload.data ?? []) {
    const key = String(row.publisher_platform ?? "unknown").toLowerCase();
    spends[key] = (spends[key] ?? 0) + Number(row.spend ?? 0);
  }
  return spends;
}

function inferMetaPlacement(spends: Record<string, number>): MetaPlacement {
  const fb =
    (spends.facebook ?? 0) +
    (spends.fb ?? 0) +
    (spends.an_classic ?? 0) +
    (spends.audience_network ?? 0);
  const ig = spends.instagram ?? 0;
  const sum = fb + ig;
  if (sum < 0.01) return "other";
  const rIg = ig / sum;
  const rFb = fb / sum;
  if (rIg >= 0.58) return "instagram";
  if (rFb >= 0.58) return "facebook";
  if (ig > 0 && fb > 0) return "mixed";
  return ig > fb ? "instagram" : "facebook";
}

function extractConversions(
  actions: MetaInsights["actions"],
  actionValues: MetaInsights["action_values"]
) {
  const actionSources = [...(actions ?? []), ...(actionValues ?? [])];
  if (actionSources.length === 0) return 0;

  const conversionAction = actionSources.find((action) =>
    ["purchase", "omni_purchase", "offsite_conversion.purchase"].includes(action.action_type)
  );

  return Number(conversionAction?.value ?? 0);
}

function extractRoas(purchaseRoas: MetaInsights["purchase_roas"]) {
  const roasValue = purchaseRoas?.[0]?.value;
  return Number(roasValue ?? 0);
}

function filterConversionActions(
  actions: MetaInsights["actions"],
  actionValues: MetaInsights["action_values"]
) {
  const conversionActionTypes = new Set([
    "purchase",
    "omni_purchase",
    "offsite_conversion.purchase"
  ]);

  return {
    actions: (actions ?? []).filter((action) => conversionActionTypes.has(action.action_type)),
    action_values: (actionValues ?? []).filter((action) =>
      conversionActionTypes.has(action.action_type)
    )
  };
}
