"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Invoice } from "@/lib/data";
import { useAdministration } from "@/components/AdministrationProvider";
import { useToast, type ToastType } from "@/components/ToastProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Sales — was the "sales" branch of the old monolith (verkoopTab:
// "boeken" | "debiteurenbeheer" | "workflow"). Same three jobs, rebuilt as
// tabs on one route instead of a query-string sub-tab inside a 6.5k line
// file:
//   - Receivables: the sortable/filterable invoice table + contextual row
//     actions (send, remind, register payment, copy, credit note).
//   - To book: invoices still needing a ledger account + VAT code, booked
//     individually via a detail drawer or in bulk.
//   - Workflow: a kanban board of the same invoices grouped by booking
//     status, for a lifecycle view instead of a flat list.
// All three read/write the same endpoints the monolith used
// (/api/invoices, /api/invoices/batch-book, /api/ledger-accounts,
// /api/vat-codes) — only the presentation changed.
// ---------------------------------------------------------------------------

interface LedgerAccount { id: string; accountNumber: string; name: string; accountType: string; isActive: boolean }
interface VatCode { id: string; code: string; name: string; percentage: number; isActive: boolean }

type Tab = "receivables" | "book" | "workflow";

function SalesInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>((searchParams.get("tab") as Tab) || "receivables");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [vatCodes, setVatCodes] = useState<VatCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAdminId) return;
    // Synchronous, same reasoning as bookkeeper/page.tsx: without this, the
    // KPI row below (rendered unconditionally, above the `{loading ? ... }`
    // branch that gates the tables) would keep showing the PREVIOUS
    // company's invoice count/totals for the entire duration of the new
    // company's fetch.
    setLoading(true);
    let cancelled = false;

    function load() {
      Promise.all([
        fetch(`/api/invoices?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch("/api/ledger-accounts").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/vat-codes").then((r) => (r.ok ? r.json() : [])),
      ]).then(([inv, ledger, vat]) => {
        if (cancelled) return;
        setInvoices(Array.isArray(inv) ? inv : []);
        setLedgerAccounts(Array.isArray(ledger) ? ledger.filter((a: LedgerAccount) => a.isActive) : []);
        setVatCodes(Array.isArray(vat) ? vat.filter((v: VatCode) => v.isActive) : []);
      }).finally(() => { if (!cancelled) setLoading(false); });
    }

    const timer = setTimeout(load, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeAdminId]);

  async function refreshInvoices() {
    if (!activeAdminId) return;
    const inv = await fetch(`/api/invoices?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : []));
    setInvoices(Array.isArray(inv) ? inv : []);
  }

  const toBookInvoices = invoices.filter((i) => i.bookkeepingStatus === "pending" || i.bookkeepingStatus === "to_book");

  // Totals summary — kept at the top of the page (above the tabs and the
  // detail table) so the headline numbers are visible before scrolling into
  // any one tab's list.
  const summary = useMemo(() => {
    const nonCredit = invoices.filter((i) => !i.isCredit);
    const totalAmount = nonCredit.reduce((s, i) => s + i.total, 0);
    const outstanding = nonCredit.filter((i) => i.status === "sent" || i.status === "overdue" || i.status === "partial");
    const paid = nonCredit.filter((i) => i.status === "paid");
    return {
      count: invoices.length,
      totalAmount,
      outstandingAmount: outstanding.reduce((s, i) => s + i.total, 0),
      paidAmount: paid.reduce((s, i) => s + i.total, 0),
    };
  }, [invoices]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl space-y-6">
      <PageHeader title="Sales" subtitle="Booking and accounts receivable management" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Invoices" value={loading ? "—" : String(summary.count)} icon="🧾" tone="primary" />
        <KpiCard label="Total amount" value={loading ? "—" : formatCurrency(summary.totalAmount)} icon="💰" tone="primary" />
        <KpiCard label="Outstanding" value={loading ? "—" : formatCurrency(summary.outstandingAmount)} icon="🟡" tone="danger" />
        <KpiCard label="Paid" value={loading ? "—" : formatCurrency(summary.paidAmount)} icon="✅" tone="success" />
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto">
        {([["receivables", "Receivables"], ["book", `To book${!loading && toBookInvoices.length ? ` (${toBookInvoices.length})` : ""}`], ["workflow", "Workflow board"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading invoices…</p></Card>
      ) : tab === "receivables" ? (
        <ReceivablesTab invoices={invoices} onChanged={refreshInvoices} addToast={addToast} />
      ) : tab === "book" ? (
        <BookTab invoices={toBookInvoices} ledgerAccounts={ledgerAccounts} vatCodes={vatCodes} onChanged={refreshInvoices} addToast={addToast} />
      ) : (
        <WorkflowBoard invoices={invoices} />
      )}
    </div>
  );
}

// ─── Receivables tab — sortable/filterable table + contextual row menu ────

function ReceivablesTab({ invoices, onChanged, addToast }: { invoices: Invoice[]; onChanged: () => void; addToast: (t: { type: ToastType; title: string; message?: string }) => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"date" | "invoiceNumber" | "total">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null);

  const filtered = useMemo(() => {
    let rows = invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!inv.invoiceNumber.toLowerCase().includes(q) && !inv.customerName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "invoiceNumber") cmp = a.invoiceNumber.localeCompare(b.invoiceNumber);
      else if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else cmp = a.total - b.total;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [invoices, search, statusFilter, sortKey, sortDir]);

  function toggleSort(key: typeof sortKey) {
    setSortKey((prev) => { if (prev === key) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else setSortDir("asc"); return key; });
  }

  async function sendReminder(inv: Invoice) {
    await fetch(`/api/invoices/${inv.id}/remind`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: inv.customer?.email || "customer@example.com", subject: `Reminder invoice ${inv.invoiceNumber}`, message: `Invoice ${inv.invoiceNumber} is still outstanding.` }) });
    addToast({ type: "info", title: "Reminder sent", message: inv.invoiceNumber });
    onChanged();
  }

  async function registerPayment(inv: Invoice, amount: number, date: string) {
    const res = await fetch(`/api/invoices/${inv.id}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, date }) });
    if (res.ok) { addToast({ type: "bookkeeping", title: "Payment registered", message: inv.invoiceNumber }); setPaymentModal(null); onChanged(); }
  }

  return (
    <Card padding="none">
      <div className="p-4 sm:p-5 border-b border-gray-100 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice number or customer…"
            className="flex-1 border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Expired</option>
          </select>
        </div>
        <p className="text-xs text-gray-400">{filtered.length} invoice{filtered.length === 1 ? "" : "s"}</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No invoices found" body="Try a different search or filter." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                {[["invoiceNumber", "Invoice"], ["date", "Date"], ["total", "Amount"]].map(([key, label]) => (
                  <th key={key} className="px-4 py-2.5 font-medium cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort(key as typeof sortKey)}>
                    {label} {sortKey === key && <span className="text-indigo-500">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50/70">
                  <td className="px-4 py-3 font-medium text-indigo-600"><Link href={`/bookkeeper/invoices/${inv.id}`}>{inv.invoiceNumber}</Link></td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(inv.date)}</td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-gray-700 truncate max-w-[200px]">{inv.customerName}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-right relative">
                    <button onClick={() => setOpenMenuId(openMenuId === inv.id ? null : inv.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
                    </button>
                    {openMenuId === inv.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-4 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-20 py-1 text-left">
                          <Link href={`/bookkeeper/invoices/${inv.id}`} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">View</Link>
                          <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">View PDF</a>
                          {(inv.status === "sent" || inv.status === "overdue") && (
                            <>
                              <button onClick={() => { setOpenMenuId(null); sendReminder(inv); }} className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-orange-50">Send reminder</button>
                              <button onClick={() => { setOpenMenuId(null); setPaymentModal(inv); }} className="w-full text-left px-4 py-2 text-sm text-emerald-600 hover:bg-emerald-50">Register payment</button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paymentModal && (
        <PaymentDrawer invoice={paymentModal} onClose={() => setPaymentModal(null)} onSubmit={(amount, date) => registerPayment(paymentModal, amount, date)} />
      )}
    </Card>
  );
}

function PaymentDrawer({ invoice, onClose, onSubmit }: { invoice: Invoice; onClose: () => void; onSubmit: (amount: number, date: string) => void }) {
  const [amount, setAmount] = useState(String(invoice.total - invoice.paidAmount));
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl p-6 space-y-4 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Register payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <p className="text-sm text-gray-500">{invoice.invoiceNumber} · {invoice.customerName}</p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
        </div>
        <Button className="w-full" onClick={() => onSubmit(parseFloat(amount), date)} disabled={!amount || parseFloat(amount) <= 0}>Register payment</Button>
      </div>
    </div>
  );
}

// ─── Book tab — worklist + single/bulk booking drawer ─────────────────────

function BookTab({ invoices, ledgerAccounts, vatCodes, onChanged, addToast }: { invoices: Invoice[]; ledgerAccounts: LedgerAccount[]; vatCodes: VatCode[]; onChanged: () => void; addToast: (t: { type: ToastType; title: string; message?: string }) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAccount, setBulkAccount] = useState("");
  const [bulkVat, setBulkVat] = useState("");
  const [saving, setSaving] = useState(false);
  const [singleInvoice, setSingleInvoice] = useState<Invoice | null>(null);

  async function bookInvoices(ids: string[], account: string, vat: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/invoices/batch-book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: ids, bookkeepingStatus: "booked", category: account, ...(vat && { vatType: vat }) }),
      });
      if (res.ok) {
        addToast({ type: "bookkeeping", title: "Booked", message: `${ids.length} invoice${ids.length === 1 ? "" : "s"} booked` });
        setSelected(new Set()); setBulkAccount(""); setBulkVat(""); setSingleInvoice(null);
        onChanged();
      }
    } finally { setSaving(false); }
  }

  if (invoices.length === 0) {
    return <EmptyState title="Nothing to book" body="Every invoice for this company already has a ledger account assigned." />;
  }

  const allSelected = selected.size > 0 && selected.size === invoices.length;

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <Card className="!bg-indigo-600 !border-indigo-600 text-white flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <p className="text-sm font-medium">{selected.size} selected</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={bulkAccount} onChange={(e) => setBulkAccount(e.target.value)} className="text-sm rounded-lg px-2.5 py-2 text-gray-800">
              <option value="">Ledger account…</option>
              {ledgerAccounts.map((a) => <option key={a.id} value={a.accountNumber}>{a.accountNumber} — {a.name}</option>)}
            </select>
            <select value={bulkVat} onChange={(e) => setBulkVat(e.target.value)} className="text-sm rounded-lg px-2.5 py-2 text-gray-800">
              <option value="">VAT code (optional)…</option>
              {vatCodes.map((v) => <option key={v.id} value={v.code}>{v.name} ({v.percentage}%)</option>)}
            </select>
            <button disabled={!bulkAccount || saving} onClick={() => bookInvoices([...selected], bulkAccount, bulkVat)}
              className="px-4 py-2 bg-white text-indigo-700 rounded-lg text-sm font-semibold disabled:opacity-50">
              {saving ? "Booking…" : "Book selected"}
            </button>
          </div>
        </Card>
      )}

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2.5 w-10"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(invoices.map((i) => i.id)))} /></th>
                <th className="px-4 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50/70">
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.has(inv.id)} onChange={() => setSelected((prev) => { const next = new Set(prev); if (next.has(inv.id)) next.delete(inv.id); else next.add(inv.id); return next; })} /></td>
                  <td className="px-4 py-3 font-medium text-indigo-600">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-gray-700 truncate max-w-[220px]">{inv.customerName}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(inv.date)}</td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => setSingleInvoice(inv)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Book →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {singleInvoice && (
        <BookDrawer invoice={singleInvoice} ledgerAccounts={ledgerAccounts} vatCodes={vatCodes} saving={saving} onClose={() => setSingleInvoice(null)} onBook={(account, vat) => bookInvoices([singleInvoice.id], account, vat)} />
      )}
    </div>
  );
}

function BookDrawer({ invoice, ledgerAccounts, vatCodes, saving, onClose, onBook }: { invoice: Invoice; ledgerAccounts: LedgerAccount[]; vatCodes: VatCode[]; saving: boolean; onClose: () => void; onBook: (account: string, vat: string) => void }) {
  const [account, setAccount] = useState(invoice.category || "");
  const [vat, setVat] = useState(invoice.vatType || "");
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl p-6 space-y-4 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Book invoice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Invoice</span><span className="font-medium">{invoice.invoiceNumber}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium truncate ml-4">{invoice.customerName}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-medium">{formatCurrency(invoice.total)}</span></div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ledger account</label>
          <select value={account} onChange={(e) => setAccount(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30">
            <option value="">Select an account…</option>
            {ledgerAccounts.filter((a) => a.accountType === "revenue" || a.accountType === "asset").map((a) => <option key={a.id} value={a.accountNumber}>{a.accountNumber} — {a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">VAT code</label>
          <select value={vat} onChange={(e) => setVat(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30">
            <option value="">Keep current</option>
            {vatCodes.map((v) => <option key={v.id} value={v.code}>{v.name} ({v.percentage}%)</option>)}
          </select>
        </div>
        <Button className="w-full" disabled={!account || saving} onClick={() => onBook(account, vat)}>{saving ? "Booking…" : "Confirm & book"}</Button>
      </div>
    </div>
  );
}

// ─── Workflow board — kanban by bookkeeping lifecycle ──────────────────────

function WorkflowBoard({ invoices }: { invoices: Invoice[] }) {
  const columns: { key: string; label: string; match: (i: Invoice) => boolean; tone: string }[] = [
    { key: "incoming", label: "Received", match: (i) => i.bookkeepingStatus === "pending", tone: "bg-gray-50 border-gray-200" },
    { key: "started", label: "Booking started", match: (i) => i.bookkeepingStatus === "to_book", tone: "bg-amber-50 border-amber-200" },
    { key: "done", label: "Completed", match: (i) => i.bookkeepingStatus === "booked", tone: "bg-emerald-50 border-emerald-200" },
  ];

  if (invoices.length === 0) return <EmptyState title="No workflow items for this company." />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((col) => {
        const items = invoices.filter(col.match);
        return (
          <div key={col.key} className={`rounded-2xl border p-3 ${col.tone}`}>
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-sm font-semibold text-gray-700">{col.label}</p>
              <span className="text-xs font-medium text-gray-500 bg-white/70 rounded-full px-2 py-0.5">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 && <p className="text-xs text-gray-400 px-2 py-4 text-center">No items</p>}
              {items.map((inv) => (
                <Link key={inv.id} href={`/bookkeeper/invoices/${inv.id}`} className="block bg-white rounded-xl border border-gray-100 p-3 hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.28),0_2px_6px_-2px_rgba(15,32,89,0.10)] hover:border-blue-200 transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{inv.invoiceNumber}</p>
                    <span className="text-xs font-semibold text-gray-600">{formatCurrency(inv.total)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{inv.customerName}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{formatDate(inv.date)}</p>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SalesPage() {
  return (
    <RequireAdministration>
      <Suspense>
        <SalesInner />
      </Suspense>
    </RequireAdministration>
  );
}
