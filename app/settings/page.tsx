"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getUserTargets, upsertPlatformToken, upsertUserTargets } from "@/services/user-settings-service";

export default function SettingsPage() {
  const [targetCpa, setTargetCpa] = useState("20");
  const [targetRoas, setTargetRoas] = useState("2.5");
  const [metaToken, setMetaToken] = useState("");
  const [metaAccountId, setMetaAccountId] = useState("");
  const [googleToken, setGoogleToken] = useState("");
  const [googleAccountId, setGoogleAccountId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadTargets() {
      const targets = await getUserTargets();
      if (targets.targetCpa !== null) setTargetCpa(String(targets.targetCpa));
      if (targets.targetRoas !== null) setTargetRoas(String(targets.targetRoas));
    }
    void loadTargets();
  }, []);

  async function saveTargets() {
    try {
      await upsertUserTargets(Number(targetCpa), Number(targetRoas));
      setMessage("Таргетите са записани.");
    } catch {
      setMessage("Неуспешен запис.");
    }
  }

  async function saveToken(platform: "Meta" | "Google", token: string, accountId: string) {
    try {
      await upsertPlatformToken(platform, token, accountId);
      setMessage(`Токенът за ${platform} е записан.`);
    } catch {
      setMessage(`Неуспешен запис за ${platform}.`);
    }
  }

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
            <Input value={metaToken} onChange={(event) => setMetaToken(event.target.value)} placeholder="Meta Access Token" />
            <Button variant="outline" onClick={() => void saveToken("Meta", metaToken, metaAccountId)}>
              Запази Meta токен
            </Button>
          </div>
          <Input value={metaAccountId} onChange={(event) => setMetaAccountId(event.target.value)} placeholder="Meta Ad Account ID" />

          <div className="grid gap-2 md:grid-cols-[1fr_200px]">
            <Input value={googleToken} onChange={(event) => setGoogleToken(event.target.value)} placeholder="Google Access Token" />
            <Button variant="outline" onClick={() => void saveToken("Google", googleToken, googleAccountId)}>
              Запази Google токен
            </Button>
          </div>
          <Input value={googleAccountId} onChange={(event) => setGoogleAccountId(event.target.value)} placeholder="Google Customer ID" />

          {message ? <p className="text-sm text-teal-300">{message}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
