"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import { useToast } from "@/components/ToastProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Badge";
import { formatCurrency, formatDate, formatFileSize } from "@/lib/format";

// ---------------------------------------------------------------------------
// Purchases — was the "purchases" branch of the old monolith. The
// original mixed an upload flow, a filtered table and a "workflow board"
// sub-tab into one 540-line block; here the kanban board (grouped by the
// document's real lifecycle: uploaded → processing → booked) IS the page,
// with a detail drawer for editing/categorizing a document instead of a
// separate inline edit panel. Same endpoints as before
// (/api/purchases/all, /api/purchases/[id], /api/purchases/upload).
// ---------------------------------------------------------------------------

interface PurchaseDoc {
  id: string; fileName: string; fileUrl: string; fileType: string; fileSize: number;
  status: string; label: string | null; supplierName: string | null; invoiceNumber: string | null;
  documentDate: string | null; amount: number | null; vatAmount: number | null; totalAmount: number | null;
  description: string | null; category: string | null; createdAt: string;
}
interface LedgerAccount { id: string; accountNumber: string; name: string; accountType: string; isActive: boolean }

const COLUMNS: { key: string; label: string; tone: string }[] = [
  { key: "uploaded", label: "Uploaded", tone: "bg-gray-50 border-gray-200" },
  { key: "processing", label: "Processing", tone: "bg-amber-50 border-amber-200" },
  { key: "booked", label: "Booked", tone: "bg-emerald-50 border-emerald-200" },
];

function PurchasesInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<PurchaseDoc[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [activeDoc, setActiveDoc] = useState<PurchaseDoc | null>(null);

  const load = useCallback(async () => {
    if (!activeAdminId) return;
    setLoading(true);
    try {
      const [d, l] = await Promise.all([
        fetch(`/api/purchases/all?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
        fetch("/api/ledger-accounts").then((r) => (r.ok ? r.json() : [])),
      ]);
      setDocs(Array.isArray(d) ? d : []);
      setLedgerAccounts(Array.isArray(l) ? l.filter((a: LedgerAccount) => a.isActive) : []);
    } finally { setLoading(false); }
  }, [activeAdminId]);

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  const suppliers = useMemo(() => Array.from(new Set(docs.map((d) => d.supplierName).filter((s): s is string => !!s))).sort(), [docs]);
  const filtered = supplierFilter === "all" ? docs : docs.filter((d) => d.supplierName === supplierFilter);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", file.name.replace(/\.[^.]+$/, ""));
      fd.append("userId", activeAdminId || "");
      const res = await fetch("/api/purchases/upload", { method: "POST", body: fd });
      if (res.ok) {
        addToast({ type: "info", title: "Document uploaded", message: file.name });
        load();
      } else {
        addToast({ type: "error", title: "Upload failed" });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveDoc(id: string, patch: Partial<PurchaseDoc>) {
    const res = await fetch(`/api/purchases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (res.ok) {
      const updated = await res.json();
      setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
      setActiveDoc(updated);
      addToast({ type: "bookkeeping", title: "Saved", message: updated.fileName });
    }
  }

  const totalOutstanding = docs.filter((d) => d.status !== "booked").reduce((s, d) => s + (d.totalAmount || 0), 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl space-y-6">
      <PageHeader
        title="Purchases"
        subtitle={`${docs.length} document${docs.length === 1 ? "" : "s"} · ${formatCurrency(totalOutstanding)} not yet booked`}
        actions={
          <>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload document"}
            </Button>
          </>
        }
      />

      {suppliers.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Supplier</label>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30">
            <option value="all">All suppliers</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : filtered.length === 0 ? (
        <EmptyState title="No purchase documents yet" body="Upload a receipt or supplier invoice to get started." action={{ label: "Upload document", onClick: () => fileInputRef.current?.click() }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const items = filtered.filter((d) => d.status === col.key);
            return (
              <div key={col.key} className={`rounded-2xl border p-3 ${col.tone}`}>
                <div className="flex items-center justify-between px-1 pb-2">
                  <p className="text-sm font-semibold text-gray-700">{col.label}</p>
                  <span className="text-xs font-medium text-gray-500 bg-white/70 rounded-full px-2 py-0.5">{items.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {items.length === 0 && <p className="col-span-2 text-xs text-gray-400 px-2 py-4 text-center">No documents</p>}
                  {items.map((d) => {
                    const isImage = d.fileType === "jpg" || d.fileType === "jpeg" || d.fileType === "png";
                    return (
                      <button key={d.id} onClick={() => setActiveDoc(d)} className="text-left bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.28),0_2px_6px_-2px_rgba(15,32,89,0.10)] hover:border-blue-200 transition-all">
                        <div className="aspect-square w-full bg-gray-50 flex items-center justify-center overflow-hidden">
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={d.fileUrl} alt={d.label || d.fileName} className="w-full h-full object-cover" />
                          ) : (
                            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 3v5a1 1 0 001 1h5" />
                            </svg>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-medium text-gray-900 truncate">{d.label || d.fileName}</p>
                          <p className="text-[10px] text-gray-500 truncate">{d.supplierName || "Supplier unknown"}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-gray-400">{d.documentDate ? formatDate(d.documentDate) : formatFileSize(d.fileSize)}</span>
                            {d.totalAmount != null && <span className="text-[10px] font-semibold text-gray-600">{formatCurrency(d.totalAmount)}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeDoc && (
        <PurchaseDrawer doc={activeDoc} ledgerAccounts={ledgerAccounts} onClose={() => setActiveDoc(null)} onSave={(patch) => saveDoc(activeDoc.id, patch)} />
      )}
    </div>
  );
}

function PurchaseDrawer({ doc, ledgerAccounts, onClose, onSave }: { doc: PurchaseDoc; ledgerAccounts: LedgerAccount[]; onClose: () => void; onSave: (patch: Partial<PurchaseDoc>) => void }) {
  const [form, setForm] = useState({
    supplierName: doc.supplierName || "", invoiceNumber: doc.invoiceNumber || "", documentDate: doc.documentDate || "",
    amount: doc.amount != null ? String(doc.amount) : "", vatAmount: doc.vatAmount != null ? String(doc.vatAmount) : "",
    totalAmount: doc.totalAmount != null ? String(doc.totalAmount) : "", description: doc.description || "", category: doc.category || "",
  });

  function field<K extends keyof typeof form>(key: K, value: string) { setForm((f) => ({ ...f, [key]: value })); }

  // AI: reconnaissance du document (/api/ai/scan-purchase-document) — ne fait
  // que pré-remplir le formulaire, rien n'est écrit tant que "Save" n'est pas
  // cliqué. Et suggestion de compte comptable (/api/ai/suggest-category) —
  // ne propose que parmi les comptes réels de l'administration.
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  // Cooldown after a 429 (rate limit hit — either our own per-user limit or
  // Groq's). Rather than leave the person guessing when to click again, we
  // count down from the server-provided retryAfterSeconds and re-enable the
  // button (with an optional auto-retry) exactly when it's safe to.
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestReasoning, setSuggestReasoning] = useState<string | null>(null);

  const [scanFromCache, setScanFromCache] = useState(false);
  const [suggestFromCache, setSuggestFromCache] = useState(false);

  // `force: true` requests a fresh Groq call even if the document/description
  // already has a cached result. Default is a plain call — the backend itself
  // decides whether to serve a cached answer (see PARTIE C/D: the rescan or
  // regeneration must be an explicit user action, exposed here as separate
  // "Rescan"/"Regenerate" buttons once a cached result comes back).
  async function scanDocument(force = false) {
    setScanning(true); setScanError(null); setScanNote(null);
    try {
      const res = await fetch("/api/ai/scan-purchase-document", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseDocumentId: doc.id, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error || "Could not recognize this document.");
        if (res.status === 429 && typeof data.retryAfterSeconds === "number") {
          setCooldown(data.retryAfterSeconds);
        }
        return;
      }
      setForm((f) => ({
        ...f,
        supplierName: data.supplierName || f.supplierName,
        invoiceNumber: data.invoiceNumber || f.invoiceNumber,
        documentDate: data.documentDate || f.documentDate,
        amount: data.amount != null ? String(data.amount) : f.amount,
        vatAmount: data.vatAmount != null ? String(data.vatAmount) : f.vatAmount,
        totalAmount: data.totalAmount != null ? String(data.totalAmount) : f.totalAmount,
        description: data.description || f.description,
      }));
      setScanFromCache(!!data.fromCache);
      if (data.pageNote) setScanNote(data.pageNote);
      if (data.confidence === "low") setScanNote((prev) => [prev, "Low confidence — please double-check every field."].filter(Boolean).join(" "));
    } catch { setScanError("Could not reach the AI service."); }
    finally { setScanning(false); }
  }

  async function suggestCategory(force = false) {
    setSuggesting(true); setSuggestError(null); setSuggestReasoning(null);
    try {
      const res = await fetch("/api/ai/suggest-category", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: form.description || form.supplierName || doc.fileName, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSuggestError(data.error || "Could not suggest an account.");
        // BUGFIX: this branch used to just show the error text and leave the
        // button immediately clickable — unlike scanDocument below, it never
        // read `retryAfterSeconds` on a 429, so nothing stopped the user from
        // re-clicking right away and tripping the rate limit again. Both
        // routes share one backend AI quota, so reuse the same `cooldown`
        // clock that scanDocument already drives.
        if (res.status === 429 && typeof data.retryAfterSeconds === "number") {
          setCooldown(data.retryAfterSeconds);
        }
        return;
      }
      field("category", data.accountNumber);
      setSuggestReasoning(data.reasoning || null);
      setSuggestFromCache(!!data.fromCache);
    } catch { setSuggestError("Could not reach the AI service."); }
    finally { setSuggesting(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold truncate pr-4">{doc.label || doc.fileName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-indigo-600 font-medium hover:text-indigo-800">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Open original document
          </a>

          {(doc.fileType === "pdf" || doc.fileType === "jpg" || doc.fileType === "jpeg" || doc.fileType === "png") && (
            <div>
              <button onClick={() => scanDocument(false)} disabled={scanning || cooldown > 0}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {scanning ? "Recognizing…" : cooldown > 0 ? `Try again in ${cooldown}s` : "Recognize with AI"}
              </button>
              {scanError && <p className="text-xs text-red-600 mt-1.5">{scanError}</p>}
              {scanNote && <p className="text-xs text-amber-600 mt-1.5">{scanNote}</p>}
              {scanFromCache && !scanError && (
                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-2">
                  Existing data shown — not a new AI scan.
                  <button onClick={() => scanDocument(true)} disabled={scanning || cooldown > 0} className="text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50">
                    Rescan with AI
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
              <input value={form.supplierName} onChange={(e) => field("supplierName", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice number</label>
              <input value={form.invoiceNumber} onChange={(e) => field("invoiceNumber", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Document date</label>
              <input type="date" value={form.documentDate} onChange={(e) => field("documentDate", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Excl. VAT</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => field("amount", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">VAT</label>
              <input type="number" step="0.01" value={form.vatAmount} onChange={(e) => field("vatAmount", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Total (incl. VAT)</label>
              <input type="number" step="0.01" value={form.totalAmount} onChange={(e) => field("totalAmount", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input value={form.description} onChange={(e) => field("description", e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-600">Ledger account</label>
                <button onClick={() => suggestCategory(false)} disabled={suggesting || cooldown > 0} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
                  {suggesting ? "Suggesting…" : cooldown > 0 ? `Try again in ${cooldown}s` : "Suggest with AI"}
                </button>
              </div>
              <select value={form.category} onChange={(e) => { field("category", e.target.value); setSuggestReasoning(null); setSuggestFromCache(false); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30">
                <option value="">Select an account…</option>
                {ledgerAccounts.filter((a) => a.accountType === "expense" || a.accountType === "asset").map((a) => <option key={a.id} value={a.accountNumber}>{a.accountNumber} — {a.name}</option>)}
              </select>
              {suggestError && <p className="text-xs text-red-600 mt-1">{suggestError}</p>}
              {suggestReasoning && <p className="text-xs text-indigo-600 mt-1">{suggestReasoning}</p>}
              {suggestFromCache && !suggestError && (
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                  Previous suggestion — not a new AI call.
                  <button onClick={() => suggestCategory(true)} disabled={suggesting || cooldown > 0} className="text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50">
                    {cooldown > 0 ? `Try again in ${cooldown}s` : "Regenerate"}
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-4 space-y-2 shrink-0">
          <Button className="w-full" onClick={() => onSave({
            supplierName: form.supplierName || null, invoiceNumber: form.invoiceNumber || null, documentDate: form.documentDate || null,
            amount: form.amount ? parseFloat(form.amount) : null, vatAmount: form.vatAmount ? parseFloat(form.vatAmount) : null,
            totalAmount: form.totalAmount ? parseFloat(form.totalAmount) : null, description: form.description || null, category: form.category || null,
          })}>
            Save
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {doc.status !== "processing" && <Button variant="secondary" onClick={() => onSave({ status: "processing" } as Partial<PurchaseDoc>)}>Mark processing</Button>}
            {doc.status !== "booked" && <Button variant="secondary" className="!text-emerald-700" onClick={() => onSave({ status: "booked" } as Partial<PurchaseDoc>)}>Mark booked</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  return (
    <RequireAdministration>
      <PurchasesInner />
    </RequireAdministration>
  );
}
