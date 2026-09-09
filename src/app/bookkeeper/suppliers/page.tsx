"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { formatCurrency, formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Suppliers — new destination (RELATIONSHIPS > Suppliers). There is no
// Supplier model in the schema — purchase documents only carry a free-text
// `supplierName`. Rather than invent a table that doesn't exist, this page
// groups the real purchase documents by that name, which is exactly the
// same underlying data the Purchases page shows, just rolled up per
// supplier instead of per document.
// ---------------------------------------------------------------------------

interface PurchaseDoc { id: string; supplierName: string | null; totalAmount: number | null; documentDate: string | null; status: string }

function SuppliersInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const [docs, setDocs] = useState<PurchaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAdminId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/purchases/all?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])).then((d) => { if (!cancelled) setDocs(Array.isArray(d) ? d : []); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeAdminId]);

  const suppliers = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number; lastDate: string; docs: PurchaseDoc[] }>();
    docs.forEach((d) => {
      const name = d.supplierName?.trim() || "Unknown supplier";
      const entry = map.get(name) || { name, count: 0, total: 0, lastDate: "", docs: [] };
      entry.count += 1;
      entry.total += d.totalAmount || 0;
      entry.docs.push(d);
      if (d.documentDate && d.documentDate > entry.lastDate) entry.lastDate = d.documentDate;
      map.set(name, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [docs]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <PageHeader title="Suppliers" subtitle={activeAdministration ? `Derived from purchase documents of ${activeAdministration.company || activeAdministration.name}` : undefined} />

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : suppliers.length === 0 ? (
        <EmptyState title="No suppliers yet" body="Suppliers appear automatically once purchase documents are uploaded for this company." />
      ) : (
        <div className="space-y-2">
          {suppliers.map((s) => (
            <Card key={s.name} padding="none">
              <button onClick={() => setExpanded(expanded === s.name ? null : s.name)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.count} document{s.count === 1 ? "" : "s"} {s.lastDate && `· last on ${formatDate(s.lastDate)}`}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-gray-800">{formatCurrency(s.total)}</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === s.name ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              {expanded === s.name && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {s.docs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-500">{d.documentDate ? formatDate(d.documentDate) : "—"}</span>
                      <span className="font-medium">{formatCurrency(d.totalAmount || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <RequireAdministration>
      <SuppliersInner />
    </RequireAdministration>
  );
}
