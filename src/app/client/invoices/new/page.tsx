"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import VoiceInvoiceAssistant from "@/components/VoiceInvoiceAssistant";

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
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
  defaultDescription: string | null;
  defaultUnitPrice: number | null;
  defaultVatRate: number | null;
}

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  date: string;
  total: number;
  notes: string | null;
  items: LineItem[];
}

const CLIENT_ID = "client-1";

// Draft persistence: protects in-progress invoices against accidental page
// reloads, browser crashes, or (in dev mode) Next.js Fast Refresh full
// remounts — none of which throw a JS error, they just silently reset React
// state. This is purely additive: if nothing is in sessionStorage, behavior
// is 100% unchanged from before.
const DRAFT_STORAGE_KEY = `invoice-draft-${CLIENT_ID}`;

interface InvoiceDraft {
  step: "select-customer" | "create-invoice";
  form: {
    date: string;
    dueDate: string;
    customerName: string;
    customerAddress: string;
    notes: string;
  };
  items: LineItem[];
  selectedCustomer: Customer | null;
  savedAt: number;
}

function readInvoiceDraft(): InvoiceDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InvoiceDraft;
  } catch {
    return null;
  }
}

function writeInvoiceDraft(draft: InvoiceDraft) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full/unavailable (e.g. private browsing) — fail silently,
    // this is a best-effort safety net, not a required feature.
  }
}

function clearInvoiceDraft() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function isDraftWorthSaving(form: InvoiceDraft["form"], items: LineItem[], selectedCustomer: Customer | null) {
  const hasItemContent = items.some((i) => i.description.trim() !== "" || i.quantity !== 1 || i.unitPrice !== 0);
  const hasFormContent = form.notes.trim() !== "" || form.customerName.trim() !== "";
  return hasItemContent || hasFormContent || selectedCustomer !== null;
}


function calculateDueDate(invoiceDate: string, termValue: number = 1, termUnit: string = "months"): string {
  const date = new Date(invoiceDate);
  if (termUnit === "days") date.setDate(date.getDate() + termValue);
  else if (termUnit === "weeks") date.setDate(date.getDate() + termValue * 7);
  else date.setMonth(date.getMonth() + termValue);
  return date.toISOString().split("T")[0];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

function NewInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCustomerId = searchParams.get("customerId");
  const [step, setStep] = useState<"select-customer" | "create-invoice">(preselectedCustomerId ? "create-invoice" : "select-customer");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lineTemplates, setLineTemplates] = useState<{ id: string; name: string; description: string; unitPrice: number; vatRate: number }[]>([]);
  const [companyInfo, setCompanyInfo] = useState<{ company: string; logoUrl: string | null; vatNumber: string | null; kvkNumber: string | null; iban: string | null; bankName: string | null; accountHolder: string | null } | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerInvoices, setCustomerInvoices] = useState<InvoiceRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  // Mirrors `selectedCustomer` in a ref so the voice assistant's onClose
  // callback (created once, when the conversation starts, and invoked only
  // much later inside a long-running async flow) always reads the *current*
  // customer instead of the stale `null` it closed over at start time.
  const selectedCustomerRef = useRef<Customer | null>(null);

  // New customer inline form state
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", email: "", phone: "", address: "", vatNumber: "" });
  const [newCustomerError, setNewCustomerError] = useState("");
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);

  const [form, setForm] = useState({
    invoiceNumber: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: calculateDueDate(new Date().toISOString().split("T")[0]),
    customerName: "",
    customerAddress: "",
    notes: "",
  });
  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, vatRate: 21 },
  ]);

  // Becomes true once the one-time draft restore attempt has run AND React
  // has re-rendered with the restored values. Using state (not a ref) here
  // matters: it forces the autosave effect below to re-run on a *fresh*
  // render that actually sees the restored form/items/selectedCustomer,
  // instead of firing in the same tick against stale (pre-restore) values
  // and immediately clearing the draft we just tried to restore.
  const [draftRestored, setDraftRestored] = useState(false);

  // Restore an in-progress draft (see writeInvoiceDraft effect further down)
  // left behind by an accidental reload/crash/Fast-Refresh remount. Skipped
  // when a customerId is passed explicitly in the URL, since that's a
  // deliberate fresh action that should take priority over a stale draft.
  useEffect(() => {
    if (!preselectedCustomerId) {
      const draft = readInvoiceDraft();
      if (draft) {
        setStep(draft.step);
        setForm((prev) => ({ ...prev, ...draft.form }));
        setItems(draft.items);
        setSelectedCustomer(draft.selectedCustomer);
        selectedCustomerRef.current = draft.selectedCustomer;
      }
    }
    setDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the draft in sessionStorage in sync with the current form state, so
  // it survives an accidental reload. Cleared on successful submit (see
  // handleSubmit) or when there's nothing meaningful to save yet.
  useEffect(() => {
    if (!draftRestored) return;
    const draftForm = {
      date: form.date,
      dueDate: form.dueDate,
      customerName: form.customerName,
      customerAddress: form.customerAddress,
      notes: form.notes,
    };
    if (isDraftWorthSaving(draftForm, items, selectedCustomer)) {
      writeInvoiceDraft({
        step,
        form: draftForm,
        items,
        selectedCustomer,
        savedAt: Date.now(),
      });
    } else {
      clearInvoiceDraft();
    }
  }, [draftRestored, step, form.date, form.dueDate, form.customerName, form.customerAddress, form.notes, items, selectedCustomer]);

  useEffect(() => {
    fetch("/api/customers").then((r) => {
      if (!r.ok) return;
      return r.json();
    }).then((data) => {
      if (Array.isArray(data)) {
        setCustomers(data);
        // Auto-select customer from URL param
        if (preselectedCustomerId) {
          const match = data.find((c: Customer) => c.id === preselectedCustomerId);
          if (match) handleSelectCustomer(match);
        }
      }
    }).catch(() => {});

    fetch("/api/invoices/next-number").then((r) => {
      if (!r.ok) return;
      return r.json();
    }).then((data) => {
      if (data?.invoiceNumber) {
        setForm((prev) => ({ ...prev, invoiceNumber: data.invoiceNumber }));
      }
    }).catch(() => {});

    fetch("/api/line-templates").then((r) => r.ok ? r.json() : []).then((data) => {
      if (Array.isArray(data)) setLineTemplates(data);
    }).catch(() => {});

    fetch("/api/profile").then((r) => {
      if (!r.ok) return;
      return r.json();
    }).then((data) => {
      if (data) setCompanyInfo(data);
    }).catch(() => {});
  }, []);

  // Filtered & sorted customers for tile view
  const filteredCustomers = customers
    .filter((c) => {
      if (!customerSearch) return true;
      return c.name.toLowerCase().startsWith(customerSearch.toLowerCase());
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function handleSelectCustomer(customer: Customer, navigate: boolean = true, resetItems: boolean = true) {
    setSelectedCustomer(customer);
    selectedCustomerRef.current = customer;
    const dueDate = customer.paymentTermValue && customer.paymentTermUnit
      ? calculateDueDate(form.date, customer.paymentTermValue, customer.paymentTermUnit)
      : calculateDueDate(form.date);
    setForm((prev) => ({
      ...prev,
      customerName: customer.name,
      customerAddress: customer.address || "",
      dueDate,
    }));
    // Keep line items empty (no customer defaults per requirements) — but only
    // when this is genuinely a fresh customer pick. When the voice assistant
    // re-confirms a customer that was already selected (e.g. when it's opened
    // from the invoice-creation screen just to dictate a line item), resetting
    // here would silently wipe out items already on the form/just captured by
    // voice. Callers that are mid-invoice pass resetItems=false.
    if (resetItems) {
      setItems([{ description: "", quantity: 1, unitPrice: 0, vatRate: 21 }]);
    }

    // Fetch previous invoices for this customer
    fetch(`/api/invoices?customerId=${customer.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data)) setCustomerInvoices(data);
      })
      .catch(() => setCustomerInvoices([]));

    // When driven by the voice assistant, stay on this screen so the same
    // component instance keeps running through the items/dates phases —
    // switching step here would unmount it mid-conversation.
    if (navigate) setStep("create-invoice");
  }

  function handleChangeCustomer() {
    setSelectedCustomer(null);
    selectedCustomerRef.current = null;
    setCustomerSearch("");
    setCustomerInvoices([]);
    setForm((prev) => ({ ...prev, customerName: "", customerAddress: "" }));
    setItems([{ description: "", quantity: 1, unitPrice: 0, vatRate: 21 }]);
    setStep("select-customer");
  }

  function handleCopyInvoice(invoice: InvoiceRecord) {
    if (invoice.items && invoice.items.length > 0) {
      setItems(invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
      })));
    }
    if (invoice.notes) {
      setForm((prev) => ({ ...prev, notes: invoice.notes || "" }));
    }
    // Visual feedback
    setCopiedId(invoice.id);
    setTimeout(() => setCopiedId(null), 2000);
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    setNewCustomerError("");
    if (!newCustomerForm.name.trim()) {
      setNewCustomerError("Name is required");
      return;
    }
    setNewCustomerSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCustomerForm),
      });
      if (!res.ok) {
        const data = await res.json();
        setNewCustomerError(data.error || "Er ging iets mis");
        return;
      }
      const newCustomer = await res.json();
      setCustomers((prev) => [...prev, newCustomer]);
      setShowNewCustomerForm(false);
      setNewCustomerForm({ name: "", email: "", phone: "", address: "", vatNumber: "" });
      handleSelectCustomer(newCustomer);
    } finally {
      setNewCustomerSaving(false);
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vatAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (item.vatRate / 100),
    0
  );
  const total = subtotal + vatAmount;

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, vatRate: 21 }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(status: "draft" | "sent") {
    setSaving(true);
    await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        customerId: selectedCustomer?.id || null,
        invoiceNumber: form.invoiceNumber,
        date: form.date,
        dueDate: form.dueDate,
        customerName: form.customerName,
        customerAddress: form.customerAddress,
        items,
        notes: form.notes,
        status,
      }),
    });
    clearInvoiceDraft();
    router.push("/client");
  }

  // ──────────────────────────────────────────────
  // STEP 1: Customer Selection Screen
  // ──────────────────────────────────────────────
  if (step === "select-customer") {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <Link href="/client" className="text-blue-600 hover:text-blue-700">
                  &larr; Terug
                </Link>
                <span className="text-gray-300">|</span>
                <h1 className="text-lg font-semibold">Choose a customer</h1>
              </div>
              <button
                onClick={() => setShowVoiceAssistant(true)}
                className="flex items-center gap-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100"
                title="Create invoice with voice"
              >
                🎤 Spraakassistent
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-8">
          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search customer by name..."
              autoFocus
              className="w-full max-w-md border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
            />
          </div>

          {/* Customer Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => handleSelectCustomer(customer)}
                className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-400 hover:shadow-md transition-all group"
              >
                <p className="font-medium text-gray-900 group-hover:text-blue-600 truncate">
                  {customer.name}
                </p>
                {customer.email && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{customer.email}</p>
                )}
              </button>
            ))}

            {/* New customer tile */}
            <button
              onClick={() => {
                setShowNewCustomerForm(true);
                setNewCustomerForm({ ...newCustomerForm, name: customerSearch });
              }}
              className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-left hover:border-blue-400 hover:bg-blue-50/50 transition-all group flex items-center justify-center min-h-[72px]"
            >
              <span className="text-sm font-medium text-gray-500 group-hover:text-blue-600">
                + New customer
              </span>
            </button>
          </div>

          {filteredCustomers.length === 0 && customerSearch && (
            <p className="text-sm text-gray-500 mt-4">
              No customers found die beginnen with &ldquo;{customerSearch}&rdquo;
            </p>
          )}

          {/* Inline New Customer Form */}
          {showNewCustomerForm && (
            <div className="mt-6 max-w-lg border border-blue-200 bg-blue-50/50 rounded-xl p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Add new customer</h3>
                <button
                  onClick={() => setShowNewCustomerForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {newCustomerError && (
                <div className="bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{newCustomerError}</div>
              )}
              <form onSubmit={handleCreateCustomer} className="space-y-3">
                <input
                  type="text"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  placeholder="Customer name *"
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="email"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                    placeholder="E-mailadres"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  />
                  <input
                    type="tel"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    placeholder="Telefoonnummer"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newCustomerForm.address}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                    placeholder="Adres"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  />
                  <input
                    type="text"
                    value={newCustomerForm.vatNumber}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, vatNumber: e.target.value })}
                    placeholder="VAT-nummer"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(false)}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={newCustomerSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {newCustomerSaving ? "Save..." : "Add customer"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
        {showVoiceAssistant && (
          <VoiceInvoiceAssistant
            customers={customers}
            invoiceDate={form.date}
            invoiceNumber={form.invoiceNumber}
            companyInfo={companyInfo}
            calculateDueDate={calculateDueDate}
            onClose={() => {
              setShowVoiceAssistant(false);
              // Only move to the invoice form once a customer actually ended
              // up selected (i.e. the conversation ran through to the end).
              // NOTE: this callback is captured once, when the conversation
              // starts (before any customer is picked), and only invoked
              // much later by the assistant's async flow — so it must read
              // the ref (always current) rather than the `selectedCustomer`
              // state variable (a stale snapshot frozen at conversation
              // start, which would always be null here).
              if (selectedCustomerRef.current) setStep("create-invoice");
            }}
            onCustomerSelected={(c) => handleSelectCustomer(c, false)}
            onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
            onItemsReady={setItems}
            onDatesNotes={(date, dueDate, notes) => setForm((prev) => ({ ...prev, date, dueDate, notes }))}
            initialItems={items}
          />
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // STEP 2: Invoice Creation Form
  // ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <button onClick={handleChangeCustomer} className="text-blue-600 hover:text-blue-700">
                &larr; Andere customer
              </button>
              <span className="text-gray-300">|</span>
              <h1 className="text-lg font-semibold">New sales invoice</h1>
            </div>
            <button
              onClick={() => setShowVoiceAssistant(true)}
              className="flex items-center gap-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100"
              title="Create invoice with voice"
            >
              🎤 Spraakassistent
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-8">
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6 space-y-6">

          {/* Selected Customer Display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer / debtor</label>
            <div className="flex items-center justify-between border border-blue-200 bg-blue-50 rounded-lg px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{selectedCustomer?.name}</p>
                {selectedCustomer?.address && (
                  <p className="text-xs text-gray-500">{selectedCustomer.address}</p>
                )}
              </div>
              <button
                onClick={handleChangeCustomer}
                className="text-gray-400 hover:text-gray-600 ml-3"
                title="Change customer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Factuurgegevens */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Factuurnummer</label>
              <input
                type="text"
                value={form.invoiceNumber}
                readOnly
                placeholder="Generated automatically"
                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600 cursor-not-allowed outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Factuurdatum</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Factuurregels */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Factuurregels</h3>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:items-end bg-gray-50 md:bg-transparent rounded-lg md:rounded-none p-3 md:p-0">
                  <div className="md:col-span-5">
                    <label className="block text-xs text-gray-500 mb-1 md:hidden">Description</label>
                    {index === 0 && <label className="hidden md:block text-xs text-gray-500 mb-1">Description</label>}
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Dienst of product"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:contents">
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1 md:hidden">Aantal</label>
                      {index === 0 && <label className="hidden md:block text-xs text-gray-500 mb-1">Aantal</label>}
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1 md:hidden">Prijs</label>
                      {index === 0 && <label className="hidden md:block text-xs text-gray-500 mb-1">Prijs per stuk</label>}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1 md:hidden">VAT %</label>
                      {index === 0 && <label className="hidden md:block text-xs text-gray-500 mb-1">VAT %</label>}
                      <select
                        value={item.vatRate}
                        onChange={(e) => updateItem(index, "vatRate", Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value={21}>21%</option>
                        <option value={9}>9%</option>
                        <option value={0}>0%</option>
                      </select>
                    </div>
                  </div>
                  <div className="md:col-span-1 flex md:justify-center justify-end">
                    <button
                      onClick={() => removeItem(index)}
                      className="text-red-400 hover:text-red-600 p-2 text-sm md:text-base"
                      title="Delete line"
                    >
                      <span className="md:hidden text-xs font-medium">Delete</span>
                      <span className="hidden md:inline">&times;</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={addItem}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add line
            </button>
            {lineTemplates.length > 0 && (
              <select
                onChange={(e) => {
                  const t = lineTemplates.find((t) => t.id === e.target.value);
                  if (t) {
                    setItems((prev) => [...prev, { description: t.description, quantity: 1, unitPrice: t.unitPrice, vatRate: t.vatRate }]);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
                className="mt-3 ml-4 text-sm text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 outline-none"
              >
                <option value="" disabled>Choose template...</option>
                {lineTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({formatCurrency(t.unitPrice)})</option>
                ))}
              </select>
            )}
          </div>

          {/* Opmerkingen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Betalingsvoorwaarden, extra informatie..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Totalen */}
          <div className="border-t border-gray-200 pt-4">
            <div className="w-full sm:w-64 sm:ml-auto space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">VAT</span>
                <span className="font-medium">{formatCurrency(vatAmount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
                <span>Total incl. VAT</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Acties */}
          <div className="flex gap-3 justify-end border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 border border-purple-200 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50 mr-auto"
            >
              {showPreview ? "Close example" : "Example"}
            </button>
            <Link href="/client" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </Link>
            <button
              onClick={() => handleSubmit("draft")}
              disabled={saving}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Save as draft
            </button>
            <button
              onClick={() => handleSubmit("sent")}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Send invoice
            </button>
          </div>
        </div>

        {/* Invoice History for this customer */}
        {selectedCustomer && (
          <div className="mt-8 bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Earlier invoices for {selectedCustomer.name}
            </h3>
            {customerInvoices.length === 0 ? (
              <p className="text-sm text-gray-500">No earlier invoices for this customer</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="pb-2 font-medium">Factuurnummer</th>
                      <th className="pb-2 font-medium">Datum</th>
                      <th className="pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3 font-mono text-gray-700">{inv.invoiceNumber}</td>
                        <td className="py-3 text-gray-600">{formatDate(inv.date)}</td>
                        <td className="py-3 font-medium">{formatCurrency(inv.total)}</td>
                        <td className="py-3 text-gray-500 truncate max-w-[200px]">
                          {inv.items?.[0]?.description || "—"}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleCopyInvoice(inv)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                              copiedId === inv.id
                                ? "border-green-300 bg-green-50 text-green-700"
                                : "border-blue-200 text-blue-600 hover:bg-blue-50"
                            }`}
                          >
                            {copiedId === inv.id ? "Gekopieerd!" : "Copy"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Preview Panel */}
      {showPreview && (
        <div className="fixed inset-0 sm:inset-auto sm:top-0 sm:right-0 sm:w-[480px] sm:h-full bg-white sm:border-l border-gray-200 shadow-xl z-50 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700">Example invoice</h2>
            <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-6">
            <div className="border border-gray-200 rounded-lg p-6 bg-white text-sm" style={{ fontSize: "12px" }}>
              <div className="flex justify-between mb-6">
                <div>
                  <p className="text-xl font-bold text-blue-600">Invoice</p>
                  <p className="text-gray-500">{form.invoiceNumber || "—"}</p>
                </div>
                <div className="text-right text-gray-500" style={{ fontSize: "11px" }}>
                  {companyInfo?.logoUrl && (
                    <img src={companyInfo.logoUrl} alt="Logo" className="ml-auto mb-2" style={{ maxHeight: "40px", maxWidth: "120px", objectFit: "contain" }} />
                  )}
                  <p className="font-semibold text-gray-700">{companyInfo?.company || "Your company"}</p>
                  {companyInfo?.vatNumber && <p>VAT: {companyInfo.vatNumber}</p>}
                  {companyInfo?.kvkNumber && <p>KVK: {companyInfo.kvkNumber}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pb-4 border-b border-gray-100">
                <div>
                  <p className="text-gray-400 uppercase" style={{ fontSize: "10px" }}>Factuurgegevens</p>
                  <p><strong>Datum:</strong> {form.date ? formatDate(form.date) : "—"}</p>
                  <p><strong>Due date:</strong> {form.dueDate ? formatDate(form.dueDate) : "—"}</p>
                </div>
                <div>
                  <p className="text-gray-400 uppercase" style={{ fontSize: "10px" }}>Customer</p>
                  <p className="font-semibold">{form.customerName || "—"}</p>
                  <p>{form.customerAddress || "—"}</p>
                </div>
              </div>

              <table className="w-full mb-4" style={{ fontSize: "11px" }}>
                <thead>
                  <tr className="text-gray-400 uppercase border-b border-gray-200" style={{ fontSize: "9px" }}>
                    <th className="text-left py-2">Description</th>
                    <th className="text-right py-2">Aantal</th>
                    <th className="text-right py-2">Prijs</th>
                    <th className="text-right py-2">VAT</th>
                    <th className="text-right py-2">Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2">{item.description || "—"}</td>
                      <td className="text-right py-2">{item.quantity}</td>
                      <td className="text-right py-2">{formatCurrency(item.unitPrice)}</td>
                      <td className="text-right py-2">{item.vatRate}%</td>
                      <td className="text-right py-2 font-medium">{formatCurrency(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="w-full sm:w-48 sm:ml-auto space-y-1" style={{ fontSize: "11px" }}>
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">VAT</span>
                  <span>{formatCurrency(vatAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
                  <span>Totaal</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              {form.notes && (
                <div className="mt-4 p-3 bg-gray-50 rounded text-gray-500" style={{ fontSize: "11px" }}>
                  <strong>Notes:</strong> {form.notes}
                </div>
              )}

              {companyInfo?.iban && (
                <div className="mt-4 pt-3 border-t border-gray-100 text-gray-400" style={{ fontSize: "10px" }}>
                  <p>Payment: {companyInfo.iban}{companyInfo.bankName ? ` (${companyInfo.bankName})` : ""} t.n.v. {companyInfo.accountHolder || companyInfo.company || ""}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showVoiceAssistant && (
        <VoiceInvoiceAssistant
          customers={customers}
          invoiceDate={form.date}
          invoiceNumber={form.invoiceNumber}
          companyInfo={companyInfo}
          calculateDueDate={calculateDueDate}
          onClose={() => setShowVoiceAssistant(false)}
          onCustomerSelected={(c) => handleSelectCustomer(c, false, false)}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])}
          onItemsReady={setItems}
          onDatesNotes={(date, dueDate, notes) => setForm((prev) => ({ ...prev, date, dueDate, notes }))}
          initialItems={items}
        />
      )}
    </div>
  );
}

export default function NewInvoice() {
  return (
    <Suspense>
      <NewInvoiceContent />
    </Suspense>
  );
}
