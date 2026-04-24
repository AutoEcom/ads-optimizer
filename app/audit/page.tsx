"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, Sparkles } from "lucide-react";

import { TypewriterInsight } from "@/components/ai/typewriter-insight";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { fetchAdsPlatformData } from "@/lib/client-ads";
import { formatCurrency } from "@/lib/utils";
import { executeCampaignAction, runDeepAudit, runHealthAudit } from "@/services/ai-service";
import { AuditInsight, CampaignMetrics } from "@/types";

export default function AuditPage() {
  const [healthAudit, setHealthAudit] = useState<AuditInsight | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [auditByCampaign, setAuditByCampaign] = useState<Record<string, AuditInsight>>({});
  const [loadingCampaignId, setLoadingCampaignId] = useState<string | null>(null);
  const [pendingExecution, setPendingExecution] = useState<CampaignMetrics[] | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const { toast } = useToast();

  const { data: metaData } = useSWR("/api/ads/meta", fetchAdsPlatformData, { dedupingInterval: 30_000 });
  const { data: googleData } = useSWR("/api/ads/google", fetchAdsPlatformData, { dedupingInterval: 30_000 });

  const allCampaigns = useMemo(
    () => [...(metaData?.campaigns ?? []), ...(googleData?.campaigns ?? [])],
    [metaData, googleData]
  );

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

  async function deepAuditCampaign(campaign: CampaignMetrics) {
    setLoadingCampaignId(campaign.id);
    try {
      const result = await runDeepAudit(campaign, 20, 2.5);
      setAuditByCampaign((prev) => ({ ...prev, [campaign.id]: result }));
    } catch {
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

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Одит център</CardTitle>
          <Button onClick={() => void runAudit()} disabled={loadingHealth}>
            {loadingHealth ? "Анализ..." : "Стартирай Health Audit"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {allCampaigns.length === 0 ? (
            <Alert>
              <AlertTitle>Няма свързани кампании</AlertTitle>
              <AlertDescription>
                Добави Meta/Google токен и account ID в `Настройки`, за да се зареждат live данни.
              </AlertDescription>
            </Alert>
          ) : null}
          {(healthAudit?.prioritizedActions ?? []).map((action) => (
            <Alert key={action.task}>
              <AlertTitle>
                [{action.platform}] Impact {action.impactScore}
              </AlertTitle>
              <AlertDescription className="flex items-start justify-between gap-3">
                <TypewriterInsight text={`${action.task}: ${action.reason}`} />
                {action.actionType === "PAUSE" && action.campaignId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const campaign = allCampaigns.find((item) => item.id === action.campaignId);
                      if (!campaign) return;
                      setPendingExecution([campaign]);
                    }}
                  >
                    Изпълни
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ))}
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

      <section className="grid gap-4 lg:grid-cols-2">
        <CampaignTable
          title="Meta кампании"
          rows={metaData?.campaigns ?? []}
          loadingCampaignId={loadingCampaignId}
          auditByCampaign={auditByCampaign}
          onDeepAudit={deepAuditCampaign}
        />
        <CampaignTable
          title="Google кампании"
          rows={googleData?.campaigns ?? []}
          loadingCampaignId={loadingCampaignId}
          auditByCampaign={auditByCampaign}
          onDeepAudit={deepAuditCampaign}
        />
      </section>

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
        {rows.map((campaign) => {
          const insight = auditByCampaign[campaign.id];
          if (!insight) return null;
          return (
            <Alert key={campaign.id}>
              <AlertTitle>AI одит: {campaign.campaignName}</AlertTitle>
              <AlertDescription>
                {insight.prioritizedActions.slice(0, 3).map((action) => (
                  <p key={action.task}>
                    <TypewriterInsight text={`${action.task} (${action.impactScore})`} />
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
