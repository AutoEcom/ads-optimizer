import {
  bulkRenameCampaigns,
  duplicateAdSet,
  fetchCreativePerformance,
  fetchCampaignAdAccountId,
  metaAdAccountsMatch,
  toggleAdvantagePlusAudience,
  updateCampaignDailyBudget,
  updateCampaignNameMeta,
  updateCampaignStatus
} from "@/lib/meta-api";

export type MetaMcpToolName =
  | "adjust_budget"
  | "pause_campaign"
  | "rename_campaign"
  | "duplicate_adset"
  | "toggle_advantage_plus"
  | "bulk_rename_campaigns"
  | "compare_creatives";

export type MetaMcpExecuteInput = {
  tool: MetaMcpToolName;
  campaign_id: string;
  /** Дневен бюджет в основна валута на ad account (напр. 42.5). */
  new_budget?: number;
  new_name?: string;
  ad_set_id?: string;
  advantage_plus_enabled?: boolean;
  campaign_ids?: string[];
  prefix?: string;
  accessToken: string;
  /** Ad account id на потребителя (act_... или числов низ). */
  userAdAccountId: string;
};

export type MetaMcpExecuteResult =
  | { ok: true; tool: MetaMcpToolName; data: Record<string, unknown> }
  | { ok: false; tool: MetaMcpToolName; error: string };

/**
 * MCP слой: мапва AI tool извиквания към Meta Marketing API (същата логика като `lib/meta-api`).
 * Преди всяка промяна проверява, че кампанията принадлежи на свързания ad account на потребителя.
 */
export async function executeMetaMcpTool(input: MetaMcpExecuteInput): Promise<MetaMcpExecuteResult> {
  const { tool, campaign_id, accessToken, userAdAccountId } = input;
  const cid = campaign_id.trim();
  const campaignScopedTools = new Set<MetaMcpToolName>(["adjust_budget", "pause_campaign", "rename_campaign"]);
  if (campaignScopedTools.has(tool) && !cid) {
    return { ok: false, tool, error: "Липсва campaign_id." };
  }

  if (campaignScopedTools.has(tool)) {
    const { accountId, errorMessage } = await fetchCampaignAdAccountId(accessToken, cid);
    if (errorMessage) {
      return { ok: false, tool, error: errorMessage };
    }
    if (!metaAdAccountsMatch(userAdAccountId, accountId)) {
      return {
        ok: false,
        tool,
        error:
          "Кампанията не принадлежи на свързания Meta ad account. Провери account ID в Настройки или избери друга кампания."
      };
    }
  }

  try {
    switch (tool) {
      case "adjust_budget": {
        const b = input.new_budget;
        if (b === undefined || !Number.isFinite(b)) {
          return { ok: false, tool, error: "За adjust_budget е задължително положително число new_budget." };
        }
        await updateCampaignDailyBudget(accessToken, cid, b);
        return { ok: true, tool, data: { campaign_id: cid, daily_budget_major: b } };
      }
      case "pause_campaign": {
        await updateCampaignStatus(accessToken, cid, "PAUSED");
        return { ok: true, tool, data: { campaign_id: cid, status: "PAUSED" } };
      }
      case "rename_campaign": {
        const name = input.new_name?.trim();
        if (!name) {
          return { ok: false, tool, error: "За rename_campaign е задължително непразен new_name." };
        }
        await updateCampaignNameMeta(accessToken, cid, name);
        return { ok: true, tool, data: { campaign_id: cid, name } };
      }
      case "duplicate_adset": {
        const adSetId = input.ad_set_id?.trim();
        if (!adSetId) return { ok: false, tool, error: "За duplicate_adset е нужен ad_set_id." };
        const out = await duplicateAdSet(accessToken, adSetId);
        return { ok: true, tool, data: { ad_set_id: adSetId, duplicated_to: out.newAdSetId } };
      }
      case "toggle_advantage_plus": {
        const adSetId = input.ad_set_id?.trim();
        if (!adSetId) return { ok: false, tool, error: "За toggle_advantage_plus е нужен ad_set_id." };
        await toggleAdvantagePlusAudience(accessToken, adSetId, Boolean(input.advantage_plus_enabled));
        return { ok: true, tool, data: { ad_set_id: adSetId, advantage_plus_enabled: Boolean(input.advantage_plus_enabled) } };
      }
      case "bulk_rename_campaigns": {
        const ids = (input.campaign_ids ?? []).map((x) => x.trim()).filter(Boolean);
        const prefix = input.prefix?.trim();
        if (!ids.length || !prefix) {
          return { ok: false, tool, error: "За bulk_rename_campaigns са нужни campaign_ids и prefix." };
        }
        const out = await bulkRenameCampaigns(accessToken, ids, prefix);
        return { ok: true, tool, data: { updated: out.updated } };
      }
      case "compare_creatives": {
        const out = await fetchCreativePerformance(accessToken, userAdAccountId);
        return { ok: true, tool, data: { rows: out.slice(0, 150) } };
      }
    }
  } catch (e) {
    const status = typeof e === "object" && e !== null ? (e as Error & { status?: number }).status : undefined;
    if (status === 401) {
      return { ok: false, tool, error: "TOKEN_EXPIRED" };
    }
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Неуспешно изпълнение на Meta MCP инструмента.";
    return { ok: false, tool, error: msg };
  }
}
