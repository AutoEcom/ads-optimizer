"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Route } from "next";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, History, Home, LogIn, Menu, Settings, User, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navItems: Array<{ href: Route; label: string; icon: typeof Home }> = [
  { href: "/dashboard", label: "Табло", icon: Home },
  { href: "/audit", label: "Одит", icon: BarChart3 },
  { href: "/generator", label: "Креатив", icon: WandSparkles },
  { href: "/history", label: "Лог", icon: History },
  { href: "/settings", label: "Настройки", icon: Settings }
];

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authState, setAuthState] = useState<{
    id: string;
    email: string;
    fullName: string;
  } | null>(null);
  const initials = useMemo(() => {
    if (!authState) return "AG";
    const source = authState.fullName || authState.email;
    return source
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() ?? "")
      .join("");
  }, [authState]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    async function load() {
      if (!supabase) return;
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setAuthState(null);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      setAuthState({
        id: user.id,
        email: user.email ?? "",
        fullName: profile?.full_name ?? ""
      });
    }

    void load();
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthState(null);
    router.push("/auth");
    router.refresh();
  }

  if (pathname === "/" || pathname.startsWith("/auth") || pathname === "/landing") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground">
      <div className="mx-auto flex max-w-7xl gap-4 px-3 py-4 md:px-4">
        <aside className="premium-glow sticky top-4 hidden h-[calc(100vh-2rem)] w-64 rounded-xl p-4 md:block">
          <div className="flex h-full flex-col">
            <p className="mb-4 text-sm font-semibold text-teal-300">AdGuard AI</p>
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition",
                      active &&
                        "border-l-teal-400 bg-teal-500/10 text-teal-200 shadow-[0_0_16px_rgba(45,212,191,0.3)]"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto space-y-2 border-t border-border/70 pt-3">
              {authState ? (
                <>
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-teal-200 hover:bg-teal-500/10"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold">
                      {initials || <User className="h-4 w-4" />}
                    </span>
                    <span className="truncate">{authState.fullName || authState.email}</span>
                  </Link>
                  <Button variant="outline" className="w-full" onClick={() => void handleLogout()}>
                    Изход
                  </Button>
                </>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => router.push("/auth")}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Вход
                </Button>
              )}
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <div className="mb-3 flex items-center justify-between md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Menu className="mr-2 h-4 w-4" />
                  Меню
                </Button>
              </SheetTrigger>
              <SheetContent className="premium-glow w-[280px]">
                <p className="mb-4 text-sm font-semibold text-teal-300">Навигация</p>
                <nav className="space-y-2">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground",
                          active &&
                            "border-l-teal-400 bg-teal-500/10 text-teal-200 shadow-[0_0_16px_rgba(45,212,191,0.3)]"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
                <div className="mt-4 border-t border-border/70 pt-3">
                  {authState ? (
                    <div className="space-y-2">
                      <Link
                        href="/profile"
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-teal-200 hover:bg-teal-500/10"
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold">
                          {initials || "AG"}
                        </span>
                        <span className="truncate">{authState.fullName || authState.email}</span>
                      </Link>
                      <Button variant="outline" className="w-full" onClick={() => void handleLogout()}>
                        Изход
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full" onClick={() => router.push("/auth")}>
                      <LogIn className="mr-2 h-4 w-4" />
                      Вход
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
