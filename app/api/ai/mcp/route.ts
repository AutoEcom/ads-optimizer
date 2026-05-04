import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { executeMetaMcpTool, type MetaMcpToolName } from "@/lib/mcp/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type McpRequestBody = {
  tool?: string;
  campaign_id?: string;
  new_budget?: number;
  new_name?: string;
};

const META_TOOLS = new Set<MetaMcpToolName>(["adjust_budget", "pause_campaign", "rename_campaign"]);

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
        { error: "Невалиден tool. Позволени: adjust_budget, pause_campaign, rename_campaign." },
        { status: 400 }
      );
    }

    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";
    if (!campaignId) {
      return NextResponse.json({ error: "Липсва campaign_id." }, { status: 400 });
    }

    if (tool === "adjust_budget") {
      if (body.new_budget === undefined || !Number.isFinite(body.new_budget) || body.new_budget <= 0) {
        return NextResponse.json(
          { error: "За adjust_budget е необходимо положително число new_budget (дневен бюджет в основна валута)." },
          { status: 400 }
        );
      }
    }
    if (tool === "rename_campaign") {
      if (typeof body.new_name !== "string" || !body.new_name.trim()) {
        return NextResponse.json({ error: "За rename_campaign е необходим непразен new_name." }, { status: 400 });
      }
    }

    const tokenResult = await getAdPlatformTokenRow(supabase, user.id, "Meta");
    if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
      return NextResponse.json(
        { error: "Липсва валиден Meta токен или ad account id. Настрой ги в Настройки." },
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
          error: isToken ? "Токенът е изтекъл. Свържи отново Meta акаунта." : result.error,
          tool: result.tool,
          ...(isToken ? { code: "TOKEN_EXPIRED" as const } : {})
        },
        { status: isToken ? 401 : 422 }
      );
    }

    return NextResponse.json({ success: true, tool: result.tool, data: result.data });
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      return NextResponse.json(
        { error: "Токенът е изтекъл. Свържи отново Meta акаунта.", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    console.error("[api/ai/mcp]", error);
    return NextResponse.json({ error: "Вътрешна грешка при MCP изпълнение." }, { status: 500 });
  }
}
