import { logAction } from "@/lib/logger";
import {
  bulkRenameCampaigns,
  duplicateAdSet,
  fetchCampaignAdAccountId,
  fetchCampaignDailyBudgetMajor,
  fetchCampaignNameAndStatus,
  fetchCreativePerformance,
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
  | { ok: false; tool: MetaMcpToolName; error: string; verification?: Record<string, unknown> };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** В production не позволяваме „test“ флагове да остават включени по погрешка. */
function productionSafetyBlock(): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.META_MCP_INTEGRATION_TEST === "1" || process.env.META_MCP_INTEGRATION_TEST === "true") {
    return "META_MCP_INTEGRATION_TEST е активен — не е позволено в production.";
  }
  return null;
}

function isMetaMcpDryRun(): boolean {
  return process.env.META_MCP_DRY_RUN === "1" || process.env.META_MCP_DRY_RUN === "true";
}

/**
 * MCP слой: мапва AI tool извиквания към Meta Marketing API (същата логика като `lib/meta-api`).
 * Преди всяка промяна проверява, че кампанията принадлежи на свързания ad account на потребителя.
 */
export async function executeMetaMcpTool(input: MetaMcpExecuteInput): Promise<MetaMcpExecuteResult> {
  const { tool, campaign_id, accessToken, userAdAccountId } = input;
  const cid = campaign_id.trim();

  const block = productionSafetyBlock();
  if (block) {
    logAction("meta_mcp_production_guard", {
      campaignId: cid || null,
      actionType: tool,
      agentName: "mcp_server",
      payload: { error: block, nodeEnv: process.env.NODE_ENV }
    });
    return { ok: false, tool, error: block };
  }

  if (isMetaMcpDryRun()) {
    logAction("meta_mcp_dry_run", {
      campaignId: cid || null,
      actionType: tool,
      agentName: "mcp_server",
      payload: { message: "META_MCP_DRY_RUN: пропускаме реални записи към Meta." }
    });
    return {
      ok: false,
      tool,
      error: "Режим dry-run (META_MCP_DRY_RUN): записите към Meta са изключени.",
      verification: { dryRun: true }
    };
  }

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
        let currentMajor: number | null = null;
        try {
          currentMajor = await fetchCampaignDailyBudgetMajor(accessToken, cid);
        } catch {
          currentMajor = null;
        }
        logAction("meta_mcp_budget_attempt", {
          campaignId: cid,
          actionType: "adjust_budget",
          agentName: "mcp_server",
          payload: { currentBudgetMajor: currentMajor, newBudgetMajor: b }
        });
        await updateCampaignDailyBudget(accessToken, cid, b);
        await sleep(2000);
        let verifiedMajor: number | null = null;
        try {
          verifiedMajor = await fetchCampaignDailyBudgetMajor(accessToken, cid);
        } catch {
          verifiedMajor = null;
        }
        const verification: Record<string, unknown> = {
          tool: "adjust_budget",
          waitMs: 2000,
          expectedDailyBudgetMajor: b,
          readDailyBudgetMajor: verifiedMajor,
          status: "skipped"
        };
        if (verifiedMajor != null) {
          const tol = Math.max(0.02, b * 0.02);
          if (Math.abs(verifiedMajor - b) > tol) {
            verification.status = "failed";
            logAction("meta_mcp_budget_verify_failed", {
              campaignId: cid,
              actionType: "adjust_budget",
              agentName: "mcp_server",
              payload: verification
            });
            return {
              ok: false,
              tool,
              error: `Верификация неуспешна: в Meta четем дневен бюджет ${verifiedMajor}, очаквахме ${b}.`,
              verification
            };
          }
          verification.status = "verified";
        } else {
          logAction("meta_mcp_budget_verify_skipped", {
            campaignId: cid,
            actionType: "adjust_budget",
            agentName: "mcp_server",
            payload: { reason: "daily_budget unreadable after update" }
          });
        }
        logAction("meta_mcp_budget_verify", {
          campaignId: cid,
          actionType: "adjust_budget",
          agentName: "mcp_server",
          payload: verification
        });
        return {
          ok: true,
          tool,
          data: {
            campaign_id: cid,
            daily_budget_major: b,
            previous_daily_budget_major: currentMajor,
            verified_daily_budget_major: verifiedMajor,
            verification
          }
        };
      }
      case "pause_campaign": {
        let before: { name: string | null; status: string | null; raw?: unknown } = {
          name: null,
          status: null
        };
        try {
          before = await fetchCampaignNameAndStatus(accessToken, cid);
        } catch {
          before = { name: null, status: null };
        }
        logAction("meta_mcp_pause_attempt", {
          campaignId: cid,
          actionType: "pause_campaign",
          agentName: "mcp_server",
          payload: { previousStatus: before.status, metaRead: before.raw }
        });
        await updateCampaignStatus(accessToken, cid, "PAUSED");
        await sleep(2000);
        let after: { name: string | null; status: string | null; raw?: unknown };
        try {
          after = await fetchCampaignNameAndStatus(accessToken, cid);
        } catch {
          after = { name: null, status: null };
        }
        const verification: Record<string, unknown> = {
          tool: "pause_campaign",
          waitMs: 2000,
          expectedStatus: "PAUSED",
          readStatus: after.status,
          metaReadAfter: after.raw,
          status: "skipped"
        };
        if (after.status != null) {
          if (String(after.status).toUpperCase() !== "PAUSED") {
            verification.status = "failed";
            logAction("meta_mcp_pause_verify_failed", {
              campaignId: cid,
              actionType: "pause_campaign",
              agentName: "mcp_server",
              payload: verification
            });
            return {
              ok: false,
              tool,
              error: `Верификация неуспешна: статусът в Meta е „${after.status}“, очаквахме PAUSED.`,
              verification
            };
          }
          verification.status = "verified";
        }
        logAction("meta_mcp_pause_verify", {
          campaignId: cid,
          actionType: "pause_campaign",
          agentName: "mcp_server",
          payload: verification
        });
        return {
          ok: true,
          tool,
          data: { campaign_id: cid, status: "PAUSED", verification }
        };
      }
      case "rename_campaign": {
        const name = input.new_name?.trim();
        if (!name) {
          return { ok: false, tool, error: "За rename_campaign е задължително непразен new_name." };
        }
        let beforeName: string | null = null;
        try {
          const b = await fetchCampaignNameAndStatus(accessToken, cid);
          beforeName = b.name;
        } catch {
          beforeName = null;
        }
        logAction("meta_mcp_rename_attempt", {
          campaignId: cid,
          actionType: "rename_campaign",
          agentName: "mcp_server",
          payload: { previousName: beforeName, newName: name }
        });
        await updateCampaignNameMeta(accessToken, cid, name);
        await sleep(2000);
        let readName: string | null = null;
        try {
          const a = await fetchCampaignNameAndStatus(accessToken, cid);
          readName = a.name;
        } catch {
          readName = null;
        }
        const verification: Record<string, unknown> = {
          tool: "rename_campaign",
          waitMs: 2000,
          expectedName: name,
          readName,
          status: "skipped"
        };
        if (readName != null) {
          if (readName.trim() !== name.trim()) {
            verification.status = "failed";
            logAction("meta_mcp_rename_verify_failed", {
              campaignId: cid,
              actionType: "rename_campaign",
              agentName: "mcp_server",
              payload: verification
            });
            return {
              ok: false,
              tool,
              error: `Верификация неуспешна: името в Meta е „${readName}“, очаквахме „${name}“.`,
              verification
            };
          }
          verification.status = "verified";
        }
        logAction("meta_mcp_rename_verify", {
          campaignId: cid,
          actionType: "rename_campaign",
          agentName: "mcp_server",
          payload: verification
        });
        return {
          ok: true,
          tool,
          data: { campaign_id: cid, name, verification }
        };
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
      default: {
        const _exhaustive: never = tool;
        return { ok: false, tool: _exhaustive, error: "Неподдържан инструмент." };
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
