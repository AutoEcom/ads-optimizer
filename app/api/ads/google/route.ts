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

    const tokenResult = await getTokenRowWithCompat(supabase, user.id, "Google");
    if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
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
      tokenResult.accessToken,
      tokenResult.accountId,
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

async function getTokenRowWithCompat(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  platform: "Meta" | "Google"
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
