import { CampaignMetrics } from "@/types";

type MetaCampaign = {
  id: string;
  name: string;
  status?: string;
  objective?: string;
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

export async function fetchMetaCampaigns(
  accessToken: string,
  adAccountId: string,
  targetCpa: number
): Promise<{ campaigns: CampaignMetrics[]; currencyCode: string }> {
  const normalizedAccount = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const baseUrl = `https://graph.facebook.com/v19.0/${normalizedAccount}/campaigns`;

  const accountUrl = new URL(`https://graph.facebook.com/v19.0/${normalizedAccount}`);
  accountUrl.searchParams.set("fields", "currency");
  accountUrl.searchParams.set("access_token", accessToken);

  const accountResponse = await fetch(accountUrl.toString(), { cache: "no-store" });
  if (accountResponse.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  const accountPayload = (await accountResponse.json()) as { currency?: string };
  const currencyCode = accountPayload.currency ?? "EUR";

  const campaignsUrl = new URL(baseUrl);
  campaignsUrl.searchParams.set("fields", "id,name,status,objective");
  campaignsUrl.searchParams.set("limit", "100");
  campaignsUrl.searchParams.set("access_token", accessToken);

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

  const results = await Promise.all(
    campaignsPayload.data.map(async (campaign) => {
      const insights = await fetchCampaignInsights(campaign.id, accessToken);
      rawMetaResponse[campaign.id] = insights;
      const conversions = extractConversions(insights.actions, insights.action_values);
      const spend = Number(insights.spend ?? 0);
      const roas = extractRoas(insights.purchase_roas);
      const calculatedCpa = conversions > 0 ? spend / conversions : 0;
      const frequency = insights.frequency ? Number(insights.frequency) : undefined;

      return {
        id: campaign.id,
        platform: "Meta",
        campaignName: campaign.name,
        currencyCode,
        spend,
        conversions,
        cpa: Number(calculatedCpa.toFixed(2)),
        roas,
        ctr: Number(insights.ctr ?? 0),
        impressions: Number(insights.impressions ?? 0),
        frequency: Number.isFinite(frequency) ? frequency : undefined,
        targetCpa
      } satisfies CampaignMetrics;
    })
  );

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

  return { campaigns: results, currencyCode };
}

export async function updateCampaignStatus(
  accessToken: string,
  campaignId: string,
  status: "PAUSED" | "ACTIVE"
) {
  const updateUrl = new URL(`https://graph.facebook.com/v19.0/${campaignId}`);
  const payload = new URLSearchParams();
  payload.set("status", status);
  payload.set("access_token", accessToken);

  const response = await fetch(updateUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
    cache: "no-store"
  });

  if (response.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }

  if (!response.ok) {
    throw new Error("Неуспешна промяна на Meta кампания.");
  }
}

async function fetchCampaignInsights(campaignId: string, accessToken: string): Promise<MetaInsights> {
  const insightsUrl = new URL(`https://graph.facebook.com/v19.0/${campaignId}/insights`);
  insightsUrl.searchParams.set(
    "fields",
    "spend,clicks,impressions,actions,action_values,cpc,ctr,frequency,purchase_roas"
  );
  insightsUrl.searchParams.set("date_preset", "last_30d");
  insightsUrl.searchParams.set("access_token", accessToken);

  const insightsResponse = await fetch(insightsUrl.toString(), { cache: "no-store" });
  if (!insightsResponse.ok) {
    return {};
  }

  const payload = (await insightsResponse.json()) as { data?: MetaInsights[] };
  return payload.data?.[0] ?? {};
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
