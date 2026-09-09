"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface InvoiceItem { description: string; quantity: number; unitPrice: number; vatRate: number }
interface InvoiceNote { id: string; text: string; createdAt: string }
interface InvoiceData {
  id: string; invoiceNumber: string; date: string; dueDate: string; customerName: string; customerAddress: string;
  subtotal: number; vatAmount: number; total: number; paidAmount: number; status: string; bookkeepingStatus: string;
  notes: string | null; isCredit: boolean; items: InvoiceItem[];
}

function formatCurrency(n: number) { return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n); }
function formatDate(d: string) { const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; }

const statusLabels: Record<string, string> = { draft: "Draft", sent: "Sent", paid: "Paid", partial: "Partially paid", overdue: "Expired" };
const statusColors: Record<string, string> = { draft: "bg-gray-100 text-gray-700", sent: "bg-blue-100 text-blue-700", paid: "bg-green-100 text-green-700", partial: "bg-amber-100 text-amber-700", overdue: "bg-red-100 text-red-700" };

export default function ViewInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [notes, setNotes] = useState<InvoiceNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/invoices/${id}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/invoices/${id}/notes`).then((r) => r.ok ? r.json() : []),
    ]).then(([inv, n]) => { setInvoice(inv); if (Array.isArray(n)) setNotes(n); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function addNote() {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    const res = await fetch(`/api/invoices/${id}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: newNote }),
    });
    if (res.ok) { const note = await res.json(); setNotes((prev) => [note, ...prev]); setNewNote(""); }
    setNoteSaving(false);
  }

  async function deleteNote(noteId: string) {
    await fetch(`/api/invoices/${id}/notes`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId }),
    });
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  async function handleAction(action: string) {
    setActionLoading(action);
    try {
      if (action === "edit") { router.push(`/client/invoices/${id}/edit`); return; }
      if (action === "pdf") { window.open(`/api/invoices/${id}/pdf`, "_blank"); return; }
      if (action === "download") {
        const res = await fetch(`/api/invoices/${id}/pdf?download=1`);
        if (res.ok) {
          const blob = await res.blob();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = `${invoice?.invoiceNumber || id}.pdf`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        return;
      }
      if (action === "copy") {
        const res = await fetch(`/api/invoices/${id}/copy`, { method: "POST" });
        if (res.ok) { const c = await res.json(); router.push(`/client/invoices/${c.id}/edit`); }
        return;
      }
      if (action === "credit") {
        const res = await fetch(`/api/invoices/${id}/credit`, { method: "POST" });
        if (res.ok) { const c = await res.json(); router.push(`/client/invoices/${c.id}/edit`); }
        return;
      }
      if (action === "markPaid") {
        await fetch(`/api/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) });
        setInvoice((prev) => prev ? { ...prev, status: "paid" } : null);
        return;
      }
    } finally { setActionLoading(""); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!invoice) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Invoice not found</p></div>;

  const isCredit = invoice.isCredit;
  const s = invoice.status;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Link href="/client" className="text-blue-600 hover:text-blue-700">&larr; Back to overview</Link>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[s] || "bg-gray-100"}`}>
                {isCredit ? "Credit note" : statusLabels[s] || s}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-8 space-y-6">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {s === "draft" && (
            <button onClick={() => handleAction("edit")} disabled={!!actionLoading}
              className="px-5 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              Edit
            </button>
          )}
          <button onClick={() => handleAction("pdf")}
            className="px-5 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200">
            View PDF
          </button>
          <button onClick={() => handleAction("download")} disabled={!!actionLoading}
            className="px-5 py-3 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
            Download PDF
          </button>
          {s === "draft" && (
            <button onClick={() => handleAction("send")} disabled={!!actionLoading}
              className="px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              Send
            </button>
          )}
          {(s === "sent" || s === "partial" || s === "overdue") && !isCredit && (
            <>
              <button onClick={() => handleAction("markPaid")} disabled={!!actionLoading}
                className="px-5 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                Mark as paid
              </button>
              <button onClick={() => router.push(`/client`)} disabled={!!actionLoading}
                className="px-5 py-3 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                Send reminder
              </button>
            </>
          )}
          {!isCredit && s !== "draft" && (
            <button onClick={() => handleAction("credit")} disabled={!!actionLoading}
              className="px-5 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 disabled:opacity-50">
              Crediteren
            </button>
          )}
          <button onClick={() => handleAction("copy")} disabled={!!actionLoading}
            className="px-5 py-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-sm font-semibold hover:bg-blue-100 disabled:opacity-50">
            Copy
          </button>
        </div>

        {/* Invoice Header */}
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
              {isCredit && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">Credit note</span>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{formatCurrency(invoice.total)}</p>
              {invoice.paidAmount > 0 && invoice.paidAmount < Math.abs(invoice.total) && (
                <p className="text-sm text-gray-500 mt-1">Paid: {formatCurrency(invoice.paidAmount)} · Resterend: {formatCurrency(Math.abs(invoice.total) - invoice.paidAmount)}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-sm">
            <div><p className="text-gray-500">Factuurdatum</p><p className="font-medium">{formatDate(invoice.date)}</p></div>
            <div><p className="text-gray-500">Due date</p><p className="font-medium">{formatDate(invoice.dueDate)}</p></div>
            <div><p className="text-gray-500">Customer</p><p className="font-medium">{invoice.customerName}</p></div>
            <div><p className="text-gray-500">Adres</p><p className="font-medium">{invoice.customerAddress}</p></div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-100"><h3 className="text-lg font-semibold">Factuurregels</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium text-right">Aantal</th>
                <th className="px-6 py-3 font-medium text-right">Prijs per stuk</th>
                <th className="px-6 py-3 font-medium text-right">VAT %</th>
                <th className="px-6 py-3 font-medium text-right">Regeltotaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.items.map((item, i) => (
                <tr key={i}>
                  <td className="px-6 py-4">{item.description}</td>
                  <td className="px-6 py-4 text-right">{item.quantity}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-6 py-4 text-right">{item.vatRate}%</td>
                  <td className="px-6 py-4 text-right font-medium">{formatCurrency(item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 p-4 sm:p-6">
            <div className="w-full sm:w-64 sm:ml-auto space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium">{formatCurrency(invoice.subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="font-medium">{formatCurrency(invoice.vatAmount)}</span></div>
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2"><span>Totaal</span><span>{formatCurrency(invoice.total)}</span></div>
            </div>
          </div>
        </div>

        {/* Invoice Notes */}
        {invoice.notes && (
          <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Invoice notes</h3>
            <p className="text-sm text-gray-600">{invoice.notes}</p>
          </div>
        )}

        {/* Internal Notes */}
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
          <h3 className="text-lg font-semibold mb-4">Internal notes</h3>
          <div className="flex gap-3 mb-4">
            <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="Add a note..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            <button onClick={addNote} disabled={noteSaving || !newNote.trim()}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {noteSaving ? "..." : "Add"}
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-gray-400">No notes for this invoice yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-700">{note.text}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(note.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <button onClick={() => deleteNote(note.id)} className="text-gray-400 hover:text-red-500 ml-3 shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
