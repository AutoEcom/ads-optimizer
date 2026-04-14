"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeAlert,
  Bot,
  Copy,
  Eye,
  Gauge,
  KeyRound,
  Layers,
  Save,
  Sparkles,
  WandSparkles
} from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { buildRulesFromSettings, evaluateUserRules } from "@/services/alert-rules";
import { generateAdVariations, runDeepAudit } from "@/services/ai-service";
import { getDigestTrend } from "@/services/daily-snapshot-service";
import { campaigns, getCampaignsByPlatform, morningDigest } from "@/services/mock-data";
import {
  getUserTargets,
  upsertPlatformToken,
  upsertUserTargets
} from "@/services/user-settings-service";
import { AdVariation, AuditInsight, CampaignMetrics, CriticalIssue, RuleSettings } from "@/types";

function formatCurrency(value: number) {
  return `${value.toFixed(0)} лв.`;
}

export function DashboardPage() {
  const [auditByCampaign, setAuditByCampaign] = useState<Record<string, AuditInsight>>({});
  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(null);

  const [productDescription, setProductDescription] = useState("");
  const [generatedAds, setGeneratedAds] = useState<AdVariation[]>([]);
  const [isGeneratingAds, setIsGeneratingAds] = useState(false);
  const generatorSectionRef = useRef<HTMLDivElement | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const [targetCpaInput, setTargetCpaInput] = useState("20");
  const [targetRoasInput, setTargetRoasInput] = useState("2.5");
  const [savedTargets, setSavedTargets] = useState({ targetCpa: 20, targetRoas: 2.5 });

  const [metaToken, setMetaToken] = useState("");
  const [googleToken, setGoogleToken] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [digestState, setDigestState] = useState(morningDigest);
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>({
    cpaAboveTargetEnabled: true,
    ctrBelowThresholdEnabled: true,
    ctrThreshold: 0.8,
    targetCpaValue: 20
  });

  const totals = useMemo(() => {
    const spend = campaigns.reduce((sum, item) => sum + item.spend, 0);
    const conversions = campaigns.reduce((sum, item) => sum + item.conversions, 0);
    const avgCpa = conversions > 0 ? spend / Math.max(1, conversions) : 0;
    const avgRoas = campaigns.reduce((sum, item) => sum + item.roas, 0) / campaigns.length;

    return { spend, conversions, avgCpa, avgRoas };
  }, []);

  const criticalIssues = useMemo(() => {
    const targetCpa = savedTargets.targetCpa;

    return campaigns.flatMap((campaign) => {
      const result: CriticalIssue[] = [];

      if (campaign.cpa > targetCpa * 1.2) {
        result.push({
          id: `${campaign.id}-high-waste`,
          severity: "Критично",
          title: "High Waste",
          description: `CPA е ${campaign.cpa.toFixed(1)} лв. при цел ${targetCpa.toFixed(
            1
          )} лв. Губиш по ${(campaign.cpa - targetCpa).toFixed(1)} лв. на продажба.`,
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
            campaign.spend
          )} без конверсии. Спри кампанията и смени криейтива.`,
          platform: campaign.platform,
          campaignId: campaign.id
        });
      }

      return result;
    });
  }, [savedTargets.targetCpa]);

  const dynamicRules = useMemo(() => buildRulesFromSettings(ruleSettings), [ruleSettings]);
  const userAlerts = useMemo(() => evaluateUserRules(campaigns, dynamicRules), [dynamicRules]);
  const metaCampaigns = useMemo(() => getCampaignsByPlatform("Meta"), []);
  const googleCampaigns = useMemo(() => getCampaignsByPlatform("Google"), []);

  useEffect(() => {
    async function loadTargets() {
      try {
        const profileTargets = await getUserTargets();
        if (profileTargets.targetCpa !== null && profileTargets.targetRoas !== null) {
          setSavedTargets({
            targetCpa: profileTargets.targetCpa,
            targetRoas: profileTargets.targetRoas
          });
          setTargetCpaInput(String(profileTargets.targetCpa));
          setTargetRoasInput(String(profileTargets.targetRoas));
          setRuleSettings((prev) => ({
            ...prev,
            targetCpaValue: profileTargets.targetCpa
          }));
        }
      } catch {
        // Keep local defaults when profile does not exist yet.
      }
    }

    void loadTargets();
  }, []);

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

  const handleAdGeneration = async () => {
    if (!productDescription.trim()) return;
    setIsGeneratingAds(true);
    const results = await generateAdVariations(productDescription.trim());
    setGeneratedAds(results);
    setIsGeneratingAds(false);
  };

  const handleFixWithAi = (issue: CriticalIssue) => {
    const campaign = campaigns.find((item) => item.id === issue.campaignId);
    if (!campaign) return;

    const autoFilledPrompt =
      `Продукт/оферта: ${campaign.campaignName}. ` +
      `Платформа: ${campaign.platform}. ` +
      `Проблем: ${issue.title}. ` +
      `Контекст: Разход ${formatCurrency(campaign.spend)}, ` +
      `конверсии ${campaign.conversions}, CTR ${campaign.ctr.toFixed(1)}%, ` +
      `CPA ${campaign.cpa ? formatCurrency(campaign.cpa) : "няма стойност"}. ` +
      "Създай нов рекламен текст с ясен CTA и фокус върху по-висока конверсия.";

    setProductDescription(autoFilledPrompt);
    setGeneratedAds([]);
    generatorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => productInputRef.current?.focus(), 250);
  };

  const handleSaveTargets = async () => {
    try {
      const nextTargetCpa = Number(targetCpaInput);
      const nextTargetRoas = Number(targetRoasInput);

      await upsertUserTargets(nextTargetCpa, nextTargetRoas);
      setSavedTargets({ targetCpa: nextTargetCpa, targetRoas: nextTargetRoas });
      setRuleSettings((prev) => ({ ...prev, targetCpaValue: nextTargetCpa }));
      setSettingsMessage("Таргетите са записани в Supabase.");
    } catch {
      setSettingsMessage("Неуспешен запис на таргетите.");
    }
  };

  const handleSaveToken = async (platform: "Meta" | "Google", token: string) => {
    try {
      await upsertPlatformToken(platform, token);
      setSettingsMessage(`Токенът за ${platform} е записан.`);
    } catch {
      setSettingsMessage(`Неуспешен запис на токен за ${platform}.`);
    }
  };

  const copyToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({
      title: "Копирано в клипборда!",
      description: "Готово за поставяне в Meta Ads Manager!"
    });
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 px-4 py-8">
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Layers className="h-5 w-5 text-primary" />
              Вход и акаунт
            </CardTitle>
            <CardDescription>Supabase Auth (имейл и парола)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Имейл" />
            <Input type="password" placeholder="Парола" />
            <div className="flex gap-2">
              <Button>Вход</Button>
              <Button variant="outline">Регистрация</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Gauge className="h-5 w-5 text-primary" />
              Онбординг: Свържи акаунт
            </CardTitle>
            <CardDescription>Мок стъпка за свързване на рекламни платформи</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" variant="outline">
              Свържи Meta Ads
            </Button>
            <Button className="w-full" variant="outline">
              Свържи Google Ads
            </Button>
            <p className="text-sm text-muted-foreground">Статус: Очаква свързване</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Общ разход" value={formatCurrency(totals.spend)} progress={78} />
        <MetricCard label="Общо конверсии" value={`${totals.conversions}`} progress={62} />
        <MetricCard label="Среден CPA" value={formatCurrency(totals.avgCpa)} progress={41} />
        <MetricCard label="Среден ROAS" value={totals.avgRoas.toFixed(2)} progress={57} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Критични проблеми
          </CardTitle>
          <CardDescription>Сигнали спрямо целевия CPA от профила</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5 text-primary" />
            Настройки за MVP интеграции
          </CardTitle>
          <CardDescription>Ръчно поставяне на токени (Meta/Google) и таргети за аларми.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_120px_120px]">
            <Input
              value={targetCpaInput}
              onChange={(event) => setTargetCpaInput(event.target.value)}
              placeholder="Целеви CPA (лв.)"
            />
            <Input
              value={targetRoasInput}
              onChange={(event) => setTargetRoasInput(event.target.value)}
              placeholder="Целеви ROAS"
            />
            <Button onClick={handleSaveTargets}>
              <Save className="mr-1 h-4 w-4" />
              Запази цели
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_160px]">
            <Input
              value={metaToken}
              onChange={(event) => setMetaToken(event.target.value)}
              placeholder="Meta Access Token"
            />
            <Button variant="outline" onClick={() => handleSaveToken("Meta", metaToken)}>
              Запази Meta токен
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_160px]">
            <Input
              value={googleToken}
              onChange={(event) => setGoogleToken(event.target.value)}
              placeholder="Google Developer Token"
            />
            <Button variant="outline" onClick={() => handleSaveToken("Google", googleToken)}>
              Запази Google токен
            </Button>
          </div>

          {settingsMessage ? <p className="text-sm text-primary">{settingsMessage}</p> : null}
          <p className="text-xs text-muted-foreground">
            Активни цели: CPA {savedTargets.targetCpa} лв., ROAS {savedTargets.targetRoas}
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <CampaignTable
          title="Meta кампании"
          rows={metaCampaigns}
          onAudit={handleDeepAudit}
          loadingId={loadingCampaignId}
          auditByCampaign={auditByCampaign}
        />
        <CampaignTable
          title="Google кампании"
          rows={googleCampaigns}
          onAudit={handleDeepAudit}
          loadingId={loadingCampaignId}
          auditByCampaign={auditByCampaign}
        />
      </section>

      <Card ref={generatorSectionRef}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <BadgeAlert className="h-5 w-5 text-primary" />
              Правила за алерти
            </CardTitle>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  Rule Settings
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Control Center: Rule Settings</SheetTitle>
                  <SheetDescription>
                    Включвай и изключвай глобалните правила за мониторинг.
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                    <p className="text-sm">Alert if CPA is 20% above target</p>
                    <Switch
                      checked={ruleSettings.cpaAboveTargetEnabled}
                      onCheckedChange={(value) =>
                        setRuleSettings((prev) => ({
                          ...prev,
                          cpaAboveTargetEnabled: value
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                    <p className="text-sm">Alert if CTR drops below 0.8%</p>
                    <Switch
                      checked={ruleSettings.ctrBelowThresholdEnabled}
                      onCheckedChange={(value) =>
                        setRuleSettings((prev) => ({
                          ...prev,
                          ctrBelowThresholdEnabled: value
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2 rounded-lg border border-border/70 p-3">
                    <p className="text-sm">Target CPA Value</p>
                    <Input
                      type="number"
                      min={1}
                      step="0.1"
                      value={ruleSettings.targetCpaValue}
                      onChange={(event) =>
                        setRuleSettings((prev) => ({
                          ...prev,
                          targetCpaValue: Number(event.target.value || 0)
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Правилото за CPA използва праг {Number((ruleSettings.targetCpaValue * 1.2).toFixed(2))} лв.
                    </p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <CardDescription>JSON-логика за потребителски сигнали</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {userAlerts.map((alert) => (
            <Alert key={alert.id} className="border-primary/40">
              <AlertTitle>Потребителско правило</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <WandSparkles className="h-5 w-5 text-primary" />
            AI генератор на реклами
          </CardTitle>
          <CardDescription>
            Въведи продуктово описание и получи 3 вариации (заглавие, текст, hook)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              ref={productInputRef}
              value={productDescription}
              onChange={(event) => setProductDescription(event.target.value)}
              placeholder="Пример: Онлайн курс по дигитален маркетинг за малки бизнеси"
            />
            <Button onClick={handleAdGeneration} disabled={isGeneratingAds}>
              {isGeneratingAds ? "Генериране..." : "Генерирай"}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {generatedAds.map((variant) => (
              <Card key={variant.headline} className="border-primary/30">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{variant.headline}</CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 transition-colors hover:bg-primary/10"
                      onClick={() => void copyToClipboard(variant.headline)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-start justify-between gap-2">
                    <p>{variant.primaryText}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 transition-colors hover:bg-primary/10"
                      onClick={() => void copyToClipboard(variant.primaryText)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-primary">Hook: {variant.hook}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 transition-colors hover:bg-primary/10"
                      onClick={() => void copyToClipboard(variant.hook)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

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
            {JSON.stringify({ campaigns, dynamicRules, digestState }, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </main>
  );
}

function MetricCard({
  label,
  value,
  progress
}: {
  label: string;
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
                <TableCell>{formatCurrency(campaign.spend)}</TableCell>
                <TableCell>{campaign.conversions}</TableCell>
                <TableCell>{campaign.cpa ? formatCurrency(campaign.cpa) : "-"}</TableCell>
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
            <Alert key={insight.campaignId} className="border-primary/40">
              <AlertTitle>AI одит: {campaign.campaignName}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {insight.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          );
        })}
      </CardContent>
    </Card>
  );
}
