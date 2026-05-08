"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Eye,
  Loader2,
  Sparkles
} from "lucide-react";

import {
  GOOGLE_ADS_SWR_KEY,
  META_ADS_SWR_KEY,
  useAdPlatformConnection
} from "@/hooks/use-ad-platform-connection";
import { useToast } from "@/hooks/use-toast";
import { GroupedActionCard } from "@/components/ads/grouped-action-card";
import { PrioritizedActionAlert } from "@/components/ads/prioritized-action-alert";
import { groupActionsByType, isPrioritizedActionGroup } from "@/lib/action-utils";
import {
  CampaignPlatformGlyph,
  ImpactScorePill,
  PlatformCornerBadge
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  executeCampaignAction,
  runDeepAudit,
  runHealthAudit
} from "@/services/ai-service";
import { fetchAiStrategyCache } from "@/services/ai-strategy-cache-service";
import { getDigestTrend } from "@/services/daily-snapshot-service";
import {
  emptyMorningDigest,
  getCampaignsByPlatform,
  morningDigest
} from "@/services/mock-data";
import { fetchAdsPlatformData } from "@/lib/client-ads";
import { formatSlashDatesToBulgarian } from "@/lib/format-insight-text";
import { cn, formatCurrency, formatCurrencyLatin } from "@/lib/utils";
import { AuditInsight, CampaignMetrics, CriticalIssue } from "@/types";

const SHOW_MOCK_DATA = process.env.NEXT_PUBLIC_SHOW_MOCK_DATA === "true";

export function DashboardPage() {
  const [auditByCampaign, setAuditByCampaign] = useState<Record<string, AuditInsight>>({});
  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(null);
  const [isHealthAuditRunning, setIsHealthAuditRunning] = useState(false);
  const [healthAudit, setHealthAudit] = useState<AuditInsight | null>(null);
  const [aiPrioritiesUpdatedAt, setAiPrioritiesUpdatedAt] = useState<string | null>(null);
  const [confirmRegeneratePrioritiesOpen, setConfirmRegeneratePrioritiesOpen] = useState(false);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [pendingExecution, setPendingExecution] = useState<
    | { mode: "single"; campaign: CampaignMetrics; reason: string }
    | { mode: "kill-all"; campaigns: CampaignMetrics[]; reason: string }
    | null
  >(null);

  const router = useRouter();
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const [savedTargets] = useState({ targetCpa: 20, targetRoas: 2.5 });
  const [digestState, setDigestState] = useState(() =>
    SHOW_MOCK_DATA ? morningDigest : emptyMorningDigest
  );

  const clearDisconnectedDashboardState = useCallback(async () => {
    setAuditByCampaign({});
    setHealthAudit(null);
    setAiPrioritiesUpdatedAt(null);
    setPendingExecution(null);
    setDigestState(SHOW_MOCK_DATA ? morningDigest : emptyMorningDigest);
    await mutate(META_ADS_SWR_KEY, undefined, { revalidate: false });
    await mutate(GOOGLE_ADS_SWR_KEY, undefined, { revalidate: false });
  }, [mutate]);

  const { linkedAccountStatus, hasLinkedAdAccounts } = useAdPlatformConnection({
    clearLinkedClientState: clearDisconnectedDashboardState,
    logPrefix: "[dashboard]",
    channelScope: "dashboard"
  });
  const metaSwrKey = hasLinkedAdAccounts ? META_ADS_SWR_KEY : null;
  const googleSwrKey = hasLinkedAdAccounts ? GOOGLE_ADS_SWR_KEY : null;

  const { data: metaAdsData, error: metaAdsError, isLoading: isMetaLoading } = useSWR(
    metaSwrKey,
    fetchAdsPlatformData,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
  const {
    data: googleAdsData,
    error: googleAdsError,
    isLoading: isGoogleLoading
  } = useSWR(googleSwrKey, fetchAdsPlatformData, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000
  });

  const metaCampaignsLive =
    metaAdsData?.campaigns ?? (SHOW_MOCK_DATA ? getCampaignsByPlatform("Meta") : []);
  const googleCampaignsLive =
    googleAdsData?.campaigns ?? (SHOW_MOCK_DATA ? getCampaignsByPlatform("Google") : []);
  const metaCurrency = metaAdsData?.currencyCode ?? "EUR";
  const googleCurrency = googleAdsData?.currencyCode ?? "EUR";
  const metaTokenExpired = isTokenExpired(metaAdsError);
  const googleTokenExpired = isTokenExpired(googleAdsError);

  const allCampaigns = useMemo(() => {
    return [...metaCampaignsLive, ...googleCampaignsLive];
  }, [metaCampaignsLive, googleCampaignsLive]);

  const totals = useMemo(() => {
    const spend = allCampaigns.reduce((sum, item) => sum + item.spend, 0);
    const conversions = allCampaigns.reduce((sum, item) => sum + item.conversions, 0);
    const avgCpa = conversions > 0 ? spend / Math.max(1, conversions) : 0;
    const avgRoas =
      allCampaigns.length > 0
        ? allCampaigns.reduce((sum, item) => sum + item.roas, 0) / allCampaigns.length
        : 0;

    return { spend, conversions, avgCpa, avgRoas };
  }, [allCampaigns]);

  const executiveAccountSpend = useMemo(() => {
    const fallbackMeta = metaCampaignsLive.reduce((s, c) => s + c.spend, 0);
    const fallbackGoogle = googleCampaignsLive.reduce((s, c) => s + c.spend, 0);
    const m = typeof metaAdsData?.totalSpend === "number" ? metaAdsData.totalSpend : fallbackMeta;
    const g = typeof googleAdsData?.totalSpend === "number" ? googleAdsData.totalSpend : fallbackGoogle;
    return { meta: m, google: g, combined: m + g };
  }, [metaAdsData?.totalSpend, googleAdsData?.totalSpend, metaCampaignsLive, googleCampaignsLive]);

  const executiveSpendDisplay = useMemo(() => {
    if (metaCurrency !== googleCurrency) {
      return `${formatCurrencyLatin(executiveAccountSpend.meta, metaCurrency)} · ${formatCurrencyLatin(
        executiveAccountSpend.google,
        googleCurrency
      )}`;
    }
    return formatCurrencyLatin(executiveAccountSpend.combined, metaCurrency);
  }, [executiveAccountSpend, metaCurrency, googleCurrency]);

  const criticalIssues = useMemo(() => {
    const targetCpa = savedTargets.targetCpa;

    return allCampaigns.flatMap((campaign) => {
      const result: CriticalIssue[] = [];

      if (campaign.cpa > targetCpa * 1.2) {
        result.push({
          id: `${campaign.id}-high-waste`,
          severity: "Критично",
          title: "High Waste",
          description: `CPA е ${campaign.cpa.toFixed(1)} EUR при цел ${targetCpa.toFixed(
            1
          )} EUR. Губиш по ${(campaign.cpa - targetCpa).toFixed(1)} EUR на продажба.`,
          platform: campaign.platform,
          campaignId: campaign.id
        });
      }

      if (campaign.conversions === 0 && campaign.spend > targetCpa) {
        result.push({
          id: `${campaign.id}-zero-conversion-leak`,
          severity: "Критично",
          title: "Zero Conversion Leak",
          description: `Разходът е ${formatCurrency(
            campaign.spend,
            campaign.currencyCode
          )} без конверсии. Спри кампанията и смени криейтива.`,
          platform: campaign.platform,
          campaignId: campaign.id
        });
      }

      return result;
    });
  }, [allCampaigns, savedTargets.targetCpa]);

  const metaCampaigns = useMemo(() => metaCampaignsLive, [metaCampaignsLive]);
  const googleCampaigns = useMemo(() => googleCampaignsLive, [googleCampaignsLive]);

  const potentialSavedEur = useMemo(() => {
    if (!healthAudit?.killList?.length) return 0;
    return healthAudit.killList.reduce((sum, item) => sum + item.spend, 0);
  }, [healthAudit]);

  const prioritizedDisplayList = useMemo(
    () => groupActionsByType(healthAudit?.prioritizedActions ?? []),
    [healthAudit?.prioritizedActions]
  );

  const groupAlertsCount = useMemo(
    () => prioritizedDisplayList.filter(isPrioritizedActionGroup).length,
    [prioritizedDisplayList]
  );

  const activeAlarmsBase = prioritizedDisplayList.length + criticalIssues.length;
  const activeAlarmsDisplay =
    groupAlertsCount > 0
      ? `${activeAlarmsBase} · ${groupAlertsCount === 1 ? "1 група" : `${groupAlertsCount} групи`} оптимизации`
      : String(activeAlarmsBase);

  const connectionStatus = useMemo(() => {
    if (!hasLinkedAdAccounts) return "Няма свързани акаунти";
    if (metaTokenExpired || googleTokenExpired) return "Провери токените в Настройки";
    return "Live данни активни";
  }, [hasLinkedAdAccounts, metaTokenExpired, googleTokenExpired]);

  const connectionStatusDotClass = useMemo(() => {
    if (!hasLinkedAdAccounts) return "bg-zinc-500 shadow-[0_0_8px_rgba(113,113,122,0.6)]";
    if (metaTokenExpired || googleTokenExpired) {
      return "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.85)]";
    }
    return "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]";
  }, [hasLinkedAdAccounts, metaTokenExpired, googleTokenExpired]);

  useEffect(() => {
    if (!hasLinkedAdAccounts) return;

    async function loadDigest() {
      try {
        const digest = await getDigestTrend();
        setDigestState({
          spendYesterday: digest.spendYesterday,
          campaignsToFix: digest.campaignsToFix,
          topMessage: digest.topMessage
        });
      } catch {
        setDigestState(SHOW_MOCK_DATA ? morningDigest : emptyMorningDigest);
      }
    }

    void loadDigest();
  }, [hasLinkedAdAccounts]);

  // Lightweight refresh за executive KPI без пълен AI orchestration цикъл.
  useEffect(() => {
    if (!hasLinkedAdAccounts) return;
    const id = window.setInterval(() => {
      void mutate(META_ADS_SWR_KEY);
      void mutate(GOOGLE_ADS_SWR_KEY);
    }, 25_000);
    return () => window.clearInterval(id);
  }, [hasLinkedAdAccounts, mutate]);

  useEffect(() => {
    if (!hasLinkedAdAccounts) return;

    let cancelled = false;
    async function loadCachedPriorities() {
      const row = await fetchAiStrategyCache();
      if (cancelled || !row) return;
      setHealthAudit((current) => (current ? current : row.insight));
      setAiPrioritiesUpdatedAt((current) => (current ? current : row.lastGeneratedAt));
    }

    void loadCachedPriorities();
    return () => {
      cancelled = true;
    };
  }, [hasLinkedAdAccounts]);

  const isPrioritiesFresh = useMemo(() => {
    if (!aiPrioritiesUpdatedAt) return false;
    return Date.now() - new Date(aiPrioritiesUpdatedAt).getTime() < 60 * 60 * 1000;
  }, [aiPrioritiesUpdatedAt]);

  const handleDeepAudit = async (campaign: CampaignMetrics) => {
    setLoadingCampaignId(campaign.id);
    try {
      const result = await runDeepAudit(campaign, savedTargets.targetCpa, savedTargets.targetRoas);
      setAuditByCampaign((prev) => ({ ...prev, [campaign.id]: result }));
    } catch (error) {
      if ((error as Error).message === "PAYWALL_FEATURE_LOCKED") {
        toast({
          title: "Pro функция",
          description: "Deep Audit е наличен за Pro план. Coming Soon / Upgrade."
        });
        setIsPaywallOpen(true);
        return;
      }
      toast({
        title: "Неуспешен дълбок одит",
        description: "Провери токените и опитай отново."
      });
    } finally {
      setLoadingCampaignId(null);
    }
  };

  const handleRunHealthAudit = async () => {
    if (allCampaigns.length === 0) {
      toast({
        title: "Липсват кампании",
        description: "Свържи акаунти от Настройки, за да стартираш Health Audit."
      });
      return;
    }

    setIsHealthAuditRunning(true);
    try {
      const result = await runHealthAudit(
        allCampaigns,
        savedTargets.targetCpa,
        savedTargets.targetRoas,
        "Home dashboard executive view"
      );
      setHealthAudit(result);
      setAiPrioritiesUpdatedAt(new Date().toISOString());
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
      setIsHealthAuditRunning(false);
    }
  };

  const openRegeneratePrioritiesModal = () => {
    if (allCampaigns.length === 0) {
      toast({
        title: "Липсват кампании",
        description: "Свържи акаунти от Настройки, за да стартираш Health Audit."
      });
      return;
    }
    setConfirmRegeneratePrioritiesOpen(true);
  };

  const confirmRegenerateAndRunAudit = async () => {
    setConfirmRegeneratePrioritiesOpen(false);
    await handleRunHealthAudit();
  };

  const handleFixWithAi = (issue: CriticalIssue) => {
    const campaign = allCampaigns.find((item) => item.id === issue.campaignId);
    if (!campaign) return;

    const autoFilledPrompt =
      `Продукт/оферта: ${campaign.campaignName}. ` +
      `Платформа: ${campaign.platform}. ` +
      `Проблем: ${issue.title}. ` +
      `Контекст: Разход ${formatCurrency(campaign.spend, campaign.currencyCode)}, ` +
      `конверсии ${campaign.conversions}, CTR ${campaign.ctr.toFixed(1)}%, ` +
      `CPA ${campaign.cpa ? formatCurrency(campaign.cpa, campaign.currencyCode) : "няма стойност"}. ` +
      "Създай нов рекламен текст с ясен CTA и фокус върху по-висока конверсия.";

    const next = `/generator?prefill=${encodeURIComponent(autoFilledPrompt)}` as Route;
    router.push(next);
  };

  const queueExecution = (campaign: CampaignMetrics, reason: string) => {
    setPendingExecution({ mode: "single", campaign, reason });
  };

  const queueKillAll = () => {
    const killCampaigns = (healthAudit?.killList ?? [])
      .map((item) => allCampaigns.find((campaign) => campaign.id === item.campaignId))
      .filter((campaign): campaign is CampaignMetrics => Boolean(campaign));

    if (killCampaigns.length === 0) return;
    setPendingExecution({
      mode: "kill-all",
      campaigns: killCampaigns,
      reason: "3x Kill Rule: незабавно ограничаване на загубите."
    });
  };

  const confirmExecution = async () => {
    if (!pendingExecution) return;
    setIsExecutingAction(true);
    try {
      if (pendingExecution.mode === "single") {
        await executeCampaignAction({
          platform: pendingExecution.campaign.platform,
          campaignId: pendingExecution.campaign.id,
          campaignName: pendingExecution.campaign.campaignName,
          action: "PAUSE",
          reason: pendingExecution.reason
        });
      } else {
        await Promise.all(
          pendingExecution.campaigns.map((campaign) =>
            executeCampaignAction({
              platform: campaign.platform,
              campaignId: campaign.id,
              campaignName: campaign.campaignName,
              action: "PAUSE",
              reason: pendingExecution.reason
            })
          )
        );
      }

      toast({
        title: "Изпълнено успешно",
        description: "Кампанията е спряна успешно. Промяната е записана в лога."
      });
      setPendingExecution(null);
    } catch {
      toast({
        title: "Грешка при изпълнение",
        description: "Действието не беше приложено. Провери токена и опитай отново."
      });
    } finally {
      setIsExecutingAction(false);
    }
  };

  const displayCurrency = metaCurrency === googleCurrency ? metaCurrency : "EUR";

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 overflow-visible px-3 py-5 sm:px-4 sm:py-8">
      {linkedAccountStatus === "loading" ? (
        <DashboardConnectionSkeleton />
      ) : linkedAccountStatus === "not-linked" ? (
        <section className="mx-auto max-w-2xl">
          <Card className="border-teal-500/25 shadow-[0_0_32px_rgba(20,184,166,0.15)]">
            <CardHeader className="space-y-3 text-center sm:text-left">
              <CardTitle className="flex flex-col items-center gap-2 text-2xl sm:flex-row sm:justify-start">
                <Activity className="h-7 w-7 shrink-0 text-primary" />
                Център за онбординг
              </CardTitle>
              <p className="text-base font-medium leading-relaxed text-foreground">
                Добре дошли в AdGuard AI! За да анализираме вашите кампании и да открием критични загуби, трябва
                първо да свържете вашия рекламен акаунт.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={() => router.push("/settings" as Route)}
                >
                  Свържи Meta Ads
                </Button>
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={() => router.push("/settings" as Route)}
                >
                  Свържи Google Ads
                </Button>
              </div>
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", connectionStatusDotClass)}
                  aria-hidden="true"
                />
                Статус: {connectionStatus}
              </p>
            </CardContent>
          </Card>
        </section>
      ) : (
        <>
          <section className="grid gap-4">
            <Card>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", connectionStatusDotClass)}
                    aria-hidden="true"
                  />
                  Статус: {connectionStatus}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="sm:w-auto"
                  onClick={() => router.push("/settings" as Route)}
                >
                  Управление на връзките
                </Button>
              </CardContent>
            </Card>
          </section>

          <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl text-foreground">Executive View</CardTitle>
              <CardDescription>Резюме за състоянието на рекламния акаунт.</CardDescription>
            </div>
            <span className="shrink-0 rounded-full border border-teal-500/30 px-3 py-1 text-xs text-muted-foreground">
              {metaCurrency === googleCurrency ? `Валута: ${metaCurrency}` : "Валута: Mixed currencies"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center justify-center gap-2">
            <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Общ здравен статус
            </p>
            <RadialScore score={healthAudit?.healthScore ?? 0} />
          </div>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label={<span>Потенциално спасени EUR</span>}
                value={formatCurrencyLatin(potentialSavedEur, displayCurrency)}
                progress={potentialSavedEur > 0 ? 48 : 0}
              />
              <MetricCard label="Активни аларми" value={activeAlarmsDisplay} progress={40} />
              <MetricCard
                label={
                  <span className="inline-flex items-center gap-1">
                    Общ разход
                    {metaCurrency !== googleCurrency ? (
                      <span title="Внимание: Данните са в различни валути">
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                      </span>
                    ) : null}
                  </span>
                }
                value={executiveSpendDisplay}
                progress={78}
              />
            </div>

            <div className="premium-glow rounded-xl border border-teal-500/20 p-4">
              <p className="text-sm font-medium text-foreground">Top Priority Actions</p>
              {aiPrioritiesUpdatedAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Последна актуализация: {formatAiPrioritiesTimestamp(aiPrioritiesUpdatedAt)}
                </p>
              ) : null}
              {isPrioritiesFresh ? (
                <p className="mt-1 text-xs text-teal-200/90">
                  Генерирани преди по-малко от час — данните вероятно са още актуални.
                </p>
              ) : null}
              <div className="mt-3">
                <Button
                  className={cn(
                    "sm:w-auto",
                    isPrioritiesFresh
                      ? "border-teal-500/40 bg-transparent text-teal-100 hover:bg-teal-500/10"
                      : "bg-emerald-500 text-white hover:bg-emerald-600"
                  )}
                  variant={isPrioritiesFresh ? "outline" : "default"}
                  onClick={openRegeneratePrioritiesModal}
                  disabled={isHealthAuditRunning || allCampaigns.length === 0}
                >
                  {isHealthAuditRunning ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Анализ...
                    </span>
                  ) : (
                    "Обнови AI приоритетите"
                  )}
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Prioritized Action Plan</p>
              <div className="mt-2 space-y-2">
                {!healthAudit ? (
                  <p className="text-sm text-muted-foreground">
                    Стартирай Health Audit, за да видиш ranked action plan.
                  </p>
                ) : prioritizedDisplayList.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                    <span>Всичко изглежда наред! Няма критични препоръки в момента.</span>
                  </div>
                ) : (
                  prioritizedDisplayList.slice(0, 5).map((item, idx) =>
                    isPrioritizedActionGroup(item) ? (
                      <GroupedActionCard
                        key={`group-${item.type}-${idx}`}
                        group={item}
                        getCampaign={(a) =>
                          a.campaignId ? (allCampaigns.find((c) => c.id === a.campaignId) ?? null) : null
                        }
                        targetCpa={savedTargets.targetCpa}
                        auditSnapshotReady={Boolean(healthAudit)}
                        childFooter={(a) =>
                          a.actionType === "PAUSE" && a.campaignId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const campaign = allCampaigns.find((c) => c.id === a.campaignId);
                                if (!campaign) return;
                                queueExecution(campaign, a.reason);
                              }}
                            >
                              Изпълни
                            </Button>
                          ) : null
                        }
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
                        targetCpa={savedTargets.targetCpa}
                        auditSnapshotReady={Boolean(healthAudit)}
                        footer={
                          item.actionType === "PAUSE" && item.campaignId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const campaign = allCampaigns.find((c) => c.id === item.campaignId);
                                if (!campaign) return;
                                queueExecution(campaign, item.reason);
                              }}
                            >
                              Изпълни
                            </Button>
                          ) : null
                        }
                      />
                    )
                  )
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-red-300">Kill List (3x Kill Rule)</p>
                {healthAudit && healthAudit.killList.length > 0 ? (
                  <Button size="sm" variant="outline" className="border-red-500/50 text-red-300" onClick={queueKillAll}>
                    Спри всички (Kill All)
                  </Button>
                ) : null}
              </div>
              <div className="mt-2 space-y-2">
                {(healthAudit?.killList ?? []).slice(0, 5).map((item) => (
                  <Alert key={item.campaignId} className="relative border-red-500/50 bg-red-500/5 pt-2">
                    <div className="absolute right-3 top-3 z-[1]">
                      <PlatformCornerBadge platform={item.platform} metaPlacement={item.metaPlacement} />
                    </div>
                    <AlertTitle className="flex flex-wrap items-center gap-2 pr-20">
                      <CampaignPlatformGlyph platform={item.platform} metaPlacement={item.metaPlacement} />
                      <span>{item.campaignName}</span>
                    </AlertTitle>
                    <AlertDescription>
                      <div className="flex items-start justify-between gap-3">
                        <p>
                          {formatSlashDatesToBulgarian(item.reason)} Разход:{" "}
                          {formatCurrencyLatin(
                            item.spend,
                            allCampaigns.find((c) => c.id === item.campaignId)?.currencyCode ?? "EUR"
                          )}
                          .
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const campaign = allCampaigns.find((campaign) => campaign.id === item.campaignId);
                            if (!campaign) return;
                            queueExecution(campaign, item.reason);
                          }}
                        >
                          Изпълни
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
                {healthAudit && healthAudit.killList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Няма кампании, които удрят 3x Kill Rule.</p>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Критични проблеми
          </CardTitle>
          <CardDescription>Сигнали спрямо целевия CPA от профила</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {metaTokenExpired ? (
            <Alert className="border-amber-500/40">
              <AlertTitle>Meta връзката е прекъсната</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Токенът е изтекъл. Свържи отново Meta акаунта.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/settings" as Route)}
                >
                  Свържи отново
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {criticalIssues.map((issue) => {
            const related = allCampaigns.find((c) => c.id === issue.campaignId);
            return (
              <Alert key={issue.id} className="relative border-red-500/50 bg-red-500/5 pt-2">
                <div className="absolute right-3 top-3 z-[1]">
                  <PlatformCornerBadge platform={issue.platform} metaPlacement={related?.metaPlacement} />
                </div>
                <AlertTitle className="flex flex-wrap items-center gap-2 pr-20">
                  <CampaignPlatformGlyph platform={issue.platform} metaPlacement={related?.metaPlacement} />
                  <span>
                    {issue.severity}: {issue.title}
                  </span>
                </AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{formatSlashDatesToBulgarian(issue.description)}</p>
                  <Button size="sm" onClick={() => handleFixWithAi(issue)}>
                    Fix with AI
                  </Button>
                </AlertDescription>
              </Alert>
            );
          })}
          {!metaTokenExpired && criticalIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">Няма активни критични проблеми към момента.</p>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {isMetaLoading ? (
          <MetaCampaignSkeleton />
        ) : (
          <CampaignTable
            title="Meta кампании"
            rows={metaCampaigns}
            onAudit={handleDeepAudit}
            loadingId={loadingCampaignId}
            auditByCampaign={auditByCampaign}
          />
        )}
        {googleTokenExpired ? (
          <Card>
            <CardHeader>
              <CardTitle>Google кампании</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert className="border-amber-500/40">
                <AlertTitle>Google връзката е прекъсната</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>Токенът е изтекъл. Свържи отново Google акаунта.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/settings" as Route)}
                  >
                    Свържи отново
                  </Button>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : isGoogleLoading ? (
          <MetaCampaignSkeleton title="Google кампании" />
        ) : (
          <CampaignTable
            title="Google кампании"
            rows={googleCampaigns}
            onAudit={handleDeepAudit}
            loadingId={loadingCampaignId}
            auditByCampaign={auditByCampaign}
          />
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bot className="h-5 w-5 text-primary" />
            Дневен отчет (Morning Digest)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Вчерашен разход: {formatCurrencyLatin(digestState.spendYesterday, "EUR")}</p>
          <p>Кампании за корекция: {digestState.campaignsToFix}</p>
          <p className="text-primary">{formatSlashDatesToBulgarian(digestState.topMessage)}</p>
        </CardContent>
      </Card>

          {SHOW_MOCK_DATA ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Eye className="h-5 w-5 text-primary" />
                  Raw Data View
                </CardTitle>
                <CardDescription>Суров изглед на мок данните за бърз debug</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
                  {JSON.stringify({ campaigns: allCampaigns, healthAudit, digestState }, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Dialog open={confirmRegeneratePrioritiesOpen} onOpenChange={setConfirmRegeneratePrioritiesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Обновяване на AI приоритетите</DialogTitle>
            <DialogDescription className="text-left leading-relaxed">
              Това действие ще направи нов задълбочен анализ на вашите кампании през Claude 4.x. Това ще се начисли
              към вашия месечен лимит за Usage. Сигурни ли сте?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmRegeneratePrioritiesOpen(false)}>
              Отказ
            </Button>
            <Button type="button" onClick={() => void confirmRegenerateAndRunAudit()}>
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

      <AlertDialog open={Boolean(pendingExecution)} onOpenChange={(isOpen) => !isOpen && setPendingExecution(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сигурни ли сте, че искате да спрете тази кампания?</AlertDialogTitle>
            <AlertDialogDescription>
              Това действие ще бъде изпратено директно към рекламния акаунт и записано в execution log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExecutingAction}>Отказ</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmExecution()} disabled={isExecutingAction}>
              {isExecutingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Потвърди
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function formatAiPrioritiesTimestamp(iso: string) {
  return new Date(iso).toLocaleString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function DashboardConnectionSkeleton() {
  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-4 w-40" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="flex justify-center">
            <Skeleton className="h-36 w-36 rounded-full" />
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <MetaCampaignSkeleton />
        <MetaCampaignSkeleton title="Google кампании" />
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  progress
}: {
  label: ReactNode;
  value: string;
  progress: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={progress} />
      </CardContent>
    </Card>
  );
}

function CampaignTable({
  title,
  rows,
  onAudit,
  loadingId,
  auditByCampaign
}: {
  title: string;
  rows: CampaignMetrics[];
  onAudit: (campaign: CampaignMetrics) => Promise<void>;
  loadingId: string | null;
  auditByCampaign: Record<string, AuditInsight>;
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
                <TableHead>ROAS</TableHead>
                <TableHead className="text-right">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>{campaign.campaignName}</TableCell>
                  <TableCell>{formatCurrency(campaign.spend, campaign.currencyCode)}</TableCell>
                  <TableCell>{campaign.conversions}</TableCell>
                  <TableCell>{campaign.cpa ? formatCurrency(campaign.cpa, campaign.currencyCode) : "-"}</TableCell>
                  <TableCell>{campaign.roas.toFixed(1)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loadingId === campaign.id}
                      onClick={() => onAudit(campaign)}
                    >
                      {loadingId === campaign.id ? (
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
                  <p>CPA: {campaign.cpa ? formatCurrency(campaign.cpa, campaign.currencyCode) : "-"}</p>
                  <p>ROAS: {campaign.roas.toFixed(1)}</p>
                </div>
                <Button size="sm" variant="outline" disabled={loadingId === campaign.id} onClick={() => onAudit(campaign)}>
                  {loadingId === campaign.id ? "Одитиране..." : "Дълбок одит"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {rows.map((campaign) => {
          const insight = auditByCampaign[campaign.id];
          if (!insight) return null;

          return (
            <Alert key={insight.campaignId ?? campaign.id} className="border-primary/40">
              <AlertTitle>AI одит: {campaign.campaignName}</AlertTitle>
              <AlertDescription>
                <ul className="space-y-2">
                  {insight.prioritizedActions.slice(0, 3).map((action, i) => (
                    <li key={`${action.task}-${i}`} className="flex flex-wrap items-start gap-2">
                      {action.platform !== "Общо" ? (
                        <CampaignPlatformGlyph platform={action.platform} metaPlacement={action.metaPlacement} />
                      ) : null}
                      <ImpactScorePill score={action.impactScore} label="Въздействие" />
                      <span className="text-sm text-muted-foreground">
                        {formatSlashDatesToBulgarian(action.task)}
                      </span>
                    </li>
                  ))}
                </ul>
                {insight.killList.length > 0 ? (
                  <p className="mt-2 text-red-300">
                    Kill List: {insight.killList.map((item) => item.campaignName).join(", ")}
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RadialScore({ score }: { score: number }) {
  const safeScore = Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-36 w-36">
      <div
        className="h-36 w-36 rounded-full shadow-[0_0_24px_rgba(45,212,191,0.35)]"
        style={{
          background: `conic-gradient(hsl(var(--primary)) ${safeScore * 3.6}deg, hsl(var(--muted)) 0deg)`
        }}
      />
      <div className="absolute inset-3 flex items-center justify-center rounded-full bg-background">
        <div className="text-center">
          <p className="text-3xl font-semibold">{safeScore}</p>
          <p className="text-xs text-muted-foreground">Health score (0–100)</p>
        </div>
      </div>
    </div>
  );
}

function MetaCampaignSkeleton({ title = "Meta кампании" }: { title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

function isTokenExpired(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as Error & { status?: number; code?: string };
  return err.status === 401 || err.code === "TOKEN_EXPIRED";
}
