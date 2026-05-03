import {
  AlertRule,
  CampaignMetrics,
  CriticalIssue,
  MorningDigest,
  Platform
} from "@/types";

export const campaigns: CampaignMetrics[] = [
  {
    id: "meta-01",
    platform: "Meta",
    campaignName: "Meta | Пролетна промоция",
    currencyCode: "EUR",
    spend: 420,
    conversions: 2,
    cpa: 210,
    roas: 1.4,
    ctr: 0.7,
    impressions: 18200,
    targetCpa: 80
  },
  {
    id: "meta-02",
    platform: "Meta",
    campaignName: "Meta | Ремаркетинг 30 дни",
    currencyCode: "EUR",
    spend: 160,
    conversions: 0,
    cpa: 0,
    roas: 0,
    ctr: 0.8,
    impressions: 7900,
    targetCpa: 55
  },
  {
    id: "google-01",
    platform: "Google",
    campaignName: "Google | Search Бранд",
    currencyCode: "EUR",
    spend: 240,
    conversions: 9,
    cpa: 26.7,
    roas: 4.3,
    ctr: 3.8,
    impressions: 5400,
    targetCpa: 35
  },
  {
    id: "google-02",
    platform: "Google",
    campaignName: "Google | Performance Max",
    currencyCode: "EUR",
    spend: 380,
    conversions: 1,
    cpa: 380,
    roas: 0.9,
    ctr: 0.6,
    impressions: 12600,
    targetCpa: 75
  }
];

export const userAlertRules: AlertRule[] = [
  {
    id: "rule-ctr",
    name: "Слаб интерес към рекламата",
    metric: "CTR",
    operator: "<",
    threshold: 1,
    active: true
  },
  {
    id: "rule-cpa",
    name: "Цена на придобиване извън контрол",
    metric: "CPA",
    operator: ">",
    threshold: 120,
    active: true
  }
];

export const morningDigest: MorningDigest = {
  spendYesterday: 1200,
  campaignsToFix: 2,
  topMessage: "Имаш 2 кампании с висок разход и ниска възвръщаемост."
};

/** Празен digest когато `NEXT_PUBLIC_SHOW_MOCK_DATA` е изключен и няма реални данни. */
export const emptyMorningDigest: MorningDigest = {
  spendYesterday: 0,
  campaignsToFix: 0,
  topMessage: ""
};

export function detectCriticalIssues(data: CampaignMetrics[]): CriticalIssue[] {
  return data
    .flatMap((campaign) => {
      const result: CriticalIssue[] = [];

      if (campaign.conversions === 0 && campaign.spend > 100) {
        result.push({
          id: `${campaign.id}-zero-conversions`,
          severity: "Критично",
          title: "Разход без конверсии",
          description: `Кампанията е изразходвала ${campaign.spend.toFixed(0)} EUR без нито една конверсия.`,
          platform: campaign.platform,
          campaignId: campaign.id
        });
      }

      if (campaign.conversions > 0 && campaign.cpa > campaign.targetCpa) {
        result.push({
          id: `${campaign.id}-high-cpa`,
          severity: "Висок риск",
          title: "CPA над целта",
          description: `CPA е ${campaign.cpa.toFixed(1)} EUR при цел ${campaign.targetCpa.toFixed(1)} EUR.`,
          platform: campaign.platform,
          campaignId: campaign.id
        });
      }

      return result;
    })
    .slice(0, 5);
}

export function getCampaignsByPlatform(platform: Platform): CampaignMetrics[] {
  return campaigns.filter((campaign) => campaign.platform === platform);
}
