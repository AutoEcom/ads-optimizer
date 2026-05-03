"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSlashDatesToBulgarian } from "@/lib/format-insight-text";
import { skillTypeToAgentLabel } from "@/lib/skill-agent-labels";
import { cn, formatCurrencyLatin } from "@/lib/utils";
import type { CampaignMetrics, PrioritizedAction } from "@/types";

import { CampaignPlatformGlyph } from "./platform-icons";

type ActionDetailSheetProps = {
  action: PrioritizedAction;
  campaign: CampaignMetrics | null;
  targetCpa?: number;
  /** Липсват priority_actions, пълен одит или текст на препоръката — показва се скелетон. */
  isDataPending?: boolean;
  trigger: ReactNode;
};

function projectedFromCampaign(
  campaign: CampaignMetrics | null,
  action: PrioritizedAction,
  targetCpa?: number
) {
  if (!campaign) return null;
  const spend = campaign.spend;
  const cpa = campaign.cpa;
  const factor = Math.min(0.92, 0.75 + action.impactScore / 400);
  const optSpend = spend * factor;
  let optCpa = cpa > 0 ? cpa * (0.88 + (100 - action.impactScore) / 500) : 0;
  if (targetCpa && targetCpa > 0 && cpa > 0 && cpa > targetCpa) {
    optCpa = Math.min(optCpa, (cpa + targetCpa) / 2);
  }
  return {
    spend: Number(optSpend.toFixed(2)),
    cpa: Number(Math.max(0, optCpa).toFixed(2))
  };
}

export function ActionDetailSheet({ action, campaign, targetCpa, isDataPending, trigger }: ActionDetailSheetProps) {
  const reasonFormatted = formatSlashDatesToBulgarian(action.reason ?? "");
  const agentLabel = skillTypeToAgentLabel(action.type);
  const currency = campaign?.currencyCode ?? "EUR";
  const projected = projectedFromCampaign(campaign, action, targetCpa);
  const showSkeleton = Boolean(isDataPending) || !reasonFormatted.trim();

  const campaignTitle = campaign?.campaignName ?? (action.campaignId ? "Кампания" : "Общ преглед");

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="space-y-3 border-b border-border/60 pb-4 text-left">
          <div className="flex items-start gap-3 pr-8">
            {action.platform !== "Общо" ? (
              <div className="shrink-0 scale-110 pt-0.5">
                <CampaignPlatformGlyph platform={action.platform} metaPlacement={action.metaPlacement} />
              </div>
            ) : null}
            <div className="min-w-0 flex-1 space-y-2">
              <SheetTitle className="text-balance text-xl leading-snug">
                {formatSlashDatesToBulgarian(campaignTitle)}
              </SheetTitle>
              <SheetDescription className="text-muted-foreground">
                {action.platform === "Общо" ? "Общ преглед" : `${action.platform} · препоръка`}
              </SheetDescription>
            </div>
          </div>
          <p className="text-xs font-medium text-teal-200/90">
            Анализ от: <span className="text-teal-100">{agentLabel}</span>
          </p>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 py-6">
          {showSkeleton ? (
            <div className="space-y-3" aria-busy="true">
              <p className="text-sm text-muted-foreground">Данните се зареждат…</p>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Детайлен анализ</h3>
                <div
                  className={cn(
                    "max-w-none space-y-3 text-sm leading-relaxed text-muted-foreground",
                    " [&_p+p]:mt-3"
                  )}
                >
                  <p className="whitespace-pre-wrap">{reasonFormatted}</p>
                </div>
              </section>

              {campaign ? (
                <section className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold text-foreground">Прогнозно въздействие</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Текущо състояние</p>
                      <p className="text-sm text-foreground">CPA: {formatCurrencyLatin(campaign.cpa, currency)}</p>
                      <p className="text-sm text-foreground">Разход: {formatCurrencyLatin(campaign.spend, currency)}</p>
                      <p className="text-sm text-foreground">Конверсии: {campaign.conversions}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-teal-200/90">Оптимизирано състояние</p>
                      {projected ? (
                        <>
                          <p className="text-sm text-teal-100">CPA: ~{formatCurrencyLatin(projected.cpa, currency)}</p>
                          <p className="text-sm text-teal-100">Разход: ~{formatCurrencyLatin(projected.spend, currency)}</p>
                          <p className="text-xs text-muted-foreground">Ориентировъчна прогноза при изпълнение на препоръките.</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Няма достатъчно данни за прогноза.</p>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>

        <div className="mt-auto border-t border-border/60 pt-4">
          <Button type="button" variant="outline" className="w-full" disabled title="Предстои имплементация">
            Изпълни автоматично
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
