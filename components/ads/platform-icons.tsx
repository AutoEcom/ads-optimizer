"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";
import type { MetaPlacement, Platform } from "@/types";

function IconBox({
  className,
  title,
  children
}: {
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md", className)}
      title={title}
    >
      {children}
    </span>
  );
}

export function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-4 w-4", className)} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-4 w-4", className)} aria-hidden fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function InstagramGlyph({ className }: { className?: string }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" className={cn("h-4 w-4", className)} aria-hidden>
      <defs>
        <linearGradient id={`ig-${gid}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="50%" stopColor="#e6683c" />
          <stop offset="100%" stopColor="#dc2743" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#ig-${gid})`}
        d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.35 3.608 1.325.975.975 1.263 2.242 1.325 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.35 2.633-1.325 3.608-.975.975-2.242 1.263-3.608 1.325-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.35-3.608-1.325-.975-.975-1.263-2.242-1.325-3.608-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.062-1.366.35-2.633 1.325-3.608.975-.975 2.242-1.263 3.608-1.325 1.266-.058 1.646-.07 4.85-.07zm0-2.163c-3.259 0-3.667.014-4.947.072-1.28.058-2.185.26-2.96.553a5.99 5.99 0 00-2.163 1.408A5.99 5.99 0 002.785 4.01c-.293.775-.495 1.68-.553 2.96C2.174 8.25 2.16 8.658 2.16 11.917c0 3.259.014 3.667.072 4.947.058 1.28.26 2.185.553 2.96.308.825.72 1.538 1.408 2.163a5.99 5.99 0 002.163 1.408c.775.293 1.68.495 2.96.553 1.28.058 1.688.072 4.947.072s3.667-.014 4.947-.072c1.28-.058 2.185-.26 2.96-.553a5.99 5.99 0 002.163-1.408 5.99 5.99 0 001.408-2.163c.293-.775.495-1.68.553-2.96.058-1.28.072-1.688.072-4.947s-.014-3.667-.072-4.947c-.058-1.28-.26-2.185-.553-2.96a5.99 5.99 0 00-1.408-2.163A5.99 5.99 0 0019.99 2.785c-.775-.293-1.68-.495-2.96-.553C15.75 2.174 15.342 2.16 12.083 2.16z"
      />
      <path
        fill="#fff"
        d="M12 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zm0 10.162a3.999 3.999 0 110-7.998 3.999 3.999 0 010 7.998zm6.406-11.845a1.44 1.44 0 11-2.881 0 1.44 1.44 0 012.881 0z"
      />
    </svg>
  );
}

/** Стилизиран знак Meta (две пресичащи се ленти в синьо), без математическия символ ∞. */
export function MetaBrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-4 w-4", className)} aria-hidden>
      <ellipse cx="8.2" cy="12" rx="5.2" ry="8.4" fill="#0866FF" transform="rotate(-22 8.2 12)" />
      <ellipse cx="15.8" cy="12" rx="5.2" ry="8.4" fill="#0082FB" transform="rotate(22 15.8 12)" opacity={0.95} />
    </svg>
  );
}

export function CampaignPlatformGlyph({
  platform,
  metaPlacement
}: {
  platform: Platform;
  metaPlacement?: MetaPlacement;
}) {
  if (platform === "Google") {
    return (
      <IconBox className="bg-white/10" title="Google Ads">
        <GoogleGlyph />
      </IconBox>
    );
  }
  if (metaPlacement === "instagram") {
    return (
      <IconBox className="bg-white/10" title="Instagram">
        <InstagramGlyph />
      </IconBox>
    );
  }
  if (metaPlacement === "facebook") {
    return (
      <IconBox className="bg-white/10" title="Facebook">
        <FacebookGlyph />
      </IconBox>
    );
  }
  return (
    <IconBox className="bg-sky-500/15" title="Meta">
      <MetaBrandGlyph />
    </IconBox>
  );
}

export function PlatformCornerBadge({
  platform,
  metaPlacement
}: {
  platform: Platform | "Общо";
  metaPlacement?: MetaPlacement;
}) {
  if (platform === "Общо") {
    return (
      <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Общо
      </span>
    );
  }
  if (platform === "Google") {
    return (
      <span className="rounded-full border border-white/10 bg-black/25 p-1.5" title="Google Ads">
        <GoogleGlyph />
      </span>
    );
  }
  if (metaPlacement === "instagram") {
    return (
      <span className="rounded-full border border-white/10 bg-black/25 p-1.5" title="Instagram">
        <InstagramGlyph />
      </span>
    );
  }
  if (metaPlacement === "facebook") {
    return (
      <span className="rounded-full border border-white/10 bg-black/25 p-1.5" title="Facebook">
        <FacebookGlyph />
      </span>
    );
  }
  return (
    <span className="rounded-full border border-white/10 bg-black/25 p-1.5" title="Meta">
      <MetaBrandGlyph />
    </span>
  );
}

export function ImpactScorePill({ score, label }: { score: number; label?: string }) {
  const high = score > 70;
  const pill = (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        high
          ? "bg-orange-500/25 text-orange-100 ring-1 ring-orange-400/45"
          : "bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/35"
      )}
    >
      {score}
    </span>
  );
  if (!label) return pill;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {pill}
    </span>
  );
}
