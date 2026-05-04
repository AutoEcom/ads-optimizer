import type { AuditInsight, ExecutableMetaTool, ExecutableMetaToolName, PrioritizedAction } from "@/types";

const TOOL_NAMES = new Set<ExecutableMetaToolName>(["adjust_budget", "pause_campaign", "rename_campaign"]);

/**
 * Парсира и валидира `executable_tool` от JSON отговор на агент (Claude).
 */
export function parseExecutableToolFromAgentJson(raw: unknown): ExecutableMetaTool | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const name = o.name;
  if (typeof name !== "string" || !TOOL_NAMES.has(name as ExecutableMetaToolName)) return undefined;

  const paramsRaw = o.parameters;
  if (!paramsRaw || typeof paramsRaw !== "object") return undefined;
  const p = paramsRaw as Record<string, unknown>;
  const campaign_id = String(p.campaign_id ?? "").trim();
  if (!campaign_id) return undefined;

  const explanation = String(o.explanation ?? "").trim();
  if (!explanation) return undefined;

  const toolName = name as ExecutableMetaToolName;

  if (toolName === "adjust_budget") {
    const nb = p.new_budget;
    if (typeof nb !== "number" || !Number.isFinite(nb) || nb <= 0) return undefined;
    return {
      name: toolName,
      parameters: { campaign_id, new_budget: nb },
      explanation
    };
  }
  if (toolName === "rename_campaign") {
    const nn = p.new_name;
    if (typeof nn !== "string" || !nn.trim()) return undefined;
    return {
      name: toolName,
      parameters: { campaign_id, new_name: nn.trim() },
      explanation
    };
  }
  return {
    name: "pause_campaign",
    parameters: { campaign_id },
    explanation
  };
}

/** Премахва невалидни MCP инструменти (платформа, campaign id, параметри). */
export function sanitizePrioritizedActionMcp(action: PrioritizedAction): PrioritizedAction {
  const parsed = parseExecutableToolFromAgentJson(action.executable_tool);
  if (!parsed) {
    const next = { ...action };
    delete next.executable_tool;
    return next;
  }
  if (action.platform !== "Meta") {
    const next = { ...action };
    delete next.executable_tool;
    return next;
  }
  if (!action.campaignId) {
    const next = { ...action };
    delete next.executable_tool;
    return next;
  }
  if (parsed.parameters.campaign_id !== action.campaignId) {
    const next = { ...action };
    delete next.executable_tool;
    return next;
  }
  return { ...action, executable_tool: parsed };
}

export function sanitizeAuditInsightMcp(insight: AuditInsight): AuditInsight {
  return {
    ...insight,
    prioritizedActions: insight.prioritizedActions.map(sanitizePrioritizedActionMcp)
  };
}
