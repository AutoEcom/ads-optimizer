import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Platform } from "@/types";

export type PlatformConnectionStatus = {
  platform: Platform;
  isConnected: boolean;
  isActive: boolean;
  accountId: string | null;
  maskedToken: string | null;
  updatedAt: string | null;
};

export async function upsertUserTargets(targetCpa: number, targetRoas: number) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Няма активна сесия.");

  const payload = {
    user_id: user.id,
    target_cpa: targetCpa,
    target_roas: targetRoas
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("user_profiles")
    .update({
      target_cpa: targetCpa,
      target_roas: targetRoas
    })
    .eq("user_id", user.id)
    .select("user_id");

  if (updateError) throw updateError;
  if ((updatedRows ?? []).length > 0) return;

  const { error: insertError } = await supabase.from("user_profiles").insert(payload);
  if (insertError) throw insertError;
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

  const sanitizedToken = accessToken.trim();
  const sanitizedAccountId = adAccountId?.trim() || null;
  if (!sanitizedToken) {
    throw new Error(`Липсва ${platform} access token.`);
  }

  const payload = {
    user_id: user.id,
    platform,
    access_token: sanitizedToken,
    ad_account_id: sanitizedAccountId,
    is_active: true
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("ad_platform_tokens")
    .update({
      access_token: sanitizedToken,
      ad_account_id: sanitizedAccountId,
      is_active: true
    })
    .eq("user_id", user.id)
    .eq("platform", platform)
    .select("id");

  if (updateError) {
    if (isMissingAdAccountColumnError(updateError)) {
      await upsertPlatformTokenLegacyAccountId({
        supabase,
        userId: user.id,
        platform,
        accessToken: sanitizedToken,
        accountId: sanitizedAccountId
      });
      return;
    }
    throw updateError;
  }
  if ((updatedRows ?? []).length > 0) return;

  const { error: insertError } = await supabase.from("ad_platform_tokens").insert(payload);
  if (insertError) {
    if (isMissingAdAccountColumnError(insertError)) {
      await upsertPlatformTokenLegacyAccountId({
        supabase,
        userId: user.id,
        platform,
        accessToken: sanitizedToken,
        accountId: sanitizedAccountId
      });
      return;
    }
    throw insertError;
  }
}

function isMissingAdAccountColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("ad_account_id") && message.includes("schema cache");
}

async function upsertPlatformTokenLegacyAccountId(args: {
  supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>;
  userId: string;
  platform: Platform;
  accessToken: string;
  accountId: string | null;
}) {
  const { supabase, userId, platform, accessToken, accountId } = args;

  const { data: legacyUpdatedRows, error: legacyUpdateError } = await supabase
    .from("ad_platform_tokens")
    .update({
      access_token: accessToken,
      account_id: accountId,
      is_active: true
    })
    .eq("user_id", userId)
    .eq("platform", platform)
    .select("id");

  if (legacyUpdateError) throw legacyUpdateError;
  if ((legacyUpdatedRows ?? []).length > 0) return;

  const { error: legacyInsertError } = await supabase.from("ad_platform_tokens").insert({
    user_id: userId,
    platform,
    access_token: accessToken,
    account_id: accountId,
    is_active: true
  });

  if (legacyInsertError) throw legacyInsertError;
}

export async function getPlatformConnectionStatus(platform: Platform): Promise<PlatformConnectionStatus> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Няма активна сесия.");

  const primary = await supabase
    .from("ad_platform_tokens")
    .select("access_token,ad_account_id,is_active,updated_at")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!isMissingAdAccountColumnError(primary.error)) {
    return {
      platform,
      isConnected: Boolean(primary.data?.access_token && primary.data?.is_active),
      isActive: Boolean(primary.data?.is_active),
      accountId: primary.data?.ad_account_id ?? null,
      maskedToken: maskToken(primary.data?.access_token),
      updatedAt: primary.data?.updated_at ?? null
    };
  }

  const legacy = await supabase
    .from("ad_platform_tokens")
    .select("access_token,account_id,is_active,updated_at")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacy.error) throw legacy.error;

  return {
    platform,
    isConnected: Boolean(legacy.data?.access_token && legacy.data?.is_active),
    isActive: Boolean(legacy.data?.is_active),
    accountId: legacy.data?.account_id ?? null,
    maskedToken: maskToken(legacy.data?.access_token),
    updatedAt: legacy.data?.updated_at ?? null
  };
}

export async function disconnectPlatformToken(platform: Platform) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Няма активна сесия.");

  const { error } = await supabase
    .from("ad_platform_tokens")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("platform", platform);

  if (error) throw error;
}

function maskToken(token?: string | null) {
  if (!token) return null;
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
