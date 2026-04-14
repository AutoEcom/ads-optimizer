"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Global app error:", error);

  return (
    <html lang="bg" className="dark">
      <body className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md space-y-4 rounded-lg border border-red-500/40 bg-card p-6">
          <p className="inline-flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Критична грешка
          </p>
          <p className="text-sm text-muted-foreground">
            Приложението срещна неочакван проблем. Опитай да презаредиш.
          </p>
          <Button onClick={reset}>Презареди приложението</Button>
        </div>
      </body>
    </html>
  );
}
