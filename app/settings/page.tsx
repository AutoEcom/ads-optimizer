"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2Off, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  disconnectPlatformToken,
  getPlatformConnectionStatus,
  getUserTargets,
  PlatformConnectionStatus,
  upsertPlatformToken,
  upsertUserTargets
} from "@/services/user-settings-service";

export default function SettingsPage() {
  const router = useRouter();
  const [targetCpa, setTargetCpa] = useState("20");
  const [targetRoas, setTargetRoas] = useState("2.5");
  const [metaToken, setMetaToken] = useState("");
  const [metaAccountId, setMetaAccountId] = useState("");
  const [googleToken, setGoogleToken] = useState("");
  const [googleAccountId, setGoogleAccountId] = useState("");
  const [message, setMessage] = useState("");
  const [metaStatus, setMetaStatus] = useState<PlatformConnectionStatus | null>(null);
  const [googleStatus, setGoogleStatus] = useState<PlatformConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

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

  async function saveToken(platform: "Meta" | "Google", token: string, accountId: string) {
    try {
      const trimmed = token.trim();
      if (!trimmed) {
        setMessage(`Въведете нов ${platform} access token (маската е само преглед).`);
        return;
      }
      await upsertPlatformToken(platform, token, accountId);
      setMessage(`Токенът за ${platform} е записан.`);
      await refreshConnectionStatus();
      router.refresh();
      if (platform === "Meta") setMetaToken("");
      if (platform === "Google") setGoogleToken("");
    } catch (error) {
      setMessage((error as Error).message || `Неуспешен запис за ${platform}.`);
    }
  }

  async function disconnectPlatform(platform: "Meta" | "Google") {
    try {
      await disconnectPlatformToken(platform);
      setMessage(`Връзката с ${platform} е прекъсната.`);
      await refreshConnectionStatus();
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message || `Неуспешно прекъсване за ${platform}.`);
    }
  }

  const metaDisplayToken =
    metaToken.length > 0 ? metaToken : metaStatus?.isConnected && metaStatus.maskedToken ? metaStatus.maskedToken : "";
  const googleDisplayToken =
    googleToken.length > 0
      ? googleToken
      : googleStatus?.isConnected && googleStatus.maskedToken
        ? googleStatus.maskedToken
        : "";

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Настройки</CardTitle>
          <CardDescription>Управлявай API токени и таргети.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
            <Input value={targetCpa} onChange={(event) => setTargetCpa(event.target.value)} placeholder="Target CPA (EUR)" />
            <Input value={targetRoas} onChange={(event) => setTargetRoas(event.target.value)} placeholder="Target ROAS" />
            <Button onClick={() => void saveTargets()}>
              <Save className="mr-1 h-4 w-4" />
              Запази
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_200px]">
            <Input
              value={metaDisplayToken}
              onChange={(event) => setMetaToken(event.target.value)}
              placeholder="Meta Access Token"
            />
            <Button variant="outline" onClick={() => void saveToken("Meta", metaToken, metaAccountId)}>
              Запази Meta токен
            </Button>
          </div>
          <Input value={metaAccountId} onChange={(event) => setMetaAccountId(event.target.value)} placeholder="Meta Ad Account ID" />
          <PlatformStatusPanel
            platform="Meta"
            status={metaStatus}
            loading={statusLoading}
            onDisconnect={() => void disconnectPlatform("Meta")}
          />

          <div className="grid gap-2 md:grid-cols-[1fr_200px]">
            <Input
              value={googleDisplayToken}
              onChange={(event) => setGoogleToken(event.target.value)}
              placeholder="Google Access Token"
            />
            <Button variant="outline" onClick={() => void saveToken("Google", googleToken, googleAccountId)}>
              Запази Google токен
            </Button>
          </div>
          <Input value={googleAccountId} onChange={(event) => setGoogleAccountId(event.target.value)} placeholder="Google Customer ID" />
          <PlatformStatusPanel
            platform="Google"
            status={googleStatus}
            loading={statusLoading}
            onDisconnect={() => void disconnectPlatform("Google")}
          />

          {message ? <p className="text-sm text-teal-300">{message}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}

function PlatformStatusPanel({
  platform,
  status,
  loading,
  onDisconnect
}: {
  platform: "Meta" | "Google";
  status: PlatformConnectionStatus | null;
  loading: boolean;
  onDisconnect: () => void;
}) {
  const connected = Boolean(status?.isConnected);
  const badgeClass = connected
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-rose-400/40 bg-rose-500/10 text-rose-200";
  const statusText = connected ? "Свързан" : "Няма активна връзка";

  return (
    <div className="rounded-lg border border-border/60 bg-slate-950/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{platform} статус</p>
        <span className={`rounded-full border px-2.5 py-1 text-xs ${badgeClass}`}>{statusText}</span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>Account ID: {status?.accountId ?? "-"}</p>
        <p>Последна актуализация: {formatUpdatedAt(status?.updatedAt)}</p>
      </div>
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={onDisconnect} disabled={!connected || loading}>
          <Link2Off className="mr-1 h-3.5 w-3.5" />
          Прекъсни връзката
        </Button>
      </div>
    </div>
  );
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("bg-BG");
}
