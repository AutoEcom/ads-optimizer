import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { CreativeExtractionError, fetchAdCreativeContentForGraphAd } from "@/lib/meta-ads";
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
  const adId = (searchParams.get("ad_id") ?? searchParams.get("adId") ?? "").trim();
  if (!adId) {
    return NextResponse.json({ error: "Липсва ad_id." }, { status: 400 });
  }

  const tokenResult = await getAdPlatformTokenRow(supabase, user.id, "Meta");
  if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
    return NextResponse.json(
      { error: "Липсва валиден Meta токен или рекламен акаунт." },
      { status: 400 }
    );
  }

  try {
    const content = await fetchAdCreativeContentForGraphAd(
      tokenResult.accessToken,
      tokenResult.accountId,
      adId
    );
    return NextResponse.json({
      adId,
      adName: content.adName,
      headline: content.headline,
      bodyText: content.bodyText
    });
  } catch (e) {
    if (e instanceof CreativeExtractionError) {
      console.error(
        "[ad-content] creative extraction failed — raw ad_creative JSON",
        JSON.stringify(
          {
            adId,
            adName: e.adName,
            creative: e.rawCreative
          },
          null,
          2
        )
      );
    }
    const status =
      typeof e === "object" && e !== null && (e as Error & { status?: number }).status === 401 ? 401 : 422;
    const msg = e instanceof Error ? e.message : "Неуспешно зареждане на обявата.";
    if (status === 401) {
      return NextResponse.json({ error: "Връзката с Meta изтече.", code: "TOKEN_EXPIRED" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
