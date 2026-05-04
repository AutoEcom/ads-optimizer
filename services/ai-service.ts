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
    throw new Error("Неуспешен AI health одит.");
  }
  const result = sanitizeAuditInsightMcp((await response.json()) as AuditInsight);

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
): Promise<AdVariation[]> {
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify({ productDescription, _nonce: Math.random() }),
    cache: "no-store"
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const j = (await response.json()) as { error?: string };
      if (j?.error && typeof j.error === "string") detail = j.error;
    } catch {
      /* игнорираме */
    }
    throw new Error(detail || "Неуспешно генериране на рекламни варианти.");
  }

  return (await response.json()) as AdVariation[];
}
