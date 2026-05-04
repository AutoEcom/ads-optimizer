"use client";

import useSWR from "swr";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LogAction =
  | "PAUSE"
  | "ACTIVATE"
  | "MCP_ADJUST_BUDGET"
  | "MCP_PAUSE"
  | "MCP_RENAME"
  | string;

type LogDetails = {
  old_value?: unknown;
  new_value?: unknown;
  status?: string;
} | null;

type LogItem = {
  id: string;
  platform: "Meta" | "Google";
  campaign_name: string;
  action_taken: LogAction;
  reason: string;
  details?: LogDetails;
  created_at: string;
};

function actionTakenLabelBg(action: LogAction): string {
  switch (action) {
    case "PAUSE":
      return "Пауза";
    case "ACTIVATE":
      return "Активиране";
    case "MCP_ADJUST_BUDGET":
      return "MCP · бюджет";
    case "MCP_PAUSE":
      return "MCP · пауза";
    case "MCP_RENAME":
      return "MCP · име";
    default:
      return String(action);
  }
}

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
          <CardTitle>Лог на действията</CardTitle>
          <CardDescription>История на изпълненията от таблото, одита и Meta MCP.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {error ? <p className="text-sm text-rose-400">Неуспешно зареждане на логовете.</p> : null}
          {data?.warning ? <p className="text-sm text-amber-300">{data.warning}</p> : null}
          {(data?.logs ?? []).map((log) => (
            <div key={log.id} className="rounded-md border border-border/70 p-3">
              <p className="text-sm font-medium">
                [{log.platform}] {log.campaign_name} → {actionTakenLabelBg(log.action_taken)}
              </p>
              <p className="mt-1 text-sm text-foreground/90">{log.reason}</p>
              {log.details && typeof log.details === "object" ? (
                <dl className="mt-2 grid gap-1 rounded-md border border-border/50 bg-muted/25 px-2 py-2 text-xs text-muted-foreground">
                  {"old_value" in log.details && log.details.old_value !== undefined && log.details.old_value !== null ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium text-foreground/80">Преди:</dt>
                      <dd className="min-w-0 break-all">{String(log.details.old_value)}</dd>
                    </div>
                  ) : null}
                  {"new_value" in log.details && log.details.new_value !== undefined && log.details.new_value !== null ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium text-foreground/80">След:</dt>
                      <dd className="min-w-0 break-all">{String(log.details.new_value)}</dd>
                    </div>
                  ) : null}
                  {log.details.status ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium text-foreground/80">Статус:</dt>
                      <dd>{String(log.details.status)}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
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
