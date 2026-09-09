"use client";

import { useEffect, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { formatCurrency } from "@/lib/format";

// ---------------------------------------------------------------------------
// Taxes — was the "fiscaal" branch of the monolith, which for the
// bookkeeper portal was a 12-line placeholder even though the exact same
// /api/fiscal endpoint already returns real VAT figures (it's used by the
// client portal's own tax section). This surfaces that same real data here
// too — nothing new was computed, it just didn't have a home in this
// portal before. Corporate/income tax stay clearly marked as not
// implemented, same as before.
// ---------------------------------------------------------------------------

interface TaxEstimate {
  taxType: "inkomstenbelasting" | "vennootschapsbelasting";
  year: number; revenue: number; costs: number; profit: number; estimatedTax: number;
  breakdown: string[]; assumption: string;
}

interface FiscalSummary {
  totalRevenue: number; totalVatCollected: number; totalVatDeductible: number; vatToPay: number;
  invoiceCount: number; paidCount: number; overdueCount: number; totalOutstanding: number; totalOverdue: number;
  taxEstimate?: TaxEstimate;
}

function TaxesInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const [fiscal, setFiscal] = useState<FiscalSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAdminId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/fiscal?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled) setFiscal(d); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeAdminId]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <PageHeader title="Taxes" subtitle={activeAdministration ? (activeAdministration.company || activeAdministration.name) : undefined} />

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : fiscal ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Revenue (excl. VAT)" value={formatCurrency(fiscal.totalRevenue)} icon="💶" tone="primary" />
            <KpiCard label="VAT received" value={formatCurrency(fiscal.totalVatCollected)} icon="📥" tone="default" />
            <KpiCard label="VAT deductible" value={formatCurrency(fiscal.totalVatDeductible)} icon="📤" tone="default" />
            <KpiCard label="Estimated VAT payable" value={formatCurrency(fiscal.vatToPay)} icon="🧾" tone="warning" />
          </div>

          <Card>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Invoicing status</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><p className="text-xl font-bold text-gray-900">{fiscal.invoiceCount}</p><p className="text-xs text-gray-400 mt-0.5">Total invoices</p></div>
              <div><p className="text-xl font-bold text-emerald-600">{fiscal.paidCount}</p><p className="text-xs text-gray-400 mt-0.5">Paid</p></div>
              <div><p className="text-xl font-bold text-red-600">{fiscal.overdueCount}</p><p className="text-xs text-gray-400 mt-0.5">Overdue</p></div>
            </div>
          </Card>

          {fiscal.taxEstimate && (
            <Card>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-gray-800">
                  {fiscal.taxEstimate.taxType === "vennootschapsbelasting" ? "Corporate tax (Vpb)" : "Income tax (personal, box 1)"} — estimate {fiscal.taxEstimate.year}
                </h2>
                <span className="text-lg font-bold text-amber-600">{formatCurrency(fiscal.taxEstimate.estimatedTax)}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">{fiscal.taxEstimate.assumption}</p>
              <ul className="text-xs text-gray-600 space-y-1 border-t border-gray-100 pt-2">
                {fiscal.taxEstimate.breakdown.map((line, i) => (
                  <li key={i} className="flex justify-between gap-4"><span>{line}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <Card><p className="text-sm text-gray-400 text-center py-10">No fiscal data available for this company yet.</p></Card>
      )}
    </div>
  );
}

export default function TaxesPage() {
  return (
    <RequireAdministration>
      <TaxesInner />
    </RequireAdministration>
  );
}
