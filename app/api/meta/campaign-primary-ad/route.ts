import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { logAction } from "@/lib/logger";
import {
  fetchCampaignAdsForFallback,
  findPrimaryTemplateAdIdForCampaign,
  pickFirstActivePausedAdIdFromList
} from "@/lib/meta-ads";
import { fetchCampaignAdAccountId, metaAdAccountsMatch } from "@/lib/meta-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawParam = searchParams.get("campaign_id") ?? searchParams.get("campaignId") ?? "";
  const campaignId = rawParam.trim();

  if (!campaignId) {
    return NextResponse.json({ error: "Липсва campaign_id или campaignId в query string." }, { status: 400 });
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
    return NextResponse.json({ error: "Кампанията не е в свързания ad account." }, { status: 403 });
  }

  let adId = await findPrimaryTemplateAdIdForCampaign(tokenResult.accessToken, campaignId);

  if (!adId) {
    try {
      const ads = await fetchCampaignAdsForFallback(tokenResult.accessToken, campaignId);
      const fallbackId = pickFirstActivePausedAdIdFromList(ads);
      if (fallbackId) {
        adId = fallbackId;
      }
    } catch (e) {
      const status = typeof e === "object" && e !== null ? (e as Error & { status?: number }).status : undefined;
      if (status === 401) {
        return NextResponse.json({ error: "Връзката с Meta изтече.", code: "TOKEN_EXPIRED" }, { status: 401 });
      }
      console.error("[campaign-primary-ad] campaign-level ads fallback failed", e);
    }
  }

  logAction("meta_campaign_primary_ad_lookup", {
    campaignId,
    adId: adId ?? null,
    matched: Boolean(adId)
  });

  if (!adId) {
    return NextResponse.json({
      adId: null,
      note:
        "Не намерихме подходяща обява: нито шаблон с object_story_spec, нито ACTIVE/PAUSED обява от GET /{campaign_id}/ads."
    });
  }

  return NextResponse.json({ adId });
}
