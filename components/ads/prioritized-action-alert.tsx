"use client";

import type { ReactNode } from "react";

import { ActionDetailSheet } from "@/components/ads/action-detail-sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatSlashDatesToBulgarian } from "@/lib/format-insight-text";
import { ENGAGEMENT_INSIGHT_LABEL } from "@/lib/skill-agent-labels";
import type { CampaignMetrics, PrioritizedAction } from "@/types";

import { CampaignPlatformGlyph, ImpactScorePill } from "./platform-icons";

export function PrioritizedActionAlert({
  action,
  footer,
  campaign,
  targetCpa,
  /** false когато priority_actions / кешът още не са готови (пълен контекст за панела). */
  auditSnapshotReady = true
}: {
  action: PrioritizedAction;
  footer?: ReactNode;
  campaign?: CampaignMetrics | null;
  targetCpa?: number;
  auditSnapshotReady?: boolean;
}) {
  const reasonPreview = formatSlashDatesToBulgarian(action.reason);
  const taskBg = formatSlashDatesToBulgarian(action.task);
  const sheetPending = !auditSnapshotReady || !reasonPreview.trim();

  return (
    <Alert className="relative min-w-0 border-primary/40 pt-2">
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {action.platform !== "Общо" ? (
          <CampaignPlatformGlyph platform={action.platform} metaPlacement={action.metaPlacement} />
        ) : null}
        <ImpactScorePill score={action.impactScore} label="Въздействие" />
        {action.insightBasis === "engagement" ? (
          <span className="inline-flex max-w-full items-center rounded-md border border-amber-500/45 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium leading-tight text-amber-100">
            {ENGAGEMENT_INSIGHT_LABEL}
          </span>
        ) : null}
      </div>

      <AlertTitle className="mt-2 text-left text-base font-semibold leading-snug text-foreground">
        {taskBg}
      </AlertTitle>

      <AlertDescription className="mt-2 space-y-2">
        <p className="line-clamp-2 break-words text-sm text-muted-foreground">{reasonPreview}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ActionDetailSheet
            action={action}
            campaign={campaign ?? null}
            targetCpa={targetCpa}
            isDataPending={sheetPending}
            trigger={
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-teal-200">
                Виж препоръката
              </Button>
            }
          />
          {footer}
        </div>
      </AlertDescription>
    </Alert>
  );
}
