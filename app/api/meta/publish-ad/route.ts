import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { addCredits, CREDIT_COSTS, deductCredits } from "@/lib/credits";
import { createAdVariant } from "@/lib/meta-ads";
import { fetchCampaignAdAccountId, metaAdAccountsMatch } from "@/lib/meta-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  campaign_id?: string;
  campaignId?: string;
  headline?: string;
  body_text?: string;
  text?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const campaignId = (
    typeof body.campaign_id === "string" ? body.campaign_id : typeof body.campaignId === "string" ? body.campaignId : ""
  ).trim();
  const headline = typeof body.headline === "string" ? body.headline.trim() : "";
  const bodyText =
    typeof body.body_text === "string"
      ? body.body_text.trim()
      : typeof body.text === "string"
        ? body.text.trim()
        : "";
  if (!campaignId || !headline || !bodyText) {
    return NextResponse.json({ error: "Липсват campaign_id, headline или текст на обявата." }, { status: 400 });
  }

  const tokenResult = await getAdPlatformTokenRow(supabase, user.id, "Meta");
  if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
    return NextResponse.json(
      { error: "Липсва валиден Meta токен или рекламен акаунт." },
      { status: 400 }
    );
  }

  const { accountId, errorMessage } = await fetchCampaignAdAccountId(tokenResult.accessToken, campaignId);
  if (errorMessage || !accountId) {
    return NextResponse.json({ error: errorMessage ?? "Кампанията не е намерена в Meta." }, { status: 400 });
  }
  if (!metaAdAccountsMatch(tokenResult.accountId, accountId)) {
    return NextResponse.json(
      { error: "Кампанията не принадлежи на свързания Meta ad account." },
      { status: 403 }
    );
  }

  const deducted = await deductCredits(supabase, user.id, CREDIT_COSTS.DIRECT_META_PUBLISH, "DIRECT_META_PUBLISH");
  if (!deducted.success) {
    return NextResponse.json(
      { error: "INSUFFICIENT_CREDITS", code: "INSUFFICIENT_CREDITS", detail: deducted.error },
      { status: 402 }
    );
  }

  try {
    const result = await createAdVariant(tokenResult.accessToken, campaignId, headline, bodyText);

    return NextResponse.json({
      success: true,
      adId: result.adId,
      creativeId: result.creativeId,
      adSetId: result.adSetId,
      creditsBalance: deducted.newBalance
    });
  } catch (e) {
    await addCredits(supabase, user.id, CREDIT_COSTS.DIRECT_META_PUBLISH);
    const status =
      typeof e === "object" && e !== null && (e as Error & { status?: number }).status === 401 ? 401 : 422;
    const msg = e instanceof Error ? e.message : "Неуспешно създаване на обява в Meta.";
    if (status === 401) {
      return NextResponse.json({ error: "Връзката с Meta изтече.", code: "TOKEN_EXPIRED" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
