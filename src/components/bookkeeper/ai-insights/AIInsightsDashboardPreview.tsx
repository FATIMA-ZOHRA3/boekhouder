"use client";

import Link from "next/link";
import { useFinancialInsights } from "@/components/bookkeeper/ai-insights/useFinancialInsights";

interface AIInsightsDashboardPreviewProps {
  administrationId: string | null;
}

/**
 * STEP 11 — compact dashboard preview. Deliberately self-contained (own data
 * fetch via the same hook the standalone page uses) so embedding it in the
 * 6000+ line bookkeeper page.tsx is a single import + a single render call,
 * not a change to that file's own state or data-loading logic.
 */
export default function AIInsightsDashboardPreview({ administrationId }: AIInsightsDashboardPreviewProps) {
  const { insights, loading, error } = useFinancialInsights(administrationId, "this_month");

  if (!administrationId || loading || error) return null;

  const top = insights.slice(0, 4);
  if (top.length === 0) return null;

  return (
    <div className="relative rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 overflow-hidden shadow-[0_1px_2px_0_rgba(17,24,39,0.04)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5 tracking-wide">
          <span aria-hidden>✨</span> AI INSIGHT
        </h2>
        <Link href="/bookkeeper/ai-insights" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
          View all →
        </Link>
      </div>
      <ul className="space-y-2.5">
        {top.map((insight) => (
          <li key={insight.id} className="text-sm text-gray-700 flex items-start gap-2">
            <span>{insight.icon}</span>
            <span>{insight.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
