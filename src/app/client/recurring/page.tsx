"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface RecurringInvoice {
  id: string;
  customerId: string;
  interval: string;
  nextDate: string;
  templateData: string;
  autoSend: boolean;
  active: boolean;
  customer: { name: string };
}

interface Customer {
  id: string;
  name: string;
}

const intervalLabels: Record<string, string> = {
  weekly: "Wekelijks",
  monthly: "Maandelijks",
  quarterly: "Per quarter",
  yearly: "Jaarlijks",
};

function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerId: "", interval: "monthly", nextDate: "", description: "", unitPrice: "", vatRate: "21", autoSend: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/recurring-invoices").then((r) => r.ok ? r.json() : []),
      fetch("/api/customers").then((r) => r.ok ? r.json() : []),
    ]).then(([rec, custs]) => {
      if (Array.isArray(rec)) setItems(rec);
      if (Array.isArray(custs)) setCustomers(custs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const templateData = {
      items: [{ description: form.description || "Dienstverlening", quantity: 1, unitPrice: parseFloat(form.unitPrice) || 0, vatRate: parseFloat(form.vatRate) }],
    };
    const res = await fetch("/api/recurring-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: form.customerId, interval: form.interval, nextDate: form.nextDate, templateData, autoSend: form.autoSend }),
    });
    if (res.ok) {
      const newItem = await res.json();
      setItems((prev) => [...prev, newItem]);
      setShowForm(false);
      setForm({ customerId: "", interval: "monthly", nextDate: "", description: "", unitPrice: "", vatRate: "21", autoSend: false });
    }
    setSaving(false);
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/recurring-invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, active: !active } : i));
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this recurring invoice?")) return;
    await fetch(`/api/recurring-invoices/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Link href="/client" className="text-blue-600 hover:text-blue-700">&larr; Terug</Link>
              <span className="text-gray-300">|</span>
              <h1 className="text-lg font-semibold">Terugkerende facturen</h1>
            </div>
            <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              + New
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-6">
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">New recurring invoice</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                  <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select...</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interval *</label>
                  <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="weekly">Wekelijks</option>
                    <option value="monthly">Maandelijks</option>
                    <option value="quarterly">Per quarter</option>
                    <option value="yearly">Jaarlijks</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Startdatum *</label>
                  <input type="date" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (excl. VAT)</label>
                  <input type="number" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                    placeholder="0,00" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Bijv. Maandelijkse retainer" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.autoSend} onChange={(e) => setForm({ ...form, autoSend: e.target.checked })} className="rounded" />
                Send automatically
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Save..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        )}

        {items.length === 0 && !showForm ? (
          <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-12 text-center">
            <h2 className="text-xl font-semibold mb-2">No recurring invoices</h2>
            <p className="text-gray-500 mb-4">Create a recurring invoice to automatically generate invoices.</p>
            <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
              Create first recurring invoice
            </button>
          </div>
        ) : items.length > 0 && (
          <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Interval</th>
                  <th className="px-5 py-3 font-medium">Next date</th>
                  <th className="px-5 py-3 font-medium">Auto-send</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium">{item.customer.name}</td>
                    <td className="px-5 py-4 text-gray-600">{intervalLabels[item.interval] || item.interval}</td>
                    <td className="px-5 py-4 text-gray-600">{formatDate(item.nextDate)}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.autoSend ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {item.autoSend ? "Ja" : "Nee"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                        {item.active ? "Active" : "Gepauzeerd"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => toggleActive(item.id, item.active)}
                          className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">
                          {item.active ? "Pauzeren" : "Activeren"}
                        </button>
                        <button onClick={() => handleDelete(item.id)}
                          className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{item.customer.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{intervalLabels[item.interval] || item.interval}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${item.active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                    {item.active ? "Active" : "Gepauzeerd"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  <span>Next: {formatDate(item.nextDate)}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.autoSend ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    Auto: {item.autoSend ? "Ja" : "Nee"}
                  </span>
                </div>
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button onClick={() => toggleActive(item.id, item.active)}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">
                    {item.active ? "Pauzeren" : "Activeren"}
                  </button>
                  <button onClick={() => handleDelete(item.id)}
                    className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </main>
    </div>
  );
}
