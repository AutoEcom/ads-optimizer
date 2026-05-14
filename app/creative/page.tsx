"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Loader2, WandSparkles } from "lucide-react";

import { TypewriterInsight } from "@/components/ai/typewriter-insight";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CREDIT_COSTS } from "@/lib/credits";
import { generateAdVariations } from "@/services/ai-service";
import { AdVariation } from "@/types";

const INSUFFICIENT_CREDITS_MSG =
  "Нямате достатъчно кредити. Моля, обновете плана си.";

function buildAutoPromptFromSearchParams(params: URLSearchParams): string | null {
  const context = params.get("context");
  const campaignName = params.get("campaignName");
  const campaignId = params.get("campaignId");
  const prefill = params.get("prefill");
  if ((context && context.trim()) || (campaignName && campaignName.trim()) || (campaignId && campaignId.trim())) {
    const parts: string[] = [];
    if (campaignName?.trim() || campaignId?.trim()) {
      parts.push(
        `Кампания: ${(campaignName ?? "").trim() || "—"}${campaignId?.trim() ? ` (ID: ${campaignId.trim()})` : ""}`
      );
    }
    if (context?.trim()) {
      parts.push("Контекст от AI препоръка за нов криейтив:\n" + context.trim());
    }
    const s = parts.join("\n\n").trim();
    if (s) return s;
  }
  if (prefill?.trim()) return prefill.trim();
  return null;
}

function CreativePageInner() {
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [productDescription, setProductDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAds, setGeneratedAds] = useState<AdVariation[]>([]);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [publishBusyIndex, setPublishBusyIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const campaignIdFromUrl = searchParams.get("campaignId")?.trim() ?? "";

  const refreshCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" });
      if (!res.ok) {
        setCreditsBalance(null);
        return;
      }
      const j = (await res.json()) as { creditsBalance?: number };
      setCreditsBalance(typeof j.creditsBalance === "number" ? j.creditsBalance : 0);
    } catch {
      setCreditsBalance(null);
    }
  }, []);

  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits, queryKey]);

  useEffect(() => {
    const next = buildAutoPromptFromSearchParams(new URLSearchParams(queryKey));
    if (next) setProductDescription(next);
  }, [queryKey]);

  const copyToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({
      title: "Копирано в клипборда!",
      description: "Готово за поставяне в рекламния мениджър."
    });
  };

  const canAffordGenerate = creditsBalance === null || creditsBalance >= CREDIT_COSTS.AI_CREATIVE_GENERATION;
  const canAffordPublish = creditsBalance === null || creditsBalance >= CREDIT_COSTS.DIRECT_META_PUBLISH;

  async function handleGenerate() {
    if (!productDescription.trim()) return;
    if (creditsBalance !== null && creditsBalance < CREDIT_COSTS.AI_CREATIVE_GENERATION) {
      toast({ title: "Кредити", description: INSUFFICIENT_CREDITS_MSG });
      return;
    }
    setIsGenerating(true);
    try {
      const { variants, creditsBalance: nextBal } = await generateAdVariations(productDescription.trim());
      setGeneratedAds(variants);
      if (typeof nextBal === "number") setCreditsBalance(nextBal);
      else void refreshCredits();
    } catch (error) {
      const message =
        error instanceof Error && error.message === "INSUFFICIENT_CREDITS"
          ? INSUFFICIENT_CREDITS_MSG
          : error instanceof Error
            ? error.message
            : "Неуспешно генериране. Провери Anthropic ключ и модела.";
      toast({
        title: error instanceof Error && error.message === "INSUFFICIENT_CREDITS" ? "Кредити" : "Грешка от AI",
        description: message
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handlePublishToMeta(variant: AdVariation, index: number) {
    if (!campaignIdFromUrl) {
      toast({
        title: "Липсва кампания",
        description: "Отвори страницата от одита с линк, който включва campaignId в URL, или го добави ръчно."
      });
      return;
    }
    if (creditsBalance !== null && creditsBalance < CREDIT_COSTS.DIRECT_META_PUBLISH) {
      toast({ title: "Кредити", description: INSUFFICIENT_CREDITS_MSG });
      return;
    }
    setPublishBusyIndex(index);
    try {
      const res = await fetch("/api/meta/publish-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignIdFromUrl,
          headline: variant.headline,
          body_text: `${variant.primaryText}\n\nHook: ${variant.hook}`
        })
      });
      const payload = (await res.json()) as {
        success?: boolean;
        adId?: string;
        creditsBalance?: number;
        error?: string;
        code?: string;
      };
      if (res.status === 402 || payload.code === "INSUFFICIENT_CREDITS") {
        toast({ title: "Кредити", description: INSUFFICIENT_CREDITS_MSG });
        return;
      }
      if (!res.ok || !payload.success) {
        toast({
          title: "Meta грешка",
          description: payload.error ?? `HTTP ${res.status}`
        });
        return;
      }
      if (typeof payload.creditsBalance === "number") setCreditsBalance(payload.creditsBalance);
      else void refreshCredits();
      const logLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        type: "creative_publish_meta_success",
        campaignId: campaignIdFromUrl,
        adId: payload.adId,
        creditsBalance: payload.creditsBalance
      });
      console.log(logLine);
      toast({
        title: "Готово в Meta",
        description: `Създадена е нова обява (PAUSED за преглед). Ad id: ${payload.adId ?? "—"}`
      });
    } catch {
      toast({ title: "Мрежа", description: "Неуспешна връзка към сървъра." });
    } finally {
      setPublishBusyIndex(null);
    }
  }

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <WandSparkles className="h-5 w-5 text-teal-300" />
            AI креатив
          </CardTitle>
          <CardDescription>
            Генерирай варианти от кратък бриф. При отваряне от одит полето се попълва от параметрите в URL
            (campaignId, campaignName, context). Публикуване в Meta: {CREDIT_COSTS.DIRECT_META_PUBLISH} кредита;
            генерация: {CREDIT_COSTS.AI_CREATIVE_GENERATION} кредита.
          </CardDescription>
          {creditsBalance !== null ? (
            <p className="text-sm text-muted-foreground">
              Текущ баланс: <span className="font-semibold text-foreground">{creditsBalance}</span> кредита
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Зареждане на кредити…</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Input
              className="flex-1"
              value={productDescription}
              onChange={(event) => setProductDescription(event.target.value)}
              placeholder="Опиши продукта, офертата или редактирай брифа от AI препоръката"
              disabled={isGenerating || !canAffordGenerate}
            />
            <div className="flex shrink-0 flex-col gap-1.5 sm:min-w-[200px]">
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!canAffordGenerate) {
                    toast({ title: "Кредити", description: INSUFFICIENT_CREDITS_MSG });
                    return;
                  }
                  void handleGenerate();
                }}
                disabled={isGenerating || !canAffordGenerate}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Генериране...
                  </>
                ) : (
                  "Генерирай"
                )}
              </Button>
              {isGenerating ? (
                <p className="text-xs text-muted-foreground sm:text-right">Агентът анализира и пише...</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {isGenerating
              ? [0, 1, 2].map((slot) => (
                  <Card key={`skeleton-${slot}`} className="border-teal-500/25">
                    <CardHeader className="space-y-2 pb-2">
                      <Skeleton className="h-6 w-[85%] rounded-md" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-4 w-full rounded-md" />
                      <Skeleton className="h-4 w-full rounded-md" />
                      <Skeleton className="h-4 w-2/3 rounded-md" />
                      <div className="pt-1">
                        <Skeleton className="h-3 w-16 rounded-md opacity-80" />
                        <Skeleton className="mt-2 h-4 w-full rounded-md" />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Skeleton className="h-8 w-24 rounded-md" />
                        <Skeleton className="h-8 w-24 rounded-md" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              : generatedAds.map((variant, index) => (
                  <Card key={`${variant.headline}-${index}`} className="border-teal-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        <TypewriterInsight text={variant.headline} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <p>
                        <TypewriterInsight text={variant.primaryText} />
                      </p>
                      <p className="text-teal-300">
                        Hook: <TypewriterInsight text={variant.hook} />
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => void copyToClipboard(variant.headline)}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Заглавие
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void copyToClipboard(variant.primaryText)}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Текст
                        </Button>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full border border-primary/30"
                        disabled={
                          publishBusyIndex !== null ||
                          !canAffordPublish ||
                          !campaignIdFromUrl
                        }
                        onClick={() => {
                          if (!canAffordPublish) {
                            toast({
                              title: "Кредити",
                              description: INSUFFICIENT_CREDITS_MSG
                            });
                            return;
                          }
                          void handlePublishToMeta(variant, index);
                        }}
                      >
                        {publishBusyIndex === index ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Публикуване…
                          </>
                        ) : (
                          `Публикувай в Meta (-${CREDIT_COSTS.DIRECT_META_PUBLISH} кредита)`
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default function CreativePage() {
  return (
    <Suspense
      fallback={
        <main className="p-4">
          <p className="text-sm text-muted-foreground">Зареждане…</p>
        </main>
      }
    >
      <CreativePageInner />
    </Suspense>
  );
}
