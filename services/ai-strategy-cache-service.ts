import { getPrioritizedActionStableId } from "@/lib/prioritized-action-id";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuditInsight, PrioritizedAction } from "@/types";

/** Синхронизира клиенти след resolve в publish-ad (Supabase cache). */
export const AI_STRATEGY_CACHE_INVALIDATE_EVENT = "adsoptimizer:ai-strategy-cache-invalidate";

export function dispatchAiStrategyCacheInvalidate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_STRATEGY_CACHE_INVALIDATE_EVENT));
}

type PriorityActionsPayload = {
  prioritizedActions: AuditInsight["prioritizedActions"];
  killList: AuditInsight["killList"];
};

export type AiStrategyCacheLoaded = {
  insight: AuditInsight;
  lastGeneratedAt: string;
};

function parseInsight(row: {
  health_score: number | string | null;
  priority_actions: unknown;
  last_generated_at: string;
}): AiStrategyCacheLoaded | null {
  const raw = row.priority_actions as Partial<PriorityActionsPayload> | null;
  const prioritizedActionsRaw = Array.isArray(raw?.prioritizedActions) ? raw.prioritizedActions : [];
  const prioritizedActions = prioritizedActionsRaw.map((a) => {
    const action = a as PrioritizedAction;
    return { ...action, id: getPrioritizedActionStableId(action) };
  });
  const killList = Array.isArray(raw?.killList) ? raw.killList : [];
  const healthScore = Number(row.health_score);
  if (!Number.isFinite(healthScore)) return null;

  const insight: AuditInsight = {
    healthScore,
    prioritizedActions,
    killList
  };

  return { insight, lastGeneratedAt: row.last_generated_at };
}

export async function fetchAiStrategyCache(): Promise<AiStrategyCacheLoaded | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("ai_strategy_cache")
    .select("health_score, priority_actions, last_generated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[ai-strategy-cache] fetch:", error.message);
    return null;
  }
  if (!data) return null;

  return parseInsight(data);
}

export async function saveAiStrategyCache(insight: AuditInsight): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  const priority_actions: PriorityActionsPayload = {
    prioritizedActions: (insight.prioritizedActions ?? []).map((a) => ({
      ...a,
      id: getPrioritizedActionStableId(a)
    })),
    killList: insight.killList ?? []
  };

  const now = new Date().toISOString();

  const { error } = await supabase.from("ai_strategy_cache").upsert(
    {
      user_id: user.id,
      health_score: insight.healthScore,
      priority_actions,
      last_generated_at: now
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.warn("[ai-strategy-cache] upsert:", error.message);
  }
}
