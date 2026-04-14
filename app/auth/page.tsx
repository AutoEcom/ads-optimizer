"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const router = useRouter();
  const redirectPath = "/dashboard" as Route;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"sign-in" | "sign-up" | null>(null);

  const supabase = createSupabaseBrowserClient();

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

  const handleSignIn = async () => {
    setLoading("sign-in");
    setError("");
    if (!validateCredentials()) {
      setLoading(null);
      return;
    }
    if (!supabase) {
      setError("Липсва Supabase конфигурация в .env.local.");
      setLoading(null);
      return;
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) {
        setError(mapAuthError(signInError.message));
        setLoading(null);
        return;
      }

      router.push(redirectPath);
      router.refresh();
    } catch {
      setError("Няма връзка към Supabase. Провери URL и ключовете в .env.local.");
      setLoading(null);
    }
  };

  const handleSignUp = async () => {
    setLoading("sign-up");
    setError("");
    if (!validateCredentials()) {
      setLoading(null);
      return;
    }
    if (!supabase) {
      setError("Липсва Supabase конфигурация в .env.local.");
      setLoading(null);
      return;
    }

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password
      });

      if (signUpError) {
        setError(mapAuthError(signUpError.message));
        setLoading(null);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Няма връзка към Supabase. Провери URL и ключовете в .env.local.");
      setLoading(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Вход в AdGuard AI</CardTitle>
          <CardDescription>Влез с имейл и парола, за да достъпиш таблото.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="email"
            placeholder="Имейл"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            type="password"
            placeholder="Парола"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex gap-2">
            <Button onClick={handleSignIn} disabled={loading !== null} className="flex-1">
              <LogIn className="mr-1 h-4 w-4" />
              {loading === "sign-in" ? "Влизане..." : "Вход"}
            </Button>
            <Button
              onClick={handleSignUp}
              disabled={loading !== null}
              variant="outline"
              className="flex-1"
            >
              <UserPlus className="mr-1 h-4 w-4" />
              {loading === "sign-up" ? "Създаване..." : "Регистрация"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
