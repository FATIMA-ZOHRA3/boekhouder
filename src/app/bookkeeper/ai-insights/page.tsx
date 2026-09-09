"use client";

import { Suspense, useMemo, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import AIInsightsHeader from "@/components/bookkeeper/ai-insights/AIInsightsHeader";
import AIInsightsSummary from "@/components/bookkeeper/ai-insights/AIInsightsSummary";
import AIInsightsFilters from "@/components/bookkeeper/ai-insights/AIInsightsFilters";
import AIInsightCard from "@/components/bookkeeper/ai-insights/AIInsightCard";
import { useFinancialInsights } from "@/components/bookkeeper/ai-insights/useFinancialInsights";
import type { InsightCategory, InsightPeriod, InsightPriority, InsightStatus } from "@/lib/aiInsights";
import { EmptyState, ErrorState } from "@/components/ui/Card";

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
      <div className="h-3 w-20 skeleton-shimmer rounded" />
      <div className="h-4 w-3/4 skeleton-shimmer rounded" />
      <div className="h-3 w-full skeleton-shimmer rounded" />
      <div className="h-3 w-2/3 skeleton-shimmer rounded" />
    </div>
  );
}

function AIInsightsInner() {
  const { activeAdministration, loading: adminLoading } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;

  const [period, setPeriod] = useState<InsightPeriod>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<InsightPriority | null>(null);
  const [statusFilter, setStatusFilter] = useState<InsightStatus | null>(null);

  const { insights, aiAvailable, loading, error, refresh, setInsightStatus } = useFinancialInsights(
    activeAdminId,
    period,
    period === "custom" ? customStart : undefined,
    period === "custom" ? customEnd : undefined
  );

  const filteredInsights = useMemo(() => {
    return insights.filter((i) => {
      if (categoryFilter && i.category !== categoryFilter) return false;
      if (priorityFilter && i.priority !== priorityFilter) return false;
      if (statusFilter && (i.status || "new") !== statusFilter) return false;
      return true;
    });
  }, [insights, categoryFilter, priorityFilter, statusFilter]);

  const anyFilterActive = !!categoryFilter || !!priorityFilter || !!statusFilter;

  return (
    <div className="p-4 sm:p-6 lg:p-8 lg:pt-3 max-w-7xl space-y-6">
      <AIInsightsHeader companyLabel={activeAdministration ? activeAdministration.company || activeAdministration.name : null} />

      {!adminLoading && !activeAdminId ? (
        <div className="max-w-xl mx-auto mt-10">
          <EmptyState
            icon={
              <svg className="w-12 h-12 text-indigo-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            title="Select a company first"
            body="AI Financial Insights works within one customer company. Choose which company you want to review."
            action={{ label: "Choose a company", href: "/bookkeeper?section=administraties" }}
          />
        </div>
      ) : (
        <>
          {!loading && !error && !aiAvailable && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-700">
              AI explanations are unavailable (no AI provider configured) — the figures below are still calculated directly from your data.
            </div>
          )}

          <AIInsightsSummary insights={insights} activeCategory={categoryFilter} onSelectCategory={setCategoryFilter} />

          <AIInsightsFilters
            period={period}
            onPeriodChange={setPeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            category={categoryFilter}
            onCategoryChange={setCategoryFilter}
            priority={priorityFilter}
            onPriorityChange={setPriorityFilter}
            status={statusFilter}
            onStatusChange={setStatusFilter}
          />

          {anyFilterActive && (
            <button
              type="button"
              onClick={() => { setCategoryFilter(null); setPriorityFilter(null); setStatusFilter(null); }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              × Clear filters
            </button>
          )}

          {error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 5, 6].map((i) => <CardSkeleton key={i} />)}
            </div>
          ) : filteredInsights.length === 0 ? (
            <EmptyState
              icon={
                <svg className="w-10 h-10 text-emerald-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              }
              title={insights.length === 0 ? "No insights for this period" : "No insights match these filters"}
              body={insights.length === 0 ? "Nothing notable was found in the selected period." : "Try clearing a filter."}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredInsights.map((insight) => (
                <AIInsightCard
                  key={insight.id}
                  insight={insight}
                  onStatusChange={(status) => setInsightStatus(insight.id, status)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AIInsightsPage() {
  return (
    <Suspense>
      <AIInsightsInner />
    </Suspense>
  );
}
