"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Invoice } from "@/lib/data";
import { useAdministration } from "@/components/AdministrationProvider";
import RequireAdministration from "@/components/RequireAdministration";
import RevenueChart from "@/components/dashboard/RevenueChart";
import { TodoWidget, type TodoException, type TodoBankTx } from "@/components/dashboard/TodoWidget";
import AIInsightsDashboardPreview from "@/components/bookkeeper/ai-insights/AIInsightsDashboardPreview";
import { Card, PageHeader, SkeletonCard } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency } from "@/lib/format";
import { LEGACY_SECTION_REDIRECTS } from "@/lib/legacySectionRedirects";

// ---------------------------------------------------------------------------
// Home — was the "dashboard" branch of the app/bookkeeper/page.tsx
// monolith (`section === "dashboard"`). Same KPIs and widgets (KpiCard row,
// RevenueChart, TodoWidget, AI insights preview, top customers) now
// arranged as a real bento grid at its own route, with data fetched
// scoped to the active administration instead of filtered client-side out
// of a firm-wide fetch.
// ---------------------------------------------------------------------------

interface PurchaseDoc { id: string; status: string; totalAmount: number | null; documentDate: string | null }
interface BankTx { id: string; status: string }
interface ExceptionRow { id: string; type: string; status: string; title: string; createdAt: string; user?: { id: string; name: string; company: string | null } | null }

function LegacyRedirectWatcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const section = searchParams.get("section");
    if (section && LEGACY_SECTION_REDIRECTS[section] && LEGACY_SECTION_REDIRECTS[section] !== "/bookkeeper") {
      router.replace(LEGACY_SECTION_REDIRECTS[section]);
    }
  }, [searchParams, router]);
  return null;
}

function HomeInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchaseDocs, setPurchaseDocs] = useState<PurchaseDoc[]>([]);
  const [bankTxs, setBankTxs] = useState<BankTx[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAdminId) return;
    // Flips synchronously, in the same commit as activeAdminId changing —
    // not deferred into the setTimeout below — so there is no render frame
    // where the new activeAdminId is set but `loading` is still false and
    // the previous company's invoices/purchaseDocs/bankTxs/exceptions are
    // still what's on screen. See the render below: everything derived from
    // that state is now behind `{loading ? ... : ...}`.
    setLoading(true);
    let cancelled = false;

    function load() {
      Promise.all([
        fetch(`/api/invoices?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/purchases/all?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/bank/transactions?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/exceptions`).then((r) => (r.ok ? r.json() : [])),
      ]).then(([inv, docs, txs, exc]) => {
        if (cancelled) return;
        setInvoices(Array.isArray(inv) ? inv : []);
        setPurchaseDocs(Array.isArray(docs) ? docs : []);
        setBankTxs(Array.isArray(txs) ? txs : []);
        setExceptions(Array.isArray(exc) ? exc.filter((e: ExceptionRow) => e.user?.id === activeAdminId) : []);
      }).finally(() => { if (!cancelled) setLoading(false); });
    }

    const timer = setTimeout(load, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeAdminId]);

  const stats = useMemo(() => {
    const nonCredit = invoices.filter((i) => !i.isCredit);
    const totalRevenue = nonCredit.reduce((s, i) => s + i.subtotal, 0);
    const outstanding = nonCredit.filter((i) => i.status === "sent" || i.status === "overdue" || i.status === "partial");
    const toBook = invoices.filter((i) => i.bookkeepingStatus === "pending" || i.bookkeepingStatus === "to_book");
    const booked = invoices.filter((i) => i.bookkeepingStatus === "booked");

    const now = new Date();
    const monthlyRevenue: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      monthlyRevenue.push(nonCredit.filter((inv) => { const d = new Date(inv.date); return d >= start && d < end; }).reduce((s, inv) => s + inv.subtotal, 0));
    }

    const customerMap = new Map<string, { name: string; count: number; total: number; open: number }>();
    invoices.forEach((inv) => {
      const key = (inv.customerName || "").trim() || "(no name)";
      const entry = customerMap.get(key) || { name: key, count: 0, total: 0, open: 0 };
      entry.count += 1;
      entry.total += inv.total;
      if (inv.status === "sent" || inv.status === "overdue") entry.open += inv.total;
      customerMap.set(key, entry);
    });
    const topCustomers = Array.from(customerMap.values()).sort((a, b) => b.total - a.total);

    return {
      totalRevenue,
      outstandingAmount: outstanding.reduce((s, i) => s + i.total, 0),
      outstandingCount: outstanding.length,
      toBookCount: toBook.length,
      bookedCount: booked.length,
      monthlyRevenue,
      topCustomers,
    };
  }, [invoices]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl space-y-6">
      <Suspense><LegacyRedirectWatcher /></Suspense>

      <PageHeader title="Home" subtitle={activeAdministration ? (activeAdministration.company || activeAdministration.name) : undefined} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total revenue" value={formatCurrency(stats.totalRevenue)} icon="💰" tone="primary" sparklineData={stats.monthlyRevenue} sparklineColor="#2E6FA7" />
            <KpiCard label="Outstanding" value={formatCurrency(stats.outstandingAmount)} icon="🟡" tone="danger" trendLabel={`${stats.outstandingCount} invoice${stats.outstandingCount === 1 ? "" : "s"}`} trend="neutral" />
            <KpiCard label="To book" value={String(stats.toBookCount)} icon="🧾" tone="warning" />
            <KpiCard label="Booked" value={String(stats.bookedCount)} icon="✅" tone="success" />
          </div>

          {/* Bento row: revenue trend (wide) + what needs attention (narrow) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Revenue — last 6 months</h2>
              <RevenueChart invoices={invoices} expenses={purchaseDocs} />
            </Card>
            <TodoWidget
              exceptions={exceptions as TodoException[]}
              bankTxs={bankTxs as TodoBankTx[]}
              exceptionsHref="/bookkeeper/exceptions"
              bankHref="/bookkeeper/banking"
            />
          </div>

          {activeAdminId && <AIInsightsDashboardPreview administrationId={activeAdminId} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Overview</h2>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-50"><span className="text-sm text-gray-600">Total revenue</span><span className="text-sm font-semibold">{formatCurrency(stats.totalRevenue)}</span></div>
                <div className="flex justify-between py-2 border-b border-gray-50"><span className="text-sm text-gray-600">Number of customers</span><span className="text-sm font-semibold">{stats.topCustomers.length}</span></div>
                <div className="flex justify-between py-2"><span className="text-sm text-gray-600">Invoices to book</span><span className="text-sm font-semibold text-amber-600">{stats.toBookCount}</span></div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-900">Recent activity</h2>
                <Link href="/bookkeeper/activity" className="text-xs text-indigo-600 font-medium hover:text-indigo-800">View all →</Link>
              </div>
              {invoices.slice(0, 5).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{inv.invoiceNumber}</p>
                    <p className="text-xs text-gray-400">{inv.customerName}</p>
                  </div>
                  <StatusBadge status={inv.bookkeepingStatus} />
                </div>
              ))}
              {invoices.length === 0 && <p className="text-xs text-gray-400 py-2">No invoices for this company yet.</p>}
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <h2 className="text-base font-semibold text-gray-900">Customers</h2>
              <Link href="/bookkeeper/sales?tab=receivables" className="text-xs text-indigo-600 font-medium hover:text-indigo-800">Open accounts receivable →</Link>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">Debtors/relations within this company.</p>
            {stats.topCustomers.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No customers for this company yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats.topCustomers.slice(0, 9).map((c) => (
                  <Link key={c.name} href="/bookkeeper/sales?tab=receivables"
                    className="group block border border-gray-100 rounded-xl p-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600">{c.name}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{c.count} invoice{c.count === 1 ? "" : "s"} · {formatCurrency(c.total)}</p>
                    {c.open > 0 && <p className="text-[10px] text-amber-600 mt-0.5">Outstanding: {formatCurrency(c.open)}</p>}
                  </Link>
                ))}
              </div>
            )}
            {stats.topCustomers.length > 9 && <p className="text-[11px] text-gray-400 text-center mt-3">+{stats.topCustomers.length - 9} more customers</p>}
          </Card>
        </>
      )}
    </div>
  );
}

export default function BookkeeperHomePage() {
  return (
    <RequireAdministration>
      <HomeInner />
    </RequireAdministration>
  );
}
