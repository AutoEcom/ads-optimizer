"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogIn, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthState = { id: string; email: string; fullName: string } | null;

function initialsFromAuth(state: AuthState): string {
  if (!state) return "AG";
  const source = state.fullName || state.email;
  return source
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

export function LandingAuthHeader() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [authState, setAuthState] = useState<AuthState>(null);

  const initials = useMemo(() => initialsFromAuth(authState), [authState]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    async function load() {
      const sb = client;
      if (!sb) return;
      const {
        data: { user }
      } = await sb.auth.getUser();
      if (!user) {
        setAuthState(null);
        return;
      }
      const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      setAuthState({
        id: user.id,
        email: user.email ?? "",
        fullName: profile?.full_name ?? ""
      });
    }

    void load();
    const {
      data: { subscription }
    } = client.auth.onAuthStateChange(() => {
      void load();
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthState(null);
    router.push("/" as Route);
    router.refresh();
  }

  return (
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
      <p className="text-lg font-semibold text-teal-300">AdGuard</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-200 transition hover:bg-teal-500/20"
        >
          Табло
        </Link>
        {authState ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/profile"
              className="flex max-w-[min(100vw-8rem,14rem)] items-center gap-2 rounded-md px-2 py-2 text-sm text-teal-200 hover:bg-teal-500/10"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold">
                {initials || <User className="h-4 w-4" />}
              </span>
              <span className="truncate text-left">{authState.fullName || authState.email}</span>
            </Link>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void handleLogout()}>
              Изход
            </Button>
          </div>
        ) : (
          <Link
            href="/auth"
            className="rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground transition hover:bg-teal-500/10 hover:text-teal-200"
          >
            <span className="inline-flex items-center gap-1.5">
              <LogIn className="h-4 w-4" />
              Вход
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
