import { sanitizeAuditInsightMcp } from "@/lib/executable-meta-tool";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdVariation, AuditInsight, CampaignMetrics } from "@/types";
import { saveAiStrategyCache } from "@/services/ai-strategy-cache-service";
import { PLAN_LIMITS } from "@/services/profile-service";

export async function runDeepAudit(
  campaign: CampaignMetrics,
  targetCpa = 20,
  targetRoas = 2.5
): Promise<AuditInsight> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user.id)
        .maybeSingle();
      const tier = (profile?.subscription_tier ?? "beta") as "free" | "beta" | "pro";
      if (tier === "free") {
        throw new Error("PAYWALL_FEATURE_LOCKED");
      }
    }
  }

  const response = await fetch("/api/ai/audit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ campaign, targetCpa, targetRoas })
  });

  if (!response.ok) {
    throw new Error("Неуспешен AI одит.");
  }

  return (await response.json()) as AuditInsight;
}

export async function runHealthAudit(
  campaigns: CampaignMetrics[],
  targetCpa = 20,
  targetRoas = 2.5,
  businessContext?: string
): Promise<AuditInsight> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier, ai_requests_count, ai_requests_period_start")
        .eq("id", user.id)
        .maybeSingle();

      const tier = (profile?.subscription_tier ?? "beta") as "free" | "beta" | "pro";
      const currentPeriod = new Date();
      const currentPeriodStart = `${currentPeriod.getFullYear()}-${String(currentPeriod.getMonth() + 1).padStart(2, "0")}-01`;
      const storedPeriod = profile?.ai_requests_period_start ?? currentPeriodStart;

      let count = profile?.ai_requests_count ?? 0;
      if (storedPeriod < currentPeriodStart) {
        await supabase
          .from("profiles")
          .update({
            ai_requests_count: 0,
            ai_requests_period_start: currentPeriodStart
          })
          .eq("id", user.id);
        count = 0;
      }

      const limit = PLAN_LIMITS[tier] ?? 20;

      if (count >= limit) {
        throw new Error("PAYWALL_LIMIT_REACHED");
      }
    }
  }

  const response = await fetch("/api/ai/audit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ campaigns, targetCpa, targetRoas, businessContext })
  });

  if (!response.ok) {
    if (response.status === 402) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
    throw new Error("Неуспешен AI health одит.");
  }
  const raw = (await response.json()) as AuditInsight & { creditsBalance?: number };
  const result = sanitizeAuditInsightMcp({
    campaignId: raw.campaignId,
    healthScore: raw.healthScore,
    prioritizedActions: raw.prioritizedActions ?? [],
    killList: raw.killList ?? [],
    creditsBalance: raw.creditsBalance
  });

  await saveAiStrategyCache(result);

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("ai_requests_count, ai_requests_period_start")
        .eq("id", user.id)
        .maybeSingle();

      const currentPeriod = new Date();
      const currentPeriodStart = `${currentPeriod.getFullYear()}-${String(currentPeriod.getMonth() + 1).padStart(2, "0")}-01`;
      const storedPeriod = profile?.ai_requests_period_start ?? currentPeriodStart;
      const count = storedPeriod < currentPeriodStart ? 0 : profile?.ai_requests_count ?? 0;

      await supabase
        .from("profiles")
        .update({
          ai_requests_count: count + 1,
          ai_requests_period_start: currentPeriodStart
        })
        .eq("id", user.id);
    }
  }

  return result;
}

export async function executeCampaignAction(args: {
  platform: "Meta" | "Google";
  campaignId: string;
  campaignName: string;
  action: "PAUSE" | "ACTIVATE";
  reason: string;
}) {
  const response = await fetch("/api/ads/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });

  if (!response.ok) {
    throw new Error("Неуспешно изпълнение.");
  }
}

export async function generateAdVariations(
  productDescription: string
): Promise<{ variants: AdVariation[]; creditsBalance?: number }> {
  const response = await fetch("/api/ai/creative/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify({ productDescription, _nonce: Math.random() }),
    cache: "no-store"
  });

  if (!response.ok) {
    let j: { error?: string; code?: string } = {};
    try {
      j = (await response.json()) as { error?: string; code?: string };
    } catch {
      /* ignore */
    }
    if (response.status === 402 || j.code === "INSUFFICIENT_CREDITS") {
      throw new Error("INSUFFICIENT_CREDITS");
    }
    const detail = j?.error && typeof j.error === "string" ? j.error : `HTTP ${response.status}`;
    throw new Error(detail || "Неуспешно генериране на рекламни варианти.");
  }

  const raw: unknown = await response.json();
  if (Array.isArray(raw)) {
    return { variants: raw as AdVariation[] };
  }
  if (raw && typeof raw === "object") {
    const o = raw as { variants?: AdVariation[]; creditsBalance?: number };
    return { variants: o.variants ?? [], creditsBalance: o.creditsBalance };
  }
  return { variants: [] };
}
