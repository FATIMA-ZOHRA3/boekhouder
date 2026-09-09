"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  vatNumber: string | null;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

export default function EditInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCredit, setIsCredit] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    invoiceNumber: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    customerName: "",
    customerAddress: "",
    notes: "",
    clientId: "",
    customerId: null as string | null,
    originalInvoiceId: null as string | null,
  });
  const [items, setItems] = useState<LineItem[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/invoices/${id}`).then((r) => r.ok ? r.json() : null),
      fetch("/api/customers").then((r) => r.ok ? r.json() : []),
    ]).then(([invoice, custs]) => {
      if (invoice) {
        setIsCredit(!!invoice.isCredit);
        setForm({
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.date,
          dueDate: invoice.dueDate,
          customerName: invoice.customerName,
          customerAddress: invoice.customerAddress,
          notes: invoice.notes || "",
          clientId: invoice.clientId,
          customerId: invoice.customerId,
          originalInvoiceId: invoice.originalInvoiceId || null,
        });
        setItems(invoice.items.map((item: LineItem & { id?: string; invoiceId?: string }) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
        })));
        if (Array.isArray(custs)) {
          setCustomers(custs);
          const customer = custs.find((c: Customer) => c.id === invoice.customerId);
          if (customer) {
            setSelectedCustomer(customer);
            setCustomerSearch(customer.name);
          }
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q));
  });

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setForm({ ...form, customerName: customer.name, customerAddress: customer.address || "", customerId: customer.id });
    setShowDropdown(false);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setForm({ ...form, customerName: "", customerAddress: "", customerId: null });
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vatAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice * (item.vatRate / 100), 0);
  const total = subtotal + vatAmount;

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, vatRate: 21 }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(status: "draft" | "sent") {
    setSaving(true);

    // For credit invoices, negate the amounts
    const finalItems = isCredit
      ? items.map((item) => ({ ...item, quantity: -Math.abs(item.quantity) }))
      : items;

    const subtotalCalc = finalItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const vatCalc = finalItems.reduce((sum, item) => sum + item.quantity * item.unitPrice * (item.vatRate / 100), 0);

    // Delete old and recreate to handle item changes
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: form.clientId,
        customerId: form.customerId,
        invoiceNumber: form.invoiceNumber,
        date: form.date,
        dueDate: form.dueDate,
        customerName: form.customerName,
        customerAddress: form.customerAddress,
        items: finalItems,
        notes: form.notes,
        status,
        isCredit,
        originalInvoiceId: form.originalInvoiceId,
      }),
    });
    router.push("/client");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Link href="/client" className="text-blue-600 hover:text-blue-700">&larr; Terug</Link>
              <span className="text-gray-300">|</span>
              <h1 className="text-lg font-semibold">{isCredit ? "Edit credit invoice" : "Edit invoice"}</h1>
              {isCredit && (
                <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">Credit note</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-8">
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6 space-y-6">

          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer / debtor</label>
            <div className="relative" ref={dropdownRef}>
              {selectedCustomer ? (
                <div className="flex items-center justify-between border border-blue-200 bg-blue-50 rounded-lg px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{selectedCustomer.name}</p>
                    {selectedCustomer.address && <p className="text-xs text-gray-500">{selectedCustomer.address}</p>}
                  </div>
                  <button onClick={clearCustomer} className="text-gray-400 hover:text-gray-600 ml-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search a customer..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {showDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.map((c) => (
                        <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          {c.address && <p className="text-xs text-gray-500">{c.address}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Invoice details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Factuurnummer</label>
              <input type="text" value={form.invoiceNumber} readOnly
                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600 cursor-not-allowed outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Factuurdatum</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
          </div>

          {!selectedCustomer && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer name</label>
                <input type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  placeholder="Bedrijfsnaam" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer address</label>
                <input type="text" value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })}
                  placeholder="Street, City" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            </div>
          )}

          {/* Line items */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Factuurregels</h3>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:items-end bg-gray-50 md:bg-transparent rounded-lg md:rounded-none p-3 md:p-0">
                  <div className="md:col-span-5">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">Description</label>}
                    <input type="text" value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Dienst of product" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  </div>
                  <div className="md:col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">Aantal</label>}
                    <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  </div>
                  <div className="md:col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">Prijs per stuk</label>}
                    <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  </div>
                  <div className="md:col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-500 mb-1">VAT %</label>}
                    <select value={item.vatRate} onChange={(e) => updateItem(index, "vatRate", Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                      <option value={21}>21%</option>
                      <option value={9}>9%</option>
                      <option value={0}>0%</option>
                    </select>
                  </div>
                  <div className="md:col-span-1 flex md:justify-center justify-end">
                    <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600 p-2" title="Delete line">&times;</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">+ Add line</button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
              placeholder="Betalingsvoorwaarden, extra informatie..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
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
            <Link href="/client" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</Link>
            <button onClick={() => handleSubmit("draft")} disabled={saving}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              Save as draft
            </button>
            <button onClick={() => handleSubmit("sent")} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              Send invoice
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
