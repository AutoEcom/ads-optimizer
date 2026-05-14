import { formatSlashDatesToBulgarian } from "@/lib/format-insight-text";
import { formatCurrencyLatin } from "@/lib/utils";
import type { CampaignMetrics, ExecutableMetaToolName, PrioritizedAction } from "@/types";

export type McpRequestBody = {
  tool: ExecutableMetaToolName;
  campaign_id: string;
  new_budget?: number;
  new_name?: string;
};

export type PendingExecution = {
  body: McpRequestBody;
  explanation: string;
  summaryLines: string[];
};

export function buildPendingExecution(
  action: PrioritizedAction,
  campaign: CampaignMetrics | null,
  targetCpaProp?: number
): PendingExecution | null {
  if (action.actionUiTemplate === "redirect_creative" && action.executable) return null;
  if (!campaign || campaign.platform !== "Meta" || !campaign.id.trim()) return null;
  const cid = campaign.id.trim();
  const cur = campaign.currencyCode ?? "EUR";
  const ext = action.executable_tool;

  if (ext && typeof ext.parameters?.campaign_id === "string") {
    const extCid = String(ext.parameters.campaign_id).trim();
    if (extCid === cid) {
      if (ext.name === "adjust_budget") {
        const nb = ext.parameters.new_budget;
        if (typeof nb === "number" && Number.isFinite(nb) && nb > 0) {
          return {
            body: { tool: "adjust_budget", campaign_id: cid, new_budget: nb },
            explanation: ext.explanation,
            summaryLines: [`Дневният бюджет ще бъде зададен на ${formatCurrencyLatin(nb, cur)}.`]
          };
        }
      }
      if (ext.name === "pause_campaign") {
        return {
          body: { tool: "pause_campaign", campaign_id: cid },
          explanation: ext.explanation,
          summaryLines: ["Кампанията ще бъде поставена на пауза (PAUSED)."]
        };
      }
      if (ext.name === "rename_campaign") {
        const nn = ext.parameters.new_name;
        if (typeof nn === "string" && nn.trim()) {
          return {
            body: { tool: "rename_campaign", campaign_id: cid, new_name: nn.trim() },
            explanation: ext.explanation,
            summaryLines: [`Името на кампанията ще бъде променено на „${nn.trim()}“ (тест).`]
          };
        }
      }
    }
  }

  if (action.actionType === "PAUSE") {
    return {
      body: { tool: "pause_campaign", campaign_id: cid },
      explanation: ext?.explanation?.trim() || formatSlashDatesToBulgarian(action.reason),
      summaryLines: ["Кампанията ще бъде поставена на пауза (PAUSED)."]
    };
  }
  if (action.type === "BUDGET_SUFFICIENCY" && targetCpaProp && targetCpaProp > 0) {
    const daily =
      typeof campaign.dailyBudgetMajor === "number" &&
      Number.isFinite(campaign.dailyBudgetMajor) &&
      campaign.dailyBudgetMajor > 0
        ? campaign.dailyBudgetMajor
        : null;
    const floor = Math.round(Math.max(targetCpaProp * 1.25, 5) * 100) / 100;
    const suggested =
      daily != null
        ? Math.round(Math.max(daily * 1.15, floor) * 100) / 100
        : Math.round(floor * 100) / 100;
    return {
      body: { tool: "adjust_budget", campaign_id: cid, new_budget: suggested },
      explanation: ext?.explanation?.trim() || formatSlashDatesToBulgarian(action.reason),
      summaryLines: [
        daily != null
          ? `Дневният бюджет ще бъде зададен на ${formatCurrencyLatin(suggested, cur)} (база: текущ ${formatCurrencyLatin(daily, cur)}, не статично 5× CPA).`
          : `Дневният бюджет ще бъде зададен на ${formatCurrencyLatin(suggested, cur)} (няма записан дневен бюджет от Meta — ползваме консервативен минимум от целевия CPA).`
      ]
    };
  }

  return null;
}
