"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatFileSize } from "@/lib/format";
import type { Invoice } from "@/lib/data";

// ---------------------------------------------------------------------------
// Documents — new destination (RELATIONSHIPS > Documents). Before this,
// "documents" only existed as the Purchases upload list; sent invoices and
// quotations were technically downloadable as PDFs but had no shared home.
// This hub combines both into one browsable, filterable grid — same
// underlying files (/uploads/purchases/... and the existing
// /api/invoices/[id]/pdf, /api/quotations/[id]/pdf routes), just one place
// to find them.
// ---------------------------------------------------------------------------

interface PurchaseDoc { id: string; fileName: string; fileUrl: string; fileType: string; fileSize: number; label: string | null; createdAt: string; supplierName: string | null }
interface Quotation { id: string; quotationNumber: string; customerName: string; date: string; status: string }

type Kind = "all" | "purchase" | "invoice" | "quotation";

function DocumentsInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind>("all");

  useEffect(() => {
    if (!activeAdminId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([
        fetch(`/api/purchases/all?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/invoices?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/quotations?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]).then(([p, i, q]) => {
        if (cancelled) return;
        setPurchases(Array.isArray(p) ? p : []);
        setInvoices(Array.isArray(i) ? i : []);
        setQuotations(Array.isArray(q) ? q : []);
      }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeAdminId]);

  const rows = useMemo(() => {
    const purchaseRows = purchases.map((d) => ({ kind: "purchase" as const, id: d.id, title: d.label || d.fileName, meta: d.supplierName || "Purchase document", date: d.createdAt, href: d.fileUrl, sizeLabel: formatFileSize(d.fileSize) }));
    const invoiceRows = invoices.map((i) => ({ kind: "invoice" as const, id: i.id, title: i.invoiceNumber, meta: i.customerName, date: i.date, href: `/api/invoices/${i.id}/pdf`, sizeLabel: "PDF" }));
    const quotationRows = quotations.map((q) => ({ kind: "quotation" as const, id: q.id, title: q.quotationNumber, meta: q.customerName, date: q.date, href: `/api/quotations/${q.id}/pdf`, sizeLabel: "PDF" }));
    const all = [...purchaseRows, ...invoiceRows, ...quotationRows].sort((a, b) => b.date.localeCompare(a.date));
    return kind === "all" ? all : all.filter((r) => r.kind === kind);
  }, [purchases, invoices, quotations, kind]);

  const kindTone = { purchase: "warning", invoice: "info", quotation: "primary" } as const;
  const kindLabel = { purchase: "Purchase", invoice: "Invoice", quotation: "Quotation" } as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <PageHeader title="Documents" subtitle={activeAdministration ? (activeAdministration.company || activeAdministration.name) : undefined} />

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto">
        {([["all", "All"], ["purchase", "Purchases"], ["invoice", "Invoices"], ["quotation", "Quotations"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setKind(key as Kind)} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${kind === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : rows.length === 0 ? (
        <EmptyState title="No documents yet" />
      ) : (
        <Card padding="none">
          <div className="divide-y divide-gray-50">
            {rows.map((r) => (
              <a key={`${r.kind}-${r.id}`} href={r.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/70 transition-colors">
                <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                  <p className="text-xs text-gray-400 truncate">{r.meta} · {formatDate(r.date)}</p>
                </div>
                <Badge tone={kindTone[r.kind]}>{kindLabel[r.kind]}</Badge>
                <span className="text-xs text-gray-400 w-14 text-right shrink-0">{r.sizeLabel}</span>
              </a>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <RequireAdministration>
      <DocumentsInner />
    </RequireAdministration>
  );
}
