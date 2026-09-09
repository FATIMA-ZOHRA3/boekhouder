"use client";

import { useCallback, useEffect, useState } from "react";
import type { FinancialInsight, InsightPeriod } from "@/lib/aiInsights";

export interface PeriodInfo {
  start: string;
  end: string;
  label: string;
}

interface UseFinancialInsightsResult {
  insights: FinancialInsight[];
  period: PeriodInfo | null;
  aiAvailable: boolean;
  loading: boolean;
  error: string;
  refresh: () => void;
  setInsightStatus: (insightId: string, status: "new" | "reviewed" | "dismissed") => Promise<void>;
}

/**
 * Fetches /api/ai/financial-insights for the given administration + period.
 * Mirrors useControlCenterData.ts: no client-side detection logic here, only
 * a fetch + normalize step. The deterministic calculation and any AI
 * enrichment both happen server-side.
 */
export function useFinancialInsights(
  administrationId: string | null,
  period: InsightPeriod,
  customStart?: string,
  customEnd?: string
): UseFinancialInsightsResult {
  const [insights, setInsights] = useState<FinancialInsight[]>([]);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfo | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!administrationId) {
      setInsights([]);
      setPeriodInfo(null);
      setLoading(false);
      setError("");
      return;
    }
    if (period === "custom" && (!customStart || !customEnd)) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const params = new URLSearchParams({ clientId: administrationId, period });
    if (period === "custom" && customStart && customEnd) {
      params.set("start", customStart);
      params.set("end", customEnd);
    }

    fetch(`/api/ai/financial-insights?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("financial-insights"))))
      .then((data: { insights: FinancialInsight[]; period: PeriodInfo; aiAvailable: boolean }) => {
        if (cancelled) return;
        setInsights(Array.isArray(data.insights) ? data.insights : []);
        setPeriodInfo(data.period || null);
        setAiAvailable(!!data.aiAvailable);
      })
      .catch(() => {
        if (!cancelled) setError("AI insights are temporarily unavailable. Your financial data is still available.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [administrationId, period, customStart, customEnd, reloadToken]);

  const setInsightStatus = useCallback(
    async (insightId: string, status: "new" | "reviewed" | "dismissed") => {
      if (!administrationId) return;
      // Optimistic update — the accountant's click should feel instant.
      setInsights((prev) => prev.map((i) => (i.id === insightId ? { ...i, status } : i)));
      try {
        const res = await fetch("/api/ai/financial-insights/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: administrationId, insightId, status }),
        });
        if (!res.ok) throw new Error("status update failed");
      } catch {
        // Revert on failure by refetching the real state from the server.
        refresh();
      }
    },
    [administrationId, refresh]
  );

  return { insights, period: periodInfo, aiAvailable, loading, error, refresh, setInsightStatus };
}
