"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Bot, Check, Layers, Loader2 } from "lucide-react";
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
import { buildCreativePageHref, fetchCampaignPrimaryAdId } from "@/lib/creative-redirect";
import { formatSlashDatesToBulgarian } from "@/lib/format-insight-text";
import { buildPendingExecution, type PendingExecution } from "@/lib/meta-mcp-pending";
import { ENGAGEMENT_INSIGHT_LABEL, getSkillAgentVisualTheme, skillTypeToAgentLabel } from "@/lib/skill-agent-labels";
import { cn, formatCurrencyLatin } from "@/lib/utils";
import type { CampaignMetrics, ExecutableMetaToolName, PrioritizedAction, PrioritizedActionGroup } from "@/types";

import { CampaignPlatformGlyph, ImpactScorePill } from "./platform-icons";

type ActionDetailSheetBase = {
  trigger: ReactNode;
  targetCpa?: number;
  isDataPending?: boolean;
};

export type ActionDetailSheetSingleProps = ActionDetailSheetBase & {
  action: PrioritizedAction;
  campaign: CampaignMetrics | null;
  group?: never;
  getCampaign?: never;
};

export type ActionDetailSheetGroupProps = ActionDetailSheetBase & {
  group: PrioritizedActionGroup;
  getCampaign: (action: PrioritizedAction) => CampaignMetrics | null;
  action?: never;
  campaign?: never;
};

export type ActionDetailSheetProps = ActionDetailSheetSingleProps | ActionDetailSheetGroupProps;

function isGroupProps(p: ActionDetailSheetProps): p is ActionDetailSheetGroupProps {
  const g = "group" in p ? p.group : undefined;
  return Boolean(g) && Array.isArray(g!.children);
}

function mcpActionTypeBg(tool: ExecutableMetaToolName): string {
  switch (tool) {
    case "adjust_budget":
      return "дневния бюджет";
    case "pause_campaign":
      return "статуса";
    case "rename_campaign":
      return "името";
    default:
      return "настройките";
  }
}

/** Тяло към /api/ai/mcp + log_context за execution_logs. */
function buildMcpRequestWithLog(
  pending: PendingExecution,
  action: PrioritizedAction,
  campaign: CampaignMetrics | null
): Record<string, unknown> {
  const tool = pending.body.tool;
  const agentLabel = skillTypeToAgentLabel(action.type);
  const campaignName = campaign?.campaignName?.trim() || pending.body.campaign_id;
  let oldVal: string | number | null = null;
  let newVal: string | number | null = null;
  if (tool === "adjust_budget") {
    oldVal =
      typeof campaign?.dailyBudgetMajor === "number" && Number.isFinite(campaign.dailyBudgetMajor)
        ? campaign.dailyBudgetMajor
        : null;
    newVal = pending.body.new_budget ?? null;
  } else if (tool === "pause_campaign") {
    oldVal = "ACTIVE";
    newVal = "PAUSED";
  } else {
    oldVal = campaign?.campaignName ?? null;
    newVal = pending.body.new_name ?? null;
  }
  return {
    ...pending.body,
    log_context: {
      agent_label: agentLabel,
      campaign_name: campaignName,
      action_type_bg: mcpActionTypeBg(tool),
      old_value: oldVal,
      new_value: newVal
    }
  };
}

function asFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function projectedFromCampaign(
  campaign: CampaignMetrics | null,
  action: PrioritizedAction,
  currentCpa: number,
  targetCpa: number,
  currentSpend: number
): { spend: number; cpa: number; savings: number; cpaLiftPercent: number } | null {
  if (!campaign) return null;
  const impact = Math.max(0, Math.min(100, action.impactScore));
  const actionKey = action.actionType ?? "";

  let spendFactor = 1;
  let cpaFactor = 1;

  if (actionKey === "PAUSE") {
    spendFactor = 0.65;
    cpaFactor = 0.9;
  } else if (action.type === "BUDGET_SUFFICIENCY") {
    spendFactor = 1.08;
    cpaFactor = 0.9;
  } else if (action.type === "BID_STRATEGY_AUDITOR") {
    spendFactor = 0.96;
    cpaFactor = 0.86;
  } else if (action.type === "SCALING_STRATEGY") {
    spendFactor = 1.1;
    cpaFactor = 0.92;
  } else {
    spendFactor = 0.94;
    cpaFactor = 0.9;
  }

  const confidenceBoost = impact / 1000;
  const optimizedSpend = Math.max(0, currentSpend * (spendFactor - confidenceBoost / 2));
  let optimizedCpa = Math.max(0, currentCpa * (cpaFactor - confidenceBoost));
  if (targetCpa > 0) {
    optimizedCpa = Math.max(targetCpa * 0.92, Math.min(optimizedCpa, (currentCpa + targetCpa) / 2));
  }

  const savings = Math.max(0, currentSpend - optimizedSpend);
  const cpaLiftPercent = currentCpa > 0 ? ((currentCpa - optimizedCpa) / currentCpa) * 100 : 0;

  return {
    spend: Number(optimizedSpend.toFixed(2)),
    cpa: Number(optimizedCpa.toFixed(2)),
    savings: Number(savings.toFixed(2)),
    cpaLiftPercent: Number(Math.max(0, cpaLiftPercent).toFixed(1))
  };
}

export function ActionDetailSheet(props: ActionDetailSheetProps) {
  const { trigger, targetCpa, isDataPending } = props;
  const isGroup = isGroupProps(props);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const { mutate } = useSWRConfig();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [executionSuccess, setExecutionSuccess] = useState(false);
  const [pending, setPending] = useState<PendingExecution | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<PendingExecution[]>([]);
  const [creativeNavBusy, setCreativeNavBusy] = useState(false);

  const router = useRouter();

  const group = isGroup ? props.group : null;
  const getCampaign = isGroup ? props.getCampaign : null;

  const children = group?.children ?? [];
  const safeIndex = isGroup && children.length > 0 ? Math.min(selectedIndex, children.length - 1) : 0;
  const action: PrioritizedAction = isGroup ? children[safeIndex]! : props.action;
  const campaign: CampaignMetrics | null = isGroup ? (getCampaign?.(children[safeIndex]!) ?? null) : props.campaign;

  const reasonFormatted = formatSlashDatesToBulgarian(action.reason ?? "");
  const agentLabel = skillTypeToAgentLabel(action.type);
  const agentTheme = getSkillAgentVisualTheme(action.type);
  const currency = campaign?.currencyCode ?? "EUR";
  const currentSpend = asFiniteNumber(campaign?.spend);
  const showSkeleton = Boolean(isDataPending) || !reasonFormatted.trim();

  const campaignTitle = campaign?.campaignName ?? (action.campaignId ? "Кампания" : "Общ преглед");

  const canUseMetaMcp =
    !showSkeleton && campaign && campaign.platform === "Meta" && Boolean(campaign.id);

  const pendingResolved = buildPendingExecution(action, campaign, targetCpa);
  const canRunAuto = Boolean(canUseMetaMcp && pendingResolved);

  const isRedirectCreative = action.executable === true && action.actionUiTemplate === "redirect_creative";
  const creativeRedirectReady =
    isRedirectCreative &&
    Boolean((action.campaignId ?? "").trim()) &&
    Boolean((action.recommendation ?? action.reason ?? "").trim());

  const bulkExecutable = isGroup
    ? children
        .map((ch) => {
          const c = getCampaign!(ch);
          return buildPendingExecution(ch, c, targetCpa);
        })
        .filter((x): x is PendingExecution => x != null)
    : [];

  const groupFingerprint =
    isGroup && group ? `${group.type}:${group.children.map((c) => c.campaignId ?? c.task).join("|")}` : "";

  useEffect(() => {
    setSelectedIndex(0);
  }, [isGroup, groupFingerprint]);

  useEffect(() => {
    setExecutionSuccess(false);
    setConfirmOpen(false);
    setPending(null);
    setConfirmBusy(false);
    setMcpRunning(false);
  }, [isGroup, action.task, action.campaignId, campaign?.id, safeIndex]);

  useEffect(() => {
    setBulkOpen(false);
    setBulkQueue([]);
  }, [groupFingerprint]);

  function openConfirmDialog() {
    const p = buildPendingExecution(action, campaign, targetCpa);
    if (!p) return;
    setPending(p);
    setConfirmOpen(true);
  }

  function openBulkDialog() {
    const queue = isGroup
      ? children
          .map((ch) => {
            const c = getCampaign!(ch);
            return buildPendingExecution(ch, c, targetCpa);
          })
          .filter((x): x is PendingExecution => x != null)
      : [];
    if (queue.length === 0) {
      toast.message("Няма автоматични действия", {
        description: "За нито една кампания в групата няма валиден Meta MCP инструмент за изпълнение."
      });
      return;
    }
    setBulkQueue(queue);
    setBulkOpen(true);
  }

  async function executePendingMcp() {
    if (!pending) return;
    setConfirmBusy(true);
    setMcpRunning(true);
    try {
      const body = buildMcpRequestWithLog(pending, action, campaign);
      const res = await fetch("/api/ai/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await res.json()) as { success?: boolean; error?: string; code?: string };
      if (!res.ok || !payload.success) {
        if (payload.code === "PAYWALL_LOCKED" || res.status === 403) {
          toast.message("Pro функция", {
            description: "Advanced MCP действията са за Pro план. Coming Soon / Upgrade."
          });
          return;
        }
        if (res.status === 401 || payload.code === "TOKEN_EXPIRED") {
          toast.error("Връзката с Meta изтече. Моля, свържете се отново.");
          return;
        }
        toast.error(`Възникна грешка при изпълнението: ${payload.error ?? "неизвестна грешка"}.`);
        return;
      }
      toast.success("Успешно изпълнение на оптимизацията!", {
        description:
          pending.body.tool === "pause_campaign"
            ? "Кампанията е поставена на пауза в Meta."
            : pending.body.tool === "adjust_budget" && pending.body.new_budget != null
              ? `Нов дневен бюджет: ${formatCurrencyLatin(pending.body.new_budget, currency)}.`
              : pending.body.tool === "rename_campaign" && pending.body.new_name
                ? `Ново име на кампания: „${pending.body.new_name}“.`
                : "Промяната е записана в Meta."
      });
      setExecutionSuccess(true);
      setConfirmOpen(false);
      await mutate(META_ADS_SWR_KEY);
      await mutate("/api/history");
    } catch {
      toast.error("Възникна грешка при изпълнението: мрежова грешка. Опитайте отново след малко.");
    } finally {
      setConfirmBusy(false);
      setMcpRunning(false);
    }
  }

  async function executeBulkQueue() {
    if (bulkQueue.length === 0) return;
    setBulkBusy(true);
    setMcpRunning(true);
    let ok = 0;
    let lastErr: string | undefined;
    try {
      for (const item of bulkQueue) {
        const child =
          isGroup && children.length > 0
            ? children.find((c) => (c.campaignId ?? "").trim() === item.body.campaign_id)
            : undefined;
        const act = child ?? action;
        const camp = isGroup && getCampaign && child ? getCampaign(child) : campaign;
        const body = buildMcpRequestWithLog(item, act, camp);
        const res = await fetch("/api/ai/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const payload = (await res.json()) as { success?: boolean; error?: string; code?: string };
        if (res.ok && payload.success) ok += 1;
        else lastErr = payload.error ?? `HTTP ${res.status}`;
        if (payload.code === "PAYWALL_LOCKED" || res.status === 403) {
          toast.message("Pro функция", {
            description: "Advanced MCP действията са за Pro план. Coming Soon / Upgrade."
          });
          break;
        }
        if (res.status === 401 || payload.code === "TOKEN_EXPIRED") {
          toast.error("Връзката с Meta изтече. Моля, свържете се отново.");
          break;
        }
      }
      if (ok === bulkQueue.length) {
        toast.success(`Всички действия бяха изпълнени успешно (${ok} бр.).`);
        setBulkOpen(false);
        await mutate(META_ADS_SWR_KEY);
        await mutate("/api/history");
      } else if (ok > 0) {
        toast.warning("Частично изпълнение", {
          description: `Успешни ${ok} от ${bulkQueue.length}.${lastErr ? ` Последна грешка: ${lastErr}` : ""}`
        });
        await mutate(META_ADS_SWR_KEY);
        await mutate("/api/history");
      } else {
        toast.error(`Възникна грешка при изпълнението: ${lastErr ?? "нито едно действие не завърши успешно"}.`);
      }
    } catch {
      toast.error("Възникна грешка при изпълнението: мрежова грешка. Опитайте отново след малко.");
    } finally {
      setBulkBusy(false);
      setMcpRunning(false);
    }
  }

  const computedCpaFromMetrics =
    campaign && campaign.conversions > 0 && Number.isFinite(campaign.spend)
      ? Number((campaign.spend / campaign.conversions).toFixed(4))
      : null;
  const effectiveCpa = asFiniteNumber(
    typeof action.currentCpa === "number" && Number.isFinite(action.currentCpa) && action.currentCpa > 0
      ? action.currentCpa
      : typeof campaign?.cpa === "number" && campaign.cpa > 0
        ? campaign.cpa
        : computedCpaFromMetrics && computedCpaFromMetrics > 0
          ? computedCpaFromMetrics
          : null
  );

  const effectiveTargetCpa =
    typeof action.targetCpa === "number" && Number.isFinite(action.targetCpa) && action.targetCpa > 0
      ? action.targetCpa
      : typeof targetCpa === "number" && targetCpa > 0
        ? targetCpa
        : asFiniteNumber(campaign?.targetCpa);

  const hasImpactInputs = Boolean(
    campaign && effectiveCpa !== null && effectiveTargetCpa !== null && currentSpend !== null
  );
  const projected =
    campaign &&
    effectiveCpa !== null &&
    effectiveTargetCpa !== null &&
    currentSpend !== null &&
    effectiveCpa > 0 &&
    effectiveTargetCpa > 0
      ? projectedFromCampaign(campaign, action, effectiveCpa, effectiveTargetCpa, currentSpend)
      : null;

  const groupAgentTheme = isGroup && group ? getSkillAgentVisualTheme(group.type) : agentTheme;
  const groupAgentLabel = isGroup && group ? skillTypeToAgentLabel(group.type) : agentLabel;
  const groupHasEngagementInsight = Boolean(isGroup && group?.children.some((c) => c.insightBasis === "engagement"));

  function currencyForBulkBody(body: PendingExecution["body"]): string {
    if (!isGroup || !group || !getCampaign) return "EUR";
    const ch = group.children.find((c) => c.campaignId === body.campaign_id);
    return ch ? (getCampaign(ch)?.currencyCode ?? "EUR") : "EUR";
  }

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl lg:max-w-2xl">
          <SheetHeader className="space-y-3 border-b border-border/60 pb-4 text-left">
            {isGroup && group ? (
              <>
                <div className="flex items-start gap-3 pr-8">
                  <div className={cn("shrink-0 rounded-lg p-2", groupAgentTheme.iconWrapClass)}>
                    <Layers className={cn("h-5 w-5", groupAgentTheme.iconClass)} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <SheetTitle className="text-balance text-xl leading-snug">
                      Група от {group.children.length} оптимизации
                    </SheetTitle>
                    <SheetDescription className="text-muted-foreground">
                      Един тип препоръка за няколко кампании — избери конкретна за детайли или изпълни всички с валиден MCP.
                    </SheetDescription>
                  </div>
                </div>
                <div className={cn("flex flex-wrap items-center gap-2 text-xs font-medium", groupAgentTheme.agentLineClass)}>
                  <span className={groupAgentTheme.iconWrapClass} aria-hidden>
                    <Bot className={groupAgentTheme.iconClass} />
                  </span>
                  <span>
                    Анализ от: <span className="font-semibold text-foreground/95">{groupAgentLabel}</span>
                  </span>
                  {groupHasEngagementInsight ? (
                    <span className="inline-flex max-w-full items-center rounded-md border border-amber-500/45 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium leading-tight text-amber-100">
                      {ENGAGEMENT_INSIGHT_LABEL}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <>
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
                <div className={cn("flex flex-wrap items-center gap-2 text-xs font-medium", agentTheme.agentLineClass)}>
                  <span className={agentTheme.iconWrapClass} aria-hidden>
                    <Bot className={agentTheme.iconClass} />
                  </span>
                  <span>
                    Анализ от: <span className="font-semibold text-foreground/95">{agentLabel}</span>
                  </span>
                  {action.insightBasis === "engagement" ? (
                    <span className="inline-flex max-w-full items-center rounded-md border border-amber-500/45 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium leading-tight text-amber-100">
                      {ENGAGEMENT_INSIGHT_LABEL}
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </SheetHeader>

          {isGroup && group ? (
            <div className="border-b border-border/60 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Кампании в групата</p>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {group.children.map((ch, idx) => {
                  const c = getCampaign!(ch);
                  const name = c?.campaignName ?? ch.task;
                  const selected = idx === safeIndex;
                  return (
                    <li key={`${ch.campaignId ?? "g"}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          selected
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/35"
                        )}
                      >
                        <span className="min-w-0 truncate font-medium">{formatSlashDatesToBulgarian(name)}</span>
                        <ImpactScorePill score={ch.impactScore} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

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
                  <h3 className="text-sm font-semibold text-foreground">
                    {isGroup ? "Анализ за избраната кампания" : "Детайлен анализ"}
                  </h3>
                  <div
                    className={cn(
                      "max-w-none space-y-3 text-sm leading-relaxed text-muted-foreground",
                      isGroup ? groupAgentTheme.proposalSectionClass : agentTheme.proposalSectionClass
                    )}
                  >
                    <p className="whitespace-pre-wrap">{reasonFormatted}</p>
                  </div>
                </section>

                <section className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold text-foreground">Прогнозно въздействие</h3>
                  {hasImpactInputs ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Текущо състояние</p>
                        <p className="text-sm text-foreground">CPA: {formatCurrencyLatin(effectiveCpa as number, currency)}</p>
                        <p className="text-sm text-foreground">
                          Целев CPA: {formatCurrencyLatin(effectiveTargetCpa as number, currency)}
                        </p>
                        <p className="text-sm text-foreground">Разход: {formatCurrencyLatin(currentSpend as number, currency)}</p>
                        <p className="text-sm text-foreground">Конверсии: {campaign?.conversions ?? 0}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-teal-200/90">Оптимизирано състояние</p>
                        {projected ? (
                          <>
                            <p className="text-sm text-teal-100">CPA: ~{formatCurrencyLatin(projected.cpa, currency)}</p>
                            <p className="text-sm text-teal-100">Разход: ~{formatCurrencyLatin(projected.spend, currency)}</p>
                            <p className="text-sm text-emerald-200">
                              Прогнозно спестяване: {formatCurrencyLatin(projected.savings, currency)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Очакван performance boost: ~{projected.cpaLiftPercent}% по-нисък CPA след изпълнение.
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Данните са налични, но липсва достатъчна база за точна прогноза (например CPA/target CPA = 0).
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border/70 bg-background/40 p-3">
                      <p className="text-sm font-medium text-foreground">Data Fetching</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Изчакваме текущи стойности за Current CPA, Target CPA и Current Spend от кампанията.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          <div className="mt-auto space-y-2 border-t border-border/60 pt-4">
            {isGroup ? (
              <Button
                type="button"
                variant="outline"
                className="w-full border-primary/40 bg-primary/5 text-primary-foreground hover:bg-primary/10"
                disabled={bulkExecutable.length === 0 || mcpRunning || bulkBusy}
                onClick={openBulkDialog}
              >
                Изпълни всички ({bulkExecutable.length})
              </Button>
            ) : null}
            {isRedirectCreative ? (
              <Button
                type="button"
                variant="outline"
                className="w-full border-teal-500/45 bg-teal-500/10 text-teal-100 hover:bg-teal-500/15"
                disabled={!creativeRedirectReady || creativeNavBusy}
                title={
                  !creativeRedirectReady
                    ? "Липсват campaignId или контекст за преход към AI креатив."
                    : undefined
                }
                onClick={() => {
                  if (!creativeRedirectReady || creativeNavBusy) return;
                  void (async () => {
                    setCreativeNavBusy(true);
                    try {
                      const cid = (action.campaignId ?? "").trim();
                      const adId = cid ? await fetchCampaignPrimaryAdId(cid) : null;
                      const href = buildCreativePageHref(action, campaign, adId);
                      if (href) {
                        router.push(href as Route);
                      } else {
                        toast.message("Неуспешен преход", {
                          description: "Липсват данни за линк към AI креатив."
                        });
                      }
                    } finally {
                      setCreativeNavBusy(false);
                    }
                  })();
                }}
              >
                {creativeNavBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Генерирай с AI
              </Button>
            ) : (
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
                {executionSuccess ? "Изпълнено" : isGroup ? "Изпълни избраната (автоматично)" : "Изпълни автоматично"}
              </Button>
            )}
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

      <AlertDialog
        open={bulkOpen}
        onOpenChange={(open) => {
          if (!open && bulkBusy) return;
          setBulkOpen(open);
        }}
      >
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Потвърждение на масово изпълнение</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-muted-foreground">
                <p className="text-foreground/90">
                  Ще бъдат изпълнени последователно <strong>{bulkQueue.length}</strong> действия към Meta API. Прегледай
                  обобщенията по-долу.
                </p>
                <ol className="list-decimal space-y-3 pl-4">
                  {bulkQueue.map((item, i) => (
                    <li key={`${item.body.campaign_id}-${i}`} className="rounded-md border border-border/50 bg-muted/20 p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {item.body.tool}
                        {item.body.new_budget != null
                          ? ` · ${formatCurrencyLatin(item.body.new_budget, currencyForBulkBody(item.body))}`
                          : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-foreground/90">
                        {formatSlashDatesToBulgarian(item.explanation)}
                      </p>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                        {item.summaryLines.map((line, j) => (
                          <li key={j}>{line}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Отказ</AlertDialogCancel>
            <Button
              type="button"
              disabled={bulkBusy || bulkQueue.length === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => void executeBulkQueue()}
            >
              {bulkBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Изпълнение…
                </span>
              ) : (
                "Потвърждавам всички"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
