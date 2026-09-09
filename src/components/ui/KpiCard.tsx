"use client";

import type { ReactNode } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Card } from "./Card";

// ---------------------------------------------------------------------------
// Sparkline — a tiny, axis-less trend chart for inside a KPI card. Real data
// only: if fewer than 2 points are given, it renders nothing rather than a
// misleading flat/fake line.
// ---------------------------------------------------------------------------
export function Sparkline({ data, color = "#2E6FA7" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const points = data.map((value, i) => ({ i, value }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#spark-${color.replace("#", "")})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface KpiCardProps {
  label: string;
  value: string;
  /** Optional emoji or icon shown next to the label. */
  icon?: ReactNode;
  /** e.g. "+12.8% vs last month" — pass a signed string; color follows `trend`. */
  trendLabel?: string;
  trend?: "up" | "down" | "flat" | "neutral";
  /** Real historical values for the sparkline (e.g. last 6 months). Omit if not available — never fabricated. */
  sparklineData?: number[];
  sparklineColor?: string;
  /** Tint the whole card (e.g. amber for "overdue") instead of the default neutral white. */
  tone?: "default" | "danger" | "warning" | "success" | "primary";
  className?: string;
}

const TONE_STYLES: Record<NonNullable<KpiCardProps["tone"]>, { bg: string; text: string; ring: string }> = {
  default: { bg: "bg-white", text: "text-gray-900", ring: "border-gray-100" },
  danger: { bg: "bg-red-50/60", text: "text-red-700", ring: "border-red-100" },
  warning: { bg: "bg-amber-50/60", text: "text-amber-700", ring: "border-amber-100" },
  success: { bg: "bg-emerald-50/60", text: "text-emerald-700", ring: "border-emerald-100" },
  primary: { bg: "bg-indigo-50/60", text: "text-indigo-700", ring: "border-indigo-100" },
};

const TREND_COLOR: Record<NonNullable<KpiCardProps["trend"]>, string> = {
  up: "text-emerald-600",
  down: "text-red-600",
  flat: "text-gray-400",
  neutral: "text-gray-400",
};

const TREND_ICON: Record<NonNullable<KpiCardProps["trend"]>, string> = {
  up: "↗",
  down: "↘",
  flat: "→",
  neutral: "",
};

export function KpiCard({ label, value, icon, trendLabel, trend = "neutral", sparklineData, sparklineColor, tone = "default", className = "" }: KpiCardProps) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <Card padding="md" hover className={`${toneStyle.bg} ${toneStyle.ring} animate-fade-in-up ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
          {icon} {label}
        </p>
        {trend !== "neutral" && <span className={`text-xs ${TREND_COLOR[trend]}`}>{TREND_ICON[trend]}</span>}
      </div>
      <p className={`text-2xl font-bold mt-1.5 ${toneStyle.text}`}>{value}</p>
      {trendLabel && <p className={`text-xs mt-1 ${TREND_COLOR[trend]}`}>{trendLabel}</p>}
      {sparklineData && sparklineData.length >= 2 && (
        <div className="mt-2 -mx-1">
          <Sparkline data={sparklineData} color={sparklineColor ?? "#2E6FA7"} />
        </div>
      )}
    </Card>
  );
}
