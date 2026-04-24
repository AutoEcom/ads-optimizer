"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  Eye,
  Loader2,
  Sparkles
} from "lucide-react";

import { useToast } from "@/hooks/use-toast";
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
import { getDigestTrend } from "@/services/daily-snapshot-service";
import { getCampaignsByPlatform, morningDigest } from "@/services/mock-data";
import { formatCurrency } from "@/lib/utils";
import { AuditInsight, CampaignMetrics, CriticalIssue } from "@/types";

export function DashboardPage() {
  const [auditByCampaign, setAuditByCampaign] = useState<Record<string, AuditInsight>>({});
  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(null);
  const [isHealthAuditRunning, setIsHealthAuditRunning] = useState(false);
  const [healthAudit, setHealthAudit] = useState<AuditInsight | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [pendingExecution, setPendingExecution] = useState<
    | { mode: "single"; campaign: CampaignMetrics; reason: string }
    | { mode: "kill-all"; campaigns: CampaignMetrics[]; reason: string }
    | null
  >(null);

  const router = useRouter();
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const { toast } = useToast();

  const [savedTargets] = useState({ targetCpa: 20, targetRoas: 2.5 });
  const [digestState, setDigestState] = useState(morningDigest);

  const { data: metaAdsData, error: metaAdsError, isLoading: isMetaLoading } = useSWR(
    "/api/ads/meta",
    fetchAdsPlatformData,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
  const {
    data: googleAdsData,
    error: googleAdsError,
    isLoading: isGoogleLoading
  } = useSWR("/api/ads/google", fetchAdsPlatformData, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000
  });

  const metaCampaignsLive = metaAdsData?.campaigns ?? getCampaignsByPlatform("Meta");
  const googleCampaignsLive = googleAdsData?.campaigns ?? getCampaignsByPlatform("Google");
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

  const activeAlarmsCount = (healthAudit?.prioritizedActions.length ?? 0) + criticalIssues.length;

  const connectionStatus = useMemo(() => {
    if (metaTokenExpired || googleTokenExpired) return "Провери токените в Настройки";
    if (allCampaigns.length > 0) return "Live данни активни";
    return "Очаква свързване";
  }, [metaTokenExpired, googleTokenExpired, allCampaigns.length]);
  const isConnectionHealthy = !metaTokenExpired && !googleTokenExpired && allCampaigns.length > 0;

  useEffect(() => {
    async function loadDigest() {
      try {
        const digest = await getDigestTrend();
        setDigestState({
          spendYesterday: digest.spendYesterday,
          campaignsToFix: digest.campaignsToFix,
          topMessage: digest.topMessage
        });
      } catch {
        setDigestState(morningDigest);
      }
    }

    void loadDigest();
  }, []);

  const handleDeepAudit = async (campaign: CampaignMetrics) => {
    setLoadingCampaignId(campaign.id);
    try {
      const result = await runDeepAudit(campaign, savedTargets.targetCpa, savedTargets.targetRoas);
      setAuditByCampaign((prev) => ({ ...prev, [campaign.id]: result }));
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
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 px-4 py-8">
      <section className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Activity className="h-5 w-5 text-primary" />
              Онбординг: Свържи акаунт
            </CardTitle>
            <CardDescription>Първа стъпка за активиране на живи данни</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" variant="outline" onClick={() => router.push("/settings" as Route)}>
              Свържи Meta Ads
            </Button>
            <Button className="w-full" variant="outline" onClick={() => router.push("/settings" as Route)}>
              Свържи Google Ads
            </Button>
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isConnectionHealthy
                    ? "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]"
                    : "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.85)]"
                }`}
                aria-hidden="true"
              />
              Статус: {connectionStatus}
            </p>
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
          <div className="flex items-center justify-center">
            <RadialScore score={healthAudit?.healthScore ?? 0} />
          </div>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label={<span>Потенциално спасени EUR</span>}
                value={formatCurrency(potentialSavedEur, displayCurrency)}
                progress={potentialSavedEur > 0 ? 48 : 0}
              />
              <MetricCard label="Активни аларми" value={`${activeAlarmsCount}`} progress={40} />
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
                value={formatCurrency(totals.spend, metaCurrency)}
                progress={78}
              />
            </div>

            <div className="premium-glow rounded-xl border border-teal-500/20 p-4">
              <p className="text-sm font-medium text-foreground">Top Priority Actions</p>
              <div className="mt-3">
                <Button
                  className="bg-emerald-500 text-white hover:bg-emerald-600 sm:w-auto"
                  onClick={() => void handleRunHealthAudit()}
                  disabled={isHealthAuditRunning}
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
                {(healthAudit?.prioritizedActions ?? []).slice(0, 5).map((action) => (
                  <Alert key={`${action.platform}-${action.task}`} className="border-primary/40">
                    <AlertTitle>
                      [{action.platform}] Impact {action.impactScore}
                    </AlertTitle>
                    <AlertDescription>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{action.task}</p>
                          <p>{action.reason}</p>
                        </div>
                        {action.actionType === "PAUSE" && action.campaignId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const campaign = allCampaigns.find((item) => item.id === action.campaignId);
                              if (!campaign) return;
                              queueExecution(campaign, action.reason);
                            }}
                          >
                            Изпълни
                          </Button>
                        ) : null}
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
                {!healthAudit || healthAudit.prioritizedActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Стартирай Health Audit, за да видиш ranked action plan.
                  </p>
                ) : null}
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
                  <Alert key={item.campaignId} className="border-red-500/50 bg-red-500/5">
                    <AlertTitle>
                      {item.campaignName} ({item.platform})
                    </AlertTitle>
                    <AlertDescription>
                      <div className="flex items-start justify-between gap-3">
                        <p>
                          {item.reason} Разход: {formatCurrency(item.spend)}.
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
          {criticalIssues.map((issue) => (
            <Alert key={issue.id} className="border-red-500/50 bg-red-500/5">
              <AlertTitle>
                {issue.severity}: {issue.title} ({issue.platform})
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{issue.description}</p>
                <Button size="sm" onClick={() => handleFixWithAi(issue)}>
                  Fix with AI
                </Button>
              </AlertDescription>
            </Alert>
          ))}
          {!metaTokenExpired && criticalIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Няма активни критични проблеми. Свържи акаунти за live alerts.
            </p>
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
          <p>Вчерашен разход: {formatCurrency(digestState.spendYesterday)}</p>
          <p>Кампании за корекция: {digestState.campaignsToFix}</p>
          <p className="text-primary">{digestState.topMessage}</p>
        </CardContent>
      </Card>

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

        {rows.map((campaign) => {
          const insight = auditByCampaign[campaign.id];
          if (!insight) return null;

          return (
            <Alert key={insight.campaignId ?? campaign.id} className="border-primary/40">
              <AlertTitle>AI одит: {campaign.campaignName}</AlertTitle>
              <AlertDescription>
                <ul className="space-y-1">
                  {insight.prioritizedActions.slice(0, 3).map((action) => (
                    <li key={action.task}>
                      <span className="font-medium">
                        [{action.platform}] Impact {action.impactScore}:
                      </span>{" "}
                      {action.task}
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
          <p className="text-xs text-muted-foreground">Health Score</p>
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

type AdsPlatformData = {
  campaigns: CampaignMetrics[];
  currencyCode: string;
};

type AdsPlatformError = Error & {
  status?: number;
  code?: string;
};

async function fetchAdsPlatformData(url: string): Promise<AdsPlatformData> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as {
    campaigns?: CampaignMetrics[];
    currencyCode?: string;
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    const error = new Error(payload.error ?? "Неуспешно зареждане на данни.") as AdsPlatformError;
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }

  return {
    campaigns: payload.campaigns ?? [],
    currencyCode: payload.currencyCode ?? "EUR"
  };
}

function isTokenExpired(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as AdsPlatformError;
  return err.status === 401 || err.code === "TOKEN_EXPIRED";
}
