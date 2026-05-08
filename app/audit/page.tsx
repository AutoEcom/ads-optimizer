"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import Link from "next/link";
import type { Route } from "next";
import {
  BadgeCheck,
  CheckCircle2,
  Crosshair,
  Loader2,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  Target
} from "lucide-react";

import { TypewriterInsight } from "@/components/ai/typewriter-insight";
import { GroupedActionCard } from "@/components/ads/grouped-action-card";
import { PrioritizedActionAlert } from "@/components/ads/prioritized-action-alert";
import { groupActionsByType, isPrioritizedActionGroup } from "@/lib/action-utils";
import {
  CampaignPlatformGlyph,
  ImpactScorePill
} from "@/components/ads/platform-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  GOOGLE_ADS_SWR_KEY,
  META_ADS_SWR_KEY,
  useAdPlatformConnection
} from "@/hooks/use-ad-platform-connection";
import { useToast } from "@/hooks/use-toast";
import { fetchAdsPlatformData } from "@/lib/client-ads";
import { formatSlashDatesToBulgarian } from "@/lib/format-insight-text";
import { cn, formatCurrency } from "@/lib/utils";
import { executeCampaignAction, runDeepAudit, runHealthAudit } from "@/services/ai-service";
import { fetchAiStrategyCache } from "@/services/ai-strategy-cache-service";
import { getCampaignsByPlatform } from "@/services/mock-data";
import { AuditInsight, CampaignMetrics, SkillType } from "@/types";

const SHOW_MOCK_DATA = process.env.NEXT_PUBLIC_SHOW_MOCK_DATA === "true";

export default function AuditPage() {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const [healthAudit, setHealthAudit] = useState<AuditInsight | null>(null);
  const [aiAuditUpdatedAt, setAiAuditUpdatedAt] = useState<string | null>(null);
  const [fetchingCachedAudit, setFetchingCachedAudit] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [confirmFullAuditOpen, setConfirmFullAuditOpen] = useState(false);

  const [auditByCampaign, setAuditByCampaign] = useState<Record<string, AuditInsight>>({});
  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(null);
  const [pendingExecution, setPendingExecution] = useState<CampaignMetrics[] | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  const clearAuditLinkedState = useCallback(async () => {
    setHealthAudit(null);
    setAiAuditUpdatedAt(null);
    setAuditByCampaign({});
    await mutate(META_ADS_SWR_KEY, undefined, { revalidate: false });
    await mutate(GOOGLE_ADS_SWR_KEY, undefined, { revalidate: false });
  }, [mutate]);

  const { linkedAccountStatus, hasLinkedAdAccounts } = useAdPlatformConnection({
    clearLinkedClientState: clearAuditLinkedState,
    logPrefix: "[audit]",
    channelScope: "audit"
  });

  const metaSwrKey = hasLinkedAdAccounts ? META_ADS_SWR_KEY : null;
  const googleSwrKey = hasLinkedAdAccounts ? GOOGLE_ADS_SWR_KEY : null;

  const { data: metaData, isLoading: isMetaLoading } = useSWR(metaSwrKey, fetchAdsPlatformData, {
    dedupingInterval: 30_000
  });
  const { data: googleData, isLoading: isGoogleLoading } = useSWR(googleSwrKey, fetchAdsPlatformData, {
    dedupingInterval: 30_000
  });

  const metaCampaigns = metaData?.campaigns ?? (SHOW_MOCK_DATA ? getCampaignsByPlatform("Meta") : []);
  const googleCampaigns = googleData?.campaigns ?? (SHOW_MOCK_DATA ? getCampaignsByPlatform("Google") : []);

  const allCampaigns = useMemo(() => [...metaCampaigns, ...googleCampaigns], [metaCampaigns, googleCampaigns]);

  const isPrioritiesFresh = useMemo(() => {
    if (!aiAuditUpdatedAt) return false;
    return Date.now() - new Date(aiAuditUpdatedAt).getTime() < 60 * 60 * 1000;
  }, [aiAuditUpdatedAt]);

  useEffect(() => {
    if (!hasLinkedAdAccounts) return;

    let cancelled = false;
    setFetchingCachedAudit(true);

    async function loadCachedAudit() {
      const row = await fetchAiStrategyCache();
      if (cancelled) return;
      setFetchingCachedAudit(false);
      if (!row) return;
      setHealthAudit((current) => (current ? current : row.insight));
      setAiAuditUpdatedAt((current) => (current ? current : row.lastGeneratedAt));
    }

    void loadCachedAudit();
    return () => {
      cancelled = true;
    };
  }, [hasLinkedAdAccounts]);

  async function runAudit() {
    if (allCampaigns.length === 0) {
      toast({
        title: "Липсват кампании",
        description: "Свържи акаунти от Настройки, за да стартираш Health Audit."
      });
      return;
    }

    setLoadingHealth(true);
    try {
      const result = await runHealthAudit(allCampaigns, 20, 2.5, "Audit page");
      setHealthAudit(result);
      setAiAuditUpdatedAt(new Date().toISOString());
    } catch (error) {
      if ((error as Error).message === "PAYWALL_LIMIT_REACHED") {
        setIsPaywallOpen(true);
        return;
      }
      toast({
        title: "Неуспешен AI health одит",
        description: "Провери токените и account ID-тата в Настройки."
      });
    } finally {
      setLoadingHealth(false);
    }
  }

  function openFullAuditModal() {
    if (allCampaigns.length === 0) {
      toast({
        title: "Липсват кампании",
        description: "Свържи акаунти от Настройки, за да стартираш Health Audit."
      });
      return;
    }
    setConfirmFullAuditOpen(true);
  }

  async function confirmFullAuditAndRun() {
    setConfirmFullAuditOpen(false);
    await runAudit();
  }

  async function deepAuditCampaign(campaign: CampaignMetrics) {
    setLoadingCampaignId(campaign.id);
    try {
      const result = await runDeepAudit(campaign, 20, 2.5);
      setAuditByCampaign((prev) => ({ ...prev, [campaign.id]: result }));
    } catch (error) {
      if ((error as Error).message === "PAYWALL_FEATURE_LOCKED") {
        setIsPaywallOpen(true);
        toast({
          title: "Pro функция",
          description: "Deep Audit е наличен за Pro план. Coming Soon / Upgrade."
        });
        return;
      }
      toast({
        title: "Неуспешен дълбок одит",
        description: "Кампанията не можа да бъде анализирана в момента."
      });
    } finally {
      setLoadingCampaignId(null);
    }
  }

  async function confirmExecution() {
    if (!pendingExecution) return;
    setIsExecuting(true);
    try {
      await Promise.all(
        pendingExecution.map((campaign) =>
          executeCampaignAction({
            platform: campaign.platform,
            campaignId: campaign.id,
            campaignName: campaign.campaignName,
            action: "PAUSE",
            reason: "Изпълнение от Audit Center"
          })
        )
      );
      toast({
        title: "Изпълнено",
        description: "Кампанията е спряна успешно. Промяната е записана в лога."
      });
      setPendingExecution(null);
    } catch {
      toast({ title: "Грешка", description: "Неуспешно изпълнение на плана." });
    } finally {
      setIsExecuting(false);
    }
  }

  const killCampaigns = (healthAudit?.killList ?? [])
    .map((item) => allCampaigns.find((campaign) => campaign.id === item.campaignId))
    .filter((campaign): campaign is CampaignMetrics => Boolean(campaign));
  const activatedSkillTypes = Array.from(
    new Set((healthAudit?.prioritizedActions ?? []).map((action) => action.type).filter(Boolean))
  ) as SkillType[];

  const budgetSufficiencyAlertCount = useMemo(
    () =>
      (healthAudit?.prioritizedActions ?? []).filter((action) => action.type === "BUDGET_SUFFICIENCY").length,
    [healthAudit?.prioritizedActions]
  );
  const prioritizedDisplayList = useMemo(
    () => groupActionsByType(healthAudit?.prioritizedActions ?? []),
    [healthAudit?.prioritizedActions]
  );
  const pulseBudgetSufficiency = budgetSufficiencyAlertCount > 0;

  const campaignsLoading = hasLinkedAdAccounts && (isMetaLoading || isGoogleLoading);
  const showAuditBusyOverlay = (hasLinkedAdAccounts && fetchingCachedAudit && !healthAudit) || loadingHealth;

  return (
    <main className="w-full space-y-4 overflow-visible">
      {linkedAccountStatus === "loading" ? (
        <AuditPageConnectionSkeleton />
      ) : linkedAccountStatus === "not-linked" ? (
        <Card>
          <CardHeader>
            <CardTitle>Одит център</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTitle>Няма свързани рекламни акаунти</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Свържи Meta или Google в Настройки, за да заредиш кампаниите и пълния одит.</p>
                <Link
                  href={"/settings" as Route}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground"
                >
                  Към настройки
                </Link>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="relative">
            {showAuditBusyOverlay && (
              <div
                className="absolute inset-0 z-10 flex flex-col gap-3 rounded-lg border border-border/50 bg-background/80 p-4 backdrop-blur-sm"
                aria-busy="true"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingHealth ? "Генериране на AI одит…" : "Зареждане на запазения одит…"}
                </div>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Одит център</CardTitle>
                {aiAuditUpdatedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Последна актуализация: {formatAiAuditTimestamp(aiAuditUpdatedAt)}
                  </p>
                ) : null}
                {isPrioritiesFresh ? (
                  <p className="mt-1 text-xs text-teal-200/90">Генерирано преди по-малко от час…</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <Button
                  className={cn(
                    isPrioritiesFresh
                      ? "border-teal-500/40 bg-transparent text-teal-100 hover:bg-teal-500/10"
                      : "bg-emerald-500 text-white hover:bg-emerald-600"
                  )}
                  variant={isPrioritiesFresh ? "outline" : "default"}
                  onClick={openFullAuditModal}
                  disabled={loadingHealth || allCampaigns.length === 0 || campaignsLoading}
                >
                  {loadingHealth ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Анализ...
                    </span>
                  ) : (
                    "Стартирай Health Audit"
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {allCampaigns.length === 0 && !campaignsLoading ? (
                <Alert>
                  <AlertTitle>Няма свързани кампании</AlertTitle>
                  <AlertDescription>
                    Добави Meta/Google токен и account ID в Настройки, за да се зареждат live данни.
                  </AlertDescription>
                </Alert>
              ) : null}
              {campaignsLoading && allCampaigns.length === 0 ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : null}
              {activatedSkillTypes.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-teal-200">Активирани AI Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {activatedSkillTypes.map((skillType) => {
                      const skill = SKILL_BADGE_MAP[skillType];
                      const Icon = skill.icon;
                      const isBudget = skillType === "BUDGET_SUFFICIENCY";
                      return (
                        <span
                          key={skillType}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-teal-200",
                            isBudget
                              ? "border-teal-300/50 bg-teal-500/20 font-medium shadow-[0_0_18px_rgba(45,212,191,0.35)]"
                              : "border-teal-400/30 bg-teal-500/10 shadow-[0_0_14px_rgba(45,212,191,0.25)]",
                            isBudget && pulseBudgetSufficiency ? "animate-skill-pulse" : null
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {skill.label}
                          {isBudget && budgetSufficiencyAlertCount > 0 ? (
                            <span className="tabular-nums text-teal-100/90">({budgetSufficiencyAlertCount})</span>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {!healthAudit ? (
                <p className="text-sm text-muted-foreground">
                  Стартирай Health Audit, за да видиш AI приоритетите за кампаниите.
                </p>
              ) : prioritizedDisplayList.length === 0 ? (
                <div className="flex items-start gap-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                  <span>Всичко изглежда наред! Няма критични препоръки в момента.</span>
                </div>
              ) : (
                prioritizedDisplayList.map((item, idx) =>
                  isPrioritizedActionGroup(item) ? (
                    <GroupedActionCard
                      key={`group-${item.type}-${idx}`}
                      group={item}
                      getCampaign={(a) =>
                        a.campaignId ? (allCampaigns.find((c) => c.id === a.campaignId) ?? null) : null
                      }
                      targetCpa={20}
                      auditSnapshotReady={!loadingHealth}
                      childFooter={(child) => (
                        <div className="flex flex-wrap items-center gap-2">
                          {child.type ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-xs text-sky-200">
                              <BadgeCheck className="h-3.5 w-3.5" />
                              {SKILL_BADGE_MAP[child.type].label}
                            </span>
                          ) : null}
                          {child.isKillRule ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              3x Kill Rule
                            </span>
                          ) : null}
                          {child.actionType === "PAUSE" && child.campaignId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const campaign = allCampaigns.find((c) => c.id === child.campaignId);
                                if (!campaign) return;
                                setPendingExecution([campaign]);
                              }}
                            >
                              Изпълни
                            </Button>
                          ) : null}
                        </div>
                      )}
                    />
                  ) : (
                    <PrioritizedActionAlert
                      key={`${item.campaignId ?? "na"}-${item.type ?? "na"}-${idx}`}
                      action={item}
                      campaign={
                        item.campaignId
                          ? (allCampaigns.find((c) => c.id === item.campaignId) ?? null)
                          : null
                      }
                      targetCpa={20}
                      auditSnapshotReady={!loadingHealth}
                      footer={
                        <div className="flex flex-wrap items-center gap-2">
                          {item.type ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-xs text-sky-200">
                              <BadgeCheck className="h-3.5 w-3.5" />
                              {SKILL_BADGE_MAP[item.type].label}
                            </span>
                          ) : null}
                          {item.isKillRule ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              3x Kill Rule
                            </span>
                          ) : null}
                          {item.actionType === "PAUSE" && item.campaignId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const campaign = allCampaigns.find((c) => c.id === item.campaignId);
                                if (!campaign) return;
                                setPendingExecution([campaign]);
                              }}
                            >
                              Изпълни
                            </Button>
                          ) : null}
                        </div>
                      }
                    />
                  )
                )
              )}
              {killCampaigns.length > 0 ? (
                <Button
                  variant="outline"
                  className="border-rose-500/50 text-rose-300"
                  onClick={() => setPendingExecution(killCampaigns)}
                >
                  Спри всички (Kill All)
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <section className="grid gap-4">
            {campaignsLoading && metaCampaigns.length === 0 ? (
              <CampaignTableSkeleton title="Meta кампании" />
            ) : (
              <CampaignTable
                title="Meta кампании"
                rows={metaCampaigns}
                loadingCampaignId={loadingCampaignId}
                auditByCampaign={auditByCampaign}
                onDeepAudit={deepAuditCampaign}
              />
            )}
            {campaignsLoading && googleCampaigns.length === 0 ? (
              <CampaignTableSkeleton title="Google кампании" />
            ) : (
              <CampaignTable
                title="Google кампании"
                rows={googleCampaigns}
                loadingCampaignId={loadingCampaignId}
                auditByCampaign={auditByCampaign}
                onDeepAudit={deepAuditCampaign}
              />
            )}
          </section>
        </>
      )}

      <AlertDialog open={Boolean(pendingExecution)} onOpenChange={(open) => !open && setPendingExecution(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сигурни ли сте, че искате да спрете тази кампания?</AlertDialogTitle>
            <AlertDialogDescription>
              Действието ще бъде изпълнено директно и записано в историята.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExecuting}>Отказ</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmExecution()} disabled={isExecuting}>
              {isExecuting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Потвърди
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={confirmFullAuditOpen} onOpenChange={setConfirmFullAuditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Стартиране на нов пълен одит</DialogTitle>
            <DialogDescription className="text-left leading-relaxed">
              Този одит анализира всички ваши кампании в дълбочина чрез Claude 4.x. Това действие ще се начисли към
              вашия месечен лимит. Желаете ли да продължите?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmFullAuditOpen(false)}>
              Отказ
            </Button>
            <Button type="button" onClick={() => void confirmFullAuditAndRun()}>
              Потвърждавам и генерирай
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaywallOpen} onOpenChange={setIsPaywallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Достигнахте лимита за вашия план</DialogTitle>
            <DialogDescription>
              Надградете за неограничени одити и пълен достъп до AI оптимизации.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setIsPaywallOpen(false)}>Разбрах</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function formatAiAuditTimestamp(iso: string) {
  return new Date(iso).toLocaleString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function AuditPageConnectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

function CampaignTableSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

const SKILL_BADGE_MAP: Record<SkillType, { label: string; icon: typeof Target }> = {
  SCALING_STRATEGY: { label: "Scaling Strategy Applied", icon: Target },
  BUDGET_SUFFICIENCY: { label: "Budget Sufficiency Active", icon: Target },
  CREATIVE_FATIGUE: { label: "Creative Fatigue Active", icon: Radar },
  AD_COPY_RELEVANCE: { label: "Ad Copy Relevance Active", icon: BadgeCheck },
  AUDIENCE_BUILDER: { label: "Audience Builder Active", icon: Crosshair },
  AUDIENCE_SIGNALS: { label: "Audience Signals Active", icon: Crosshair },
  EVENT_MATCH_QUALITY: { label: "Event Match Quality Active", icon: Radar },
  NEGATIVE_KEYWORD_GUARD: { label: "Negative Keyword Guard Active", icon: ShieldAlert },
  AUCTION_OVERLAP: { label: "Auction Overlap Active", icon: Radar },
  BID_STRATEGY_AUDITOR: { label: "Bid Strategy Auditor Active", icon: BadgeCheck },
  FUNNEL_ALIGNMENT: { label: "Funnel Alignment Active", icon: Target },
  KEYWORD_MINING: { label: "Keyword Mining Active", icon: Search }
};

function CampaignTable({
  title,
  rows,
  loadingCampaignId,
  auditByCampaign,
  onDeepAudit
}: {
  title: string;
  rows: CampaignMetrics[];
  loadingCampaignId: string | null;
  auditByCampaign: Record<string, AuditInsight>;
  onDeepAudit: (campaign: CampaignMetrics) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Кампания</TableHead>
                <TableHead>Разход</TableHead>
                <TableHead>Конверсии</TableHead>
                <TableHead>CPA</TableHead>
                <TableHead className="text-right">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>{campaign.campaignName}</TableCell>
                  <TableCell>{formatCurrency(campaign.spend, campaign.currencyCode)}</TableCell>
                  <TableCell>{campaign.conversions}</TableCell>
                  <TableCell>{formatCurrency(campaign.cpa, campaign.currencyCode)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loadingCampaignId === campaign.id}
                      onClick={() => void onDeepAudit(campaign)}
                    >
                      {loadingCampaignId === campaign.id ? (
                        "Одитиране..."
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5" />
                          Дълбок одит
                        </span>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-2 md:hidden">
          {rows.map((campaign) => (
            <Card key={campaign.id} className="border-border/60 bg-muted/10">
              <CardContent className="space-y-2 p-3">
                <p className="text-sm font-medium">{campaign.campaignName}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>Разход: {formatCurrency(campaign.spend, campaign.currencyCode)}</p>
                  <p>Конверсии: {campaign.conversions}</p>
                  <p>CPA: {formatCurrency(campaign.cpa, campaign.currencyCode)}</p>
                </div>
                <Button size="sm" variant="outline" disabled={loadingCampaignId === campaign.id} onClick={() => void onDeepAudit(campaign)}>
                  {loadingCampaignId === campaign.id ? "Одитиране..." : "Дълбок одит"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {rows.map((campaign) => {
          const insight = auditByCampaign[campaign.id];
          if (!insight) return null;
          return (
            <Alert key={campaign.id}>
              <AlertTitle>AI одит: {campaign.campaignName}</AlertTitle>
              <AlertDescription>
                {insight.prioritizedActions.slice(0, 3).map((action, i) => (
                  <p key={`${action.task}-${i}`} className="flex flex-wrap items-center gap-2">
                    {action.platform !== "Общо" ? (
                      <CampaignPlatformGlyph platform={action.platform} metaPlacement={action.metaPlacement} />
                    ) : null}
                    <ImpactScorePill score={action.impactScore} label="Въздействие" />
                    <TypewriterInsight text={formatSlashDatesToBulgarian(action.task)} />
                  </p>
                ))}
              </AlertDescription>
            </Alert>
          );
        })}
      </CardContent>
    </Card>
  );
}
