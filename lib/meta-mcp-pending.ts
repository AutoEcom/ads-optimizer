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
    const suggested = Math.round(Math.max(targetCpaProp * 5, campaign.spend * 1.1, 1) * 100) / 100;
    return {
      body: { tool: "adjust_budget", campaign_id: cid, new_budget: suggested },
      explanation: ext?.explanation?.trim() || formatSlashDatesToBulgarian(action.reason),
      summaryLines: [
        `Дневният бюджет ще бъде зададен на ${formatCurrencyLatin(suggested, cur)} (препоръчана стойност: max(5× целеви CPA, 110% от текущия разход)).`
      ]
    };
  }

  return null;
}
