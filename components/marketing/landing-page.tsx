"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, Shield, Sparkles } from "lucide-react";
import { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WaitlistForm } from "@/components/marketing/waitlist-form";

export function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
        <p className="text-lg font-semibold text-teal-300">AdGuard AI</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-200 transition hover:bg-teal-500/20"
          >
            Табло
          </Link>
          <Link
            href="/auth"
            className="rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground transition hover:bg-teal-500/10 hover:text-teal-200"
          >
            Вход
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-8 pt-6 lg:grid-cols-[1.1fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-5"
        >
          <p className="inline-flex rounded-full border border-teal-400/40 bg-teal-500/10 px-3 py-1 text-xs text-teal-200">
            AI Ads Manager за Meta + Google
          </p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            Спри да губиш пари за реклама. Остави AI да пази бюджета ти.
          </h1>
          <p className="max-w-xl text-muted-foreground">
            AdGuard AI автоматично открива и спира губещите кампании в Meta и Google Ads. Спести до 30% от
            разходите си още днес.
          </p>
          <WaitlistForm />
        </motion.div>

        <Card className="shadow-[0_0_28px_rgba(20,184,166,0.26)]">
          <CardHeader>
            <CardTitle className="text-base">Live Preview: Health Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-slate-950/60 p-2 shadow-[0_0_34px_rgba(45,212,191,0.38)]">
              <div
                className="relative h-full w-full rounded-full"
                style={{
                  background:
                    "conic-gradient(rgb(45 212 191) 280deg, rgba(45,212,191,0.16) 280deg 360deg)"
                }}
              >
                <div className="absolute inset-5 flex items-center justify-center rounded-full bg-slate-950">
                  <div className="text-center">
                    <p className="text-5xl font-semibold text-teal-300">78</p>
                    <p className="text-xs text-muted-foreground">Health Score</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Маркетинг бюджетът ти изтича в грешни кампании. AI го спира преди да е късно.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <h2 className="text-2xl font-semibold">Как работи</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "1) Свързваш акаунтите си",
            "2) Одитираш с AI за 1 клик",
            "3) Спестяваш от губещи кампании"
          ].map((step) => (
            <Card key={step}>
              <CardContent className="pt-6 text-sm">{step}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-4 px-4 pb-10 pt-3">
        <h2 className="text-2xl font-semibold">Core Features</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <FeatureCard
            icon={<Bot className="h-5 w-5 text-teal-300" />}
            title="24/7 AI Мониторинг"
            description="Клод-базиран анализ на всяко евро и всяка кампания."
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5 text-rose-400" />}
            title="Kill-Switch Правила"
            description="Автоматично спиране при висок CPA и необоснован разход."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5 text-emerald-400" />}
            title="Smart Insights"
            description="Приоритизирани задачи за твоя медиа байър и екип."
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
