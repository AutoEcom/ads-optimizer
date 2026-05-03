"use client";

import { motion } from "framer-motion";
import { Activity, BadgeCheck, Crosshair, Radar, Search, ShieldAlert, Target, Zap } from "lucide-react";
import { ReactNode } from "react";

import { LandingAuthHeader } from "@/components/marketing/landing-auth-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WaitlistForm } from "@/components/marketing/waitlist-form";

export function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground">
      <LandingAuthHeader />

      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-8 pt-6 lg:grid-cols-[1.1fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-5"
        >
          <p className="inline-flex rounded-full border border-teal-400/40 bg-teal-500/10 px-3 py-1 text-xs text-teal-200">
            Agentic Orchestration за Meta + Google
          </p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            6-Agent Orchestration, което пази бюджета ти и скалира победителите.
          </h1>
          <p className="max-w-xl text-muted-foreground">
            AdGuard AI синхронизира 6 специализирани агента, които анализират Budget, Audience, Bidding и
            Strategy в реално време. Получаваш ясни действия, по-нисък CPA и по-висок ROAS без догадки.
          </p>
          <WaitlistForm />
        </motion.div>

        <Card className="shadow-[0_0_28px_rgba(20,184,166,0.26)]">
          <CardHeader>
            <CardTitle className="text-base">Live Preview: Health Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <motion.div
              className="mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-slate-950/60 p-2 shadow-[0_0_44px_rgba(16,185,129,0.42)]"
              animate={{ boxShadow: ["0 0 28px rgba(16,185,129,0.32)", "0 0 52px rgba(16,185,129,0.58)", "0 0 28px rgba(16,185,129,0.32)"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div
                className="relative h-full w-full rounded-full"
                style={{
                  background:
                    "conic-gradient(rgb(45 212 191) 295deg, rgba(45,212,191,0.12) 295deg 360deg)"
                }}
              >
                <div className="absolute inset-5 flex items-center justify-center rounded-full bg-slate-950">
                  <div className="text-center">
                    <p className="text-5xl font-semibold text-teal-300">82</p>
                    <p className="text-xs text-muted-foreground">Health Score</p>
                  </div>
                </div>
              </div>
            </motion.div>
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3">
              <p className="text-sm font-medium text-rose-200">3x Kill Rule защита</p>
              <p className="text-xs text-muted-foreground">
                Ако CPA мине 3x таргета, агентът маркира риска и предлага незабавно действие.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <h2 className="text-2xl font-semibold">Мозъкът зад оптимизацията</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6 text-sm">
              <p className="font-medium text-teal-200">1) The Brain анализира данните</p>
              <p className="mt-1 text-muted-foreground">Meta + Google сигнали се оценяват едновременно.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-sm">
              <p className="font-medium text-teal-200">2) 6 агента генерират план</p>
              <p className="mt-1 text-muted-foreground">Всеки агент решава конкретен проблемен слой.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-sm">
              <p className="font-medium text-teal-200">3) Priority действия в реално време</p>
              <p className="mt-1 text-muted-foreground">Виждаш Impact и Kill Rule защита преди загубата.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-5 px-4 pb-10 pt-3">
        <h2 className="text-2xl font-semibold">Skill Showcase: Платформени инструменти</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SKILL_BADGES.map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.label}
                className="inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-500/10 px-3 py-2 text-xs text-teal-200 shadow-[0_0_14px_rgba(45,212,191,0.18)]"
              >
                <Icon className="h-3.5 w-3.5" />
                {badge.label}
              </div>
            );
          })}
        </div>

        <h2 className="pt-2 text-2xl font-semibold">6-Agent Orchestration</h2>
        <motion.div
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.12,
                delayChildren: 0.08
              }
            }
          }}
        >
          {AGENTS.map((agent) => (
            <motion.div
              key={agent.title}
              variants={{
                hidden: { opacity: 0, y: 26 },
                visible: { opacity: 1, y: 0 }
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <FeatureCard
                icon={<agent.icon className="h-5 w-5 text-teal-300" />}
                title={agent.title}
                description={agent.description}
              />
            </motion.div>
          ))}
        </motion.div>
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

const SKILL_BADGES = [
  { label: "Keyword Mining", icon: Search },
  { label: "Audience Builder", icon: Crosshair },
  { label: "Scaling Roadmap", icon: Target },
  { label: "Negative Keyword Guard", icon: ShieldAlert },
  { label: "Bid Strategy Auditor", icon: Activity },
  { label: "Funnel Alignment", icon: Radar },
  { label: "Budget Sufficiency", icon: Zap },
  { label: "3x Kill Rule", icon: ShieldAlert }
];

const AGENTS = [
  {
    title: "Budget Agent",
    description: "Scaling Roadmap за Meta и Budget Sufficiency за Google, за да не блокираш ръст.",
    icon: Target
  },
  {
    title: "Creative Agent",
    description: "Следи fatigue, hook performance и relevance сигнали преди спад в CTR.",
    icon: BadgeCheck
  },
  {
    title: "Audience Agent",
    description: "Audience Builder идеи (LAL/interest) и сигнали за PMax/Display разширяване.",
    icon: Crosshair
  },
  {
    title: "Technical Agent",
    description: "Event Match Quality плюс Negative Keyword Guard срещу нерелевантен spend.",
    icon: Activity
  },
  {
    title: "Bidding Agent",
    description: "Открива Auction Overlap и bidding разминавания, които изяждат маржа.",
    icon: Radar
  },
  {
    title: "Strategy Agent",
    description: "Funnel Alignment + Keyword Mining за Search Terms и приоритети по възвръщаемост.",
    icon: Search
  }
];
