"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import { useToast } from "@/components/ToastProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { Badge, Button } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Invoice } from "@/lib/data";

// ---------------------------------------------------------------------------
// Accounting — merges three old flat sidebar items into one page:
//   - "general ledger" section  -> Ledger tab (chart of accounts, browse +
//     add; this is firm-wide configuration, not per-company)
//   - "memoriaal" section       -> Journal tab (manual journal entries;
//     also firm-wide — JournalEntry has no per-administration field in the
//     schema, so unlike every other tab in this app it is NOT scoped to
//     the active company. That's existing behaviour, not a redesign choice)
//   - "boekingen" section       -> VAT postings tab (booked invoices for
//     the active company, grouped by quarter)
// ---------------------------------------------------------------------------

interface LedgerAccount { id: string; accountNumber: string; name: string; accountType: string; category: string; isActive: boolean; isBalanceSheet: boolean }
interface JournalLine { id: string; ledgerAccount: string; debit: number; credit: number; description: string | null; vatCode: string | null }
interface JournalEntryRow { id: string; date: string; reference: string; description: string; type: string; totalDebit: number; totalCredit: number; status: string; lines: JournalLine[] }

type Tab = "ledger" | "journal" | "postings";

function AccountingInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const { addToast } = useToast();

  const [tab, setTab] = useState<Tab>("ledger");
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, j, i] = await Promise.all([
        fetch("/api/ledger-accounts").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/journal-entries").then((r) => (r.ok ? r.json() : [])),
        activeAdminId ? fetch(`/api/invoices?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])) : Promise.resolve([]),
      ]);
      setAccounts(Array.isArray(a) ? a : []);
      setEntries(Array.isArray(j) ? j : []);
      setInvoices(Array.isArray(i) ? i : []);
    } finally { setLoading(false); }
  }, [activeAdminId]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl space-y-6">
      <PageHeader title="Accounting" subtitle="Chart of accounts, journal entries and VAT postings" />

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto">
        {([["ledger", "Ledger"], ["journal", "Journal"], ["postings", "VAT postings"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : tab === "ledger" ? (
        <LedgerTab accounts={accounts} onAdd={() => setShowNewAccount(true)} />
      ) : tab === "journal" ? (
        <JournalTab entries={entries} accounts={accounts} onAdd={() => setShowNewEntry(true)} />
      ) : (
        <PostingsTab invoices={invoices} hasCompany={!!activeAdminId} />
      )}

      {showNewAccount && <NewAccountDrawer onClose={() => setShowNewAccount(false)} onCreated={() => { setShowNewAccount(false); load(); addToast({ type: "bookkeeping", title: "Account added" }); }} />}
      {showNewEntry && <NewJournalDrawer accounts={accounts} onClose={() => setShowNewEntry(false)} onCreated={() => { setShowNewEntry(false); load(); addToast({ type: "bookkeeping", title: "Journal entry booked" }); }} />}
    </div>
  );
}

function LedgerTab({ accounts, onAdd }: { accounts: LedgerAccount[]; onAdd: () => void }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const types = Array.from(new Set(accounts.map((a) => a.accountType)));
  const filtered = accounts.filter((a) => (typeFilter === "all" || a.accountType === typeFilter) && (!search || a.name.toLowerCase().includes(search.toLowerCase()) || a.accountNumber.includes(search)));

  return (
    <Card padding="none">
      <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search account (no. / name)…" className="flex-1 border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30">
            <option value="all">All types</option>
            {types.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
        <Button onClick={onAdd} className="shrink-0">Add account</Button>
      </div>
      {filtered.length === 0 ? <EmptyState title="No accounts found" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100"><th className="px-4 py-2.5 font-medium">No.</th><th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">Category</th><th className="px-4 py-2.5 font-medium">Type</th><th className="px-4 py-2.5 font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/70">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{a.accountNumber}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{a.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{a.category}</td>
                  <td className="px-4 py-2.5"><Badge tone="neutral" className="capitalize">{a.accountType}</Badge></td>
                  <td className="px-4 py-2.5">{a.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function NewAccountDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ accountNumber: "", name: "", category: "", accountType: "expense", normalBalance: "debit", isBalanceSheet: false });
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/ledger-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) onCreated();
    } finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl p-6 space-y-4 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Add ledger account</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Account number</label><input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Omzet, Vaste activa…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {["asset", "liability", "equity", "revenue", "expense", "contra"].map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
        <Button className="w-full" disabled={!form.accountNumber || !form.name || saving} onClick={submit}>{saving ? "Saving…" : "Add account"}</Button>
      </div>
    </div>
  );
}

function JournalTab({ entries, accounts, onAdd }: { entries: JournalEntryRow[]; accounts: LedgerAccount[]; onAdd: () => void }) {
  if (entries.length === 0) return <EmptyState title="No journal entries yet" body="Create a journal entry or opening balance." action={{ label: "New entry", onClick: onAdd }} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={onAdd}>New entry</Button></div>
      <div className="space-y-2">
        {entries.map((e) => (
          <Card key={e.id} padding="sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{e.reference} · {e.description}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(e.date)} · {e.type === "beginbalans" ? "Opening balance" : "Journal"} · {e.lines.length} line{e.lines.length === 1 ? "" : "s"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{formatCurrency(e.totalDebit)}</span>
                <Badge tone={e.status === "booked" ? "success" : "neutral"}>{e.status === "booked" ? "Booked" : "Draft"}</Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">Chart of accounts reference: {accounts.length} accounts configured.</p>
    </div>
  );
}

function NewJournalDrawer({ accounts, onClose, onCreated }: { accounts: LedgerAccount[]; onClose: () => void; onCreated: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([{ ledgerAccount: "", debit: "", credit: "", description: "" }]);
  const [saving, setSaving] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = lines.length > 0 && Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function updateLine(i: number, patch: Partial<(typeof lines)[0]>) { setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); }

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/journal-entries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, description, type: "memoriaal", lines: lines.map((l) => ({ ledgerAccount: l.ledgerAccount, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0, description: l.description || undefined })) }),
      });
      if (res.ok) onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"><h2 className="text-lg font-semibold">New journal entry</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Lines</p>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <select value={l.ledgerAccount} onChange={(e) => updateLine(i, { ledgerAccount: e.target.value })} className="col-span-6 border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                  <option value="">Account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.accountNumber}>{a.accountNumber} {a.name}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Debit" value={l.debit} onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                <input type="number" step="0.01" placeholder="Credit" value={l.credit} onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
            ))}
            <button onClick={() => setLines((prev) => [...prev, { ledgerAccount: "", debit: "", credit: "", description: "" }])} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">+ Add line</button>
          </div>
          <div className={`rounded-lg p-3 text-xs flex justify-between ${balanced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            <span>Debit {formatCurrency(totalDebit)} · Credit {formatCurrency(totalCredit)}</span>
            <span>{balanced ? "Balanced ✓" : "Not balanced"}</span>
          </div>
        </div>
        <div className="border-t border-gray-100 p-4 shrink-0">
          <Button className="w-full" disabled={!balanced || !description || saving} onClick={submit}>{saving ? "Booking…" : "Book entry"}</Button>
        </div>
      </div>
    </div>
  );
}

function PostingsTab({ invoices, hasCompany }: { invoices: Invoice[]; hasCompany: boolean }) {
  const quarters = useMemo(() => {
    const booked = invoices.filter((i) => i.bookkeepingStatus === "booked" && !i.isCredit);
    const map = new Map<string, { label: string; revenue: number; vat: number; count: number }>();
    booked.forEach((inv) => {
      const d = new Date(inv.date);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const key = `${d.getFullYear()}-Q${q}`;
      const entry = map.get(key) || { label: key, revenue: 0, vat: 0, count: 0 };
      entry.revenue += inv.subtotal; entry.vat += inv.vatAmount; entry.count += 1;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.label.localeCompare(a.label));
  }, [invoices]);

  if (!hasCompany) return <EmptyState title="Select a company" />;
  if (quarters.length === 0) return <EmptyState title="No booked invoices found" body="Once sales invoices are booked, they'll be grouped here by quarter for the VAT return." />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {quarters.map((q) => (
        <Card key={q.label}>
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-gray-800">{q.label}</h3><Badge tone={q.label === quarters[0].label ? "info" : "neutral"}>{q.label === quarters[0].label ? "Current" : "Closed"}</Badge></div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Revenue excl. VAT</span><span className="font-medium">{formatCurrency(q.revenue)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total VAT</span><span className="font-medium">{formatCurrency(q.vat)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Invoices booked</span><span className="font-medium">{q.count}</span></div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function AccountingPage() {
  return (
    <RequireAdministration>
      <AccountingInner />
    </RequireAdministration>
  );
}
