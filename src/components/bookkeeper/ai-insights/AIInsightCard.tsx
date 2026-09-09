"use client";

import { useState } from "react";
import Link from "next/link";
import { CATEGORY_META, PRIORITY_META, type FinancialInsight } from "@/lib/aiInsights";

interface AIInsightCardProps {
  insight: FinancialInsight;
  onStatusChange: (status: "reviewed" | "dismissed" | "new") => void;
}

export default function AIInsightCard({ insight, onStatusChange }: AIInsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const priorityMeta = PRIORITY_META[insight.priority];
  const categoryMeta = CATEGORY_META[insight.category];
  const status = insight.status || "new";

  return (
    <div
      className={`relative rounded-2xl border bg-white p-5 flex flex-col gap-3 transition-all overflow-hidden ${
        status === "dismissed" ? "border-gray-100 opacity-60" : "border-gray-100 hover:border-indigo-100 hover:shadow-[0_4px_12px_-2px_rgba(17,24,39,0.08)]"
      }`}
    >
      {/* AI-generated content gets a subtle violet accent bar — visually
          distinct from the rest of the app without shouting for attention,
          per the brief: "visually distinct but still professional". */}
      <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500" aria-hidden />

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityMeta.badgeClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${priorityMeta.dotClass}`} />
          {priorityMeta.label}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600">
          {categoryMeta.emoji} {categoryMeta.label}
        </span>
        {status === "reviewed" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200">Reviewed</span>
        )}
        {status === "dismissed" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500 border border-gray-200">Dismissed</span>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <span>{insight.icon}</span> {insight.title}
        </p>
        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{insight.summary}</p>
      </div>

      {insight.metricLabel && (
        <p className="text-lg font-bold text-indigo-700">{insight.metricLabel}</p>
      )}

      <div className="space-y-1.5 pt-1 border-t border-gray-50">
        <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">Why it matters:</span> {insight.whyItMatters}</p>
        <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">What to consider:</span> {insight.whatToConsider}</p>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium text-left flex items-center gap-1"
      >
        {expanded ? "Hide" : "Why am I seeing this?"}
        <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-1 animate-fade-in-up">
          {insight.why.map((line) => (
            <div key={line.label} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{line.label}</span>
              <span className="font-medium text-gray-700">{line.value}</span>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 pt-1">
            {insight.aiEnhanced ? "Explanation refined by AI · figures calculated directly from your data." : "Confidence: " + insight.confidence}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
        <div className="flex items-center gap-2">
          {status !== "reviewed" && (
            <button type="button" onClick={() => onStatusChange("reviewed")} className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">
              Mark reviewed
            </button>
          )}
          {status !== "dismissed" && (
            <button type="button" onClick={() => onStatusChange("dismissed")} className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">
              Dismiss
            </button>
          )}
          {status !== "new" && (
            <button type="button" onClick={() => onStatusChange("new")} className="text-[11px] px-2 py-1 rounded-md text-gray-400 hover:text-gray-600">
              Undo
            </button>
          )}
        </div>
        {insight.cta && (
          <Link href={insight.cta.href} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shrink-0">
            {insight.cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
