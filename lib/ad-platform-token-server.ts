import type { SupabaseClient } from "@supabase/supabase-js";

import type { Platform } from "@/types";

export function isMissingAdAccountColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("ad_account_id") && message.includes("schema cache");
}

/** Активен access token + ad/customer id за Meta/Google (съвместимост с legacy колона account_id). */
export async function getAdPlatformTokenRow(
  supabase: SupabaseClient,
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
