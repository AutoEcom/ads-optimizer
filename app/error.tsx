"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard runtime error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4">
      <Card className="w-full border-red-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Възникна грешка в таблото
          </CardTitle>
          <CardDescription>
            Нещо се обърка при зареждане. Натисни бутона за нов опит.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset}>Опитай отново</Button>
        </CardContent>
      </Card>
    </main>
  );
}
