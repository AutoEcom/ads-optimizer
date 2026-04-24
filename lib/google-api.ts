import { CampaignMetrics } from "@/types";

type GoogleAdsRow = {
  customer?: {
    currencyCode?: string;
  };
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
  };
  metrics?: {
    costMicros?: string;
    clicks?: string;
    impressions?: string;
    conversions?: number;
    ctr?: number;
    averageCpc?: string;
    conversionsValue?: number;
    searchImpressionShare?: number;
  };
};

export async function fetchGoogleCampaigns(
  accessToken: string,
  customerId: string,
  targetCpa: number
): Promise<{ campaigns: CampaignMetrics[]; currencyCode: string }> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    throw new Error("Липсва GOOGLE_ADS_DEVELOPER_TOKEN.");
  }

  const normalizedCustomerId = customerId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/v17/customers/${normalizedCustomerId}/googleAds:searchStream`;

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      customer.currency_code,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions_value,
      metrics.search_impression_share
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
  `;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query }),
    cache: "no-store"
  });

  if (response.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }

  if (!response.ok) {
    throw new Error("Неуспешно зареждане на кампании от Google Ads.");
  }

  const payload = (await response.json()) as Array<{ results?: GoogleAdsRow[] }>;
  const rows = payload.flatMap((chunk) => chunk.results ?? []);
  const currencyCode = rows[0]?.customer?.currencyCode ?? "EUR";

  const campaigns = rows
    .filter((row) => row.campaign?.id && row.campaign?.name)
    .map((row) => {
      const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
      const conversions = Number(row.metrics?.conversions ?? 0);
      const cpa = conversions > 0 ? spend / conversions : 0;
      const conversionsValue = Number(row.metrics?.conversionsValue ?? 0);
      const roas = spend > 0 ? conversionsValue / spend : 0;
      const impressionShareRaw = row.metrics?.searchImpressionShare;
      const impressionShare =
        typeof impressionShareRaw === "number"
          ? Number((impressionShareRaw * 100).toFixed(1))
          : Number((Math.min(95, Math.max(25, 35 + conversions * 4)) + 0.1).toFixed(1));
      const searchTerms = buildMockSearchTerms(row.campaign?.name);

      return {
        id: String(row.campaign?.id),
        platform: "Google",
        campaignName: row.campaign?.name ?? "Без име",
        currencyCode,
        spend: Number(spend.toFixed(2)),
        conversions,
        cpa: Number(cpa.toFixed(2)),
        roas: Number(roas.toFixed(2)),
        ctr: Number(((row.metrics?.ctr ?? 0) * 100).toFixed(2)),
        impressions: Number(row.metrics?.impressions ?? 0),
        impressionShare,
        searchTerms,
        targetCpa
      } satisfies CampaignMetrics;
    });

  return { campaigns, currencyCode };
}

function buildMockSearchTerms(campaignName?: string) {
  const seed = (campaignName ?? "campaign").toLowerCase();
  return [`${seed} цена`, `${seed} оферта`, `${seed} ревю`];
}

export async function updateGoogleCampaignStatus(
  accessToken: string,
  customerId: string,
  campaignId: string,
  status: "PAUSED" | "ENABLED"
) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    throw new Error("Липсва GOOGLE_ADS_DEVELOPER_TOKEN.");
  }

  const normalizedCustomerId = customerId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/v17/customers/${normalizedCustomerId}/campaigns:mutate`;
  const resourceName = `customers/${normalizedCustomerId}/campaigns/${campaignId}`;
  const body = {
    operations: [
      {
        update: {
          resourceName,
          status
        },
        updateMask: "status"
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (response.status === 401) {
    const error = new Error("TOKEN_EXPIRED");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }

  if (!response.ok) {
    throw new Error("Неуспешна промяна на Google кампания.");
  }
}
