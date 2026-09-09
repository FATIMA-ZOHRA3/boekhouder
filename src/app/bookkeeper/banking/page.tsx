"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import { useToast, type ToastType } from "@/components/ToastProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Invoice } from "@/lib/data";

// ---------------------------------------------------------------------------
// Banking — merges the old "bank" and "afletteren" (reconciliation)
// sections into one page with two tabs. Reconciliation used to be a
// separate flat sidebar item; it's naturally a split-screen job (unmatched
// bank lines on one side, unmatched documents on the other, click both to
// pair them) so it gets that layout explicitly, rather than another table.
// ---------------------------------------------------------------------------

interface BankTx { id: string; transactionDate: string; amount: number; direction: string; description: string; counterparty: string | null; status: string; bankAccount: string | null }
interface PurchaseDoc { id: string; supplierName: string | null; totalAmount: number | null; documentDate: string | null; status: string; label: string | null; fileName: string }

type Tab = "transactions" | "reconciliation";

function BankingInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Always holds the CURRENT activeAdminId, unlike the `activeAdminId`
  // closed over inside `load` below (which is fixed at the moment that
  // particular `load` instance was created) — used to detect whether an
  // in-flight response is still relevant by the time it resolves.
  const activeAdminIdRef = useRef(activeAdminId);
  activeAdminIdRef.current = activeAdminId;

  const [tab, setTab] = useState<Tab>("transactions");
  const [txs, setTxs] = useState<BankTx[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchaseDocs, setPurchaseDocs] = useState<PurchaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    if (!activeAdminId) return;
    const requestedFor = activeAdminId;
    setLoading(true);
    try {
      const [t, i, p] = await Promise.all([
        fetch(`/api/bank/transactions?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/invoices?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/purchases/all?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
      ]);
      // Guards against rapid A→B→C switching: if the accountant has since
      // moved on to another company, activeAdminIdRef (always current,
      // unlike the closed-over `activeAdminId` above) no longer matches
      // what THIS call was for — an older, slower response must not
      // overwrite the newer company's state that a later call may have
      // already written.
      if (activeAdminIdRef.current !== requestedFor) return;
      setTxs(Array.isArray(t) ? t : []);
      setInvoices(Array.isArray(i) ? i : []);
      setPurchaseDocs(Array.isArray(p) ? p : []);
    } finally {
      if (activeAdminIdRef.current === requestedFor) setLoading(false);
    }
  }, [activeAdminId]);
  useEffect(() => {
    if (!activeAdminId) return;
    // See bookkeeper/page.tsx for why this needs to be synchronous: without
    // it, the PageHeader subtitle below (txs.length/unreconciled.length,
    // rendered unconditionally) would show the previous company's counts
    // for the whole duration of the new company's fetch.
    setLoading(true);
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [activeAdminId, load]);

  async function handleImport(file: File) {
    if (!activeAdminId) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", activeAdminId);
      const res = await fetch("/api/bank/import", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) { addToast({ type: "info", title: "MT940 imported", message: data.message || "Transactions imported" }); load(); }
      else addToast({ type: "error", title: "Import failed", message: data.error });
    } finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  const unreconciled = txs.filter((t) => t.status !== "reconciled" && t.status !== "matched");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl space-y-6">
      <PageHeader
        title="Banking"
        subtitle={loading ? "Loading…" : `${txs.length} transaction${txs.length === 1 ? "" : "s"} · ${unreconciled.length} awaiting reconciliation`}
        actions={
          <>
            <input ref={fileInputRef} type="file" accept=".mt940,.sta,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }} />
            <Button onClick={() => fileInputRef.current?.click()} disabled={importing}>{importing ? "Importing…" : "Import MT940"}</Button>
          </>
        }
      />

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([["transactions", "Transactions"], ["reconciliation", `Reconciliation${unreconciled.length ? ` (${unreconciled.length})` : ""}`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : tab === "transactions" ? (
        <TransactionsTable txs={txs} />
      ) : (
        <ReconciliationSplit txs={unreconciled} invoices={invoices.filter((i) => i.status === "sent" || i.status === "overdue")} purchaseDocs={purchaseDocs.filter((d) => d.status !== "booked")} onReconciled={load} addToast={addToast} />
      )}
    </div>
  );
}

function TransactionsTable({ txs }: { txs: BankTx[] }) {
  if (txs.length === 0) return <EmptyState title="No bank transactions yet" body="Import an MT940 file to get started, or connect a bank feed." />;
  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="px-4 py-2.5 font-medium">Date</th><th className="px-4 py-2.5 font-medium">Description</th>
            <th className="px-4 py-2.5 font-medium">Counterparty</th><th className="px-4 py-2.5 font-medium">Amount</th><th className="px-4 py-2.5 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {txs.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50/70">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[280px] truncate">{t.description}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{t.counterparty || "—"}</td>
                <td className={`px-4 py-3 font-medium whitespace-nowrap ${t.direction === "credit" ? "text-emerald-600" : "text-gray-900"}`}>{t.direction === "credit" ? "+" : "−"}{formatCurrency(t.amount)}</td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReconciliationSplit({ txs, invoices, purchaseDocs, onReconciled, addToast }: {
  txs: BankTx[]; invoices: Invoice[]; purchaseDocs: PurchaseDoc[]; onReconciled: () => void; addToast: (t: { type: ToastType; title: string; message?: string }) => void;
}) {
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{ kind: "invoice" | "purchase"; id: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const docs = [
    ...invoices.map((i) => ({ kind: "invoice" as const, id: i.id, name: i.customerName, ref: i.invoiceNumber, amount: i.total, date: i.date })),
    ...purchaseDocs.map((d) => ({ kind: "purchase" as const, id: d.id, name: d.supplierName || "Unknown supplier", ref: d.label || d.fileName, amount: d.totalAmount || 0, date: d.documentDate || "" })),
  ];

  async function confirmMatch() {
    if (!selectedTx || !selectedDoc) return;
    setSaving(true);
    try {
      const body: Record<string, string[]> = { bankTransactionIds: [selectedTx] };
      if (selectedDoc.kind === "invoice") body.invoiceIds = [selectedDoc.id]; else body.purchaseDocIds = [selectedDoc.id];
      const res = await fetch("/api/bank/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { addToast({ type: "bookkeeping", title: "Reconciled" }); setSelectedTx(null); setSelectedDoc(null); onReconciled(); }
    } finally { setSaving(false); }
  }

  if (txs.length === 0) return <EmptyState title="Everything is reconciled" body="No open bank transactions need matching right now." />;

  return (
    <div className="space-y-3">
      {selectedTx && selectedDoc && (
        <Card className="!bg-indigo-600 !border-indigo-600 text-white flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm font-medium">Match selected transaction with {selectedDoc.kind === "invoice" ? "invoice" : "purchase document"}?</p>
          <div className="flex gap-2">
            <button onClick={() => { setSelectedTx(null); setSelectedDoc(null); }} className="px-3 py-1.5 text-sm rounded-lg bg-white/15 hover:bg-white/25">Cancel</button>
            <button onClick={confirmMatch} disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-white text-indigo-700 font-semibold disabled:opacity-50">{saving ? "Matching…" : "Confirm match"}</button>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="none">
          <div className="px-4 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Bank transactions</h3></div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-50">
            {txs.map((t) => (
              <button key={t.id} onClick={() => setSelectedTx(t.id)} className={`w-full text-left px-4 py-3 transition-colors ${selectedTx === t.id ? "bg-indigo-50 border-l-2 border-indigo-500" : "hover:bg-gray-50"}`}>
                <div className="flex justify-between items-center gap-2">
                  <p className="text-sm text-gray-800 truncate">{t.description}</p>
                  <span className={`text-sm font-semibold shrink-0 ${t.direction === "credit" ? "text-emerald-600" : "text-gray-900"}`}>{t.direction === "credit" ? "+" : "−"}{formatCurrency(t.amount)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(t.transactionDate)} · {t.counterparty || "—"}</p>
              </button>
            ))}
          </div>
        </Card>
        <Card padding="none">
          <div className="px-4 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Outstanding documents</h3></div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-50">
            {docs.length === 0 && <p className="text-xs text-gray-400 px-4 py-6 text-center">No open invoices or purchase documents.</p>}
            {docs.map((d) => (
              <button key={`${d.kind}-${d.id}`} onClick={() => setSelectedDoc({ kind: d.kind, id: d.id })}
                className={`w-full text-left px-4 py-3 transition-colors ${selectedDoc?.id === d.id ? "bg-indigo-50 border-l-2 border-indigo-500" : "hover:bg-gray-50"}`}>
                <div className="flex justify-between items-center gap-2">
                  <p className="text-sm text-gray-800 truncate">{d.ref}</p>
                  <span className="text-sm font-semibold shrink-0">{formatCurrency(d.amount)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{d.name} · <span className="uppercase text-[10px] tracking-wide">{d.kind === "invoice" ? "Sales" : "Purchase"}</span></p>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function BankingPage() {
  return (
    <RequireAdministration>
      <BankingInner />
    </RequireAdministration>
  );
}
