"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// Structural types — same rationale as TodoWidget: minimal shape so this
// component works with the real (locally-declared) Invoice / PurchaseDoc
// types on both the bookkeeper and client dashboards without importing
// them.
export interface RevenueChartInvoice {
  date: string;
  subtotal: number;
  isCredit?: boolean;
}

export interface RevenueChartExpense {
  documentDate?: string | null;
  totalAmount?: number | null;
}

interface RevenueChartProps {
  invoices: RevenueChartInvoice[];
  expenses?: RevenueChartExpense[];
  /** Number of months to show, ending with the current month. Default 6. */
  months?: number;
}

function formatCurrencyFull(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function formatCurrencyCompact(v: number) {
  if (v >= 1000) return `€${v % 1000 === 0 ? v / 1000 : (v / 1000).toFixed(1)}K`;
  return `€${v}`;
}

const MONTH_LABELS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

// Placeholder y-axis scale used only while there is zero revenue and zero
// expenses to plot — keeps the grid looking like a real, calibrated chart
// (round numbers, five ticks) instead of a degenerate 0-0 axis, without
// inventing any data point: the line still sits flat at €0 the whole way.
const EMPTY_STATE_TICKS = [0, 250, 500, 750, 1000];

/**
 * CA / dépenses chart, aggregated by month from data already held in
 * component state (invoices always; expenses optional — purchase
 * documents don't have a normalized "expense" concept in the current
 * schema, so callers pass what they have or omit the series).
 *
 * Always renders the full chart (axes, grid, legend) — including before
 * any invoices exist — rather than swapping in a "not enough data" text
 * placeholder. A brand-new administration still gets a calibrated,
 * good-looking empty chart instead of a blank box.
 */
export function RevenueChart({ invoices, expenses = [], months = 6 }: RevenueChartProps) {
  const { data, currentTotal, previousTotal } = useMemo(() => {
    const now = new Date();

    function buildBuckets(offsetMonths: number) {
      const buckets: { key: string; label: string; revenue: number; expenses: number }[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i - offsetMonths, 1);
        buckets.push({ key: monthKey(d), label: `${MONTH_LABELS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`, revenue: 0, expenses: 0 });
      }
      return buckets;
    }

    const current = buildBuckets(0);
    const previous = buildBuckets(months); // the `months` window right before the current one
    const currentByKey = new Map(current.map((b) => [b.key, b]));
    const previousByKey = new Map(previous.map((b) => [b.key, b]));

    for (const inv of invoices) {
      if (inv.isCredit) continue;
      const d = new Date(inv.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = monthKey(d);
      const bucket = currentByKey.get(key) ?? previousByKey.get(key);
      if (bucket) bucket.revenue += inv.subtotal;
    }

    for (const exp of expenses) {
      if (!exp.documentDate || !exp.totalAmount) continue;
      const d = new Date(exp.documentDate);
      if (Number.isNaN(d.getTime())) continue;
      const key = monthKey(d);
      const bucket = currentByKey.get(key) ?? previousByKey.get(key);
      if (bucket) bucket.expenses += exp.totalAmount;
    }

    return {
      data: current,
      currentTotal: current.reduce((s, b) => s + b.revenue, 0),
      previousTotal: previous.reduce((s, b) => s + b.revenue, 0),
    };
  }, [invoices, expenses, months]);

  const hasExpenses = expenses.some((e) => e.totalAmount && e.totalAmount > 0);
  const hasAnyData = data.some((d) => d.revenue > 0 || d.expenses > 0);

  const changePct = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : currentTotal > 0 ? null : 0;
  const changeTone = changePct === null || changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
  const changeLabel =
    changePct === null ? "New revenue this period" : `${changePct > 0 ? "+" : ""}${changePct.toFixed(0)}% compared with previous ${months} months`;

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-4">
        <p className="text-[28px] leading-none font-bold text-[#0E2A47]">{formatCurrencyFull(currentTotal)}</p>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            changeTone === "up"
              ? "bg-emerald-50 text-emerald-700"
              : changeTone === "down"
              ? "bg-red-50 text-red-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {changeLabel}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2E6FA7" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#2E6FA7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E4E9F5" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#4F7191" }} axisLine={{ stroke: "#E4E9F5" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#4F7191" }}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={hasAnyData ? [0, "auto"] : [0, 1000]}
            ticks={hasAnyData ? undefined : EMPTY_STATE_TICKS}
            tickFormatter={formatCurrencyCompact}
          />
          <Tooltip
            formatter={(value, name) => [formatCurrencyFull(Number(value)), name === "revenue" ? "Revenue" : "Uitgaven"]}
            contentStyle={{ borderRadius: 8, border: "1px solid #E4E9F5", fontSize: 12 }}
          />
          <Legend
            formatter={(value: string) => (value === "revenue" ? "Revenue" : "Uitgaven")}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            name="revenue"
            stroke="#2E6FA7"
            strokeWidth={2.5}
            fill="url(#revenue-fill)"
            dot={{ r: 3, fill: "#2E6FA7", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          {hasExpenses && <Line dataKey="expenses" name="expenses" stroke="#C2410C" strokeWidth={2} dot={{ r: 3 }} />}
        </ComposedChart>
      </ResponsiveContainer>

      {!hasAnyData && (
        <p className="text-center text-xs text-gray-400 -mt-2">Your revenue will start showing up here once you send your first invoice.</p>
      )}
    </div>
  );
}

export default RevenueChart;
