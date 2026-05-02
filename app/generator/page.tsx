"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, WandSparkles } from "lucide-react";

import { TypewriterInsight } from "@/components/ai/typewriter-insight";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { generateAdVariations } from "@/services/ai-service";
import { AdVariation } from "@/types";

export default function GeneratorPage() {
  const [productDescription, setProductDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAds, setGeneratedAds] = useState<AdVariation[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("prefill");
    if (prefill) {
      setProductDescription(prefill);
    }
  }, []);

  const copyToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({
      title: "Копирано в клипборда!",
      description: "Готово за поставяне в рекламния мениджър."
    });
  };

  async function handleGenerate() {
    if (!productDescription.trim()) return;
    setIsGenerating(true);
    try {
      const results = await generateAdVariations(productDescription.trim());
      setGeneratedAds(results);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Неуспешно генериране. Провери Anthropic ключ и модела.";
      toast({ title: "Грешка от AI", description: message });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <WandSparkles className="h-5 w-5 text-teal-300" />
            AI генератор на реклами
          </CardTitle>
          <CardDescription>Генерирай варианти с агентен typing ефект.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Input
              className="flex-1"
              value={productDescription}
              onChange={(event) => setProductDescription(event.target.value)}
              placeholder="Опиши продукта/офертата или постави линк към продукт"
              disabled={isGenerating}
            />
            <div className="flex shrink-0 flex-col gap-1.5 sm:min-w-[200px]">
              <Button
                className="w-full sm:w-auto"
                onClick={() => void handleGenerate()}
                disabled={isGenerating}
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
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => void copyToClipboard(variant.headline)}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Заглавие
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void copyToClipboard(variant.primaryText)}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Текст
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
