"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  vatNumber: string | null;
  kvkNumber: string | null;
  legalForm: string | null;
  sbiCode: string | null;
  sbiDescription: string | null;
  city: string | null;
  postalCode: string | null;
  kvkLastSynced: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
  createdAt: string;
}

interface KvkSearchResult {
  kvkNummer: string;
  naam: string;
  plaats: string;
  type: string;
}

const EMPTY_FORM = { name: "", email: "", phone: "", address: "", vatNumber: "", kvkNumber: "", legalForm: "", paymentTermValue: "", paymentTermUnit: "months" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // KVK search state
  const [kvkSearchQuery, setKvkSearchQuery] = useState("");
  const [kvkSearchType, setKvkSearchType] = useState<"name" | "nummer">("name");
  const [kvkResults, setKvkResults] = useState<KvkSearchResult[]>([]);
  const [kvkSearching, setKvkSearching] = useState(false);
  const [kvkSearchDone, setKvkSearchDone] = useState(false);
  const [kvkImporting, setKvkImporting] = useState<string | null>(null);
  const [kvkMessage, setKvkMessage] = useState("");
  const [kvkSyncing, setKvkSyncing] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) { const data = await res.json(); if (Array.isArray(data)) setCustomers(data); }
    } catch { /* */ }
    setLoading(false);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError("");
    setKvkSearchQuery("");
    setKvkResults([]);
    setKvkSearchDone(false);
    setKvkMessage("");
  }

  function startEdit(customer: Customer) {
    setForm({
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      vatNumber: customer.vatNumber || "",
      kvkNumber: customer.kvkNumber || "",
      legalForm: customer.legalForm || "",
      paymentTermValue: customer.paymentTermValue?.toString() || "",
      paymentTermUnit: customer.paymentTermUnit || "months",
    });
    setEditingId(customer.id);
    setShowForm(true);
    setError("");
    setKvkResults([]);
    setKvkSearchDone(false);
    setKvkMessage("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/customers/${editingId}` : "/api/customers";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          paymentTermValue: form.paymentTermValue ? parseInt(form.paymentTermValue, 10) : null,
          paymentTermUnit: form.paymentTermValue ? form.paymentTermUnit : null,
        }),
      });
      if (!res.ok) {
        try { const data = await res.json(); setError(data.error || "Er ging iets mis"); } catch { setError("Er ging iets mis"); }
        return;
      }
      await fetchCustomers();
      resetForm();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    await fetchCustomers();
  }

  // KVK search
  function handleKvkSearch() {
    const q = kvkSearchQuery.trim();
    if (!q) return;

    if (kvkSearchType === "nummer") {
      const clean = q.replace(/\s/g, "");
      if (!/^\d{8}$/.test(clean)) { setKvkMessage("KVK number must be exactly 8 digits"); return; }
      searchKvkByNumber(clean);
    } else {
      if (q.length < 2) { setKvkMessage("Enter at least 2 characters"); return; }
      searchKvkByName(q);
    }
  }

  async function searchKvkByName(naam: string) {
    setKvkSearching(true);
    setKvkResults([]);
    setKvkMessage("");
    setKvkSearchDone(false);
    try {
      const res = await fetch(`/api/kvk/search?naam=${encodeURIComponent(naam)}&resultatenPerPagina=10`);
      if (res.ok) {
        const data = await res.json();
        const results = (data.resultaten || []).map((r: KvkSearchResult) => ({
          kvkNummer: r.kvkNummer, naam: r.naam, plaats: r.plaats || "", type: r.type || "",
        }));
        setKvkResults(results);
        if (results.length === 0) setKvkMessage("No companies found");
      } else {
        const data = await res.json().catch(() => ({}));
        setKvkMessage(data.error || "Search failed");
      }
    } catch { setKvkMessage("Could not connect to KVK"); }
    finally { setKvkSearching(false); setKvkSearchDone(true); }
  }

  async function searchKvkByNumber(kvkNummer: string) {
    setKvkSearching(true);
    setKvkResults([]);
    setKvkMessage("");
    setKvkSearchDone(false);
    try {
      const res = await fetch(`/api/kvk/search?kvkNummer=${kvkNummer}`);
      if (res.ok) {
        const data = await res.json();
        const results = (data.resultaten || []).map((r: KvkSearchResult) => ({
          kvkNummer: r.kvkNummer, naam: r.naam, plaats: r.plaats || "", type: r.type || "",
        }));
        setKvkResults(results);
        if (results.length === 0) setKvkMessage("No company found with this KVK number");
      } else {
        const data = await res.json().catch(() => ({}));
        setKvkMessage(data.error || "Search failed");
      }
    } catch { setKvkMessage("Could not connect to KVK"); }
    finally { setKvkSearching(false); setKvkSearchDone(true); }
  }

  // Import KVK result into form (auto-fill)
  async function importKvkToForm(result: KvkSearchResult) {
    setKvkImporting(result.kvkNummer);
    try {
      const res = await fetch(`/api/kvk/profile?kvkNummer=${result.kvkNummer}`);
      if (res.ok) {
        const data = await res.json();
        const n = data.normalized;
        const profiel = data.raw;
        const bezoekAdres = profiel?.hoofdvestiging?.adressen?.find((a: { type: string }) => a.type === "bezoekadres") || profiel?.hoofdvestiging?.adressen?.[0];
        const fullAddress = bezoekAdres?.volledigAdres || [bezoekAdres?.straatnaam, bezoekAdres?.huisnummer, bezoekAdres?.postcode, bezoekAdres?.plaats].filter(Boolean).join(" ");

        setForm((prev) => ({
          ...prev,
          name: n.company || prev.name,
          kvkNumber: n.kvkNumber || prev.kvkNumber,
          legalForm: n.legalForm || prev.legalForm,
          address: fullAddress || prev.address,
        }));
        setKvkMessage(`Details of ${n.company} filled in`);
        setKvkResults([]);
      } else {
        setKvkMessage("Could not fetch company details");
      }
    } catch { setKvkMessage("Error fetching company details"); }
    finally { setKvkImporting(null); }
  }

  // Sync existing customer with KVK
  async function syncCustomerKvk(customer: Customer) {
    if (!customer.kvkNumber) return;
    setKvkSyncing(customer.id);
    try {
      const res = await fetch("/api/kvk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kvkNummer: customer.kvkNumber, customerId: customer.id, mode: "sync" }),
      });
      if (res.ok) {
        await fetchCustomers();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Sync failed");
      }
    } catch { alert("Could not sync with KVK"); }
    finally { setKvkSyncing(null); }
  }

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q)) || (c.kvkNumber && c.kvkNumber.includes(q));
  });

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
              <h1 className="text-lg font-semibold">My customers</h1>
            </div>
            <button onClick={() => { resetForm(); setShowForm(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              + New customer
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-6">
        {/* Empty state */}
        {customers.length === 0 && !showForm && (
          <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-12 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">You don't have any customers yet</h2>
            <p className="text-gray-500 mb-6">Add your first customer so you can create invoices.</p>
            <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Add first customer
            </button>
          </div>
        )}

        {/* Create/Edit form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-4 sm:p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? "Edit customer" : "Add new customer"}
            </h2>

            {/* KVK Search section */}
            {!editingId && (
              <div className="bg-[#EAF3FA] border border-[#2E6FA7]/20 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-[#12355B]">Search KVK trade register</h3>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select value={kvkSearchType} onChange={(e) => setKvkSearchType(e.target.value as "name" | "nummer")}
                    className="border border-[#2E6FA7]/30 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none sm:w-40">
                    <option value="name">Bedrijfsnaam</option>
                    <option value="nummer">KVK number</option>
                  </select>
                  <div className="flex flex-1 gap-2">
                    <input
                      type="text"
                      value={kvkSearchQuery}
                      onChange={(e) => setKvkSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleKvkSearch()}
                      placeholder={kvkSearchType === "name" ? "Zoek op bedrijfsnaam..." : "Enter KVK number (8 digits)"}
                      className="flex-1 border border-[#2E6FA7]/30 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none"
                    />
                    <button onClick={handleKvkSearch} disabled={kvkSearching}
                      className="px-4 py-2.5 bg-[#12355B] text-white rounded-lg text-sm font-medium hover:bg-[#101A3D] disabled:opacity-50 transition-colors whitespace-nowrap">
                      {kvkSearching ? "Search..." : "Search"}
                    </button>
                  </div>
                </div>

                {/* KVK Results */}
                {kvkResults.length > 0 && (
                  <div className="mt-3 bg-white rounded-lg border border-gray-200 overflow-hidden max-h-64 overflow-y-auto">
                    {kvkResults.map((r, i) => (
                      <button key={`${r.kvkNummer}-${i}`} onClick={() => importKvkToForm(r)} disabled={kvkImporting === r.kvkNummer}
                        className="w-full text-left px-4 py-3 hover:bg-[#EAF3FA]/50 transition-colors border-b border-gray-50 last:border-0 disabled:opacity-50">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#0E2A47] truncate">{r.naam}</p>
                            <p className="text-xs text-gray-500">KVK: {r.kvkNummer}{r.plaats && <> &middot; {r.plaats}</>}</p>
                          </div>
                          <span className="text-xs text-[#2E6FA7] font-medium flex-shrink-0">
                            {kvkImporting === r.kvkNummer ? "Ophalen..." : "Invullen"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {kvkMessage && (
                  <p className={`mt-2 text-sm ${kvkMessage.includes("ingevuld") || kvkMessage.includes("opgehaald") ? "text-emerald-600" : "text-gray-500"}`}>
                    {kvkMessage}
                  </p>
                )}
              </div>
            )}

            {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Company name or customer name" autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">KVK number</label>
                  <input type="text" value={form.kvkNumber} onChange={(e) => setForm({ ...form, kvkNumber: e.target.value })}
                    placeholder="12345678"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="customer@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefoonnummer</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="0612345678"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                  <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street 1, 1234 AB City"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VAT-nummer</label>
                  <input type="text" value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
                    placeholder="NL123456789B01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rechtsvorm</label>
                  <select value={form.legalForm} onChange={(e) => setForm({ ...form, legalForm: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    <option value="">— Select —</option>
                    <option value="eenmanszaak">Eenmanszaak</option>
                    <option value="vof">VOF</option>
                    <option value="bv">BV</option>
                    <option value="nv">NV</option>
                    <option value="stichting">Stichting</option>
                    <option value="vereniging">Vereniging</option>
                    <option value="other">Anders</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Betalingstermijn</label>
                  <div className="flex gap-2">
                    <input type="number" min="1" value={form.paymentTermValue}
                      onChange={(e) => setForm({ ...form, paymentTermValue: e.target.value })}
                      placeholder="14"
                      className="w-20 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    <select value={form.paymentTermUnit} onChange={(e) => setForm({ ...form, paymentTermUnit: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="days">Dagen</option>
                      <option value="weeks">Weken</option>
                      <option value="months">Maanden</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button type="button" onClick={resetForm}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Save..." : editingId ? "Save" : "Add customer"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Customer list */}
        {customers.length > 0 && (
          <>
            {customers.length > 3 && (
              <div className="mb-4">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email or KVK number..."
                  className="w-full max-w-sm border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            )}

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">KVK</th>
                    <th className="px-5 py-3 font-medium">E-mail</th>
                    <th className="px-5 py-3 font-medium">Adres</th>
                    <th className="px-5 py-3 font-medium text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-medium">{c.name}</p>
                        {c.legalForm && <p className="text-xs text-gray-400 mt-0.5 capitalize">{c.legalForm}</p>}
                      </td>
                      <td className="px-5 py-4 text-gray-600 text-sm font-mono">
                        {c.kvkNumber || "—"}
                        {c.kvkLastSynced && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Synced: {new Date(c.kvkLastSynced).toLocaleDateString("nl-NL")}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-600 text-sm">{c.email || "—"}</td>
                      <td className="px-5 py-4 text-gray-600 text-sm">{c.address || "—"}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {c.kvkNumber && (
                            <button onClick={() => syncCustomerKvk(c)} disabled={kvkSyncing === c.id}
                              className="text-xs px-2 py-1 border border-[#2E6FA7]/30 text-[#12355B] rounded hover:bg-[#EAF3FA] font-medium disabled:opacity-50">
                              {kvkSyncing === c.id ? "..." : "KVK sync"}
                            </button>
                          )}
                          <button onClick={() => startEdit(c)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Edit</button>
                          <button onClick={() => handleDelete(c.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">No customers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((c) => (
                <div key={c.id} className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{c.name}</p>
                      {c.kvkNumber && <p className="text-xs text-gray-400 mt-0.5 font-mono">KVK: {c.kvkNumber}</p>}
                      {c.legalForm && <p className="text-xs text-gray-400 capitalize">{c.legalForm}</p>}
                    </div>
                    {c.kvkLastSynced && (
                      <span className="text-[10px] text-[#2E6FA7] bg-[#EAF3FA] px-1.5 py-0.5 rounded flex-shrink-0">KVK</span>
                    )}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-gray-600">
                    {c.email && <p className="truncate">{c.email}</p>}
                    {c.phone && <p>{c.phone}</p>}
                    {c.address && <p className="text-xs text-gray-400 truncate">{c.address}</p>}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
                    {c.kvkNumber && (
                      <button onClick={() => syncCustomerKvk(c)} disabled={kvkSyncing === c.id}
                        className="text-xs text-[#12355B] hover:text-[#2E6FA7] font-medium disabled:opacity-50">
                        {kvkSyncing === c.id ? "Syncing..." : "Refresh KVK"}
                      </button>
                    )}
                    <button onClick={() => startEdit(c)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Edit</button>
                    <button onClick={() => handleDelete(c.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] px-4 py-12 text-center text-gray-400">No customers found.</div>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-3">{filtered.length} customer(and)</p>
          </>
        )}
      </main>
    </div>
  );
}
