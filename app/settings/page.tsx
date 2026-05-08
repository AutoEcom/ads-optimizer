"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BlockMath } from "react-katex";
import { Info, Link2Off, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  checkPlatformTokenHealth,
  disconnectPlatformToken,
  fetchMetaAdAccounts,
  getPlatformConnectionStatus,
  getUserTargets,
  type MetaAdAccountOption,
  type PlatformConnectionStatus,
  startPlatformOAuth,
  syncOAuthTokenFromSession,
  updatePlatformAccountId,
  upsertUserTargets
} from "@/services/user-settings-service";
import { useToast } from "@/hooks/use-toast";
import "katex/dist/katex.min.css";

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [targetCpa, setTargetCpa] = useState("20");
  const [targetRoas, setTargetRoas] = useState("2.5");
  const [metaAccountId, setMetaAccountId] = useState("");
  const [googleAccountId, setGoogleAccountId] = useState("");
  const [metaAccounts, setMetaAccounts] = useState<MetaAdAccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [metaStatus, setMetaStatus] = useState<PlatformConnectionStatus | null>(null);
  const [googleStatus, setGoogleStatus] = useState<PlatformConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [metaNeedsReconnect, setMetaNeedsReconnect] = useState(false);
  const [googleNeedsReconnect, setGoogleNeedsReconnect] = useState(false);
  const [cpaHelpOpen, setCpaHelpOpen] = useState(false);
  const [roasHelpOpen, setRoasHelpOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const targets = await getUserTargets();
        if (targets.targetCpa !== null) setTargetCpa(String(targets.targetCpa));
        if (targets.targetRoas !== null) setTargetRoas(String(targets.targetRoas));
      } catch {
        // Session-less state is handled by middleware.
      }
      await refreshConnectionStatus();
    }

    void load();
  }, []);

  async function refreshConnectionStatus() {
    setStatusLoading(true);
    try {
      const [meta, google] = await Promise.all([
        getPlatformConnectionStatus("Meta"),
        getPlatformConnectionStatus("Google")
      ]);
      setMetaStatus(meta);
      setGoogleStatus(google);
      if (meta.accountId) setMetaAccountId(meta.accountId);
      if (google.accountId) setGoogleAccountId(google.accountId);

      if (meta.isConnected) {
        const health = await checkPlatformTokenHealth("Meta");
        setMetaNeedsReconnect(!health.valid || health.expiresSoon);
      } else {
        setMetaNeedsReconnect(false);
      }
      if (google.isConnected) {
        const health = await checkPlatformTokenHealth("Google");
        setGoogleNeedsReconnect(!health.valid || health.expiresSoon);
      } else {
        setGoogleNeedsReconnect(false);
      }
    } catch {
      // Keep settings usable even if status query fails.
    } finally {
      setStatusLoading(false);
    }
  }

  async function saveTargets() {
    try {
      await upsertUserTargets(Number(targetCpa), Number(targetRoas));
      setMessage("Таргетите са записани.");
    } catch (error) {
      setMessage((error as Error).message || "Неуспешен запис.");
    }
  }

  async function handleOAuthConnect(platform: "Meta" | "Google") {
    try {
      await startPlatformOAuth(platform);
    } catch (error) {
      setMessage((error as Error).message || `Неуспешно стартиране на ${platform} OAuth.`);
    }
  }

  async function disconnectPlatform(platform: "Meta" | "Google") {
    try {
      await disconnectPlatformToken(platform);
      setMessage(`Връзката с ${platform} е прекъсната.`);
      await refreshConnectionStatus();
      if (platform === "Meta") {
        setMetaAccounts([]);
        setMetaAccountId("");
      }
      if (platform === "Google") {
        setGoogleAccountId("");
      }
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message || `Неуспешно прекъсване за ${platform}.`);
    }
  }

  async function loadMetaAccounts() {
    if (!metaStatus?.isConnected) {
      setMetaAccounts([]);
      return;
    }
    setAccountsLoading(true);
    try {
      const accounts = await fetchMetaAdAccounts();
      setMetaAccounts(accounts);
    } catch (error) {
      setMetaAccounts([]);
      setMessage((error as Error).message || "Неуспешно зареждане на Meta акаунтите.");
    } finally {
      setAccountsLoading(false);
    }
  }

  async function saveMetaAccountSelection(nextAccountId: string) {
    setMetaAccountId(nextAccountId);
    try {
      await updatePlatformAccountId("Meta", nextAccountId);
      setMessage("Избраният Meta рекламен акаунт е записан.");
      await refreshConnectionStatus();
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message || "Неуспешно запазване на Meta акаунта.");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    const oauthErrorDescription = params.get("error_description");
    if (oauthError || oauthErrorDescription) {
      const raw = oauthErrorDescription ?? oauthError ?? "OAuth грешка";
      let safeMessage = raw;
      try {
        safeMessage = decodeURIComponent(raw).replace(/\+/g, " ");
      } catch {
        safeMessage = raw;
      }
      toast({
        title: "Неуспешно свързване с Meta",
        description:
          "Meta конфигурацията вероятно е непълна или URL адресът не е whitelist-нат. Детайли: " + safeMessage
      });
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("error");
      nextUrl.searchParams.delete("error_description");
      window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
      return;
    }

    const oauth = params.get("oauth");
    if (oauth !== "meta" && oauth !== "google") return;

    let cancelled = false;
    async function syncOAuthAndRefresh() {
      try {
        const platform = oauth === "meta" ? "Meta" : "Google";
        await syncOAuthTokenFromSession(platform);
        if (cancelled) return;
        await refreshConnectionStatus();
        if (platform === "Meta") await loadMetaAccounts();
        toast({
          title: "Профилът е свързан успешно!",
          description: "Изберете вашия рекламен акаунт от списъка."
        });
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("oauth");
        window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
      } catch (error) {
        if (cancelled) return;
        setMessage((error as Error).message || "Неуспешно финализиране на OAuth връзката.");
      }
    }
    void syncOAuthAndRefresh();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!metaStatus?.isConnected) {
      setMetaAccounts([]);
      return;
    }
    void loadMetaAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaStatus?.isConnected]);

  const connectedMetaAccountName = useMemo(() => {
    if (!metaStatus?.accountId) return null;
    const byId = metaAccounts.find((account) => account.id === metaStatus.accountId);
    return byId?.name ?? null;
  }, [metaAccounts, metaStatus?.accountId]);

  const connectedGoogleAccountName = useMemo(() => {
    if (!googleStatus?.accountId) return null;
    return `Google Ads ${googleStatus.accountId}`;
  }, [googleStatus?.accountId]);

  return (
    <main className="w-full space-y-3">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Настройки</CardTitle>
          <CardDescription>Интелигентен onboarding за цели и рекламни интеграции.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <Card className="w-full border-border/60 bg-slate-950/30">
            <CardHeader>
              <CardTitle className="text-base">Бизнес цели</CardTitle>
              <CardDescription>Настрой KPI таргетите, които AI ще използва за оптимизация.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Target CPA (EUR)</p>
                  <Input
                    value={targetCpa}
                    onChange={(event) => setTargetCpa(event.target.value)}
                    placeholder="напр. 20"
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => setCpaHelpOpen(true)}
                      className="text-teal-300 hover:text-teal-200"
                    >
                      Научи повече
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Target ROAS</p>
                  <Input
                    value={targetRoas}
                    onChange={(event) => setTargetRoas(event.target.value)}
                    placeholder="напр. 2.5"
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => setRoasHelpOpen(true)}
                      className="text-teal-300 hover:text-teal-200"
                    >
                      Научи повече
                    </button>
                  </div>
                </div>
              </div>
              <Button onClick={() => void saveTargets()}>
                <Save className="mr-1 h-4 w-4" />
                Запази бизнес целите
              </Button>
            </CardContent>
          </Card>

          <Card className="w-full border-border/60 bg-slate-950/30">
            <CardHeader>
              <CardTitle className="text-base">Интеграции</CardTitle>
              <CardDescription>Свържи рекламните платформи и избери правилните акаунти.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="space-y-3 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Meta (Facebook Ads)</p>
                  <PlatformStatusBadge
                    status={metaStatus}
                    needsReconnect={metaNeedsReconnect}
                    accountName={connectedMetaAccountName}
                    fallbackAccountId={metaStatus?.accountId}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="bg-blue-600 text-white hover:bg-blue-500"
                    onClick={() => void handleOAuthConnect("Meta")}
                  >
                    {metaNeedsReconnect ? "Свържи отново Facebook" : "Свържи Facebook"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void disconnectPlatform("Meta")}
                    disabled={!metaStatus?.isConnected || statusLoading}
                  >
                    <Link2Off className="mr-1 h-3.5 w-3.5" />
                    Прекъсни връзката
                  </Button>
                </div>
                {metaStatus?.isConnected ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Избери Meta ad account за live синхронизация:</p>
                    <select
                      value={metaAccountId}
                      onChange={(event) => void saveMetaAccountSelection(event.target.value)}
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                      disabled={accountsLoading || metaAccounts.length === 0}
                    >
                      <option value="">Избери акаунт...</option>
                      {metaAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} ({account.id})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">След свързване ще можеш да избереш ad account от списък.</p>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Google Ads</p>
                  <PlatformStatusBadge
                    status={googleStatus}
                    needsReconnect={googleNeedsReconnect}
                    accountName={connectedGoogleAccountName}
                    fallbackAccountId={googleStatus?.accountId}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={() => void handleOAuthConnect("Google")}
                  >
                    {googleNeedsReconnect ? "Свържи отново Google Ads" : "Свържи Google Ads"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void disconnectPlatform("Google")}
                    disabled={!googleStatus?.isConnected || statusLoading}
                  >
                    <Link2Off className="mr-1 h-3.5 w-3.5" />
                    Прекъсни връзката
                  </Button>
                </div>
                <Input
                  value={googleAccountId}
                  onChange={(event) => setGoogleAccountId(event.target.value)}
                  placeholder="Google Customer ID (напр. 123-456-7890)"
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          {message ? <p className="text-sm text-teal-300">{message}</p> : null}
        </CardContent>
      </Card>

      <Dialog open={cpaHelpOpen} onOpenChange={setCpaHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CPA (Цена за придобиване)</DialogTitle>
            <DialogDescription>
              CPA показва колко ти струва една реализация (покупка, lead или друга конверсия).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
            <BlockMath math={"\\text{CPA} = \\frac{\\text{Общи разходи за реклама}}{\\text{Брой реализации}}"} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={roasHelpOpen} onOpenChange={setRoasHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ROAS (Възвръщаемост)</DialogTitle>
            <DialogDescription>
              ROAS измерва приходите спрямо рекламния разход. Стойност над 1.0 означава положителна възвръщаемост.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
            <BlockMath math={"\\text{ROAS} = \\frac{\\text{Приходи от реклама}}{\\text{Разходи за реклама}}"} />
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function PlatformStatusBadge({
  status,
  needsReconnect,
  accountName,
  fallbackAccountId
}: {
  status: PlatformConnectionStatus | null;
  needsReconnect: boolean;
  accountName: string | null;
  fallbackAccountId: string | null | undefined;
}) {
  const connected = Boolean(status?.isConnected) && !needsReconnect;
  const badgeClass = connected
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-amber-400/40 bg-amber-500/10 text-amber-200";
  const statusText = connected
    ? `Свързан${accountName ? ` · ${accountName}` : fallbackAccountId ? ` · ${fallbackAccountId}` : ""}`
    : needsReconnect
      ? "Нужна е повторна връзка"
      : "Няма активна връзка";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${badgeClass}`}>{statusText}</span>
  );
}

