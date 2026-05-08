import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Platform } from "@/types";

export type PlatformConnectionStatus = {
  platform: Platform;
  isConnected: boolean;
  isActive: boolean;
  accountId: string | null;
  maskedToken: string | null;
  refreshTokenMasked: string | null;
  tokenExpiresAt: string | null;
  updatedAt: string | null;
};

export type MetaAdAccountOption = {
  id: string;
  name: string;
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
  adAccountId?: string,
  refreshToken?: string | null,
  tokenExpiresAt?: string | null
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
    refresh_token: refreshToken?.trim() || null,
    token_expires_at: tokenExpiresAt ?? null,
    ad_account_id: sanitizedAccountId,
    is_active: true
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("ad_platform_tokens")
    .update({
      access_token: sanitizedToken,
      refresh_token: refreshToken?.trim() || null,
      token_expires_at: tokenExpiresAt ?? null,
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
        refreshToken: refreshToken?.trim() || null,
        tokenExpiresAt: tokenExpiresAt ?? null,
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
        refreshToken: refreshToken?.trim() || null,
        tokenExpiresAt: tokenExpiresAt ?? null,
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
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  accountId: string | null;
}) {
  const { supabase, userId, platform, accessToken, refreshToken, tokenExpiresAt, accountId } = args;

  const { data: legacyUpdatedRows, error: legacyUpdateError } = await supabase
    .from("ad_platform_tokens")
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
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
    refresh_token: refreshToken,
    token_expires_at: tokenExpiresAt,
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
    .select("access_token,refresh_token,token_expires_at,ad_account_id,is_active,updated_at")
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
      refreshTokenMasked: maskToken(primary.data?.refresh_token),
      tokenExpiresAt: primary.data?.token_expires_at ?? null,
      updatedAt: primary.data?.updated_at ?? null
    };
  }

  const legacy = await supabase
    .from("ad_platform_tokens")
    .select("access_token,refresh_token,token_expires_at,account_id,is_active,updated_at")
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
    refreshTokenMasked: maskToken(legacy.data?.refresh_token),
    tokenExpiresAt: legacy.data?.token_expires_at ?? null,
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

  const { error } = await supabase.from("ad_platform_tokens").delete().eq("user_id", user.id).eq("platform", platform);

  if (error) throw error;
}

export async function updatePlatformAccountId(platform: Platform, accountId: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Няма активна сесия.");

  const sanitizedAccountId = accountId.trim();
  if (!sanitizedAccountId) throw new Error("Избери рекламен акаунт.");

  const { error: primaryError } = await supabase
    .from("ad_platform_tokens")
    .update({ ad_account_id: sanitizedAccountId, is_active: true })
    .eq("user_id", user.id)
    .eq("platform", platform);
  if (!isMissingAdAccountColumnError(primaryError)) {
    if (primaryError) throw primaryError;
    return;
  }

  const { error: legacyError } = await supabase
    .from("ad_platform_tokens")
    .update({ account_id: sanitizedAccountId, is_active: true })
    .eq("user_id", user.id)
    .eq("platform", platform);
  if (legacyError) throw legacyError;
}

export async function fetchMetaAdAccounts(): Promise<MetaAdAccountOption[]> {
  const response = await fetch("/api/settings/meta-adaccounts", { cache: "no-store" });
  const payload = (await response.json()) as {
    accounts?: MetaAdAccountOption[];
    error?: string;
    warning?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Неуспешно зареждане на Meta акаунтите.");
  }
  if (payload.warning) {
    return [];
  }
  return payload.accounts ?? [];
}

export async function startPlatformOAuth(platform: Platform) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");

  const isMeta = platform === "Meta";
  const provider = isMeta ? "facebook" : "google";
  const redirectTo = `${window.location.origin}/settings?oauth=${isMeta ? "meta" : "google"}`;
  const scopes = isMeta
    ? "ads_management ads_read business_management pages_read_engagement"
    : "https://www.googleapis.com/auth/adwords";
  const queryParams = isMeta
    ? undefined
    : {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true"
      };

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      scopes,
      queryParams
    }
  });
  if (error) throw error;
  if (data.url) {
    window.location.assign(data.url);
  }
}

export async function syncOAuthTokenFromSession(platform: Platform) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Липсва Supabase конфигурация.");
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session?.provider_token) {
    throw new Error("OAuth сесията не върна provider token.");
  }

  const tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();
  await upsertPlatformToken(
    platform,
    session.provider_token,
    undefined,
    session.provider_refresh_token ?? null,
    tokenExpiresAt
  );
}

export async function checkPlatformTokenHealth(platform: Platform): Promise<{ valid: boolean; expiresSoon: boolean }> {
  const response = await fetch(`/api/settings/token-health?platform=${platform}`, { cache: "no-store" });
  const payload = (await response.json()) as { valid?: boolean; expiresSoon?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Неуспешна проверка на токена.");
  }
  return {
    valid: Boolean(payload.valid),
    expiresSoon: Boolean(payload.expiresSoon)
  };
}

function maskToken(token?: string | null) {
  if (!token) return null;
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
