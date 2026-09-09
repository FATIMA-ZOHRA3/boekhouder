"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LineItem { description: string; quantity: number; unitPrice: number; vatRate: number }
interface Customer { id: string; name: string; email: string | null; address: string | null; paymentTermValue: number | null; paymentTermUnit: string | null }

const CLIENT_ID = "client-1";
function formatCurrency(n: number) { return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n); }
function formatDate(d: string) { const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; }

export default function NewQuotation() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const defaultValidUntil = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })();

  const [form, setForm] = useState({
    quotationNumber: "", date: today, validUntil: defaultValidUntil,
    customerName: "", customerAddress: "", notes: "",
  });
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, vatRate: 21 }]);

  useEffect(() => {
    fetch("/api/customers").then((r) => r.ok ? r.json() : []).then((d) => { if (Array.isArray(d)) setCustomers(d); }).catch(() => {});
    fetch("/api/quotations/next-number").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.quotationNumber) setForm((prev) => ({ ...prev, quotationNumber: d.quotationNumber }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function h(e: MouseEvent) { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const filteredCustomers = customers.filter((c) => !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase()));

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c); setCustomerSearch(c.name);
    setForm({ ...form, customerName: c.name, customerAddress: c.address || "" });
    setShowDropdown(false);
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.vatRate / 100), 0);
  const total = subtotal + vatAmount;

  function updateItem(idx: number, field: keyof LineItem, val: string | number) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  async function handleSubmit(status: "draft" | "sent") {
    setSaving(true);
    const res = await fetch("/api/quotations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, customerId: selectedCustomer?.id || null, ...form, items, status }),
    });
    if (res.ok) router.push("/client/quotations");
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-3">
            <Link href="/client/quotations" className="text-blue-600 hover:text-blue-700">&larr; Terug</Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-lg font-semibold">New quotation</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-8">
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6 space-y-6">
          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
            <div className="relative" ref={dropdownRef}>
              {selectedCustomer ? (
                <div className="flex items-center justify-between border border-blue-200 bg-blue-50 rounded-lg px-4 py-2.5">
                  <p className="text-sm font-medium">{selectedCustomer.name}</p>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); setForm({ ...form, customerName: "", customerAddress: "" }); }} className="text-gray-400 hover:text-gray-600 ml-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <input type="text" value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)} placeholder="Search a customer..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  {showDropdown && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.map((c) => (
                        <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                          <p className="text-sm font-medium">{c.name}</p>
                        </button>
                      ))}
                      {filteredCustomers.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">No customers found</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Offertenummer</label>
              <input type="text" value={form.quotationNumber} readOnly placeholder="Generated automatically"
                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600 cursor-not-allowed outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Offertedatum</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid until</label>
              <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {!selectedCustomer && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer name</label>
                <input type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  placeholder="Bedrijfsnaam" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer address</label>
                <input type="text" value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })}
                  placeholder="Street, City" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {/* Line Items */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Offerteregels</h3>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:items-end bg-gray-50 md:bg-transparent rounded-lg md:rounded-none p-3 md:p-0">
                  <div className="md:col-span-5">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Description</label>}
                    <input type="text" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)}
                      placeholder="Dienst of product" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="md:col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Aantal</label>}
                    <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="md:col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Prijs per stuk</label>}
                    <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="md:col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">VAT %</label>}
                    <select value={item.vatRate} onChange={(e) => updateItem(idx, "vatRate", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                      <option value={21}>21%</option><option value={9}>9%</option><option value={0}>0%</option>
                    </select>
                  </div>
                  <div className="md:col-span-1 flex md:justify-center justify-end">
                    <button onClick={() => items.length > 1 && setItems((p) => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-2">&times;</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0, vatRate: 21 }])}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">+ Add line</button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
              placeholder="Extra informatie..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Totals */}
          <div className="border-t border-gray-200 pt-4">
            <div className="w-full sm:w-64 sm:ml-auto space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span className="font-medium">{formatCurrency(vatAmount)}</span></div>
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2"><span>Total incl. VAT</span><span>{formatCurrency(total)}</span></div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end border-t border-gray-200 pt-4">
            <button type="button" onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 border border-purple-200 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50 mr-auto">
              {showPreview ? "Close example" : "Example"}
            </button>
            <Link href="/client/quotations" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</Link>
            <button onClick={() => handleSubmit("draft")} disabled={saving}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Save as draft</button>
            <button onClick={() => handleSubmit("draft")} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Save quotation</button>
          </div>
        </div>
      </main>

      {/* Preview Panel */}
      {showPreview && (
        <div className="fixed inset-0 sm:inset-auto sm:top-0 sm:right-0 sm:w-[480px] sm:h-full bg-white sm:border-l border-gray-200 shadow-xl z-50 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700">Example quotation</h2>
            <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-6">
            <div className="border border-gray-200 rounded-lg p-6 bg-white" style={{ fontSize: "12px" }}>
              <div className="flex justify-between mb-6">
                <div><p className="text-xl font-bold text-blue-600">Offerte</p><p className="text-gray-500">{form.quotationNumber || "—"}</p></div>
                <div className="text-right text-gray-500" style={{ fontSize: "11px" }}><p className="font-semibold text-gray-700">Your company</p></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pb-4 border-b border-gray-100">
                <div><p className="text-gray-400 uppercase" style={{ fontSize: "10px" }}>Offertegegevens</p><p><strong>Datum:</strong> {form.date ? formatDate(form.date) : "—"}</p><p><strong>Valid until:</strong> {form.validUntil ? formatDate(form.validUntil) : "—"}</p></div>
                <div><p className="text-gray-400 uppercase" style={{ fontSize: "10px" }}>Customer</p><p className="font-semibold">{form.customerName || "—"}</p><p>{form.customerAddress || "—"}</p></div>
              </div>
              <table className="w-full mb-4" style={{ fontSize: "11px" }}>
                <thead><tr className="text-gray-400 uppercase border-b border-gray-200" style={{ fontSize: "9px" }}>
                  <th className="text-left py-2">Description</th><th className="text-right py-2">Aantal</th><th className="text-right py-2">Prijs</th><th className="text-right py-2">Totaal</th>
                </tr></thead>
                <tbody>{items.map((it, i) => (
                  <tr key={i} className="border-b border-gray-50"><td className="py-2">{it.description || "—"}</td><td className="text-right py-2">{it.quantity}</td><td className="text-right py-2">{formatCurrency(it.unitPrice)}</td><td className="text-right py-2 font-medium">{formatCurrency(it.quantity * it.unitPrice)}</td></tr>
                ))}</tbody>
              </table>
              <div className="w-full sm:w-48 sm:ml-auto space-y-1" style={{ fontSize: "11px" }}>
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">VAT</span><span>{formatCurrency(vatAmount)}</span></div>
                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2"><span>Totaal</span><span>{formatCurrency(total)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
