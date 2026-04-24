import { NextResponse } from "next/server";

import { fetchGoogleCampaigns } from "@/lib/google-api";
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

    const { data: tokenRow, error: tokenError } = await supabase
      .from("ad_platform_tokens")
      .select("access_token,ad_account_id")
      .eq("user_id", user.id)
      .eq("platform", "Google")
      .eq("is_active", true)
      .maybeSingle();

    if (tokenError || !tokenRow?.access_token || !tokenRow?.ad_account_id) {
      return NextResponse.json(
        { error: "Моля, въведете валиден Google Token в настройките." },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("target_cpa")
      .eq("user_id", user.id)
      .maybeSingle();

    const targetCpa = Number(profile?.target_cpa ?? 20);
    const result = await fetchGoogleCampaigns(
      tokenRow.access_token,
      tokenRow.ad_account_id,
      targetCpa
    );

    return NextResponse.json(result);
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      return NextResponse.json(
        { error: "Моля, въведете валиден Google Token в настройките.", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Моля, въведете валиден Google Token в настройките." },
      { status: 400 }
    );
  }
}
