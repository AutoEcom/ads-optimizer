import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Platform } from "@/types";

export async function upsertUserTargets(targetCpa: number, targetRoas: number) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Няма активна сесия.");

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      target_cpa: targetCpa,
      target_roas: targetRoas
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
}

export async function getUserTargets() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Няма активна сесия.");

  const { data, error } = await supabase
    .from("user_profiles")
    .select("target_cpa,target_roas")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    targetCpa: data?.target_cpa ?? null,
    targetRoas: data?.target_roas ?? null
  };
}

export async function upsertPlatformToken(
  platform: Platform,
  accessToken: string,
  adAccountId?: string
) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Няма активна сесия.");

  const { error } = await supabase.from("ad_platform_tokens").upsert(
    {
      user_id: user.id,
      platform,
      access_token: accessToken,
      ad_account_id: adAccountId ?? null,
      is_active: true
    },
    { onConflict: "user_id,platform" }
  );

  if (error) throw error;
}
