"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Eye, EyeOff, Loader2, LogIn, MailCheck, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function AuthPage() {
  const router = useRouter();
  const { toast } = useToast();
  const redirectPath = "/dashboard" as Route;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  /** Регистрация без session (имейл за потвърждение): показваме статичен екран вместо формата. */
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [authFormMode, setAuthFormMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [loading, setLoading] = useState<"sign-in" | "sign-up" | null>(null);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const mapAuthError = (message: string) => {
    if (message.includes("Anonymous sign-ins are disabled")) {
      return "Въведи имейл и парола. В момента регистрацията се изпраща без валидни данни.";
    }
    return message;
  };

  const validateCredentials = () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Моля въведи имейл.");
      return false;
    }

    if (!normalizedEmail.includes("@")) {
      setError("Имейлът изглежда невалиден.");
      return false;
    }

    if (!password.trim()) {
      setError("Моля въведи парола.");
      return false;
    }

    if (password.length < 6) {
      setError("Паролата трябва да е поне 6 символа.");
      return false;
    }

    return true;
  };

  async function redirectToDashboard() {
    await router.push(redirectPath);
    router.refresh();
  }

  const handleSignIn = async () => {
    setAuthFormMode("sign-in");
    setLoading("sign-in");
    setError("");
    try {
      if (!validateCredentials()) return;
      if (!supabase) {
        setError("Липсва Supabase конфигурация (NEXT_PUBLIC_SUPABASE_*).");
        toast({
          title: "Конфигурация",
          description: "Липсва Supabase конфигурация (NEXT_PUBLIC_SUPABASE_*)."
        });
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) {
        console.warn("[auth] signInWithPassword error:", signInError.message);
        const msg = mapAuthError(signInError.message);
        setError(msg);
        toast({ title: "Грешка при вход", description: msg });
        return;
      }

      toast({ title: "Успешен вход! Пренасочване..." });
      await redirectToDashboard();
    } catch (err) {
      console.error("[auth] handleSignIn exception:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Няма връзка към Supabase. Провери мрежата и променливите NEXT_PUBLIC_SUPABASE_* във Vercel.";
      setError(msg);
      toast({ title: "Грешка при вход", description: msg });
    } finally {
      setLoading(null);
    }
  };

  const handleSignUp = async () => {
    setAuthFormMode("sign-up");
    setLoading("sign-up");
    setError("");
    try {
      if (!validateCredentials()) return;
      if (!supabase) {
        setError("Липсва Supabase конфигурация (NEXT_PUBLIC_SUPABASE_*).");
        toast({
          title: "Конфигурация",
          description: "Липсва Supabase конфигурация (NEXT_PUBLIC_SUPABASE_*)."
        });
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password
      });

      if (signUpError) {
        console.warn("[auth] signUp error:", signUpError.message);
        const msg = mapAuthError(signUpError.message);
        setError(msg);
        toast({ title: "Грешка при регистрация", description: msg });
        return;
      }

      if (!data.session) {
        const sentTo = data.user?.email?.trim() || email.trim();
        setRegisteredEmail(sentTo);
        setAwaitingEmailConfirmation(true);
        return;
      }

      toast({ title: "Успешен вход! Пренасочване..." });
      await redirectToDashboard();
    } catch (err) {
      console.error("[auth] handleSignUp exception:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Няма връзка към Supabase. Провери мрежата и променливите NEXT_PUBLIC_SUPABASE_* във Vercel.";
      setError(msg);
      toast({ title: "Грешка при регистрация", description: msg });
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <Card className="relative w-full">
        <Link
          href="/"
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition hover:bg-teal-500/10 hover:text-teal-200"
          aria-label="Затвори и се върни към началната страница"
        >
          <X className="h-5 w-5" />
        </Link>
        <CardHeader className="pr-12">
          {awaitingEmailConfirmation ? (
            <>
              <CardTitle>Потвърди имейла си</CardTitle>
              <CardDescription>Следвай инструкциите в пощата, за да активираш акаунта.</CardDescription>
            </>
          ) : (
            <>
              <CardTitle>{authFormMode === "sign-in" ? "Вход" : "Регистрация"}</CardTitle>
              <CardDescription>
                {authFormMode === "sign-in"
                  ? "Влез с имейл и парола, за да достъпиш таблото."
                  : "Създай акаунт с имейл и парола. Може да изпратим линк за потвърждение."}
              </CardDescription>
              <p className="text-xs text-muted-foreground">
                {authFormMode === "sign-in" ? (
                  <>
                    Нямаш акаунт?{" "}
                    <button
                      type="button"
                      disabled={loading !== null}
                      className="font-medium text-teal-300 underline-offset-2 hover:underline disabled:opacity-50"
                      onClick={() => setAuthFormMode("sign-up")}
                    >
                      Регистрация
                    </button>
                  </>
                ) : (
                  <>
                    Вече имаш акаунт?{" "}
                    <button
                      type="button"
                      disabled={loading !== null}
                      className="font-medium text-teal-300 underline-offset-2 hover:underline disabled:opacity-50"
                      onClick={() => setAuthFormMode("sign-in")}
                    >
                      Вход
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {awaitingEmailConfirmation ? (
            <div className="space-y-4 py-1">
              <div className="flex justify-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-teal-500/15 text-teal-300">
                  <MailCheck className="h-7 w-7" aria-hidden />
                </span>
              </div>
              <p className="text-center text-base font-medium leading-relaxed text-teal-100">
                Изпратихме ви имейл с линк за потвърждение.
              </p>
              {registeredEmail ? (
                <p className="text-center text-sm text-muted-foreground">
                  Адрес: <span className="font-medium text-foreground">{registeredEmail}</span>
                </p>
              ) : null}
              <p className="text-center text-sm leading-relaxed text-muted-foreground">
                Проверете входящата и спам папката. След като потвърдите линка, се върнете тук и влезте с
                „Вход“.
              </p>
            </div>
          ) : (
            <>
              <Input
                type="email"
                placeholder="Имейл"
                value={email}
                disabled={loading !== null}
                onChange={(event) => setEmail(event.target.value)}
              />
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Парола"
                  value={password}
                  disabled={loading !== null}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={loading !== null}
                  className={cn(
                    "absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition hover:bg-teal-500/10 hover:text-teal-200",
                    loading !== null && "pointer-events-none opacity-50"
                  )}
                  aria-label={showPassword ? "Скрий паролата" : "Покажи паролата"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {error ? <p className="text-sm text-red-400">{error}</p> : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => void handleSignIn()}
                  disabled={loading !== null}
                  className="flex-1"
                >
                  {loading === "sign-in" ? (
                    <Loader2 className="mr-1 h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <LogIn className="mr-1 h-4 w-4 shrink-0" />
                  )}
                  {loading === "sign-in" ? "Влизане..." : "Вход"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSignUp()}
                  disabled={loading !== null}
                  variant="outline"
                  className="flex-1"
                >
                  {loading === "sign-up" ? (
                    <Loader2 className="mr-1 h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <UserPlus className="mr-1 h-4 w-4 shrink-0" />
                  )}
                  {loading === "sign-up" ? "Създаване..." : "Регистрация"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
