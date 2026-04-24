import { CampaignMetrics } from "@/types";

export type AdsPlatformData = {
  campaigns: CampaignMetrics[];
  currencyCode: string;
};

export type AdsPlatformError = Error & {
  status?: number;
  code?: string;
};

export async function fetchAdsPlatformData(url: string): Promise<AdsPlatformData> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as {
    campaigns?: CampaignMetrics[];
    currencyCode?: string;
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    // Missing token/account is expected during onboarding; keep UI alive with empty data.
    if (response.status === 400 || response.status === 401) {
      return {
        campaigns: [],
        currencyCode: payload.currencyCode ?? "EUR"
      };
    }

    const error = new Error(payload.error ?? "Неуспешно зареждане на данни.") as AdsPlatformError;
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }

  return {
    campaigns: payload.campaigns ?? [],
    currencyCode: payload.currencyCode ?? "EUR"
  };
}
