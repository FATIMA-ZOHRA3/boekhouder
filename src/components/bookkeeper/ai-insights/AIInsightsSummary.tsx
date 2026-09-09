"use client";

import type { FinancialInsight, InsightCategory } from "@/lib/aiInsights";
import { CATEGORY_META } from "@/lib/aiInsights";

const CATEGORY_ORDER: InsightCategory[] = ["performance", "cash_flow", "invoices", "expenses", "banking", "accounting"];

interface AIInsightsSummaryProps {
  insights: FinancialInsight[];
  activeCategory: InsightCategory | null;
  onSelectCategory: (category: InsightCategory | null) => void;
}

export default function AIInsightsSummary({ insights, activeCategory, onSelectCategory }: AIInsightsSummaryProps) {
  const counts: Record<InsightCategory, number> = {
    performance: 0, cash_flow: 0, invoices: 0, expenses: 0, banking: 0, accounting: 0,
  };
  const criticalCount = insights.filter((i) => i.priority === "critical").length;
  for (const insight of insights) counts[insight.category] += 1;

  return (
    <div className="space-y-3">
      {criticalCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 font-medium">
          🔴 {criticalCount} insight{criticalCount === 1 ? " needs" : "s need"} urgent attention
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(isActive ? null : cat)}
              className={`rounded-2xl p-4 shadow-[0_1px_2px_0_rgba(17,24,39,0.04)] border text-left transition-all bg-white ${
                isActive ? "border-indigo-400 ring-2 ring-indigo-500/25" : "border-gray-100 hover:border-indigo-100 hover:shadow-[0_4px_12px_-2px_rgba(17,24,39,0.06)]"
              }`}
            >
              <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <span aria-hidden>{meta.emoji}</span> {meta.label}
              </p>
              <p className="text-xl font-bold text-gray-900">{counts[cat]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
