"use client";

import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Неуспешен запис.");
      }

      setSuccess(true);
      setEmail("");
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`rounded-xl border p-3 ${success ? "border-teal-400/60 shadow-[0_0_24px_rgba(45,212,191,0.35)]" : "border-border/70"}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          placeholder="Въведи имейл за ранен достъп"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Влез в списъка на чакащите"}
        </Button>
      </div>
      {success ? (
        <p className="mt-2 text-sm text-teal-300">Успешно! Ще получиш ранен достъп веднага щом отворим beta.</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
    </form>
  );
}
