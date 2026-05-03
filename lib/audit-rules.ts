import { CampaignMetrics, KillListItem, PrioritizedAction } from "@/types";

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
    const hasLowBudget = campaign.spend < targetCpa * 5;
    if (hasLowBudget) {
      actions.push({
        task: `Увеличи бюджет или консолидирай ${campaign.campaignName}`,
        impactScore: 72,
        reason: `Бюджетът е под препоръката от 5x целеви CPA (${(targetCpa * 5).toFixed(
          2
        )}). Липсва стабилен learning сигнал.`,
        platform: campaign.platform,
        metaPlacement: campaign.platform === "Meta" ? campaign.metaPlacement : undefined,
        campaignId: campaign.id,
        type: "BUDGET_SUFFICIENCY"
      });
    }

    if (campaign.cpa > targetCpa * KILL_RULE_MULTIPLIER) {
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
        isKillRule: true
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
