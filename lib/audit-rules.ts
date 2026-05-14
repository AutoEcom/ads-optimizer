import { type ExecutableMetaTool, CampaignMetrics, KillListItem, PrioritizedAction } from "@/types";

const KILL_RULE_MULTIPLIER = 3;

export function buildKillList(campaigns: CampaignMetrics[], targetCpa: number): KillListItem[] {
  return campaigns
    .filter((campaign) => campaign.cpa > targetCpa * KILL_RULE_MULTIPLIER)
    .map((campaign) => ({
      campaignId: campaign.id,
      campaignName: campaign.campaignName,
      platform: campaign.platform,
      metaPlacement: campaign.platform === "Meta" ? campaign.metaPlacement : undefined,
      cpa: campaign.cpa,
      targetCpa,
      spend: campaign.spend,
      reason: `3x Kill Rule: CPA ${campaign.cpa.toFixed(2)} е над 3x целевия CPA ${targetCpa.toFixed(2)}.`
    }))
    .sort((a, b) => b.spend - a.spend);
}

export function buildHeuristicActions(
  campaigns: CampaignMetrics[],
  targetCpa: number
): PrioritizedAction[] {
  const actions: PrioritizedAction[] = [];

  for (const campaign of campaigns) {
    const minHealthyDaily = Math.round(Math.max(targetCpa * 1.25, 5) * 100) / 100;
    const daily = campaign.dailyBudgetMajor;

    const hasLowDailyBudget =
      campaign.platform === "Meta" &&
      typeof daily === "number" &&
      Number.isFinite(daily) &&
      daily > 0 &&
      daily < minHealthyDaily;

    const unknownDailyButWeakDelivery =
      campaign.platform === "Meta" &&
      (daily == null || !(daily > 0)) &&
      campaign.impressions < 2500 &&
      campaign.spend < targetCpa * 3;

    if (hasLowDailyBudget || unknownDailyButWeakDelivery) {
      const suggestedDaily =
        typeof daily === "number" && daily > 0
          ? Math.round(Math.max(daily * 1.2, minHealthyDaily) * 100) / 100
          : Math.round(minHealthyDaily * 100) / 100;

      const metaBudgetTool: ExecutableMetaTool | undefined =
        campaign.platform === "Meta"
          ? {
              name: "adjust_budget",
              parameters: { campaign_id: campaign.id, new_budget: suggestedDaily },
              explanation:
                typeof daily === "number" && daily > 0
                  ? `Евристика: текущ дневен бюджет ${daily.toFixed(2)} е под здравословен минимум (~${minHealthyDaily.toFixed(2)}); предлагаме умерено увеличение от реалната стойност.`
                  : `Евристика: липсва четим дневен бюджет от Meta, но доставката е слаба (ниски импресии); предлагаме минимален дневен бюджет ~${suggestedDaily.toFixed(2)}.`
            }
          : undefined;
      actions.push({
        task: `Увеличи бюджет или консолидирай ${campaign.campaignName}`,
        impactScore: 72,
        reason:
          typeof daily === "number" && daily > 0
            ? `Дневният бюджет ${daily.toFixed(2)} е под препоръчания минимум ~${minHealthyDaily.toFixed(
                2
              )} (≈1.25× целеви CPA). Риск от недостатъчен learning сигнал.`
            : `Слаба доставка (импресии ${campaign.impressions}) при нисък разход; препоръчваме минимален дневен бюджет ~${suggestedDaily.toFixed(2)} след потвърждение от Meta.`,
        platform: campaign.platform,
        metaPlacement: campaign.platform === "Meta" ? campaign.metaPlacement : undefined,
        campaignId: campaign.id,
        type: "BUDGET_SUFFICIENCY",
        executable_tool: metaBudgetTool
      });
    }

    if (campaign.cpa > targetCpa * KILL_RULE_MULTIPLIER) {
      const metaPauseTool: ExecutableMetaTool | undefined =
        campaign.platform === "Meta"
          ? {
              name: "pause_campaign",
              parameters: { campaign_id: campaign.id },
              explanation: "Евристика: CPA над 3× целевия — незабавна пауза за ограничаване на загубите."
            }
          : undefined;
      actions.push({
        task: `Спри кампания ${campaign.campaignName}`,
        impactScore: 96,
        reason: `CPA ${campaign.cpa.toFixed(2)} е над 3x target CPA ${targetCpa.toFixed(
          2
        )}. Нужна е незабавна пауза за ограничаване на загубите.`,
        platform: campaign.platform,
        metaPlacement: campaign.platform === "Meta" ? campaign.metaPlacement : undefined,
        campaignId: campaign.id,
        actionType: "PAUSE",
        type: "SCALING_STRATEGY",
        isKillRule: true,
        executable_tool: metaPauseTool
      });
    }

    if (campaign.platform === "Meta" && typeof campaign.frequency === "number" && campaign.frequency > 3) {
      actions.push({
        task: `Смени криейтивите в ${campaign.campaignName}`,
        impactScore: 85,
        reason: `Frequency ${campaign.frequency.toFixed(
          2
        )} > 3.0: сигнал за creative fatigue и спад в CTR.`,
        platform: "Meta",
        metaPlacement: campaign.metaPlacement,
        campaignId: campaign.id,
        type: "CREATIVE_FATIGUE"
      });
    }

    if (
      campaign.platform === "Google" &&
      typeof campaign.impressionShare === "number" &&
      campaign.impressionShare < 45
    ) {
      actions.push({
        task: `Повиши impression share за ${campaign.campaignName}`,
        impactScore: 79,
        reason: `Impression Share ${campaign.impressionShare.toFixed(
          1
        )}% е нисък; губиш търсене заради бюджет или bidding ограничения.`,
        platform: "Google",
        campaignId: campaign.id,
        type: "AUDIENCE_SIGNALS"
      });
    }
  }

  return actions.sort((a, b) => b.impactScore - a.impactScore);
}

export function computeHealthScore(args: {
  campaigns: CampaignMetrics[];
  targetCpa: number;
  killCount: number;
  actionCount: number;
}) {
  const { campaigns, targetCpa, killCount, actionCount } = args;
  if (campaigns.length === 0) return 100;

  const expensiveCampaigns = campaigns.filter((campaign) => campaign.cpa > targetCpa * 1.2).length;
  const spendWithoutConversion = campaigns.filter(
    (campaign) => campaign.conversions === 0 && campaign.spend > targetCpa
  ).length;

  const penalty =
    killCount * 18 + expensiveCampaigns * 7 + spendWithoutConversion * 8 + Math.min(actionCount, 8) * 2;
  return Math.max(0, Math.min(100, 100 - penalty));
}
