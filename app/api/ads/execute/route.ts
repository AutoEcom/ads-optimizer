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

const EXECUTION_LOG_DETAILS = {
  PAUSE: { old_value: "active", new_value: "paused", status: "success" as const },
  ACTIVATE: { old_value: "paused", new_value: "active", status: "success" as const }
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExecuteBody;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Няма активна потребителска сесия." }, { status: 401 });
    }

    const tokenResult = await getAdPlatformTokenRow(supabase, user.id, body.platform);
    if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
      return NextResponse.json(
        { error: "Липсва валиден токен или идентификатор на рекламен акаунт. Проверете настройките." },
        { status: 400 }
      );
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

    const logReason = `Ръчно превключване на статуса за кампания „${body.campaignName.trim() || body.campaignId}“.`;
    const logNote = typeof body.reason === "string" && body.reason.trim() ? ` Бележка: ${body.reason.trim()}` : "";
    const details = EXECUTION_LOG_DETAILS[body.action];

    try {
      const { error: logError } = await supabase.from("execution_logs").insert({
        user_id: user.id,
        platform: body.platform,
        campaign_id: body.campaignId,
        campaign_name: body.campaignName.trim() || body.campaignId,
        action_taken: body.action,
        reason: `${logReason}${logNote}`,
        details: {
          old_value: details.old_value,
          new_value: details.new_value,
          status: details.status
        }
      });
      if (logError) {
        console.warn("[api/ads/execute] execution_logs insert:", logError.message);
      }
    } catch (logErr) {
      console.warn("[api/ads/execute] execution_logs insert failed:", logErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      return NextResponse.json(
        { error: "Връзката с платформата изтече. Моля, свържете се отново.", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Възникна грешка при изпълнението на действието. Опитайте отново." },
      { status: 400 }
    );
  }
}
