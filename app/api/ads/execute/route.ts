import { NextResponse } from "next/server";

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

    const { data: tokenRow, error: tokenError } = await supabase
      .from("ad_platform_tokens")
      .select("access_token, ad_account_id")
      .eq("user_id", user.id)
      .eq("platform", body.platform)
      .eq("is_active", true)
      .maybeSingle();

    if (tokenError || !tokenRow?.access_token || !tokenRow.ad_account_id) {
      return NextResponse.json({ error: "Липсва валиден токен или account id." }, { status: 400 });
    }

    if (body.platform === "Meta") {
      await updateCampaignStatus(
        tokenRow.access_token,
        body.campaignId,
        body.action === "PAUSE" ? "PAUSED" : "ACTIVE"
      );
    } else {
      await updateGoogleCampaignStatus(
        tokenRow.access_token,
        tokenRow.ad_account_id,
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
