"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Bot, ChevronDown, ChevronUp } from "lucide-react";

import { ActionDetailSheet } from "@/components/ads/action-detail-sheet";
import { Button } from "@/components/ui/button";
import { formatSlashDatesToBulgarian } from "@/lib/format-insight-text";
import { getSkillAgentVisualTheme, skillTypeToAgentLabel } from "@/lib/skill-agent-labels";
import { cn } from "@/lib/utils";
import type { CampaignMetrics, PrioritizedAction, PrioritizedActionGroup } from "@/types";

import { CampaignPlatformGlyph, ImpactScorePill, PlatformCornerBadge } from "./platform-icons";

type GroupedActionCardProps = {
  group: PrioritizedActionGroup;
  getCampaign: (action: PrioritizedAction) => CampaignMetrics | null;
  targetCpa?: number;
  auditSnapshotReady?: boolean;
  childFooter?: (action: PrioritizedAction) => ReactNode;
};

export function GroupedActionCard({
  group,
  getCampaign,
  targetCpa,
  auditSnapshotReady = true,
  childFooter
}: GroupedActionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const sheetPending =
    !auditSnapshotReady ||
    group.children.some((c) => !formatSlashDatesToBulgarian(c.reason ?? "").trim());
  const theme = getSkillAgentVisualTheme(group.type);
  const agentLabel = skillTypeToAgentLabel(group.type);
  const n = group.children.length;
  const maxImpact = Math.max(...group.children.map((c) => c.impactScore), 0);
  const rep = group.children[0];

  return (
    <div className="relative pt-2">
      <div
        className="pointer-events-none absolute left-2 right-2 top-0 z-0 h-full rounded-lg border border-primary/25 bg-card/40 shadow-sm"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1 right-1 top-1 z-[1] h-full rounded-lg border border-primary/30 bg-card/55 shadow-sm"
        aria-hidden
      />

      <div className="relative z-[2] rounded-lg border border-primary/45 bg-card pt-2 shadow-md">
        <div className="absolute right-3 top-3 z-[3]">
          <PlatformCornerBadge platform={rep.platform} metaPlacement={rep.metaPlacement} />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pr-20 pt-1">
          <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg p-1.5", theme.iconWrapClass)}>
            <Bot className={cn("h-4 w-4", theme.iconClass)} aria-hidden />
          </span>
          <ImpactScorePill score={maxImpact} label="Макс. въздействие" />
        </div>

        <div className="space-y-2 px-4 pb-3 pt-2">
          <p className={cn("pr-16 text-left text-sm font-medium leading-snug", theme.agentLineClass)}>
            {agentLabel} откри <span className="font-semibold text-foreground/95">{n}</span> подобни оптимизации
          </p>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {formatSlashDatesToBulgarian(rep.task)} и още {n - 1} кампании със същия тип препоръка.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-border/70"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="mr-1 h-3.5 w-3.5" />
                  Свий
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-3.5 w-3.5" />
                  Разгъни
                </>
              )}
            </Button>
            <ActionDetailSheet
              group={group}
              getCampaign={getCampaign}
              targetCpa={targetCpa}
              isDataPending={sheetPending}
              trigger={
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-teal-200">
                  Виж препоръките
                </Button>
              }
            />
          </div>

          <div
            className={cn(
              "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out",
              expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}
          >
            <div className="min-h-0">
              <ul className="mt-2 space-y-2 rounded-md border border-border/50 bg-muted/15 p-3 text-sm">
                {group.children.map((child, idx) => {
                  const camp = getCampaign(child);
                  const title = camp?.campaignName ?? child.task;
                  return (
                    <li
                      key={`${child.campaignId ?? "row"}-${idx}`}
                      className="flex flex-col gap-2 rounded-md border border-border/40 bg-background/40 p-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {child.platform !== "Общо" ? (
                          <CampaignPlatformGlyph platform={child.platform} metaPlacement={child.metaPlacement} />
                        ) : null}
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {formatSlashDatesToBulgarian(title)}
                        </span>
                        <ImpactScorePill score={child.impactScore} label="Въздействие" />
                      </div>
                      {childFooter ? <div className="flex shrink-0 flex-wrap gap-2">{childFooter(child)}</div> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
