import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { executeMetaMcpTool, type MetaMcpToolName } from "@/lib/mcp/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type McpLogContextInput = {
  agent_label: string;
  campaign_name: string;
  action_type_bg: string;
  old_value?: string | number | null;
  new_value?: string | number | null;
};

type McpRequestBody = {
  tool?: string;
  campaign_id?: string;
  new_budget?: number;
  new_name?: string;
  log_context?: unknown;
};

const META_TOOLS = new Set<MetaMcpToolName>(["adjust_budget", "pause_campaign", "rename_campaign"]);

const MCP_ACTION_LOG: Record<MetaMcpToolName, "MCP_ADJUST_BUDGET" | "MCP_PAUSE" | "MCP_RENAME"> = {
  adjust_budget: "MCP_ADJUST_BUDGET",
  pause_campaign: "MCP_PAUSE",
  rename_campaign: "MCP_RENAME"
};

function sanitizeLogContext(raw: unknown): McpLogContextInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const agent = typeof o.agent_label === "string" ? o.agent_label.trim().slice(0, 160) : "";
  const name = typeof o.campaign_name === "string" ? o.campaign_name.trim().slice(0, 280) : "";
  const at = typeof o.action_type_bg === "string" ? o.action_type_bg.trim().slice(0, 120) : "";
  if (!agent || !name || !at) return null;
  const ov = o.old_value;
  const nv = o.new_value;
  return {
    agent_label: agent,
    campaign_name: name,
    action_type_bg: at,
    old_value: ov === undefined || ov === null ? null : typeof ov === "string" || typeof ov === "number" ? ov : String(ov),
    new_value: nv === undefined || nv === null ? null : typeof nv === "string" || typeof nv === "number" ? nv : String(nv)
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
    }

    const body = (await request.json()) as McpRequestBody;
    const tool = body.tool as MetaMcpToolName | undefined;
    if (!tool || !META_TOOLS.has(tool)) {
      return NextResponse.json(
        {
          error:
            "Невалиден инструмент. Позволени са само: adjust_budget (бюджет), pause_campaign (пауза), rename_campaign (име)."
        },
        { status: 400 }
      );
    }

    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";
    if (!campaignId) {
      return NextResponse.json({ error: "Липсва идентификатор на кампания (campaign_id)." }, { status: 400 });
    }

    if (tool === "adjust_budget") {
      if (body.new_budget === undefined || !Number.isFinite(body.new_budget) || body.new_budget <= 0) {
        return NextResponse.json(
          {
            error:
              "За промяна на бюджет е необходимо положително число new_budget (дневен бюджет в основната валута на акаунта)."
          },
          { status: 400 }
        );
      }
    }
    if (tool === "rename_campaign") {
      if (typeof body.new_name !== "string" || !body.new_name.trim()) {
        return NextResponse.json(
          { error: "За преименуване е необходимо непразно поле new_name." },
          { status: 400 }
        );
      }
    }

    const tokenResult = await getAdPlatformTokenRow(supabase, user.id, "Meta");
    if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
      return NextResponse.json(
        { error: "Липсва валиден Meta токен или рекламен акаунт. Настрой ги в раздел Настройки." },
        { status: 400 }
      );
    }

    const result = await executeMetaMcpTool({
      tool,
      campaign_id: campaignId,
      new_budget: body.new_budget,
      new_name: body.new_name,
      accessToken: tokenResult.accessToken,
      userAdAccountId: tokenResult.accountId
    });

    if (!result.ok) {
      const isToken = result.error === "TOKEN_EXPIRED";
      return NextResponse.json(
        {
          success: false,
          error: isToken ? "Връзката с Meta изтече. Моля, свържете се отново." : (result.error ?? "Неизвестна грешка"),
          tool: result.tool,
          ...(isToken ? { code: "TOKEN_EXPIRED" as const } : {})
        },
        { status: isToken ? 401 : 422 }
      );
    }

    const logCtx = sanitizeLogContext(body.log_context);
    if (logCtx) {
      const message = `${logCtx.agent_label} промени ${logCtx.action_type_bg} за кампания ${logCtx.campaign_name}.`;
      const { error: logError } = await supabase.from("execution_logs").insert({
        user_id: user.id,
        platform: "Meta",
        campaign_id: campaignId,
        campaign_name: logCtx.campaign_name,
        action_taken: MCP_ACTION_LOG[tool],
        reason: message,
        details: {
          old_value: logCtx.old_value ?? null,
          new_value: logCtx.new_value ?? null,
          status: "success"
        }
      });
      if (logError) {
        console.warn("[api/ai/mcp] execution_logs insert:", logError.message);
      }
    }

    return NextResponse.json({ success: true, tool: result.tool, data: result.data });
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      return NextResponse.json(
        { error: "Връзката с Meta изтече. Моля, свържете се отново.", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    console.error("[api/ai/mcp]", error);
    return NextResponse.json(
      { error: "Вътрешна грешка при MCP изпълнение. Опитайте отново по-късно." },
      { status: 500 }
    );
  }
}
