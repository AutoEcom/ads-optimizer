import { NextResponse } from "next/server";

import { getAdPlatformTokenRow } from "@/lib/ad-platform-token-server";
import { addCredits, CREDIT_COSTS, deductCredits } from "@/lib/credits";
import { createAdVariant } from "@/lib/meta-ads";
import { fetchCampaignAdAccountId, metaAdAccountsMatch } from "@/lib/meta-api";
import { getPrioritizedActionStableId } from "@/lib/prioritized-action-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PrioritizedAction } from "@/types";

export const dynamic = "force-dynamic";

type Body = {
  campaign_id?: string;
  campaignId?: string;
  headline?: string;
  body_text?: string;
  text?: string;
  /** Стабилен ключ от `/creative?actionId=…` — маркира препоръката като изпълнена в `ai_strategy_cache`. */
  resolved_action_id?: string;
  campaign_name?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Няма активна сесия." }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const campaignId = (
    typeof body.campaign_id === "string" ? body.campaign_id : typeof body.campaignId === "string" ? body.campaignId : ""
  ).trim();
  const headline = typeof body.headline === "string" ? body.headline.trim() : "";
  const bodyText =
    typeof body.body_text === "string"
      ? body.body_text.trim()
      : typeof body.text === "string"
        ? body.text.trim()
        : "";
  if (!campaignId || !headline || !bodyText) {
    return NextResponse.json({ error: "Липсват campaign_id, headline или текст на обявата." }, { status: 400 });
  }

  const tokenResult = await getAdPlatformTokenRow(supabase, user.id, "Meta");
  if (tokenResult.error || !tokenResult.accessToken || !tokenResult.accountId) {
    return NextResponse.json(
      { error: "Липсва валиден Meta токен или рекламен акаунт." },
      { status: 400 }
    );
  }

  const { accountId, errorMessage } = await fetchCampaignAdAccountId(tokenResult.accessToken, campaignId);
  if (errorMessage || !accountId) {
    return NextResponse.json({ error: errorMessage ?? "Кампанията не е намерена в Meta." }, { status: 400 });
  }
  if (!metaAdAccountsMatch(tokenResult.accountId, accountId)) {
    return NextResponse.json(
      { error: "Кампанията не принадлежи на свързания Meta ad account." },
      { status: 403 }
    );
  }

  const deducted = await deductCredits(supabase, user.id, CREDIT_COSTS.DIRECT_META_PUBLISH, "DIRECT_META_PUBLISH");
  if (!deducted.success) {
    return NextResponse.json(
      { error: "INSUFFICIENT_CREDITS", code: "INSUFFICIENT_CREDITS", detail: deducted.error },
      { status: 402 }
    );
  }

  const resolvedActionId =
    typeof body.resolved_action_id === "string" ? body.resolved_action_id.trim() : "";
  const campaignNameForLog =
    typeof body.campaign_name === "string" && body.campaign_name.trim()
      ? body.campaign_name.trim()
      : campaignId;

  try {
    const result = await createAdVariant(tokenResult.accessToken, campaignId, headline, bodyText);

    try {
      if (resolvedActionId) {
        const { data: cacheRow, error: cacheFetchErr } = await supabase
          .from("ai_strategy_cache")
          .select("priority_actions")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cacheFetchErr && cacheRow?.priority_actions) {
          const raw = cacheRow.priority_actions as {
            prioritizedActions?: unknown[];
            killList?: unknown[];
          };
          const list = Array.isArray(raw.prioritizedActions) ? raw.prioritizedActions : [];
          let matched = false;
          const nextActions = list.map((entry) => {
            const a = entry as PrioritizedAction;
            const sid = getPrioritizedActionStableId(a);
            if (sid === resolvedActionId || (typeof a.id === "string" && a.id.trim() === resolvedActionId)) {
              matched = true;
              return {
                ...a,
                id: sid,
                status: "resolved" as const,
                resolvedAt: new Date().toISOString()
              };
            }
            return { ...a, id: sid };
          });
          if (matched) {
            const killList = Array.isArray(raw.killList) ? raw.killList : [];
            const { error: cacheUpdErr } = await supabase
              .from("ai_strategy_cache")
              .update({
                priority_actions: { prioritizedActions: nextActions, killList }
              })
              .eq("user_id", user.id);
            if (cacheUpdErr) {
              console.warn("[api/meta/publish-ad] ai_strategy_cache update:", cacheUpdErr.message);
            }
          }
        } else if (cacheFetchErr) {
          console.warn("[api/meta/publish-ad] ai_strategy_cache fetch:", cacheFetchErr.message);
        }
      }

      const logReason =
        resolvedActionId.length > 0
          ? `Публикувана е нова Meta обява по AI препоръка. Заглавие: ${headline.slice(0, 160)}${headline.length > 160 ? "…" : ""}`
          : `Публикувана е нова Meta обява. Заглавие: ${headline.slice(0, 160)}${headline.length > 160 ? "…" : ""}`;

      const { error: logError } = await supabase.from("execution_logs").insert({
        user_id: user.id,
        platform: "Meta",
        campaign_id: campaignId,
        campaign_name: campaignNameForLog,
        action_taken: "META_PUBLISH_CREATIVE",
        reason: logReason,
        details: {
          ad_id: result.adId,
          creative_id: result.creativeId,
          ad_set_id: result.adSetId,
          resolved_action_id: resolvedActionId || null,
          status: "success"
        }
      });
      if (logError) {
        console.warn("[api/meta/publish-ad] execution_logs insert:", logError.message);
      }
    } catch (sideEffectErr) {
      console.warn("[api/meta/publish-ad] post-publish side effects:", sideEffectErr);
    }

    return NextResponse.json({
      success: true,
      adId: result.adId,
      creativeId: result.creativeId,
      adSetId: result.adSetId,
      creditsBalance: deducted.newBalance
    });
  } catch (e) {
    await addCredits(supabase, user.id, CREDIT_COSTS.DIRECT_META_PUBLISH);
    const status =
      typeof e === "object" && e !== null && (e as Error & { status?: number }).status === 401 ? 401 : 422;
    const msg = e instanceof Error ? e.message : "Неуспешно създаване на обява в Meta.";
    if (status === 401) {
      return NextResponse.json({ error: "Връзката с Meta изтече.", code: "TOKEN_EXPIRED" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
