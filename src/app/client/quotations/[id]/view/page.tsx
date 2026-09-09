"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface QItem { description: string; quantity: number; unitPrice: number; vatRate: number }
interface QNote { id: string; text: string; createdAt: string }
interface QData {
  id: string; quotationNumber: string; date: string; validUntil: string; customerName: string; customerAddress: string;
  subtotal: number; vatAmount: number; total: number; status: string; notes: string | null; items: QItem[];
}

function fmt(n: number) { return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n); }
function fmtDate(d: string) { const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; }

const statusLabels: Record<string, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", expired: "Expired", rejected: "Rejected", converted: "Converted to invoice" };
const statusColors: Record<string, string> = { draft: "bg-gray-100 text-gray-700", sent: "bg-blue-100 text-blue-700", accepted: "bg-green-100 text-green-700", expired: "bg-red-100 text-red-700", rejected: "bg-red-100 text-red-600", converted: "bg-purple-100 text-purple-700" };

export default function ViewQuotation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [q, setQ] = useState<QData | null>(null);
  const [notes, setNotes] = useState<QNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/quotations/${id}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/quotations/${id}/notes`).then((r) => r.ok ? r.json() : []),
    ]).then(([data, n]) => { setQ(data); if (Array.isArray(n)) setNotes(n); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function addNote() {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    const res = await fetch(`/api/quotations/${id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: newNote }) });
    if (res.ok) { const note = await res.json(); setNotes((p) => [note, ...p]); setNewNote(""); }
    setNoteSaving(false);
  }

  async function deleteNote(noteId: string) {
    await fetch(`/api/quotations/${id}/notes`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId }) });
    setNotes((p) => p.filter((n) => n.id !== noteId));
  }

  async function handleConvert() {
    if (!confirm("Wil je this quotation convert naar a invoice?")) return;
    const res = await fetch(`/api/quotations/${id}/convert`, { method: "POST" });
    if (res.ok) { const inv = await res.json(); router.push(`/client/invoices/${inv.id}/edit`); }
  }

  async function handleCopy() {
    const res = await fetch(`/api/quotations/${id}/copy`, { method: "POST" });
    if (res.ok) { const c = await res.json(); router.push(`/client/quotations/${c.id}/edit`); }
  }

  async function handleDownload() {
    const res = await fetch(`/api/quotations/${id}/pdf?download=1`);
    if (res.ok) {
      const blob = await res.blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${q?.quotationNumber || id}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!q) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Quotation not found</p></div>;

  const s = q.status;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/client/quotations" className="text-blue-600 hover:text-blue-700">&larr; Terug naar offertes</Link>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[s] || "bg-gray-100"}`}>{statusLabels[s] || s}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-8 space-y-6">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {s === "draft" && <Link href={`/client/quotations/${id}/edit`} className="px-5 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700">Edit</Link>}
          <button onClick={() => window.open(`/api/quotations/${id}/pdf`, "_blank")} className="px-5 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200">View PDF</button>
          <button onClick={handleDownload} className="px-5 py-3 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700">Download PDF</button>
          {s === "accepted" && <button onClick={handleConvert} className="px-5 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700">Create invoice</button>}
          <button onClick={handleCopy} className="px-5 py-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl text-sm font-semibold hover:bg-blue-100">Copy</button>
        </div>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-2xl font-bold">{q.quotationNumber}</h1>
            <p className="text-3xl font-bold">{fmt(q.total)}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500">Offertedatum</p><p className="font-medium">{fmtDate(q.date)}</p></div>
            <div><p className="text-gray-500">Valid until</p><p className="font-medium">{fmtDate(q.validUntil)}</p></div>
            <div><p className="text-gray-500">Customer</p><p className="font-medium">{q.customerName}</p></div>
            <div><p className="text-gray-500">Adres</p><p className="font-medium">{q.customerAddress}</p></div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-100"><h3 className="text-lg font-semibold">Offerteregels</h3></div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead><tr className="text-left text-sm text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="px-6 py-3 font-medium">Description</th><th className="px-6 py-3 font-medium text-right">Aantal</th>
              <th className="px-6 py-3 font-medium text-right">Prijs per stuk</th><th className="px-6 py-3 font-medium text-right">VAT %</th>
              <th className="px-6 py-3 font-medium text-right">Regeltotaal</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {q.items.map((it, i) => (
                <tr key={i}><td className="px-6 py-4">{it.description}</td><td className="px-6 py-4 text-right">{it.quantity}</td>
                <td className="px-6 py-4 text-right">{fmt(it.unitPrice)}</td><td className="px-6 py-4 text-right">{it.vatRate}%</td>
                <td className="px-6 py-4 text-right font-medium">{fmt(it.quantity * it.unitPrice)}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="border-t border-gray-200 p-4 sm:p-6">
            <div className="w-full sm:w-64 sm:ml-auto space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium">{fmt(q.subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="font-medium">{fmt(q.vatAmount)}</span></div>
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2"><span>Totaal</span><span>{fmt(q.total)}</span></div>
            </div>
          </div>
        </div>

        {q.notes && <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6"><h3 className="text-sm font-medium text-gray-700 mb-2">Notes</h3><p className="text-sm text-gray-600">{q.notes}</p></div>}

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
          <h3 className="text-lg font-semibold mb-4">Internal notes</h3>
          <div className="flex gap-3 mb-4">
            <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="Add a note..." className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={addNote} disabled={noteSaving || !newNote.trim()} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Add</button>
          </div>
          {notes.length === 0 ? <p className="text-sm text-gray-400">No notes yet.</p> : (
            <div className="space-y-3">{notes.map((n) => (
              <div key={n.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-4 py-3">
                <div><p className="text-sm text-gray-700">{n.text}</p><p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div>
                <button onClick={() => deleteNote(n.id)} className="text-gray-400 hover:text-red-500 ml-3 shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}</div>
          )}
        </div>
      </main>
    </div>
  );
}
