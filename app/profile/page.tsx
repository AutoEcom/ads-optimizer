"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, Trash2, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PLAN_LIMITS, getCurrentProfile, updateFullName } from "@/services/profile-service";
import { Profile } from "@/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullNameInput, setFullNameInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function load() {
      const data = await getCurrentProfile();
      setProfile(data);
      setFullNameInput(data?.fullName ?? "");
    }
    void load();
  }, []);

  const tierLabel = useMemo(() => {
    if (!profile) return "Beta Tester";
    if (profile.subscriptionTier === "pro") return "Pro";
    if (profile.subscriptionTier === "free") return "Free";
    return "Beta Tester";
  }, [profile]);

  const usageLimit = profile ? PLAN_LIMITS[profile.subscriptionTier] : 20;
  const usageCount = profile?.aiRequestsCount ?? 0;
  const usageProgress = Math.min(100, Math.round((usageCount / Math.max(1, usageLimit)) * 100));

  async function saveName() {
    try {
      await updateFullName(fullNameInput);
      const latest = await getCurrentProfile();
      setProfile(latest);
      setStatusMessage("Името е записано успешно.");
    } catch {
      setStatusMessage("Неуспешен запис на име.");
    }
  }

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-teal-300" />
            Профил
          </CardTitle>
          <CardDescription>Identity, Usage и Control в едно място.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Лична информация</CardTitle>
          <CardDescription>Твоят имейл и публично име.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Имейл</p>
            <p className="text-sm">{profile?.email || "Няма активна сесия"}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_140px]">
            <Input
              value={fullNameInput}
              onChange={(event) => setFullNameInput(event.target.value)}
              placeholder="Име и фамилия"
            />
            <Button onClick={() => void saveName()}>Запази име</Button>
          </div>
          {statusMessage ? <p className="text-sm text-teal-300">{statusMessage}</p> : null}
        </CardContent>
      </Card>

      <Card className="shadow-[0_0_22px_rgba(20,184,166,0.2)]">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Crown className="h-5 w-5 text-emerald-400" />
            Subscription Plan
          </CardTitle>
          <CardDescription>Подготовка за paywall и billing нива.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <span className="inline-flex rounded-full border border-teal-400/40 bg-teal-500/10 px-3 py-1 text-xs text-teal-200">
            {tierLabel}
          </span>
          <Button variant="outline" disabled>
            Upgrade to Pro
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage Limits</CardTitle>
          <CardDescription>Подготовка за лимити по план.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            AI Одити: {usageCount} / {usageLimit}
          </p>
          <Progress value={usageProgress} />
        </CardContent>
      </Card>

      <Card className="border-rose-500/40">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-rose-300">
            <Trash2 className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Чувствителни действия за акаунта.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Изтриването на акаунт ще бъде активирано в следваща версия. Засега можеш да излезеш от сесията.
          </p>
          <Button variant="outline" className="border-rose-500/50 text-rose-300" onClick={() => void logout()}>
            Изход от акаунта
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
