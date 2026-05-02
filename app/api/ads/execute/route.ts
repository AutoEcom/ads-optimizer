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

    const tokenResult = await getTokenRowWithCompat(supabase, user.id, body.platform);
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

async function getTokenRowWithCompat(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  platform: Platform
) {
  const primary = await supabase
    .from("ad_platform_tokens")
    .select("access_token,ad_account_id")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("is_active", true)
    .maybeSingle();

  if (!isMissingAdAccountColumnError(primary.error)) {
    return {
      accessToken: primary.data?.access_token ?? null,
      accountId: primary.data?.ad_account_id ?? null,
      error: primary.error
    };
  }

  const legacy = await supabase
    .from("ad_platform_tokens")
    .select("access_token,account_id")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("is_active", true)
    .maybeSingle();

  return {
    accessToken: legacy.data?.access_token ?? null,
    accountId: legacy.data?.account_id ?? null,
    error: legacy.error
  };
}

function isMissingAdAccountColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("ad_account_id") && message.includes("schema cache");
}
