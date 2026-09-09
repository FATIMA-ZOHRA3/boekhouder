// ═══════════════════════════════════════════════════════════════════════════
// AI Financial Insights — deterministic calculation & normalization engine
// ═══════════════════════════════════════════════════════════════════════════
// Per the brief (STEP 14 — Fallback / STEP 12 — Real data): every number in
// an insight is computed HERE, deterministically, from real rows already
// loaded by the route handler (Invoice, PurchaseDocument, BankTransaction,
// ExceptionItem — the same models the rest of the app already reads). This
// file never calls Groq and never invents a figure. The route handler may
// optionally ask the AI (src/lib/ai.ts) to turn the objects this file
// produces into a short human explanation, but the numbers themselves are
// always trustworthy without it — if the AI is unavailable, everything here
// still renders (STEP 15).
//
// Priority reuses the same 4-tier vocabulary as the existing exception
// severity engine (src/lib/exceptionSeverity.ts: critical/high/medium/low)
// plus one additional tier, "informational", for insights that are good
// news or purely descriptive (e.g. "revenue increased") and were never
// meant to alarm anyone — that tier doesn't exist in the exception engine
// because exceptions are never good news. Nothing here contradicts or
// re-derives the exception engine's own scoring; accounting-anomaly
// insights (STEP 3 category "Accounting anomalies") reuse
// `computeExceptionSeverity` directly instead of re-implementing it.
// ═══════════════════════════════════════════════════════════════════════════

import { computeExceptionSeverity, type ExceptionSeverity } from "@/lib/exceptionSeverity";

// --- Period handling -------------------------------------------------------

export type InsightPeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export interface PeriodRange {
  /** Inclusive, YYYY-MM-DD */
  start: string;
  /** Inclusive, YYYY-MM-DD */
  end: string;
  /** Same-length prior period, for comparison. */
  prevStart: string;
  prevEnd: string;
  label: string;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday as start of week
  return addDays(copy, diff);
}

/**
 * Resolves a named period (or explicit custom range) into a concrete
 * start/end plus a same-length preceding period to compare against.
 */
export function resolvePeriod(
  period: InsightPeriod,
  now: Date = new Date(),
  custom?: { start: string; end: string }
): PeriodRange {
  const today = toISODate(now);

  switch (period) {
    case "today":
      return { start: today, end: today, prevStart: toISODate(addDays(now, -1)), prevEnd: toISODate(addDays(now, -1)), label: "Today" };
    case "this_week": {
      const start = startOfWeek(now);
      return {
        start: toISODate(start),
        end: today,
        prevStart: toISODate(addDays(start, -7)),
        prevEnd: toISODate(addDays(start, -1)),
        label: "This week",
      };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevEnd = addDays(start, -1);
      return { start: toISODate(start), end: today, prevStart: toISODate(prevStart), prevEnd: toISODate(prevEnd), label: "This month" };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = addDays(new Date(now.getFullYear(), now.getMonth(), 1), -1);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const prevEnd = addDays(start, -1);
      return { start: toISODate(start), end: toISODate(end), prevStart: toISODate(prevStart), prevEnd: toISODate(prevEnd), label: "Last month" };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      const prevEnd = addDays(start, -1);
      return { start: toISODate(start), end: today, prevStart: toISODate(prevStart), prevEnd: toISODate(prevEnd), label: "This quarter" };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const prevStart = new Date(now.getFullYear() - 1, 0, 1);
      const prevEnd = new Date(now.getFullYear() - 1, 11, 31);
      return { start: toISODate(start), end: today, prevStart: toISODate(prevStart), prevEnd: toISODate(prevEnd), label: "This year" };
    }
    case "custom": {
      if (!custom) throw new Error("custom period requires start/end");
      const startD = new Date(custom.start);
      const endD = new Date(custom.end);
      const spanMs = Math.max(0, endD.getTime() - startD.getTime());
      const prevEndD = addDays(startD, -1);
      const prevStartD = new Date(prevEndD.getTime() - spanMs);
      return {
        start: custom.start,
        end: custom.end,
        prevStart: toISODate(prevStartD),
        prevEnd: toISODate(prevEndD),
        label: `${custom.start} → ${custom.end}`,
      };
    }
  }
}

export function inRange(dateStr: string, start: string, end: string): boolean {
  const d = dateStr.slice(0, 10);
  return d >= start && d <= end;
}

// --- Input shapes (mirror the existing Prisma models / API JSON) -----------

export interface InvoiceInput {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customerId: string | null;
  customerName: string;
  subtotal: number;
  total: number;
  paidAmount: number;
  status: string;
  isCredit: boolean;
  createdAt: string;
}

export interface PaymentInput {
  invoiceId: string;
  amount: number;
  date: string;
}

export interface PurchaseDocumentInput {
  id: string;
  amount: number | null;
  totalAmount: number | null;
  category: string | null;
  documentDate: string | null;
  createdAt: string;
  status: string;
}

export interface BankTransactionInput {
  id: string;
  amount: number;
  direction: string; // debit | credit
  transactionDate: string;
  status: string; // new, processing, matched, reconciled
}

export interface ExceptionSignalInput {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  amount?: number | null;
}

// --- Output shape ------------------------------------------------------

export type InsightCategory = "performance" | "cash_flow" | "invoices" | "expenses" | "banking" | "accounting";
export type InsightPriority = "critical" | "high" | "medium" | "low" | "informational";
export type InsightStatus = "new" | "reviewed" | "dismissed";

export interface InsightWhy {
  label: string;
  value: string;
}

export interface FinancialInsight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  icon: string;
  title: string;
  /** "What happened" — one sentence, deterministic, always present. */
  summary: string;
  /** "Why it matters" — filled by AI when available, else a safe generic fallback. */
  whyItMatters: string;
  /** "What to consider" — filled by AI when available, else a safe generic fallback. */
  whatToConsider: string;
  /** Deterministic evidence lines shown under "Why am I seeing this?" */
  why: InsightWhy[];
  /** Primary metric shown on the card, e.g. "€18,420 → €21,000". Optional. */
  metricLabel: string | null;
  cta: { label: string; href: string } | null;
  aiEnhanced: boolean;
  confidence: "High" | "Medium" | "Low";
  /** Set by the route after merging persisted status; "new" until the accountant acts on it. */
  status?: InsightStatus;
}

const PRIORITY_ORDER: InsightPriority[] = ["critical", "high", "medium", "low", "informational"];

export const CATEGORY_META: Record<InsightCategory, { label: string; emoji: string }> = {
  performance: { label: "Performance", emoji: "📈" },
  cash_flow: { label: "Cash Flow", emoji: "💰" },
  invoices: { label: "Invoices", emoji: "🧾" },
  expenses: { label: "Expenses", emoji: "💸" },
  banking: { label: "Banking", emoji: "🏦" },
  accounting: { label: "Accounting", emoji: "⚠️" },
};

export const PRIORITY_META: Record<InsightPriority, { label: string; badgeClass: string; dotClass: string }> = {
  critical: { label: "Critical", badgeClass: "bg-red-50 text-red-700 border border-red-200", dotClass: "bg-red-500" },
  high: { label: "High", badgeClass: "bg-orange-50 text-orange-700 border border-orange-200", dotClass: "bg-orange-500" },
  medium: { label: "Medium", badgeClass: "bg-amber-50 text-amber-700 border border-amber-200", dotClass: "bg-amber-400" },
  low: { label: "Low", badgeClass: "bg-sky-50 text-sky-700 border border-sky-200", dotClass: "bg-sky-400" },
  informational: { label: "Informational", badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200", dotClass: "bg-emerald-500" },
};

function formatCurrencyEUR(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // undefined % change, avoid a fake number
  return ((current - previous) / previous) * 100;
}

function priorityFromPctChange(pct: number, goodDirection: "up" | "down"): InsightPriority {
  const magnitude = Math.abs(pct);
  const isGood = goodDirection === "up" ? pct >= 0 : pct <= 0;
  if (magnitude < 5) return "informational";
  if (isGood) return magnitude >= 25 ? "informational" : "low";
  if (magnitude >= 40) return "critical";
  if (magnitude >= 20) return "high";
  return "medium";
}

// --- Category builders -------------------------------------------------
// Each function takes already-filtered (current + previous period) rows and
// returns zero or more insights. Nothing here is called if the underlying
// data doesn't support the insight ("Only make predictions if sufficient
// real data exists" — STEP 3).

export function buildPerformanceInsights(
  currentInvoices: InvoiceInput[],
  previousInvoices: InvoiceInput[],
  currentPurchases: PurchaseDocumentInput[],
  previousPurchases: PurchaseDocumentInput[],
  periodLabel: string
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  const revenueNow = currentInvoices.filter((i) => !i.isCredit).reduce((s, i) => s + i.subtotal, 0);
  const revenuePrev = previousInvoices.filter((i) => !i.isCredit).reduce((s, i) => s + i.subtotal, 0);
  const revPct = pctChange(revenueNow, revenuePrev);

  if (revPct !== null && (currentInvoices.length > 0 || previousInvoices.length > 0)) {
    const up = revPct >= 0;
    insights.push({
      id: "perf:revenue",
      category: "performance",
      priority: priorityFromPctChange(revPct, "up"),
      icon: up ? "📈" : "📉",
      title: up ? "Revenue growth" : "Revenue decline",
      summary: `Revenue ${up ? "increased" : "decreased"} by ${Math.abs(revPct).toFixed(1)}% compared with the previous period (${periodLabel}).`,
      whyItMatters: up
        ? "This indicates stronger sales activity compared with the previous period."
        : "A revenue drop can affect margins and cash flow if it continues.",
      whatToConsider: up
        ? "Review whether the increase comes from recurring customers or one-time invoices."
        : "Check whether this is seasonal, or driven by fewer invoices, lower prices, or lost customers.",
      why: [
        { label: "Revenue this period", value: formatCurrencyEUR(revenueNow) },
        { label: "Revenue previous period", value: formatCurrencyEUR(revenuePrev) },
        { label: "Difference", value: formatCurrencyEUR(revenueNow - revenuePrev) },
        { label: "Change", value: `${up ? "+" : ""}${revPct.toFixed(1)}%` },
        { label: "Data period", value: periodLabel },
      ],
      metricLabel: `${formatCurrencyEUR(revenuePrev)} → ${formatCurrencyEUR(revenueNow)}`,
      cta: { label: "View sales", href: "/bookkeeper?section=sales" },
      aiEnhanced: false,
      confidence: previousInvoices.length >= 3 && currentInvoices.length >= 3 ? "High" : "Medium",
    });
  }

  const expensesNow = currentPurchases.reduce((s, p) => s + (p.amount ?? p.totalAmount ?? 0), 0);
  const expensesPrev = previousPurchases.reduce((s, p) => s + (p.amount ?? p.totalAmount ?? 0), 0);
  const expPct = pctChange(expensesNow, expensesPrev);

  if (expPct !== null && (currentPurchases.length > 0 || previousPurchases.length > 0)) {
    const up = expPct >= 0;
    insights.push({
      id: "perf:expenses",
      category: "performance",
      priority: priorityFromPctChange(expPct, "down"),
      icon: up ? "📊" : "📉",
      title: up ? "Expenses increased" : "Expenses decreased",
      summary: `Expenses ${up ? "increased" : "decreased"} by ${Math.abs(expPct).toFixed(1)}% compared with the previous period.`,
      whyItMatters: up
        ? "Rising expenses reduce margin unless matched by revenue growth."
        : "Lower expenses can improve margin, but check it isn't caused by missing/unbooked purchase documents.",
      whatToConsider: "Compare against the category breakdown to see which type of expense is driving the change.",
      why: [
        { label: "Expenses this period", value: formatCurrencyEUR(expensesNow) },
        { label: "Expenses previous period", value: formatCurrencyEUR(expensesPrev) },
        { label: "Difference", value: formatCurrencyEUR(expensesNow - expensesPrev) },
        { label: "Change", value: `${up ? "+" : ""}${expPct.toFixed(1)}%` },
        { label: "Data period", value: periodLabel },
      ],
      metricLabel: `${formatCurrencyEUR(expensesPrev)} → ${formatCurrencyEUR(expensesNow)}`,
      cta: { label: "View purchases", href: "/bookkeeper?section=purchases" },
      aiEnhanced: false,
      confidence: previousPurchases.length >= 3 && currentPurchases.length >= 3 ? "High" : "Medium",
    });
  }

  if (revenueNow > 0 || revenuePrev > 0) {
    const marginNow = revenueNow > 0 ? ((revenueNow - expensesNow) / revenueNow) * 100 : null;
    const marginPrev = revenuePrev > 0 ? ((revenuePrev - expensesPrev) / revenuePrev) * 100 : null;
    if (marginNow !== null && marginPrev !== null) {
      const diff = marginNow - marginPrev;
      if (Math.abs(diff) >= 3) {
        const improved = diff > 0;
        insights.push({
          id: "perf:margin",
          category: "performance",
          priority: improved ? "informational" : Math.abs(diff) >= 10 ? "high" : "medium",
          icon: improved ? "✅" : "⚠️",
          title: improved ? "Profit margin improved" : "Profit margin declined",
          summary: `Profit margin ${improved ? "improved" : "declined"} from ${marginPrev.toFixed(1)}% to ${marginNow.toFixed(1)}%.`,
          whyItMatters: improved
            ? "A wider margin means each euro of revenue is converting into more profit."
            : "A shrinking margin means costs are growing faster than revenue.",
          whatToConsider: "Look at the expense category breakdown and recent pricing to understand the driver.",
          why: [
            { label: "Margin this period", value: `${marginNow.toFixed(1)}%` },
            { label: "Margin previous period", value: `${marginPrev.toFixed(1)}%` },
            { label: "Change", value: `${improved ? "+" : ""}${diff.toFixed(1)} pts` },
            { label: "Data period", value: periodLabel },
          ],
          metricLabel: `${marginPrev.toFixed(1)}% → ${marginNow.toFixed(1)}%`,
          cta: { label: "View dashboard", href: "/bookkeeper" },
          aiEnhanced: false,
          confidence: "Medium",
        });
      }
    }
  }

  return insights;
}

export function buildInvoiceInsights(openInvoices: InvoiceInput[], todayISO: string): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  const overdue = openInvoices.filter((i) => !i.isCredit && i.status !== "paid" && i.paidAmount < i.total && i.dueDate < todayISO);
  if (overdue.length > 0) {
    const totalOutstanding = overdue.reduce((s, i) => s + (i.total - i.paidAmount), 0);
    const worstDays = Math.max(...overdue.map((i) => Math.floor((new Date(todayISO).getTime() - new Date(i.dueDate).getTime()) / 86400000)));
    insights.push({
      id: "inv:overdue",
      category: "invoices",
      priority: totalOutstanding >= 5000 || worstDays >= 30 ? "critical" : totalOutstanding >= 1000 || worstDays >= 14 ? "high" : "medium",
      icon: "⚠️",
      title: "Overdue invoices",
      summary: `${overdue.length} invoice${overdue.length === 1 ? " is" : "s are"} currently overdue.`,
      whyItMatters: "Overdue invoices directly delay incoming cash and increase the risk of non-payment the longer they sit unresolved.",
      whatToConsider: "Consider sending payment reminders to the oldest or largest overdue invoices first.",
      why: [
        { label: "Overdue invoices", value: String(overdue.length) },
        { label: "Total outstanding", value: formatCurrencyEUR(totalOutstanding) },
        { label: "Oldest overdue by", value: `${worstDays} day${worstDays === 1 ? "" : "s"}` },
      ],
      metricLabel: formatCurrencyEUR(totalOutstanding),
      cta: { label: "View invoices", href: "/bookkeeper?section=sales" },
      aiEnhanced: false,
      confidence: "High",
    });
  }

  // Repeated late payers: customers with 2+ overdue (or previously-overdue-but-paid-late) invoices.
  const byCustomer = new Map<string, InvoiceInput[]>();
  for (const inv of overdue) {
    const key = inv.customerId || inv.customerName;
    const list = byCustomer.get(key) || [];
    list.push(inv);
    byCustomer.set(key, list);
  }
  const repeatOffenders = Array.from(byCustomer.entries()).filter(([, invs]) => invs.length >= 2);
  if (repeatOffenders.length > 0) {
    const [, invs] = repeatOffenders.sort((a, b) => b[1].length - a[1].length)[0];
    insights.push({
      id: "inv:repeat-late",
      category: "invoices",
      priority: invs.length >= 3 ? "high" : "medium",
      icon: "🔁",
      title: "Repeated late payments",
      summary: `${invs[0].customerName} has ${invs.length} overdue invoices right now.`,
      whyItMatters: "A pattern of repeated late payments from one customer is a stronger signal than a single overdue invoice.",
      whatToConsider: "Consider reviewing this customer's payment terms or following up directly before issuing further credit.",
      why: [
        { label: "Customer", value: invs[0].customerName },
        { label: "Overdue invoices from this customer", value: String(invs.length) },
        { label: "Total outstanding from this customer", value: formatCurrencyEUR(invs.reduce((s, i) => s + (i.total - i.paidAmount), 0)) },
      ],
      metricLabel: `${invs.length} overdue`,
      cta: { label: "View customer", href: "/bookkeeper?section=sales" },
      aiEnhanced: false,
      confidence: repeatOffenders.length === 1 ? "Medium" : "High",
    });
  }

  return insights;
}

export function buildCashFlowInsights(openInvoices: InvoiceInput[], recentBankTx: BankTransactionInput[], todayISO: string): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  const notYetDue = openInvoices.filter((i) => !i.isCredit && i.status !== "paid" && i.paidAmount < i.total && i.dueDate >= todayISO);
  const expectedIncoming = notYetDue.reduce((s, i) => s + (i.total - i.paidAmount), 0);
  const overdueAmount = openInvoices
    .filter((i) => !i.isCredit && i.status !== "paid" && i.paidAmount < i.total && i.dueDate < todayISO)
    .reduce((s, i) => s + (i.total - i.paidAmount), 0);

  if (expectedIncoming > 0 || overdueAmount > 0) {
    const atRiskShare = expectedIncoming + overdueAmount > 0 ? (overdueAmount / (expectedIncoming + overdueAmount)) * 100 : 0;
    if (atRiskShare >= 20) {
      insights.push({
        id: "cash:outstanding-risk",
        category: "cash_flow",
        priority: atRiskShare >= 50 ? "critical" : atRiskShare >= 30 ? "high" : "medium",
        icon: "💰",
        title: "Outstanding invoices may affect cash flow",
        summary: `${atRiskShare.toFixed(0)}% of expected incoming payments are already overdue.`,
        whyItMatters: "A large share of overdue receivables reduces predictable cash flow and can force reliance on other funding.",
        whatToConsider: "Prioritize collecting the overdue portion before it grows relative to the invoices still within terms.",
        why: [
          { label: "Not yet due", value: formatCurrencyEUR(expectedIncoming) },
          { label: "Overdue", value: formatCurrencyEUR(overdueAmount) },
          { label: "Share overdue", value: `${atRiskShare.toFixed(0)}%` },
        ],
        metricLabel: formatCurrencyEUR(overdueAmount),
        cta: { label: "View invoices", href: "/bookkeeper?section=sales" },
        aiEnhanced: false,
        confidence: "Medium",
      });
    }
  }

  const unmatched = recentBankTx.filter((t) => t.status === "new" || t.status === "processing");
  if (unmatched.length >= 3) {
    const totalUnmatched = unmatched.reduce((s, t) => s + t.amount, 0);
    insights.push({
      id: "cash:unmatched-bank",
      category: "cash_flow",
      priority: unmatched.length >= 10 ? "high" : "medium",
      icon: "🏦",
      title: "Bank transactions awaiting reconciliation",
      summary: `${unmatched.length} bank transactions are not yet matched or reconciled.`,
      whyItMatters: "Unreconciled transactions mean the accounting records may not reflect the real bank position yet.",
      whatToConsider: "Review and reconcile these transactions to keep the cash position accurate.",
      why: [
        { label: "Unmatched transactions", value: String(unmatched.length) },
        { label: "Combined amount", value: formatCurrencyEUR(totalUnmatched) },
      ],
      metricLabel: `${unmatched.length} pending`,
      cta: { label: "View bank", href: "/bookkeeper?section=bank" },
      aiEnhanced: false,
      confidence: "High",
    });
  }

  return insights;
}

export function buildExpenseInsights(currentPurchases: PurchaseDocumentInput[], previousPurchases: PurchaseDocumentInput[]): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  if (currentPurchases.length === 0) return insights;

  const total = currentPurchases.reduce((s, p) => s + (p.amount ?? p.totalAmount ?? 0), 0);
  if (total <= 0) return insights;

  const byCategory = new Map<string, number>();
  for (const p of currentPurchases) {
    const cat = p.category || "Uncategorized";
    byCategory.set(cat, (byCategory.get(cat) || 0) + (p.amount ?? p.totalAmount ?? 0));
  }
  const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  const [topCategory, topAmount] = sorted[0];
  const share = (topAmount / total) * 100;

  if (share >= 40 && byCategory.size > 1) {
    insights.push({
      id: "exp:concentration",
      category: "expenses",
      priority: share >= 65 ? "high" : "medium",
      icon: "💸",
      title: "Expense concentration",
      summary: `"${topCategory}" represents ${share.toFixed(0)}% of total expenses this period.`,
      whyItMatters: "A single category dominating spend increases exposure if that supplier or cost driver changes.",
      whatToConsider: "Check whether this concentration is expected (e.g. a known large purchase) or worth diversifying.",
      why: [
        { label: "Top category", value: topCategory },
        { label: "Amount in category", value: formatCurrencyEUR(topAmount) },
        { label: "Total expenses", value: formatCurrencyEUR(total) },
        { label: "Share", value: `${share.toFixed(0)}%` },
      ],
      metricLabel: `${share.toFixed(0)}% "${topCategory}"`,
      cta: { label: "View purchases", href: "/bookkeeper?section=purchases" },
      aiEnhanced: false,
      confidence: "High",
    });
  }

  // Recurring category that changed significantly vs previous period.
  if (previousPurchases.length > 0) {
    const prevByCategory = new Map<string, number>();
    for (const p of previousPurchases) {
      const cat = p.category || "Uncategorized";
      prevByCategory.set(cat, (prevByCategory.get(cat) || 0) + (p.amount ?? p.totalAmount ?? 0));
    }
    for (const [cat, amt] of byCategory) {
      const prevAmt = prevByCategory.get(cat);
      if (prevAmt && prevAmt > 0) {
        const pct = pctChange(amt, prevAmt);
        if (pct !== null && Math.abs(pct) >= 50 && Math.min(amt, prevAmt) >= 100) {
          const up = pct >= 0;
          insights.push({
            id: `exp:recurring-change:${cat}`,
            category: "expenses",
            priority: Math.abs(pct) >= 100 ? "high" : "medium",
            icon: up ? "📊" : "📉",
            title: `"${cat}" expenses changed significantly`,
            summary: `Spend in "${cat}" ${up ? "increased" : "decreased"} by ${Math.abs(pct).toFixed(0)}% compared with the previous period.`,
            whyItMatters: "A large swing in a recurring category can signal a new contract, a pricing change, or a billing error worth checking.",
            whatToConsider: "Compare individual purchase documents in this category to confirm the change is expected.",
            why: [
              { label: "Category", value: cat },
              { label: "This period", value: formatCurrencyEUR(amt) },
              { label: "Previous period", value: formatCurrencyEUR(prevAmt) },
              { label: "Change", value: `${up ? "+" : ""}${pct.toFixed(0)}%` },
            ],
            metricLabel: `${formatCurrencyEUR(prevAmt)} → ${formatCurrencyEUR(amt)}`,
            cta: { label: "View purchases", href: "/bookkeeper?section=purchases" },
            aiEnhanced: false,
            confidence: "Medium",
          });
          break; // one recurring-change insight is enough signal, avoid flooding the board
        }
      }
    }
  }

  return insights;
}

export function buildBankingInsights(bankTx: BankTransactionInput[]): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const flagged = bankTx.filter((t) => t.status === "new");
  const oldFlagged = flagged; // all "new" are unreviewed by definition

  if (oldFlagged.length > 0) {
    const totalCredit = oldFlagged.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0);
    const totalDebit = oldFlagged.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
    insights.push({
      id: "bank:review-needed",
      category: "banking",
      priority: oldFlagged.length >= 15 ? "high" : oldFlagged.length >= 5 ? "medium" : "low",
      icon: "🔎",
      title: "Transactions require review",
      summary: `${oldFlagged.length} bank transaction${oldFlagged.length === 1 ? "" : "s"} may require review.`,
      whyItMatters: "New, un-triaged transactions can hide missing documents, duplicate matches, or misclassified income/expense.",
      whatToConsider: "Work through the newest bank transactions to match or reconcile them.",
      why: [
        { label: "Transactions flagged", value: String(oldFlagged.length) },
        { label: "Incoming (credit)", value: formatCurrencyEUR(totalCredit) },
        { label: "Outgoing (debit)", value: formatCurrencyEUR(totalDebit) },
      ],
      metricLabel: `${oldFlagged.length} to review`,
      cta: { label: "View bank", href: "/bookkeeper?section=bank" },
      aiEnhanced: false,
      confidence: "High",
    });
  }

  return insights;
}

/**
 * Accounting anomalies reuse the existing exception severity engine
 * directly — this function does not score anything itself, it only maps an
 * already-scored ExceptionItem-like signal into an insight card.
 */
export function buildAccountingInsights(exceptions: ExceptionSignalInput[]): FinancialInsight[] {
  const open = exceptions.filter((e) => e.status !== "resolved");
  if (open.length === 0) return [];

  const scored = open.map((e) => ({ e, severity: computeExceptionSeverity(e) as ExceptionSeverity }));
  const worst = scored.sort((a, b) => PRIORITY_ORDER.indexOf(a.severity as InsightPriority) - PRIORITY_ORDER.indexOf(b.severity as InsightPriority))[0];

  return [
    {
      id: "acc:open-exceptions",
      category: "accounting",
      priority: worst.severity,
      icon: "⚠️",
      title: "Open accounting exceptions",
      summary: `${open.length} accounting exception${open.length === 1 ? " is" : "s are"} still open.`,
      whyItMatters: "Open exceptions (missing documents or missing payments) can block VAT filing or period closing if left unresolved.",
      whatToConsider: "Review the Exceptions module, starting with the most severe items.",
      why: [
        { label: "Open exceptions", value: String(open.length) },
        { label: "Most severe", value: PRIORITY_META[worst.severity].label },
      ],
      metricLabel: `${open.length} open`,
      cta: { label: "View exceptions", href: "/bookkeeper?section=exceptions" },
      aiEnhanced: false,
      confidence: "High",
    },
  ];
}

export function sortInsights(insights: FinancialInsight[]): FinancialInsight[] {
  return [...insights].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
}

export function formatCurrency(amount: number): string {
  return formatCurrencyEUR(amount);
}
