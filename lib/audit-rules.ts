import { type ExecutableMetaTool, CampaignMetrics, KillListItem, PrioritizedAction } from "@/types";

const KILL_RULE_MULTIPLIER = 3;

/** Leading indicators: достатъчно показвания, но още без конверсии — не пропускаме кампанията. */
const ENGAGEMENT_IMPRESSIONS_MIN = 1000;
const CTR_STRONG_PCT = 2;
const CTR_WEAK_PCT = 0.8;
const FREQUENCY_AUDIENCE_WARN = 1.5;
const FREQUENCY_CREATIVE_STRONG = 3;

function isEngagementEarlyStage(campaign: CampaignMetrics): boolean {
  return campaign.impressions > ENGAGEMENT_IMPRESSIONS_MIN && campaign.conversions === 0;
}

/** CPC в основна валута: от API или приближено от spend/импресии/CTR. */
function effectiveCpcMajor(campaign: CampaignMetrics): number | null {
  if (typeof campaign.cpcMajor === "number" && Number.isFinite(campaign.cpcMajor) && campaign.cpcMajor > 0) {
    return campaign.cpcMajor;
  }
  const imp = campaign.impressions ?? 0;
  const sp = campaign.spend ?? 0;
  const ctr = campaign.ctr ?? 0;
  if (imp <= 0 || sp <= 0 || ctr <= 0) return null;
  const estClicks = Math.max(1, (imp * ctr) / 100);
  return sp / estClicks;
}

function isHighCpcForEngagement(campaign: CampaignMetrics, targetCpa: number): boolean {
  const cpc = effectiveCpcMajor(campaign);
  if (cpc == null) return false;
  const floor = Math.max(1.25, targetCpa * 0.12);
  return cpc >= floor;
}

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

    const freq = typeof campaign.frequency === "number" && Number.isFinite(campaign.frequency) ? campaign.frequency : null;
    const engagementEarly = isEngagementEarlyStage(campaign);

    if (campaign.platform === "Meta" && freq != null && freq > FREQUENCY_CREATIVE_STRONG) {
      actions.push({
        task: `Смени криейтивите в ${campaign.campaignName}`,
        impactScore: 85,
        reason: `Frequency ${freq.toFixed(
          2
        )} > ${FREQUENCY_CREATIVE_STRONG}: сигнал за creative fatigue и спад в CTR.`,
        platform: "Meta",
        metaPlacement: campaign.metaPlacement,
        campaignId: campaign.id,
        type: "CREATIVE_FATIGUE",
        ...(engagementEarly ? { insightBasis: "engagement" as const } : {})
      });
    } else if (
      campaign.platform === "Meta" &&
      engagementEarly &&
      typeof campaign.last7DaysFrequency === "number" &&
      Number.isFinite(campaign.last7DaysFrequency) &&
      campaign.last7DaysFrequency > FREQUENCY_AUDIENCE_WARN
    ) {
      const freq7 = campaign.last7DaysFrequency;
      const cpm7 = campaign.last7DaysCpm;
      const cpmBit =
        typeof cpm7 === "number" && Number.isFinite(cpm7) && cpm7 > 0
          ? ` 7-дневен CPM ${cpm7.toFixed(2)} (last_7_days).`
          : "";
      actions.push({
        task: `Прегледай аудиторията за ${campaign.campaignName}`,
        impactScore: 68,
        reason: `7-дневна frequency ${freq7.toFixed(
          2
        )} > ${FREQUENCY_AUDIENCE_WARN} (Meta date_preset=last_7_days) при >${ENGAGEMENT_IMPRESSIONS_MIN} импресии и 0 конверсии: риск от audience overlap или твърде тясна аудитория.${cpmBit}`,
        platform: "Meta",
        metaPlacement: campaign.metaPlacement,
        campaignId: campaign.id,
        type: "AUDIENCE_SIGNALS",
        insightBasis: "engagement"
      });
    }

    if (campaign.platform === "Meta" && engagementEarly) {
      if (campaign.ctr > CTR_STRONG_PCT) {
        actions.push({
          task: `Скалирай или тествай сходни криейтиви за ${campaign.campaignName}`,
          impactScore: 74,
          reason: `CTR ${campaign.ctr.toFixed(
            2
          )}% > ${CTR_STRONG_PCT}% при >${ENGAGEMENT_IMPRESSIONS_MIN} импресии и 0 конверсии — силен интерес; тествай сходни ъгли/формати или умерено скалиране след потвърждение.`,
          platform: "Meta",
          metaPlacement: campaign.metaPlacement,
          campaignId: campaign.id,
          type: "AD_COPY_RELEVANCE",
          insightBasis: "engagement"
        });
      }
      if (campaign.ctr < CTR_WEAK_PCT && isHighCpcForEngagement(campaign, targetCpa)) {
        const cpc = effectiveCpcMajor(campaign);
        actions.push({
          task: `Подмени куката/криейтива за ${campaign.campaignName}`,
          impactScore: 78,
          reason: `CTR ${campaign.ctr.toFixed(2)}% < ${CTR_WEAK_PCT}% и висок CPC (~${
            cpc != null ? cpc.toFixed(2) : "—"
          }) при липса на конверсии — вероятна creative fatigue или слаба кука (leading indicators).`,
          platform: "Meta",
          metaPlacement: campaign.metaPlacement,
          campaignId: campaign.id,
          type: "CREATIVE_FATIGUE",
          insightBasis: "engagement"
        });
      }
    }

    if (campaign.platform === "Google" && engagementEarly) {
      if (campaign.ctr > CTR_STRONG_PCT) {
        actions.push({
          task: `Разшири тестове по копи/криейтив за ${campaign.campaignName}`,
          impactScore: 70,
          reason: `CTR ${campaign.ctr.toFixed(
            2
          )}% > ${CTR_STRONG_PCT}% при >${ENGAGEMENT_IMPRESSIONS_MIN} импресии и 0 конверсии — ангажираност без продажби; тествай нови RSA/акценти.`,
          platform: "Google",
          campaignId: campaign.id,
          type: "AD_COPY_RELEVANCE",
          insightBasis: "engagement"
        });
      }
      if (campaign.ctr < CTR_WEAK_PCT && isHighCpcForEngagement(campaign, targetCpa)) {
        actions.push({
          task: `Подсил релевантността на обявите за ${campaign.campaignName}`,
          impactScore: 72,
          reason: `CTR ${campaign.ctr.toFixed(2)}% < ${CTR_WEAK_PCT}% и висок CPC при 0 конверсии — сигнал за слаба кука или ниска релевантност (engagement режим).`,
          platform: "Google",
          campaignId: campaign.id,
          type: "AD_COPY_RELEVANCE",
          insightBasis: "engagement"
        });
      }
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

/**
 * Paused кампании без доставка в прозореца на метриките — изключваме от AI orchestration,
 * за да не задавят евристики и Budget агента при липсващи данни (напр. стари id-та).
 */
export function filterCampaignsForOrchestration(campaigns: CampaignMetrics[]): CampaignMetrics[] {
  return campaigns.filter((c) => !isStalePausedWithoutDeliverySignals(c));
}

function isStalePausedWithoutDeliverySignals(c: CampaignMetrics): boolean {
  const st = (c.campaignStatus ?? "").toUpperCase();
  if (st !== "PAUSED") return false;
  return (c.impressions ?? 0) === 0 && (c.spend ?? 0) < 1;
}
