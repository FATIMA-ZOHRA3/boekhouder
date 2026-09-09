"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface QuotationItem { description: string; quantity: number; unitPrice: number; vatRate: number }
interface Quotation {
  id: string; quotationNumber: string; date: string; validUntil: string; customerName: string;
  subtotal: number; vatAmount: number; total: number; status: string; notes: string | null;
  items: QuotationItem[]; _count?: { quotationNotes: number };
}

const CLIENT_ID = "client-1";
function formatCurrency(n: number) { return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n); }
function formatDate(d: string) { const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; }

const statusLabels: Record<string, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", expired: "Expired", rejected: "Rejected", converted: "Converted to invoice" };
const statusColors: Record<string, string> = { draft: "bg-gray-100 text-gray-700", sent: "bg-blue-100 text-blue-700", accepted: "bg-green-100 text-green-700", expired: "bg-red-100 text-red-700", rejected: "bg-red-100 text-red-600", converted: "bg-purple-100 text-purple-700" };

export default function QuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [emailModal, setEmailModal] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", message: "" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState("");

  useEffect(() => {
    fetch(`/api/quotations?clientId=${CLIENT_ID}`).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setQuotations(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = quotations.filter((q) => {
    if (statusFilter !== "all" && q.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return q.quotationNumber.toLowerCase().includes(s) || q.customerName.toLowerCase().includes(s);
    }
    return true;
  });

  function openSendModal(qId: string) {
    const q = quotations.find((x) => x.id === qId);
    if (!q) return;
    setEmailForm({
      to: "",
      subject: `Offerte ${q.quotationNumber}`,
      message: `Dear ${q.customerName},\n\nPlease find attached our quotation ${q.quotationNumber}.\n\nIf you agree, you can accept the quotation via the button in the email.\n\nKind regards`,
    });
    setEmailResult("");
    setEmailModal(qId);
  }

  async function handleSendEmail() {
    if (!emailModal || !emailForm.to) { setEmailResult("Email address is required"); return; }
    setEmailSending(true);
    const res = await fetch(`/api/quotations/${emailModal}/send`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emailForm),
    });
    if (res.ok) {
      setEmailResult("Quotation sent!");
      const updated = await fetch(`/api/quotations?clientId=${CLIENT_ID}`).then((r) => r.json());
      if (Array.isArray(updated)) setQuotations(updated);
      setTimeout(() => setEmailModal(null), 1200);
    } else { setEmailResult("Send failed"); }
    setEmailSending(false);
  }

  async function handleCopy(qId: string) {
    const res = await fetch(`/api/quotations/${qId}/copy`, { method: "POST" });
    if (res.ok) { const c = await res.json(); router.push(`/client/quotations/${c.id}/edit`); }
  }

  async function handleConvert(qId: string) {
    if (!confirm("Wil je this quotation convert naar a invoice?")) return;
    const res = await fetch(`/api/quotations/${qId}/convert`, { method: "POST" });
    if (res.ok) { const inv = await res.json(); router.push(`/client/invoices/${inv.id}/edit`); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Link href="/client" className="text-blue-600 hover:text-blue-700">&larr; Terug</Link>
              <span className="text-gray-300">|</span>
              <h1 className="text-lg font-semibold">Offertes</h1>
            </div>
            <Link href="/client/quotations/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              + New quotation
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number or customer..." className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="expired">Expired</option>
            <option value="converted">Omgezet</option>
          </select>
        </div>

        <p className="text-sm text-gray-400 mb-4">{filtered.length} offerte(s)</p>

        <div className="space-y-3">
          {filtered.map((q) => (
            <div key={q.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.28),0_2px_6px_-2px_rgba(15,32,89,0.10)] hover:border-blue-200 transition-all">
              <div className="flex items-center justify-between">
                <Link href={`/client/quotations/${q.id}/view`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-lg font-semibold">{q.customerName}</p>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[q.status] || "bg-gray-100"}`}>
                      {statusLabels[q.status] || q.status}
                    </span>
                    {q._count?.quotationNotes ? (
                      <span className="text-amber-500"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2z" clipRule="evenodd" /></svg></span>
                    ) : null}
                  </div>
                  <p className="text-sm text-gray-400">{q.quotationNumber} · {formatDate(q.date)} · Valid until: {formatDate(q.validUntil)}</p>
                </Link>
                <div className="flex items-center gap-3 ml-4">
                  <p className="text-xl font-bold">{formatCurrency(q.total)}</p>
                  <div className="flex gap-2">
                    {q.status === "draft" && (
                      <>
                        <Link href={`/client/quotations/${q.id}/edit`} className="text-xs px-2.5 py-1.5 border border-green-200 text-green-600 rounded-lg hover:bg-green-50 font-medium">Edit</Link>
                        <button onClick={() => openSendModal(q.id)} className="text-xs px-2.5 py-1.5 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 font-medium">Send</button>
                      </>
                    )}
                    {q.status === "accepted" && (
                      <button onClick={() => handleConvert(q.id)} className="text-xs px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">Create invoice</button>
                    )}
                    <button onClick={() => handleCopy(q.id)} className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">Copy</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <h2 className="text-xl font-semibold mb-2">No quotations found</h2>
              <p className="text-gray-500 mb-4">Create your first quotation.</p>
              <Link href="/client/quotations/new" className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
                Create first quotation
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Email Modal */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Send quotation</h2>
              <button onClick={() => setEmailModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {emailResult && <div className={`rounded-lg px-4 py-3 text-sm ${emailResult.includes("!") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{emailResult}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To *</label>
                <input type="email" value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })}
                  placeholder="customer@example.com" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Onderwerp</label>
                <input type="text" value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bericht</label>
                <textarea value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} rows={5}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">The quotation will be attached as a PDF with an accept button.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEmailModal(null)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={handleSendEmail} disabled={emailSending}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
                  {emailSending ? "Send..." : "Finalize and send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
