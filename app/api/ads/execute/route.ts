import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { updateGoogleCampaignStatus } from "@/lib/google-api";
import { updateCampaignStatus } from "@/lib/meta-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Platform } from "@/types";

type ExecuteBody = {
  platform: Platform;
  campaignId: string;
  campaignName: string;
  action: "PAUSE" | "ACTIVATE";
  reason: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExecuteBody;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
    }

    const tokenResult = await getAdPlatformTokenRow(supabase, user.id, body.platform);
    if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
      return NextResponse.json({ error: "Липсва валиден токен или account id." }, { status: 400 });
    }

    if (body.platform === "Meta") {
      await updateCampaignStatus(
        tokenResult.accessToken,
        body.campaignId,
        body.action === "PAUSE" ? "PAUSED" : "ACTIVE"
      );
    } else {
      await updateGoogleCampaignStatus(
        tokenResult.accessToken,
        tokenResult.accountId,
        body.campaignId,
        body.action === "PAUSE" ? "PAUSED" : "ENABLED"
      );
    }

    await supabase.from("execution_logs").insert({
      user_id: user.id,
      platform: body.platform,
      campaign_id: body.campaignId,
      campaign_name: body.campaignName,
      action_taken: body.action,
      reason: body.reason
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      return NextResponse.json(
        { error: "Токенът е изтекъл. Свържи отново акаунта.", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: "Неуспешно изпълнение на действието." }, { status: 400 });
  }
}

