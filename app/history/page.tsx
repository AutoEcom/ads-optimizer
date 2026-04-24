"use client";

import useSWR from "swr";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LogItem = {
  id: string;
  platform: "Meta" | "Google";
  campaign_name: string;
  action_taken: "PAUSE" | "ACTIVATE";
  reason: string;
  created_at: string;
};

async function fetchLogs(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Неуспешно зареждане");
  return (await response.json()) as { logs: LogItem[]; warning?: string };
}

export default function HistoryPage() {
  const { data, error } = useSWR("/api/history", fetchLogs, { dedupingInterval: 15_000 });

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>Прозрачност за всяко AI действие.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {error ? <p className="text-sm text-rose-400">Неуспешно зареждане на логовете.</p> : null}
          {data?.warning ? <p className="text-sm text-amber-300">{data.warning}</p> : null}
          {(data?.logs ?? []).map((log) => (
            <div key={log.id} className="rounded-md border border-border/70 p-3">
              <p className="text-sm font-medium">
                [{log.platform}] {log.campaign_name} {"->"} {log.action_taken}
              </p>
              <p className="text-xs text-muted-foreground">{log.reason}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString("bg-BG")}
              </p>
            </div>
          ))}
          {!error && (data?.logs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Все още няма записани действия.</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
