import { logAction } from "@/lib/logger";
import type { CampaignMetrics } from "@/types";

const MAX_PAYLOAD_CHARS = 80_000;

function truncateForLog(text: string, max = MAX_PAYLOAD_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
}

/**
 * Server-side orchestration transparency: structured JSON logs for Vercel / observability.
 */
export function logOrchestrationCampaigns(campaigns: CampaignMetrics[]) {
  const summary = campaigns.map((c) => ({
    id: c.id,
    name: c.campaignName,
    platform: c.platform,
    spend: c.spend,
    dailyBudgetMajor: c.dailyBudgetMajor,
    cpa: c.cpa,
    ctr: c.ctr,
    frequency: c.frequency,
    impressions: c.impressions,
    conversions: c.conversions,
    roas: c.roas,
    targetCpa: c.targetCpa
  }));
  logAction("orchestration_campaign_list", {
    campaignId: null,
    actionType: "orchestration_snapshot",
    agentName: "orchestrator",
    payload: { campaigns: summary }
  });
}

export function logSubAgentInstructions(domain: string, domainPlaybook: string, userPayload: unknown) {
  let userPayloadStr: string;
  try {
    userPayloadStr = JSON.stringify(userPayload, null, 2);
  } catch {
    userPayloadStr = "<unserializable>";
  }
  logAction("orchestration_subagent_input", {
    campaignId: null,
    actionType: "subagent_input",
    agentName: `orchestrator:${domain}`,
    payload: {
      domainPlaybook: truncateForLog(domainPlaybook),
      userMessageJson: truncateForLog(userPayloadStr)
    }
  });
}

export function logSubAgentRawLlmResponse(domain: string, rawText: string) {
  logAction("orchestration_subagent_llm_raw", {
    campaignId: null,
    actionType: "subagent_llm_response",
    agentName: `orchestrator:${domain}`,
    payload: { rawText: truncateForLog(rawText) }
  });
}

export function logSubAgentHttpError(domain: string, status: number, bodySnippet: string) {
  logAction("orchestration_subagent_http_error", {
    campaignId: null,
    actionType: "subagent_http_error",
    agentName: `orchestrator:${domain}`,
    payload: { status, bodySnippet: truncateForLog(bodySnippet, 2000) }
  });
}
