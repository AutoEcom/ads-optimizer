import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { fetchMetaCampaigns } from "@/lib/meta-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
    }

    const tokenResult = await getAdPlatformTokenRow(supabase, user.id, "Meta");
    if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
      return NextResponse.json(
        { error: "Моля, въведете валиден Meta Token в настройките." },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("target_cpa")
      .eq("user_id", user.id)
      .maybeSingle();

    const targetCpa = Number(profile?.target_cpa ?? 20);
    const result = await fetchMetaCampaigns(
      tokenResult.accessToken,
      tokenResult.accountId,
      targetCpa
    );

    return NextResponse.json(result);
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      return NextResponse.json(
        { error: "Моля, въведете валиден Meta Token в настройките.", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Моля, въведете валиден Meta Token в настройките." },
      { status: 400 }
    );
  }
}

