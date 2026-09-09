"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import { useToast } from "@/components/ToastProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { KpiCard } from "@/components/ui/KpiCard";
import { Button } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Cash — manual cash-book: register in/out movements and reconcile them
// against the actual till count. Backed by the new CashTransaction model
// (see prisma/schema.prisma + /api/cash). This is a manual register, same
// spirit as the MT940 import on Banking — there's no automated cash feed
// (there's no such thing as "Open Banking" for a physical cash drawer), so
// every entry here is typed in by the bookkeeper or picked up from what
// the client reports.
// ---------------------------------------------------------------------------

interface CashTx {
  id: string;
  transactionDate: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  category: string | null;
  notes: string | null;
  status: "open" | "reconciled";
  runningBalance: number;
}

function CashInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const { addToast } = useToast();
  // Always holds the current activeAdminId — see the identical comment in
  // bookkeeper/banking/page.tsx for why `load` needs this instead of just
  // closing over `activeAdminId` directly.
  const activeAdminIdRef = useRef(activeAdminId);
  activeAdminIdRef.current = activeAdminId;

  const [txs, setTxs] = useState<CashTx[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);

  const load = useCallback(async () => {
    if (!activeAdminId) return;
    const requestedFor = activeAdminId;
    setLoading(true);
    try {
      const res = await fetch(`/api/cash?clientId=${activeAdminId}`);
      if (res.ok) {
        const data = await res.json();
        if (activeAdminIdRef.current !== requestedFor) return;
        setTxs(Array.isArray(data.transactions) ? data.transactions : []);
        setBalance(data.balance ?? 0);
      }
    } finally {
      if (activeAdminIdRef.current === requestedFor) setLoading(false);
    }
  }, [activeAdminId]);
  useEffect(() => {
    if (!activeAdminId) return;
    // Synchronous — see bookkeeper/page.tsx: without this, the KPI cards
    // below (rendered unconditionally, above the `{loading ? ... }` list)
    // would show the previous company's balance/totals while the new
    // company's fetch is still in flight.
    setLoading(true);
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [activeAdminId, load]);

  const open = txs.filter((t) => t.status === "open");
  const now = new Date();
  const thisMonth = txs.filter((t) => {
    const d = new Date(t.transactionDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const inThisMonth = thisMonth.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
  const outThisMonth = thisMonth.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);

  async function updateStatus(id: string, status: "open" | "reconciled") {
    const res = await fetch(`/api/cash/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      addToast({ type: "bookkeeping", title: status === "reconciled" ? "Marked as reconciled" : "Reopened" });
      load();
    } else {
      addToast({ type: "error", title: "Could not update transaction" });
    }
  }

  async function removeTx(id: string) {
    if (!confirm("Delete this cash transaction?")) return;
    const res = await fetch(`/api/cash/${id}`, { method: "DELETE" });
    if (res.ok) {
      addToast({ type: "bookkeeping", title: "Transaction deleted" });
      load();
    } else {
      addToast({ type: "error", title: "Could not delete transaction" });
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <PageHeader
        title="Cash"
        subtitle={activeAdministration ? (activeAdministration.company || activeAdministration.name) : undefined}
        actions={
          <>
            <button onClick={() => setShowReconcile(true)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">
              Reconcile till
            </button>
            <Button onClick={() => setShowForm(true)}>Add transaction</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Cash book balance" value={loading ? "—" : formatCurrency(balance)} icon="💰" tone="primary" />
        <KpiCard label="In this month" value={loading ? "—" : formatCurrency(inThisMonth)} icon="📥" tone="success" />
        <KpiCard label="Out this month" value={loading ? "—" : formatCurrency(outThisMonth)} icon="📤" tone="default" />
        <KpiCard label="Awaiting reconciliation" value={loading ? "—" : String(open.length)} icon="🧾" tone={!loading && open.length ? "warning" : "default"} />
      </div>

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : txs.length === 0 ? (
        <EmptyState title="No cash transactions yet" body="Register the first cash in/out movement to start the cash book." />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-4 py-2.5 font-medium text-right">Balance</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {txs.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[240px] truncate">{t.description}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{t.category || "—"}</td>
                    <td className={`px-4 py-3 font-medium whitespace-nowrap text-right ${t.direction === "in" ? "text-emerald-600" : "text-gray-900"}`}>
                      {t.direction === "in" ? "+" : "−"}{formatCurrency(t.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-right">{formatCurrency(t.runningBalance)}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {t.status === "open" ? (
                        <button onClick={() => updateStatus(t.id, "reconciled")} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 mr-3">Reconcile</button>
                      ) : (
                        <button onClick={() => updateStatus(t.id, "open")} className="text-xs font-medium text-gray-500 hover:text-gray-700 mr-3">Reopen</button>
                      )}
                      <button onClick={() => removeTx(t.id)} className="text-xs font-medium text-red-500 hover:text-red-700">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && activeAdminId && (
        <AddTransactionModal clientId={activeAdminId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} addToast={addToast} />
      )}
      {showReconcile && (
        <ReconcileTillModal bookBalance={balance} onClose={() => setShowReconcile(false)} />
      )}
    </div>
  );
}

function AddTransactionModal({ clientId, onClose, onSaved, addToast }: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
  addToast: (t: { type: "bookkeeping" | "error" | "info"; title: string; message?: string }) => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!description.trim() || !parsedAmount || parsedAmount <= 0) {
      setError("Fill in a description and a positive amount.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, transactionDate: date, amount: parsedAmount, direction, description: description.trim(), category: category.trim() || undefined, notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: "bookkeeping", title: "Cash transaction added" });
        onSaved();
      } else {
        setError(data.error || "Could not save transaction");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900">Add cash transaction</h2>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {(["out", "in"] as const).map((d) => (
            <button key={d} onClick={() => setDirection(d)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${direction === d ? "bg-white shadow-sm " + (d === "in" ? "text-emerald-600" : "text-gray-900") : "text-gray-500"}`}>
              {d === "in" ? "Cash in" : "Cash out"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500 space-y-1">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900" />
          </label>
          <label className="text-xs text-gray-500 space-y-1">
            <span>Amount (€)</span>
            <input type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900" />
          </label>
        </div>

        <label className="text-xs text-gray-500 space-y-1 block">
          <span>Description</span>
          <input type="text" placeholder="e.g. Office supplies" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900" />
        </label>

        <label className="text-xs text-gray-500 space-y-1 block">
          <span>Ledger category (optional)</span>
          <input type="text" placeholder="e.g. 4300 Kantoorkosten" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900" />
        </label>

        <label className="text-xs text-gray-500 space-y-1 block">
          <span>Notes (optional)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900" />
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-50 font-medium">Cancel</button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add transaction"}</Button>
        </div>
      </div>
    </div>
  );
}

function ReconcileTillModal({ bookBalance, onClose }: { bookBalance: number; onClose: () => void }) {
  const [counted, setCounted] = useState("");
  const parsedCounted = parseFloat(counted.replace(",", "."));
  const hasValue = counted.trim() !== "" && !Number.isNaN(parsedCounted);
  const diff = hasValue ? parsedCounted - bookBalance : null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900">Reconcile till</h2>
        <p className="text-xs text-gray-500">Count the physical cash in the till and compare it to what the cash book says. This is a comparison only — it doesn&apos;t change any transaction; reconcile individual entries from the table once you&apos;ve worked out where a difference comes from.</p>

        <div className="bg-gray-50 rounded-lg p-3 flex justify-between text-sm">
          <span className="text-gray-500">Cash book balance</span>
          <span className="font-semibold text-gray-900">{formatCurrency(bookBalance)}</span>
        </div>

        <label className="text-xs text-gray-500 space-y-1 block">
          <span>Counted amount in the till (€)</span>
          <input type="text" inputMode="decimal" placeholder="0,00" value={counted} onChange={(e) => setCounted(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900" />
        </label>

        {diff !== null && (
          <div className={`rounded-lg p-3 flex justify-between text-sm ${diff === 0 ? "bg-emerald-50" : "bg-amber-50"}`}>
            <span className={diff === 0 ? "text-emerald-700" : "text-amber-700"}>{diff === 0 ? "Matches exactly" : diff > 0 ? "Surplus in the till" : "Missing from the till"}</span>
            <span className={`font-semibold ${diff === 0 ? "text-emerald-700" : "text-amber-700"}`}>{diff === 0 ? "€0,00" : formatCurrency(Math.abs(diff))}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-50 font-medium">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function CashPage() {
  return (
    <RequireAdministration>
      <CashInner />
    </RequireAdministration>
  );
}
