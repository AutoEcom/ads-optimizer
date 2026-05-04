import {
  fetchCampaignAdAccountId,
  metaAdAccountsMatch,
  updateCampaignDailyBudget,
  updateCampaignNameMeta,
  updateCampaignStatus
} from "@/lib/meta-api";

export type MetaMcpToolName = "adjust_budget" | "pause_campaign" | "rename_campaign";

export type MetaMcpExecuteInput = {
  tool: MetaMcpToolName;
  campaign_id: string;
  /** Дневен бюджет в основна валута на ad account (напр. 42.5). */
  new_budget?: number;
  new_name?: string;
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
  if (!cid) {
    return { ok: false, tool, error: "Липсва campaign_id." };
  }

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
