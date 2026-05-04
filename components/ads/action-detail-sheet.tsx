"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
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
import { META_ADS_SWR_KEY } from "@/hooks/use-ad-platform-connection";
import { formatSlashDatesToBulgarian } from "@/lib/format-insight-text";
import { getSkillAgentVisualTheme, skillTypeToAgentLabel } from "@/lib/skill-agent-labels";
import { cn, formatCurrencyLatin } from "@/lib/utils";
import type { CampaignMetrics, ExecutableMetaToolName, PrioritizedAction } from "@/types";

import { CampaignPlatformGlyph } from "./platform-icons";

type ActionDetailSheetProps = {
  action: PrioritizedAction;
  campaign: CampaignMetrics | null;
  targetCpa?: number;
  /** Липсват priority_actions, пълен одит или текст на препоръката — показва се скелетон. */
  isDataPending?: boolean;
  trigger: ReactNode;
};

type McpRequestBody = {
  tool: ExecutableMetaToolName;
  campaign_id: string;
  new_budget?: number;
  new_name?: string;
};

type PendingExecution = {
  body: McpRequestBody;
  explanation: string;
  summaryLines: string[];
};

function buildPendingExecution(
  action: PrioritizedAction,
  campaign: CampaignMetrics | null,
  targetCpaProp?: number
): PendingExecution | null {
  if (!campaign || campaign.platform !== "Meta" || !campaign.id.trim()) return null;
  const cid = campaign.id.trim();
  const cur = campaign.currencyCode ?? "EUR";
  const ext = action.executable_tool;

  if (ext && typeof ext.parameters?.campaign_id === "string") {
    const extCid = String(ext.parameters.campaign_id).trim();
    if (extCid === cid) {
      if (ext.name === "adjust_budget") {
        const nb = ext.parameters.new_budget;
        if (typeof nb === "number" && Number.isFinite(nb) && nb > 0) {
          return {
            body: { tool: "adjust_budget", campaign_id: cid, new_budget: nb },
            explanation: ext.explanation,
            summaryLines: [`Дневният бюджет ще бъде зададен на ${formatCurrencyLatin(nb, cur)}.`]
          };
        }
      }
      if (ext.name === "pause_campaign") {
        return {
          body: { tool: "pause_campaign", campaign_id: cid },
          explanation: ext.explanation,
          summaryLines: ["Кампанията ще бъде поставена на пауза (PAUSED)."]
        };
      }
      if (ext.name === "rename_campaign") {
        const nn = ext.parameters.new_name;
        if (typeof nn === "string" && nn.trim()) {
          return {
            body: { tool: "rename_campaign", campaign_id: cid, new_name: nn.trim() },
            explanation: ext.explanation,
            summaryLines: [`Името на кампанията ще бъде променено на „${nn.trim()}“ (тест).`]
          };
        }
      }
    }
  }

  if (action.actionType === "PAUSE") {
    return {
      body: { tool: "pause_campaign", campaign_id: cid },
      explanation: ext?.explanation?.trim() || formatSlashDatesToBulgarian(action.reason),
      summaryLines: ["Кампанията ще бъде поставена на пауза (PAUSED)."]
    };
  }
  if (action.type === "BUDGET_SUFFICIENCY" && targetCpaProp && targetCpaProp > 0) {
    const suggested = Math.round(Math.max(targetCpaProp * 5, campaign.spend * 1.1, 1) * 100) / 100;
    return {
      body: { tool: "adjust_budget", campaign_id: cid, new_budget: suggested },
      explanation: ext?.explanation?.trim() || formatSlashDatesToBulgarian(action.reason),
      summaryLines: [
        `Дневният бюджет ще бъде зададен на ${formatCurrencyLatin(suggested, cur)} (препоръчана стойност: max(5× целеви CPA, 110% от текущия разход)).`
      ]
    };
  }

  return null;
}

function projectedFromCampaign(
  campaign: CampaignMetrics | null,
  action: PrioritizedAction,
  targetCpa?: number
): { spend: number; cpa: number | null } | null {
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
    cpa: cpa > 0 && Number.isFinite(optCpa) && optCpa > 0 ? Number(Math.max(0, optCpa).toFixed(2)) : null
  };
}

export function ActionDetailSheet({ action, campaign, targetCpa, isDataPending, trigger }: ActionDetailSheetProps) {
  const { mutate } = useSWRConfig();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [executionSuccess, setExecutionSuccess] = useState(false);
  const [pending, setPending] = useState<PendingExecution | null>(null);

  const reasonFormatted = formatSlashDatesToBulgarian(action.reason ?? "");
  const agentLabel = skillTypeToAgentLabel(action.type);
  const agentTheme = getSkillAgentVisualTheme(action.type);
  const currency = campaign?.currencyCode ?? "EUR";
  const projected = projectedFromCampaign(campaign, action, targetCpa);
  const showSkeleton = Boolean(isDataPending) || !reasonFormatted.trim();

  const campaignTitle = campaign?.campaignName ?? (action.campaignId ? "Кампания" : "Общ преглед");

  const canUseMetaMcp =
    !showSkeleton && campaign && campaign.platform === "Meta" && Boolean(campaign.id);

  const pendingResolved = buildPendingExecution(action, campaign, targetCpa);
  const canRunAuto = Boolean(canUseMetaMcp && pendingResolved);

  useEffect(() => {
    setExecutionSuccess(false);
    setConfirmOpen(false);
    setPending(null);
    setConfirmBusy(false);
    setMcpRunning(false);
  }, [action.task, action.campaignId, campaign?.id]);

  function openConfirmDialog() {
    const p = buildPendingExecution(action, campaign, targetCpa);
    if (!p) return;
    setPending(p);
    setConfirmOpen(true);
  }

  async function executePendingMcp() {
    if (!pending) return;
    setConfirmBusy(true);
    setMcpRunning(true);
    try {
      const res = await fetch("/api/ai/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.body)
      });
      const payload = (await res.json()) as { success?: boolean; error?: string; code?: string };
      if (!res.ok || !payload.success) {
        if (res.status === 401 || payload.code === "TOKEN_EXPIRED") {
          toast.error("Токенът изтече", {
            description: "Свържи отново Meta в Настройки."
          });
          return;
        }
        toast.error("Действието не успя", { description: payload.error ?? "Неуспешно изпълнение." });
        return;
      }
      toast.success("Изпълнено", {
        description:
          pending.body.tool === "pause_campaign"
            ? "Кампанията е паузирана чрез Meta MCP."
            : pending.body.tool === "adjust_budget" && pending.body.new_budget != null
              ? `Дневният бюджет е обновен до ${formatCurrencyLatin(pending.body.new_budget, currency)}.`
              : pending.body.tool === "rename_campaign" && pending.body.new_name
                ? `Името на кампанията е обновено до „${pending.body.new_name}“.`
                : "Промяната е записана в Meta."
      });
      setExecutionSuccess(true);
      setConfirmOpen(false);
      await mutate(META_ADS_SWR_KEY);
    } catch {
      toast.error("Мрежова грешка", { description: "Опитай отново след малко." });
    } finally {
      setConfirmBusy(false);
      setMcpRunning(false);
    }
  }

  const effectiveCpa =
    typeof action.currentCpa === "number" && Number.isFinite(action.currentCpa)
      ? action.currentCpa
      : campaign?.cpa;
  const hasMeaningfulCpa =
    campaign &&
    campaign.conversions > 0 &&
    typeof effectiveCpa === "number" &&
    Number.isFinite(effectiveCpa) &&
    effectiveCpa > 0;

  const effectiveTargetCpa =
    typeof action.targetCpa === "number" && Number.isFinite(action.targetCpa) && action.targetCpa > 0
      ? action.targetCpa
      : typeof targetCpa === "number" && targetCpa > 0
        ? targetCpa
        : campaign?.targetCpa;

  return (
    <>
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
            <div className={cn("flex items-center gap-2 text-xs font-medium", agentTheme.agentLineClass)}>
              <span className={agentTheme.iconWrapClass} aria-hidden>
                <Bot className={agentTheme.iconClass} />
              </span>
              <span>
                Анализ от: <span className="font-semibold text-foreground/95">{agentLabel}</span>
              </span>
            </div>
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
                  <div className={cn("max-w-none space-y-3 text-sm leading-relaxed text-muted-foreground", agentTheme.proposalSectionClass)}>
                    <p className="whitespace-pre-wrap">{reasonFormatted}</p>
                  </div>
                </section>

                {campaign ? (
                  <section className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold text-foreground">Прогнозно въздействие</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Текущо състояние</p>
                        <p className="text-sm text-foreground">
                          CPA:{" "}
                          {hasMeaningfulCpa ? formatCurrencyLatin(effectiveCpa!, currency) : "— (няма конверсии)"}
                        </p>
                        {typeof effectiveTargetCpa === "number" &&
                        Number.isFinite(effectiveTargetCpa) &&
                        effectiveTargetCpa > 0 ? (
                          <p className="text-sm text-foreground">
                            Целев CPA: {formatCurrencyLatin(effectiveTargetCpa, currency)}
                          </p>
                        ) : null}
                        <p className="text-sm text-foreground">Разход: {formatCurrencyLatin(campaign.spend, currency)}</p>
                        <p className="text-sm text-foreground">Конверсии: {campaign.conversions}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-teal-200/90">Оптимизирано състояние</p>
                        {projected ? (
                          <>
                            {projected.cpa != null ? (
                              <p className="text-sm text-teal-100">
                                CPA: ~{formatCurrencyLatin(projected.cpa, currency)}
                              </p>
                            ) : (
                              <p className="text-sm text-teal-100/90">CPA: ~няма оценка при нулеви конверсии</p>
                            )}
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
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full",
                executionSuccess && "border-emerald-500/50 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
              )}
              disabled={!canRunAuto || mcpRunning || executionSuccess}
              title={
                !canUseMetaMcp
                  ? campaign?.platform === "Google"
                    ? "MCP автоматизацията за момента е само за Meta."
                    : "Нужна е Meta кампания и изпълнима препоръка (пауза, бюджет или rename от AI)."
                  : undefined
              }
              onClick={() => {
                if (executionSuccess) return;
                openConfirmDialog();
              }}
            >
              {mcpRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {executionSuccess ? <Check className="mr-2 h-4 w-4 text-emerald-400" /> : null}
              {executionSuccess ? "Изпълнено" : "Изпълни автоматично"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && confirmBusy) return;
          setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Потвърждение на действието</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-muted-foreground">
                <p className="whitespace-pre-wrap text-foreground/90">
                  {pending ? formatSlashDatesToBulgarian(pending.explanation) : ""}
                </p>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-foreground">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Обобщение</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {(pending?.summaryLines ?? []).map((line, i) => (
                      <li key={`${i}-${line.slice(0, 40)}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>Отказ</AlertDialogCancel>
            <Button
              type="button"
              disabled={confirmBusy || !pending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => void executePendingMcp()}
            >
              {confirmBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Изпълнение…
                </span>
              ) : (
                "Потвърждавам изпълнението"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
