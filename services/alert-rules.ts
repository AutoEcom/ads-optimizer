import { AlertRule, CampaignMetrics, RuleSettings } from "@/types";

export function evaluateUserRules(data: CampaignMetrics[], rules: AlertRule[]) {
  return rules
    .filter((rule) => rule.active)
    .flatMap((rule) => {
      return data
        .filter((campaign) => {
          if (rule.metric === "CTR") {
            return compare(campaign.ctr, rule.operator, rule.threshold);
          }

          if (rule.metric === "CPA") {
            return compare(campaign.cpa, rule.operator, rule.threshold);
          }

          if (rule.metric === "ROAS") {
            return compare(campaign.roas, rule.operator, rule.threshold);
          }

          return compare(campaign.spend, rule.operator, rule.threshold);
        })
        .map((campaign) => ({
          id: `${rule.id}-${campaign.id}`,
          message: `${rule.name}: "${campaign.campaignName}" покрива условие ${rule.metric} ${rule.operator} ${rule.threshold}.`
        }));
    });
}

export function buildRulesFromSettings(settings: RuleSettings): AlertRule[] {
  return [
    {
      id: "rule-cpa-20-over-target",
      name: "CPA над целта с 20%",
      metric: "CPA",
      operator: ">",
      threshold: Number((settings.targetCpaValue * 1.2).toFixed(2)),
      active: settings.cpaAboveTargetEnabled
    },
    {
      id: "rule-ctr-low",
      name: "CTR под 0.8%",
      metric: "CTR",
      operator: "<",
      threshold: settings.ctrThreshold,
      active: settings.ctrBelowThresholdEnabled
    }
  ];
}

function compare(value: number, operator: "<" | ">" | "=", threshold: number) {
  if (operator === "<") return value < threshold;
  if (operator === ">") return value > threshold;
  return value === threshold;
}
