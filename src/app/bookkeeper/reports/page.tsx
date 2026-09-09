"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdministration } from "@/components/AdministrationProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import RevenueChart from "@/components/dashboard/RevenueChart";
import { formatCurrency } from "@/lib/format";
import type { Invoice } from "@/lib/data";

// ---------------------------------------------------------------------------
// Reports — new destination (FINANCE > Reports). There was no dedicated
// "reports" screen in the old app; the figures here were previously
// scattered read-only across the dashboard and fiscal sections. This pulls
// them into one bento grid of report views — all computed from the same
// real invoice/purchase data every other page already uses, nothing
// fabricated.
// ---------------------------------------------------------------------------

interface PurchaseDoc { id: string; category: string | null; totalAmount: number | null; supplierName: string | null; status: string }

function ReportsInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAdminId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([
        fetch(`/api/invoices?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/purchases/all?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
      ]).then(([i, p]) => { if (!cancelled) { setInvoices(Array.isArray(i) ? i : []); setPurchases(Array.isArray(p) ? p : []); } }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeAdminId]);

  const aging = useMemo(() => {
    const today = new Date();
    const buckets = { current: 0, d30: 0, d60: 0, d90plus: 0 };
    invoices.filter((i) => (i.status === "sent" || i.status === "overdue") && !i.isCredit).forEach((i) => {
      const due = new Date(i.dueDate);
      const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
      const remaining = i.total - i.paidAmount;
      if (days <= 0) buckets.current += remaining;
      else if (days <= 30) buckets.d30 += remaining;
      else if (days <= 60) buckets.d60 += remaining;
      else buckets.d90plus += remaining;
    });
    return buckets;
  }, [invoices]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    purchases.forEach((p) => { const key = p.category || "Uncategorized"; map.set(key, (map.get(key) || 0) + (p.totalAmount || 0)); });
    return Array.from(map.entries()).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [purchases]);

  const totalOpen = aging.current + aging.d30 + aging.d60 + aging.d90plus;
  const maxExpense = Math.max(1, ...expensesByCategory.map((e) => e.total));

  if (loading) return <div className="p-4 sm:p-6 lg:p-8 max-w-6xl"><Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <PageHeader title="Reports" subtitle={activeAdministration ? (activeAdministration.company || activeAdministration.name) : undefined} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Revenue trend</h2>
            <Link href="/bookkeeper/sales" className="text-xs text-indigo-600 font-medium hover:text-indigo-800">Sales →</Link>
          </div>
          <RevenueChart invoices={invoices} expenses={purchases} />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Accounts receivable aging</h2>
            <Link href="/bookkeeper/sales?tab=receivables" className="text-xs text-indigo-600 font-medium hover:text-indigo-800">Details →</Link>
          </div>
          {totalOpen === 0 ? <p className="text-sm text-gray-400 py-6 text-center">Nothing outstanding.</p> : (
            <div className="space-y-2.5">
              {[["Current", aging.current, "bg-emerald-500"], ["1–30 days", aging.d30, "bg-amber-400"], ["31–60 days", aging.d60, "bg-orange-500"], ["60+ days", aging.d90plus, "bg-red-500"]].map(([label, val, color]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-700">{formatCurrency(val as number)}</span></div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${totalOpen ? ((val as number) / totalOpen) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Expenses by category</h2>
            <Link href="/bookkeeper/purchases" className="text-xs text-indigo-600 font-medium hover:text-indigo-800">Purchases →</Link>
          </div>
          {expensesByCategory.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">No categorized purchases yet.</p> : (
            <div className="space-y-2.5">
              {expensesByCategory.map((e) => (
                <div key={e.category}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-gray-600 truncate pr-2">{e.category}</span><span className="font-medium text-gray-700 shrink-0">{formatCurrency(e.total)}</span></div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${(e.total / maxExpense) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">VAT summary</h2>
            <Link href="/bookkeeper/taxes" className="text-xs text-indigo-600 font-medium hover:text-indigo-800">Taxes →</Link>
          </div>
          <p className="text-sm text-gray-500">Open the Taxes page for the current VAT position — collected, deductible and estimated payable, computed from booked invoices for this company.</p>
        </Card>
      </div>

      {invoices.length === 0 && purchases.length === 0 && (
        <EmptyState title="Not enough data yet" body="Reports will fill in as invoices and purchase documents are added for this company." />
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequireAdministration>
      <ReportsInner />
    </RequireAdministration>
  );
}
