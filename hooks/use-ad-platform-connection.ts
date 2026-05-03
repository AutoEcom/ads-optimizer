"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const META_ADS_SWR_KEY = "/api/ads/meta";
export const GOOGLE_ADS_SWR_KEY = "/api/ads/google";

export type LinkedAccountStatus = "loading" | "linked" | "not-linked";

type UseAdPlatformConnectionOptions = {
  /** Извиква се при преход linked → not-linked: локално изчистване + SWR кеш. */
  clearLinkedClientState: () => Promise<void>;
  logPrefix?: string;
  /** Уникален суфикс за Realtime канала (различни страници). */
  channelScope?: string;
};

export function useAdPlatformConnection({
  clearLinkedClientState,
  logPrefix = "[ad-connection]",
  channelScope = "app"
}: UseAdPlatformConnectionOptions) {
  const { mutate } = useSWRConfig();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [linkedAccountStatus, setLinkedAccountStatus] = useState<LinkedAccountStatus>("loading");
  const prevLinkedRef = useRef<LinkedAccountStatus>("loading");

  const runConnectionCheck = useCallback(async (): Promise<LinkedAccountStatus> => {
    const client = supabase;
    if (!client) {
      const prev = prevLinkedRef.current;
      if (prev === "linked") {
        await clearLinkedClientState();
      }
      prevLinkedRef.current = "not-linked";
      setLinkedAccountStatus("not-linked");
      return "not-linked";
    }

    const prev = prevLinkedRef.current;
    const sb = client;
    const { count, error } = await sb
      .from("ad_platform_tokens")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (error) {
      console.warn(`${logPrefix} ad_platform_tokens count:`, error.message);
      const next: LinkedAccountStatus = "not-linked";
      if (prev === "linked") {
        await clearLinkedClientState();
      }
      prevLinkedRef.current = next;
      setLinkedAccountStatus(next);
      return next;
    }

    const next: LinkedAccountStatus = (count ?? 0) > 0 ? "linked" : "not-linked";

    if (next === "not-linked") {
      if (prev === "linked") {
        await clearLinkedClientState();
      }
      prevLinkedRef.current = next;
      setLinkedAccountStatus(next);
      return next;
    }

    prevLinkedRef.current = next;
    setLinkedAccountStatus(next);

    if (prev !== "linked") {
      await Promise.all([mutate(META_ADS_SWR_KEY), mutate(GOOGLE_ADS_SWR_KEY)]);
    }

    return next;
  }, [supabase, mutate, clearLinkedClientState, logPrefix]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      void runConnectionCheck();
      return;
    }

    void runConnectionCheck();
    const {
      data: { subscription }
    } = client.auth.onAuthStateChange(() => {
      void runConnectionCheck();
    });
    return () => subscription.unsubscribe();
  }, [supabase, runConnectionCheck]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let cancelled = false;
    const rt = { channel: null as ReturnType<typeof client.channel> | null };

    void (async () => {
      const {
        data: { user },
        error: userError
      } = await client.auth.getUser();
      if (cancelled || userError || !user) return;

      const ch = client
        .channel(`ad_platform_tokens:${user.id}:${channelScope}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "ad_platform_tokens",
            filter: `user_id=eq.${user.id}`
          },
          async () => {
            const wasLinked = prevLinkedRef.current === "linked";
            const next = await runConnectionCheck();
            if (next === "linked" && wasLinked) {
              await Promise.all([mutate(META_ADS_SWR_KEY), mutate(GOOGLE_ADS_SWR_KEY)]);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`${logPrefix} Realtime:`, status, err?.message ?? err);
          }
        });

      rt.channel = ch;
      if (cancelled) {
        void client.removeChannel(ch);
        rt.channel = null;
      }
    })();

    return () => {
      cancelled = true;
      if (rt.channel) {
        void client.removeChannel(rt.channel);
        rt.channel = null;
      }
    };
  }, [supabase, runConnectionCheck, mutate, logPrefix, channelScope]);

  return {
    linkedAccountStatus,
    hasLinkedAdAccounts: linkedAccountStatus === "linked",
    runConnectionCheck,
    supabase
  };
}
