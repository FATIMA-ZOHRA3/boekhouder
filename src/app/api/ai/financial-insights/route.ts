import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getGroqApiKey, GROQ_MODEL, callGroq, checkAiRateLimit, truncateForPrompt, parseGroqJson, hashForCacheKey, getCachedSuggestion, setCachedSuggestion, dedupeInFlight } from "@/lib/ai";
import {
  resolvePeriod,
  buildPerformanceInsights,
  buildInvoiceInsights,
  buildCashFlowInsights,
  buildExpenseInsights,
  buildBankingInsights,
  buildAccountingInsights,
  sortInsights,
  inRange,
  type InsightPeriod,
  type FinancialInsight,
  type InvoiceInput,
  type PurchaseDocumentInput,
  type BankTransactionInput,
  type ExceptionSignalInput,
} from "@/lib/aiInsights";

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/ai/financial-insights?clientId=&period=&start=&end=
//
// STEP 14 (fallback) — the deterministic metrics in src/lib/aiInsights.ts are
// always computed first, from real data. Groq (already used everywhere else
// in this project — see src/lib/ai.ts) is only called AFTER, to turn each
// already-correct insight into a short human explanation, and only for the
// handful of insights the deterministic pass produced (never per page
// render — STEP 18). If Groq is unavailable, unconfigured, or the call
// fails, every insight still renders with a safe generic explanation
// (STEP 15) — nothing in this route depends on the AI succeeding.
//
// STEP 17 (security) — same auth/permission pattern as every other /api/ai/*
// route (ai.use, staff-only). Only the minimum fields needed for the prompt
// are sent to Groq — no full invoice/customer objects, no PII beyond a
// customer display name already visible to the accountant.
// ═══════════════════════════════════════════════════════════════════════════

const VALID_PERIODS: InsightPeriod[] = ["today", "this_week", "this_month", "last_month", "this_quarter", "this_year", "custom"];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "ai.use");
  if (!check.ok) return NextResponse.json({ error: "No access" }, { status: check.status });

  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const periodParam = (request.nextUrl.searchParams.get("period") || "this_month") as InsightPeriod;
  if (!VALID_PERIODS.includes(periodParam)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }
  const startParam = request.nextUrl.searchParams.get("start");
  const endParam = request.nextUrl.searchParams.get("end");
  if (periodParam === "custom" && (!startParam || !endParam)) {
    return NextResponse.json({ error: "start and end are required for a custom period" }, { status: 400 });
  }

  let range;
  try {
    range = resolvePeriod(periodParam, new Date(), periodParam === "custom" ? { start: startParam!, end: endParam! } : undefined);
  } catch {
    return NextResponse.json({ error: "Invalid period range" }, { status: 400 });
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  // --- Load real data, scoped to this administration -----------------------
  const [allInvoices, currentPurchasesRaw, previousPurchasesRaw, bankTxRaw, exceptionsRaw] = await Promise.all([
    prisma.invoice.findMany({
      where: { clientId },
      select: {
        id: true, invoiceNumber: true, date: true, dueDate: true, customerId: true, customerName: true,
        subtotal: true, total: true, paidAmount: true, status: true, isCredit: true, createdAt: true,
      },
      orderBy: { date: "desc" },
    }),
    prisma.purchaseDocument.findMany({
      where: { userId: clientId, documentDate: { gte: range.start, lte: range.end } },
      select: { id: true, amount: true, totalAmount: true, category: true, documentDate: true, createdAt: true, status: true },
    }),
    prisma.purchaseDocument.findMany({
      where: { userId: clientId, documentDate: { gte: range.prevStart, lte: range.prevEnd } },
      select: { id: true, amount: true, totalAmount: true, category: true, documentDate: true, createdAt: true, status: true },
    }),
    prisma.bankTransaction.findMany({
      where: { userId: clientId, transactionDate: { gte: range.start, lte: range.end } },
      select: { id: true, amount: true, direction: true, transactionDate: true, status: true },
    }),
    prisma.exceptionItem.findMany({
      where: { userId: clientId, status: { not: "resolved" } },
      select: { id: true, type: true, title: true, description: true, status: true, createdAt: true },
    }),
  ]);

  const invoices: InvoiceInput[] = allInvoices.map((i: typeof allInvoices[number]) => ({
    ...i,
    date: i.date, dueDate: i.dueDate, createdAt: i.createdAt.toISOString(),
  }));
  const currentInvoices = invoices.filter((i) => inRange(i.date, range.start, range.end));
  const previousInvoices = invoices.filter((i) => inRange(i.date, range.prevStart, range.prevEnd));
  const openInvoices = invoices.filter((i) => !i.isCredit && i.status !== "paid" && i.paidAmount < i.total);

  const currentPurchases: PurchaseDocumentInput[] = currentPurchasesRaw.map((p: typeof currentPurchasesRaw[number]) => ({ ...p, createdAt: p.createdAt.toISOString() }));
  const previousPurchases: PurchaseDocumentInput[] = previousPurchasesRaw.map((p: typeof previousPurchasesRaw[number]) => ({ ...p, createdAt: p.createdAt.toISOString() }));
  const bankTx: BankTransactionInput[] = bankTxRaw;
  const exceptions: ExceptionSignalInput[] = exceptionsRaw.map((e: typeof exceptionsRaw[number]) => ({ ...e, createdAt: e.createdAt.toISOString() }));

  // --- STEP 12/14: deterministic calculation, always correct without AI ---
  let insights: FinancialInsight[] = [
    ...buildPerformanceInsights(currentInvoices, previousInvoices, currentPurchases, previousPurchases, range.label),
    ...buildInvoiceInsights(openInvoices, todayISO),
    ...buildCashFlowInsights(openInvoices, bankTx, todayISO),
    ...buildExpenseInsights(currentPurchases, previousPurchases),
    ...buildBankingInsights(bankTx),
    ...buildAccountingInsights(exceptions),
  ];
  insights = sortInsights(insights);

  // --- Merge persisted status (New/Reviewed/Dismissed) ---------------------
  // Piggybacks on the existing generic SystemSetting key-value table (already
  // used for the Groq API key) instead of adding a new model — per STEP 10,
  // "first determine whether an existing model can support it".
  if (insights.length > 0) {
    const keys = insights.map((i) => statusKey(clientId, i.id));
    const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
    const statusByKey = new Map(rows.map((r: typeof rows[number]) => [r.key, r.value]));
    for (const insight of insights) {
      const status = statusByKey.get(statusKey(clientId, insight.id));
      insight.status = status === "reviewed" || status === "dismissed" ? status : "new";
    }
  }

  // --- STEP 6/18: AI enrichment — one batched call, only if there's
  // something to explain and a key is configured. Never blocks the
  // deterministic result on failure.
  //
  // CACHED: this GET fires automatically on every mount of the AI Insights
  // page/dashboard preview (useFinancialInsights' useEffect) — every
  // navigation back to the dashboard, every client switch, every React
  // Strict Mode dev double-invoke, with no explicit "generate" action from
  // the accountant. Before this cache existed, every single one of those
  // was a fresh Groq call even when the underlying insights (same ids/
  // titles/summaries — i.e. nothing about the client's data actually
  // changed) were identical to the last call. The deterministic numbers
  // above are ALWAYS recomputed fresh from the DB on every request — only
  // the AI-written phrasing is cached, keyed by a hash of exactly what's
  // sent to the prompt, so any real change to the insights (a new invoice,
  // a resolved exception, etc.) produces a different key and a fresh call.
  // dedupeInFlight additionally collapses truly concurrent requests for the
  // same key (Strict Mode's mount→cleanup→mount fires the real fetch twice
  // before either one resolves) into a single Groq call instead of a race
  // where both requests miss the cache and both call Groq.
  const apiKey = await getGroqApiKey();
  if (insights.length > 0 && apiKey) {
    const compact = insights.map((i) => ({ id: i.id, title: i.title, summary: i.summary }));
    const cacheKey = `financial-insights:${clientId}:${hashForCacheKey(JSON.stringify(compact))}`;
    const cached = getCachedSuggestion<EnrichmentMap>(cacheKey);
    if (cached) {
      insights = applyEnrichment(insights, cached);
    } else {
      const enrichment = await dedupeInFlight(`ai-enrich:${cacheKey}`, async () => {
        // Rate-limit check lives inside the dedupe callback so a request that
        // was only deduped (not actually re-executed) never double-counts
        // against the per-user budget.
        if (!checkAiRateLimit(check.user.id)) return null;
        const map = await enrichWithAi(compact, apiKey);
        if (map) setCachedSuggestion(cacheKey, map);
        return map;
      });
      if (enrichment) insights = applyEnrichment(insights, enrichment);
    }
  }

  return NextResponse.json({
    period: range,
    insights,
    aiAvailable: !!apiKey,
  });
}

function statusKey(clientId: string, insightId: string): string {
  return `ai_insight_status:${clientId}:${insightId}`;
}

// One row per insight id, exactly what the cache stores (see the GET handler
// above) — split out from the merge step so a cache hit and a fresh Groq
// call go through the exact same "apply to insights" code path below.
type EnrichmentMap = Record<string, { whyItMatters?: string; whatToConsider?: string }>;

function applyEnrichment(insights: FinancialInsight[], enrichment: EnrichmentMap): FinancialInsight[] {
  return insights.map((insight) => {
    const enriched = enrichment[insight.id];
    if (!enriched) return insight;
    return {
      ...insight,
      whyItMatters: typeof enriched.whyItMatters === "string" && enriched.whyItMatters.trim() ? enriched.whyItMatters.trim() : insight.whyItMatters,
      whatToConsider: typeof enriched.whatToConsider === "string" && enriched.whatToConsider.trim() ? enriched.whatToConsider.trim() : insight.whatToConsider,
      aiEnhanced: true,
    };
  });
}

// `compact` is already the minimal {id, title, summary} shape (STEP 17: no
// customer names, no raw invoice/transaction rows) — same value used both
// as the Groq prompt input and as the cache key material in the GET handler.
// Returns just the enrichment map (or null on any failure) so the caller
// decides what to cache and how to merge it — this function no longer knows
// about the full FinancialInsight[] shape at all.
async function enrichWithAi(compact: Array<{ id: string; title: string; summary: string }>, apiKey: string): Promise<EnrichmentMap | null> {
  const result = await callGroq(apiKey, {
    model: GROQ_MODEL,
    max_tokens: 900,
    // Rephrasing already-correct deterministic numbers into plain sentences — low
    // temperature keeps it close to the given facts rather than embellishing.
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an assistant for an accountant reviewing financial insights about one of their client companies.

For each insight given, write two short sentences in simple English:
- "whyItMatters": why this matters to the accountant, in plain language.
- "whatToConsider": a neutral recommendation of what to check or consider next.

Rules:
- Do NOT invent any numbers, percentages, or amounts — the numbers are already correct and are not shown to you.
- Do NOT make definitive accounting decisions or tell the accountant what to do — only suggest what to consider.
- Each sentence must be short (under 25 words).
- Return JSON: {"insights": [{"id": "...", "whyItMatters": "...", "whatToConsider": "..."}]}
- Only return valid JSON, no explanation.`,
      },
      {
        role: "user",
        content: truncateForPrompt(JSON.stringify(compact), 4000),
      },
    ],
  });

  if (!result.ok) return null; // fallback: caller keeps the deterministic generic text

  const raw = result.data.choices?.[0]?.message?.content || "{}";
  const parsed = parseGroqJson<{ insights?: Array<{ id: string; whyItMatters?: string; whatToConsider?: string }> }>(raw);
  if (!parsed || !Array.isArray(parsed.insights)) return null;

  const map: EnrichmentMap = {};
  for (const p of parsed.insights) {
    if (p && typeof p.id === "string") map[p.id] = { whyItMatters: p.whyItMatters, whatToConsider: p.whatToConsider };
  }
  return map;
}
