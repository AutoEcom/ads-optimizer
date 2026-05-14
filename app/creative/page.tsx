"use client";

import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Copy,
  Coins,
  FileText,
  FolderKanban,
  Loader2,
  Newspaper,
  Smartphone,
  Sparkles,
  WandSparkles
} from "lucide-react";

import { TypewriterInsight } from "@/components/ai/typewriter-insight";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchAdContent, type FetchedAdContent } from "@/lib/creative-ad-fetch";
import {
  buildCreativeBriefSections,
  composeCreativeBriefForApi,
  hasUsableAdCopy,
  type CreativeBriefSections
} from "@/lib/creative-brief-format";
import { CREDIT_COSTS } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { generateAdVariations } from "@/services/ai-service";
import { dispatchAiStrategyCacheInvalidate } from "@/services/ai-strategy-cache-service";
import { AdVariation } from "@/types";

const INSUFFICIENT_CREDITS_MSG =
  "Нямате достатъчно кредити. Моля, обновете плана си.";

/** Glass панел — тъмен, лек blur, дискретна рамка */
const glassPanel = cn(
  "rounded-2xl border border-white/10 bg-slate-950/50 shadow-xl shadow-black/30",
  "backdrop-blur-xl backdrop-saturate-150"
);

const ghostTextarea = cn(
  "min-h-[3.25rem] w-full resize-none overflow-hidden rounded-xl px-3 py-2.5",
  "border border-transparent bg-white/[0.03] text-[15px] leading-relaxed tracking-tight text-slate-100",
  "placeholder:text-slate-500",
  "transition-colors duration-200",
  "hover:bg-white/[0.05]",
  "focus-visible:border-teal-400/35 focus-visible:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-400/30",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

const glassBriefCard = cn(glassPanel, "p-6 sm:p-7");

const RING_MAX = 250;

function AutosizeGhostTextarea({
  value,
  onChange,
  disabled,
  placeholder,
  minHeightPx = 72,
  "aria-label": ariaLabel
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeightPx?: number;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeightPx, el.scrollHeight)}px`;
  }, [minHeightPx]);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={2}
      spellCheck
      className={ghostTextarea}
      onChange={(e) => {
        onChange(e.target.value);
        requestAnimationFrame(() => {
          const el = ref.current;
          if (!el) return;
          el.style.height = "auto";
          el.style.height = `${Math.max(minHeightPx, el.scrollHeight)}px`;
        });
      }}
    />
  );
}

function CreditRing({ balance }: { balance: number | null }) {
  const gid = `cc-${useId().replace(/:/g, "")}`;
  const r = 36;
  const stroke = 4;
  const c = 2 * Math.PI * (r - stroke / 2);
  const pct = balance == null ? 0 : Math.min(100, (balance / RING_MAX) * 100);
  const dash = (pct / 100) * c;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0">
        <svg className="-rotate-90" width="80" height="80" viewBox="0 0 80 80" aria-hidden>
          <circle
            cx="40"
            cy="40"
            r={r - stroke / 2}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-white/10"
          />
          <circle
            cx="40"
            cy="40"
            r={r - stroke / 2}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <Coins className="h-4 w-4 text-emerald-300/90" aria-hidden />
        </div>
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Текущ баланс</p>
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-white">
          {balance == null ? "—" : balance}
          <span className="ml-1.5 text-sm font-medium text-slate-400">кредита</span>
        </p>
        <p className="text-xs text-slate-500">Генерация: {CREDIT_COSTS.AI_CREATIVE_GENERATION} · Meta: {CREDIT_COSTS.DIRECT_META_PUBLISH}</p>
      </div>
    </div>
  );
}

function MetaFeedPhonePreview({
  loading,
  ad,
  hasCopy,
  warnMessage
}: {
  loading: boolean;
  ad: FetchedAdContent | null;
  hasCopy: boolean;
  warnMessage: string | null;
}) {
  return (
    <div className="flex w-full justify-center">
      <div
        className={cn(
          "relative w-[min(100%,320px)] shrink-0 rounded-[2.35rem] border-[11px] border-slate-800 bg-slate-900",
          "p-1 shadow-2xl shadow-black/50 ring-1 ring-white/10"
        )}
      >
        <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black/50" aria-hidden />
        <div
          className={cn(
            "relative flex max-h-[min(60vh,440px)] min-h-[300px] flex-col overflow-hidden rounded-[1.85rem]",
            "bg-gradient-to-b from-slate-900 via-slate-950 to-black"
          )}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Feed преглед</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-slate-400">
              Sponsored
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {loading ? (
              <div className="space-y-3 pt-2">
                <p className="text-xs leading-relaxed text-slate-500">
                  Зареждане от Meta: object_story_spec → creative → asset_feed → публикуван пост…
                </p>
                <Skeleton className="h-4 w-[80%] rounded-md bg-white/10" />
                <Skeleton className="h-4 w-[60%] rounded-md bg-white/10" />
                <Skeleton className="h-24 w-full rounded-lg bg-white/5" />
              </div>
            ) : ad && hasCopy ? (
              <>
                {ad.adName.trim() ? (
                  <p className="text-[11px] font-medium text-slate-500">{ad.adName}</p>
                ) : null}
                <p className="text-[17px] font-semibold leading-snug text-white">{ad.headline}</p>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-300">{ad.bodyText}</p>
                <div className="mt-auto rounded-lg border border-white/5 bg-white/[0.04] px-3 py-2 text-center text-[11px] text-slate-500">
                  Текуща обява (Meta)
                </div>
              </>
            ) : (
              <p className="pt-4 text-sm leading-relaxed text-amber-200/90">
                {warnMessage ??
                  (ad
                    ? "Обявата е заредена, но липсва видимо заглавие или основен текст."
                    : "Неуспешно зареждане от Meta.")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreativePageInner() {
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [productDescription, setProductDescription] = useState("");
  const [briefSections, setBriefSections] = useState<CreativeBriefSections | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAds, setGeneratedAds] = useState<AdVariation[]>([]);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [publishBusyIndex, setPublishBusyIndex] = useState<number | null>(null);
  const [currentAdPreview, setCurrentAdPreview] = useState<FetchedAdContent | null>(null);
  const [adPreviewLoading, setAdPreviewLoading] = useState(false);
  const { toast } = useToast();

  const campaignIdFromUrl = searchParams.get("campaignId")?.trim() ?? "";
  const adIdFromUrl = searchParams.get("adId")?.trim() ?? "";
  const actionIdFromUrl = searchParams.get("actionId")?.trim() ?? "";
  const campaignNameFromUrl = searchParams.get("campaignName")?.trim() ?? "";

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
    let cancelled = false;
    const params = new URLSearchParams(queryKey);
    const prefill = params.get("prefill")?.trim();
    if (prefill) {
      setBriefSections(null);
      setProductDescription(prefill);
      setCurrentAdPreview(null);
      setAdPreviewLoading(false);
      return;
    }

    const campaignId = params.get("campaignId")?.trim() ?? "";
    const campaignName = params.get("campaignName")?.trim() ?? "";
    const context = params.get("context")?.trim() ?? "";
    const adId = params.get("adId")?.trim() ?? "";

    if (!campaignId && !context && !campaignName && !adId) {
      setBriefSections(null);
      return;
    }

    if (!adId) {
      setAdPreviewLoading(false);
      setCurrentAdPreview(null);
      setProductDescription("");
      setBriefSections(
        buildCreativeBriefSections({
          campaignName,
          campaignId,
          optimizationReason: context,
          requestedMetaAd: false
        })
      );
      return;
    }

    setAdPreviewLoading(true);
    setCurrentAdPreview(null);
    setProductDescription("");
    setBriefSections(
      buildCreativeBriefSections({
        campaignName,
        campaignId,
        optimizationReason: context,
        requestedMetaAd: true,
        hydratingMetaAd: true
      })
    );

    void fetchAdContent(adId).then((data) => {
      if (cancelled) return;
      setAdPreviewLoading(false);
      setCurrentAdPreview(data);

      const hasCopy = hasUsableAdCopy(data);
      const warn = !data
        ? "Внимание: не успяхме да заредим оригиналното копие на обявата от Meta (мрежова грешка, токен или права)."
        : !hasCopy
          ? "Внимание: обявата е намерена в Meta, но липсва видимо заглавие или основен текст в creative (неподдържан или празен формат)."
          : null;

      setBriefSections(
        buildCreativeBriefSections({
          campaignName,
          campaignId,
          currentAd: hasCopy ? data! : null,
          optimizationReason: context,
          requestedMetaAd: true,
          adFetchWarning: warn
        })
      );
    });

    return () => {
      cancelled = true;
    };
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
    const composed = briefSections
      ? composeCreativeBriefForApi(briefSections)
      : productDescription.trim();
    if (!composed) return;
    if (creditsBalance !== null && creditsBalance < CREDIT_COSTS.AI_CREATIVE_GENERATION) {
      toast({ title: "Кредити", description: INSUFFICIENT_CREDITS_MSG });
      return;
    }
    setIsGenerating(true);
    try {
      const optimizationReason =
        briefSections?.agentAnalysis.trim() ||
        searchParams.get("context")?.trim() ||
        undefined;
      const metaAd =
        currentAdPreview && hasUsableAdCopy(currentAdPreview)
          ? { headline: currentAdPreview.headline, bodyText: currentAdPreview.bodyText }
          : undefined;
      const { variants, creditsBalance: nextBal } = await generateAdVariations(composed, {
        currentAd: metaAd,
        optimizationReason: optimizationReason || undefined
      });
      setGeneratedAds(variants);
      if (typeof nextBal === "number") {
        setCreditsBalance(nextBal);
        toast({
          title: "Успешно!",
          description: `Оставащи кредити: ${nextBal}`
        });
      } else void refreshCredits();
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
          body_text: `${variant.primaryText}\n\nHook: ${variant.hook}`,
          ...(actionIdFromUrl ? { resolved_action_id: actionIdFromUrl } : {}),
          ...(campaignNameFromUrl ? { campaign_name: campaignNameFromUrl } : {})
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
      dispatchAiStrategyCacheInvalidate();
      const logLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        type: "creative_publish_meta_success",
        campaignId: campaignIdFromUrl,
        adId: payload.adId,
        creditsBalance: payload.creditsBalance
      });
      console.log(logLine);
      const bal = payload.creditsBalance;
      toast({
        title: "Успешно!",
        description:
          typeof bal === "number"
            ? `Създадена е нова обява в Meta (PAUSED). Ad id: ${payload.adId ?? "—"}. Оставащи кредити: ${bal}`
            : `Създадена е нова обява в Meta (PAUSED). Ad id: ${payload.adId ?? "—"}`
      });
    } catch {
      toast({ title: "Мрежа", description: "Неуспешна връзка към сървъра." });
    } finally {
      setPublishBusyIndex(null);
    }
  }

  const showCurrentAdPreview = Boolean(adIdFromUrl);
  const previewHasCopy = Boolean(currentAdPreview && hasUsableAdCopy(currentAdPreview));
  const previewWarn =
    !adPreviewLoading && currentAdPreview && !hasUsableAdCopy(currentAdPreview)
      ? "Обявата е заредена, но липсва видимо заглавие или основен текст в Meta creative."
      : !adPreviewLoading && !currentAdPreview
        ? "Неуспешно зареждане от Meta — виж брифа за детайли."
        : null;

  const variantGlass = cn(
    "rounded-2xl border border-white/10 bg-slate-950/40 shadow-lg shadow-black/20 backdrop-blur-md"
  );

  const generateDisabled =
    isGenerating ||
    !canAffordGenerate ||
    (briefSections ? !composeCreativeBriefForApi(briefSections).trim() : !productDescription.trim());

  return (
    <main className="mx-auto w-full max-w-7xl space-y-10 px-4 pb-20 pt-2 sm:px-6 lg:space-y-12 lg:px-8 lg:pt-4">
      <header className="space-y-2 border-b border-white/5 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 ring-1 ring-white/10">
                <WandSparkles className="h-5 w-5 text-teal-300" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">AI креатив</h1>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-[15px]">
              Премиум работно пространство за варианти от одит. Брифът се сглобява от картоните вляво; генерирането не
              изпраща нищо към Meta — само бутонът „Публикувай“.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 items-start gap-y-10 lg:gap-x-10 lg:gap-y-8">
        <div className="col-span-12 flex w-full min-w-0 flex-col gap-6 lg:col-span-8">
          {showCurrentAdPreview ? (
            <div className={cn(glassBriefCard, "w-full")}>
              <div className="mb-5 flex items-center gap-3">
                <Smartphone className="h-5 w-5 shrink-0 text-teal-400" aria-hidden />
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-white">Feed преглед (Meta)</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Визуализация на текущата обява във feed</p>
                </div>
              </div>
              <MetaFeedPhonePreview
                loading={adPreviewLoading}
                ad={currentAdPreview}
                hasCopy={previewHasCopy}
                warnMessage={previewWarn}
              />
            </div>
          ) : null}

          {briefSections ? (
            <>
              <p className="text-sm leading-relaxed text-slate-400">
                Редактирай полетата — при „Генерирай“ се подава един структуриран бриф към AI.
              </p>

              <div className={cn(glassBriefCard, "w-full")}>
                <div className="mb-5 flex items-center gap-3">
                  <FolderKanban className="h-5 w-5 text-teal-400" aria-hidden />
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-white">Кампания</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Име и Meta ID</p>
                  </div>
                </div>
                <AutosizeGhostTextarea
                  value={briefSections.campaignDisplay}
                  onChange={(v) =>
                    setBriefSections((prev) => (prev ? { ...prev, campaignDisplay: v } : prev))
                  }
                  disabled={isGenerating || !canAffordGenerate}
                  placeholder="Кампания: … · Meta ID: …"
                  minHeightPx={88}
                  aria-label="Кампания и Meta ID"
                />
              </div>

              <div className={cn(glassBriefCard, "w-full")}>
                <div className="mb-5 flex items-center gap-3">
                  <Newspaper className="h-5 w-5 text-teal-400" aria-hidden />
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-white">Текуща реклама (Meta)</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Копие в брифа</p>
                  </div>
                </div>
                <AutosizeGhostTextarea
                  value={briefSections.currentAdBlock}
                  onChange={(v) =>
                    setBriefSections((prev) => (prev ? { ...prev, currentAdBlock: v } : prev))
                  }
                  disabled={isGenerating || !canAffordGenerate || adPreviewLoading}
                  placeholder="Заглавие, текст…"
                  minHeightPx={132}
                  aria-label="Текуща реклама"
                />
              </div>

              <div className={cn(glassBriefCard, "flex w-full min-h-[22rem] flex-col")}>
                <div className="mb-5 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-teal-400" aria-hidden />
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-white">Анализ и задача</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Препоръка от одита и инструкция към AI</p>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-6">
                  <div className="flex min-h-0 flex-1 flex-col">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Анализ на агента
                    </label>
                    <AutosizeGhostTextarea
                      value={briefSections.agentAnalysis}
                      onChange={(v) =>
                        setBriefSections((prev) => (prev ? { ...prev, agentAnalysis: v } : prev))
                      }
                      disabled={isGenerating || !canAffordGenerate}
                      minHeightPx={128}
                      aria-label="Анализ на агента"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Задача за AI
                    </label>
                    <AutosizeGhostTextarea
                      value={briefSections.taskForAi}
                      onChange={(v) => setBriefSections((prev) => (prev ? { ...prev, taskForAi: v } : prev))}
                      disabled={isGenerating || !canAffordGenerate}
                      minHeightPx={112}
                      aria-label="Задача за AI"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className={cn(glassBriefCard, "w-full")}>
              <div className="mb-5 flex items-center gap-3">
                <FileText className="h-5 w-5 text-teal-400" aria-hidden />
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-white">Свободен бриф</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Текст или линк към страница</p>
                </div>
              </div>
              <AutosizeGhostTextarea
                value={productDescription}
                onChange={setProductDescription}
                disabled={isGenerating || !canAffordGenerate}
                placeholder="Опиши продукта, офертата или постави линк…"
                minHeightPx={220}
                aria-label="Свободен бриф"
              />
            </div>
          )}
        </div>

        <aside className="col-span-12 w-full min-w-0 lg:col-span-4 lg:self-start">
          <div className="sticky top-8 space-y-5">
            <div className={cn(glassPanel, "p-6")}>
              <CreditRing balance={creditsBalance} />
            </div>

            <div className={cn(glassPanel, "p-6")}>
              <div className="mb-5 flex gap-3 border-b border-white/10 pb-5">
                <WandSparkles className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-white">Генериране</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {briefSections
                      ? "Картоните вляво се сливат в един бриф за модела."
                      : "Съдържанието от полето вляво отива към AI."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                className={cn(
                  "h-14 w-full rounded-xl text-base font-semibold text-white shadow-lg transition-all duration-300",
                  "bg-gradient-to-r from-emerald-500 to-teal-600",
                  "shadow-emerald-500/25 hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-400/35",
                  "disabled:scale-100 disabled:opacity-50 disabled:shadow-none"
                )}
                onClick={() => {
                  if (!canAffordGenerate) {
                    toast({ title: "Кредити", description: INSUFFICIENT_CREDITS_MSG });
                    return;
                  }
                  void handleGenerate();
                }}
                disabled={generateDisabled}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Генериране…
                  </>
                ) : (
                  <>
                    <WandSparkles className="mr-2 h-5 w-5 opacity-90" />
                    Генерирай
                  </>
                )}
              </Button>
              {isGenerating ? (
                <p className="mt-4 text-center text-xs text-slate-500">Агентът анализира и пише…</p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <section className="space-y-5 border-t border-white/10 pt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-white">Генерирани варианти</h2>
          <p className="max-w-xl text-xs leading-relaxed text-slate-500">
            „Публикувай в Meta“ създава реална нова обява (PAUSED). Активирай в Ads Manager преди LIVE.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {isGenerating
            ? [0, 1, 2].map((slot) => (
                <Card key={`skeleton-${slot}`} className={cn(variantGlass, "border-white/10")}>
                  <CardHeader className="space-y-2 pb-2">
                    <Skeleton className="h-6 w-[85%] rounded-md bg-white/10" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full rounded-md bg-white/10" />
                    <Skeleton className="h-4 w-full rounded-md bg-white/10" />
                    <Skeleton className="h-4 w-2/3 rounded-md bg-white/10" />
                    <div className="pt-1">
                      <Skeleton className="h-3 w-16 rounded-md bg-white/10 opacity-80" />
                      <Skeleton className="mt-2 h-4 w-full rounded-md bg-white/10" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-8 w-24 rounded-md bg-white/10" />
                      <Skeleton className="h-8 w-24 rounded-md bg-white/10" />
                    </div>
                  </CardContent>
                </Card>
              ))
            : generatedAds.map((variant, index) => (
                <Card key={`${variant.headline}-${index}`} className={cn(variantGlass, "overflow-hidden")}>
                  <CardHeader className="border-b border-white/5 pb-3">
                    <CardTitle className="text-base font-semibold leading-snug text-white">
                      <TypewriterInsight text={variant.headline} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4 text-sm text-slate-300">
                    <p className="leading-relaxed">
                      <TypewriterInsight text={variant.primaryText} />
                    </p>
                    <p className="text-sm text-teal-300/95">
                      Hook: <TypewriterInsight text={variant.hook} />
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-400 hover:bg-white/5 hover:text-white"
                        onClick={() => void copyToClipboard(variant.headline)}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" /> Заглавие
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-400 hover:bg-white/5 hover:text-white"
                        onClick={() => void copyToClipboard(variant.primaryText)}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" /> Текст
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full border-white/15 bg-white/[0.04] text-slate-200 hover:bg-white/10"
                      disabled={publishBusyIndex !== null || !canAffordPublish || !campaignIdFromUrl}
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
                      title="Създава нова обява в Meta (PAUSED) в тази кампания — реално API действие."
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
      </section>
    </main>
  );
}

export default function CreativePage() {
  return (
    <Suspense
      fallback={
        <main className="p-6">
          <p className="text-sm text-slate-500">Зареждане…</p>
        </main>
      }
    >
      <CreativePageInner />
    </Suspense>
  );
}
