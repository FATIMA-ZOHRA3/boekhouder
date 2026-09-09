"use client";

import { CATEGORY_META, PRIORITY_META, type InsightCategory, type InsightPeriod, type InsightPriority, type InsightStatus } from "@/lib/aiInsights";

const CATEGORY_ORDER: InsightCategory[] = ["performance", "cash_flow", "invoices", "expenses", "banking", "accounting"];
const PRIORITY_ORDER: InsightPriority[] = ["critical", "high", "medium", "low", "informational"];
const STATUS_ORDER: InsightStatus[] = ["new", "reviewed", "dismissed"];

const PERIOD_OPTIONS: { value: InsightPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom period" },
];

const STATUS_LABEL: Record<InsightStatus, string> = { new: "New", reviewed: "Reviewed", dismissed: "Dismissed" };

const selectClass =
  "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

interface AIInsightsFiltersProps {
  period: InsightPeriod;
  onPeriodChange: (value: InsightPeriod) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  category: InsightCategory | null;
  onCategoryChange: (value: InsightCategory | null) => void;
  priority: InsightPriority | null;
  onPriorityChange: (value: InsightPriority | null) => void;
  status: InsightStatus | null;
  onStatusChange: (value: InsightStatus | null) => void;
}

export default function AIInsightsFilters({
  period, onPeriodChange, customStart, customEnd, onCustomStartChange, onCustomEndChange,
  category, onCategoryChange, priority, onPriorityChange, status, onStatusChange,
}: AIInsightsFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
      <select
        value={period}
        onChange={(e) => onPeriodChange(e.target.value as InsightPeriod)}
        className={selectClass}
        aria-label="Filter by period"
      >
        {PERIOD_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {period === "custom" && (
        <div className="flex items-center gap-2">
          <input type="date" value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} className={selectClass} aria-label="Start date" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} className={selectClass} aria-label="End date" />
        </div>
      )}

      <select
        value={category ?? "all"}
        onChange={(e) => onCategoryChange(e.target.value === "all" ? null : (e.target.value as InsightCategory))}
        className={selectClass}
        aria-label="Filter by category"
      >
        <option value="all">All categories</option>
        {CATEGORY_ORDER.map((c) => (
          <option key={c} value={c}>{CATEGORY_META[c].label}</option>
        ))}
      </select>

      <select
        value={priority ?? "all"}
        onChange={(e) => onPriorityChange(e.target.value === "all" ? null : (e.target.value as InsightPriority))}
        className={selectClass}
        aria-label="Filter by priority"
      >
        <option value="all">All priorities</option>
        {PRIORITY_ORDER.map((p) => (
          <option key={p} value={p}>{PRIORITY_META[p].label}</option>
        ))}
      </select>

      <select
        value={status ?? "all"}
        onChange={(e) => onStatusChange(e.target.value === "all" ? null : (e.target.value as InsightStatus))}
        className={selectClass}
        aria-label="Filter by status"
      >
        <option value="all">All statuses</option>
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
    </div>
  );
}
