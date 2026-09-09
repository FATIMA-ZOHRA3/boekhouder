"use client";

import { useState, useEffect, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Invoice, User } from "@/lib/data";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

const statusLabels: Record<string, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Expired",
  pending: "In afwachting", processing: "In verwerking", processed: "Processed",
  to_book: "To book", booked: "Booked",
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700", sent: "bg-blue-100 text-blue-700", paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700", pending: "bg-yellow-100 text-yellow-700",
    processing: "bg-blue-100 text-blue-700", processed: "bg-green-100 text-green-700",
    to_book: "bg-amber-100 text-amber-700", booked: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100"}`}>{statusLabels[status] || status}</span>;
}

const CATEGORIES = ["Revenue", "Cost of sales", "Bedrijfskosten", "Zakelijke dienstverlening", "Reis- en verblijfkosten", "Kantoorbenodigdheden", "Marketing", "Overig"];

function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

interface CustomerData {
  id: string; name: string; email: string | null; phone: string | null;
  address: string | null; vatNumber: string | null; city: string | null; postalCode: string | null;
}

interface VatCodeData {
  id: string; code: string; name: string; percentage: number; type: string;
  rubricCode: string | null; isActive: boolean;
}

interface LedgerAccountData {
  id: string; accountNumber: string; name: string; accountType: string; isActive: boolean;
  defaultVatCode: VatCodeData | null;
}

function InvoiceReviewInner({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromBoeken = searchParams.get("from") === "boeken";
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [clients, setClients] = useState<User[]>([]);
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // Debtor management state
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [relatedInvoices, setRelatedInvoices] = useState<Invoice[]>([]);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderEmail, setReminderEmail] = useState("");
  const [reminderSubject, setReminderSubject] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditLoading, setCreditLoading] = useState(false);

  // Editable factuurgegevens state
  const [editingDetails, setEditingDetails] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerAddress, setEditCustomerAddress] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  // Processing-focused state (Boeken)
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccountData[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [selectedLedger, setSelectedLedger] = useState("");
  const [vatCodes, setVatCodes] = useState<VatCodeData[]>([]);
  const [vatSearch, setVatSearch] = useState("");
  const [selectedVat, setSelectedVat] = useState("");
  const [bookingMode, setBookingMode] = useState<"invoice" | "line">("invoice");
  const [lineBookings, setLineBookings] = useState<Record<string, { ledger: string; ledgerSearch: string; vatCode: string; vatSearch: string }>>({});
  const [activeLineDrop, setActiveLineDrop] = useState<string | null>(null); // "ledger-{id}" or "vat-{id}"

  useEffect(() => {
    fetch(`/api/invoices/${id}`).then((r) => r.json()).then((inv) => {
      setInvoice(inv);
      setCategory(inv.category || "Revenue");
      if (inv.category) { setSelectedLedger(inv.category); setLedgerSearch(inv.category); }
      if (inv.vatType) { setSelectedVat(inv.vatType); setVatSearch(inv.vatType); }
      // Initialize line bookings from existing item data
      if (inv.items && Array.isArray(inv.items)) {
        const lb: Record<string, { ledger: string; ledgerSearch: string; vatCode: string; vatSearch: string }> = {};
        let hasLineData = false;
        for (const item of inv.items) {
          lb[item.id] = {
            ledger: item.category || "",
            ledgerSearch: item.category || "",
            vatCode: item.vatCode || "",
            vatSearch: item.vatCode || "",
          };
          if (item.category || item.vatCode) hasLineData = true;
        }
        setLineBookings(lb);
        if (hasLineData) setBookingMode("line");
      }
    });
    fetch("/api/clients").then((r) => r.json()).then(setClients);
    fetch("/api/ledger-accounts").then((r) => r.ok ? r.json() : []).then((d) => { if (Array.isArray(d)) setLedgerAccounts(d); }).catch(() => {});
    fetch("/api/vat-codes").then((r) => r.ok ? r.json() : []).then((d) => { if (Array.isArray(d)) setVatCodes(d); }).catch(() => {});
  }, [id]);

  // Fetch customer details and related invoices for debtor management
  useEffect(() => {
    if (!invoice) return;
    // Fetch customer contact details
    if (invoice.customerId) {
      fetch(`/api/customers/${invoice.customerId}`).then((r) => r.ok ? r.json() : null).then((c) => {
        if (c) setCustomer(c);
      }).catch(() => {});
    }
    // Fetch all invoices for this client to find related/duplicate invoices
    fetch(`/api/invoices?clientId=${invoice.clientId}`).then((r) => r.json()).then((allInvs: Invoice[]) => {
      if (!Array.isArray(allInvs)) return;
      // Related invoices for the same debtor
      const related = allInvs.filter((i) => i.customerName === invoice.customerName && i.id !== invoice.id);
      setRelatedInvoices(related);
      // Duplicate checks
      const warnings: string[] = [];
      const sameNumber = allInvs.filter((i) => i.invoiceNumber === invoice.invoiceNumber && i.id !== invoice.id);
      if (sameNumber.length > 0) warnings.push(`Invoice number "${invoice.invoiceNumber}" occurs ${sameNumber.length + 1}times.`);
      const similarAmount = related.filter((i) => Math.abs(i.total - invoice.total) < 0.01 && i.date === invoice.date && i.id !== invoice.id);
      if (similarAmount.length > 0) warnings.push(`${similarAmount.length} factuur/invoice(s) with exactly the same amount and date for this debtor.`);
      setDuplicateWarnings(warnings);
    }).catch(() => {});
  }, [invoice]);

  function getClient(clientId: string) {
    return clients.find((c) => c.id === clientId);
  }

  async function updateStatus(bookkeepingStatus: string) {
    setSaving(true);
    if (fromBoeken && bookingMode === "line") {
      // Line-level booking
      const lbArray = Object.entries(lineBookings).map(([itemId, lb]) => ({
        itemId,
        category: lb.ledger || null,
        vatCode: lb.vatCode || null,
      }));
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookkeepingStatus, category: "Booked per line", vatType: "Per line", lineBookings: lbArray }),
      });
      const updated = await res.json();
      setInvoice(updated);
    } else {
      // Invoice-level booking
      const cat = fromBoeken && selectedLedger ? selectedLedger : category;
      const vat = fromBoeken && selectedVat ? selectedVat : undefined;
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookkeepingStatus, category: cat, ...(vat && { vatType: vat }) }),
      });
      const updated = await res.json();
      setInvoice(updated);
    }
    setSaving(false);
  }

  function openReminderModal() {
    if (!invoice) return;
    setReminderEmail(customer?.email || "");
    setReminderSubject(`Reminder: Factuur ${invoice.invoiceNumber}`);
    setReminderMessage(`Dear Sir/Madam,\n\nWe would like to remind you of the outstanding invoice ${invoice.invoiceNumber} worth ${formatCurrency(invoice.total)}. The due date was ${formatDate(invoice.dueDate)}.\n\nWe kindly ask you to transfer the outstanding amount as soon as possible.\n\nKind regards`);
    setReminderSent(false);
    setShowReminderModal(true);
  }

  async function sendReminder() {
    if (!reminderEmail) return;
    setReminderSending(true);
    try {
      const res = await fetch(`/api/invoices/${id}/remind`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: reminderEmail, subject: reminderSubject, message: reminderMessage }),
      });
      if (res.ok) {
        setReminderSent(true);
        // Update local invoice reminder count
        if (invoice) setInvoice({ ...invoice, remindersSent: (invoice.remindersSent || 0) + 1 });
      }
    } catch { /* */ }
    finally { setReminderSending(false); }
  }

  async function createCreditInvoice() {
    setCreditLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}/credit`, { method: "POST" });
      if (res.ok) {
        const creditInv = await res.json();
        setShowCreditModal(false);
        router.push(`/bookkeeper/invoices/${creditInv.id}`);
      }
    } catch { /* */ }
    finally { setCreditLoading(false); }
  }

  function startEditingDetails() {
    if (!invoice) return;
    setEditDate(invoice.date);
    setEditDueDate(invoice.dueDate);
    setEditCustomerName(invoice.customerName);
    setEditCustomerAddress(invoice.customerAddress || "");
    setEditingDetails(true);
  }

  async function saveDetails() {
    if (!invoice) return;
    setSavingDetails(true);
    try {
      const body: Record<string, string> = {};
      if (editDate !== invoice.date) body.date = editDate;
      if (editDueDate !== invoice.dueDate) body.dueDate = editDueDate;
      if (editCustomerName !== invoice.customerName) body.customerName = editCustomerName;
      if (editCustomerAddress !== (invoice.customerAddress || "")) body.customerAddress = editCustomerAddress;
      if (Object.keys(body).length > 0) {
        const res = await fetch(`/api/invoices/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const updated = await res.json();
          setInvoice(updated);
        }
      }
      setEditingDetails(false);
    } catch { /* */ }
    finally { setSavingDetails(false); }
  }

  if (!invoice) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>;
  }

  const client = getClient(invoice.clientId);
  const isOverdueOrSent = invoice.status === "sent" || invoice.status === "overdue";
  const daysOverdue = (() => {
    const due = new Date(invoice.dueDate);
    const now = new Date();
    const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  })();

  // Searchable ledger helper with prefix-priority
  const filteredLedgerAccounts = (() => {
    const active = ledgerAccounts.filter((a: LedgerAccountData) => a.isActive);
    if (!ledgerSearch) return active.filter((a: LedgerAccountData) => a.accountType === "revenue");
    const s = ledgerSearch.toLowerCase();
    const matched = active.filter((a: LedgerAccountData) => a.accountNumber.startsWith(ledgerSearch) || a.name.toLowerCase().includes(s) || a.accountNumber.includes(ledgerSearch));
    return matched.sort((a, b) => {
      const aPrefix = a.accountNumber.startsWith(ledgerSearch) ? 0 : 1;
      const bPrefix = b.accountNumber.startsWith(ledgerSearch) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.accountNumber.localeCompare(b.accountNumber);
    });
  })();

  // VAT code filter
  const salesVatCodes = vatCodes.filter((v) => v.type === "sales" && v.isActive);
  const filteredVatCodes = (() => {
    if (!vatSearch) return salesVatCodes;
    const s = vatSearch.toLowerCase();
    return salesVatCodes.filter((v) => v.code.toLowerCase().includes(s) || v.name.toLowerCase().includes(s) || v.percentage.toString().includes(s));
  })();

  // Line-level filter helpers
  const activeAccounts = ledgerAccounts.filter((a) => a.isActive);
  function filterLedgerForLine(search: string) {
    if (!search) return activeAccounts.filter((a) => a.accountType === "revenue");
    const s = search.toLowerCase();
    const matched = activeAccounts.filter((a) => a.accountNumber.startsWith(search) || a.name.toLowerCase().includes(s) || a.accountNumber.includes(search));
    return matched.sort((a, b) => {
      const aP = a.accountNumber.startsWith(search) ? 0 : 1;
      const bP = b.accountNumber.startsWith(search) ? 0 : 1;
      return aP !== bP ? aP - bP : a.accountNumber.localeCompare(b.accountNumber);
    });
  }
  function filterVatForLine(search: string) {
    if (!search) return salesVatCodes;
    const s = search.toLowerCase();
    return salesVatCodes.filter((v) => v.code.toLowerCase().includes(s) || v.name.toLowerCase().includes(s) || v.percentage.toString().includes(s));
  }
  function updateLineLedger(itemId: string, field: string, value: string) {
    setLineBookings((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  }
  const hasMultipleLines = invoice ? invoice.items.length > 1 : false;
  const canBook = invoice?.bookkeepingStatus === "pending" || invoice?.bookkeepingStatus === "to_book" || invoice?.bookkeepingStatus === "processing";
  const allLinesFilled = bookingMode === "line" ? Object.values(lineBookings).every((lb) => lb.ledger) : !!selectedLedger;

  // ═══ PROCESSING-FOCUSED VIEW (from Boeken) ═══
  if (fromBoeken) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/bookkeeper?section=sales" className="text-[#2E6FA7] hover:text-[#12355B] text-sm font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Terug naar Boeken
              </Link>
              <div className="flex items-center gap-2">
                <StatusBadge status={invoice.bookkeepingStatus} />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-6 space-y-5">
          {/* Duplicate warnings */}
          {duplicateWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Mogelijke duplicaat / controle</p>
                  {duplicateWarnings.map((w, i) => <p key={i} className="text-sm text-amber-700 mt-0.5">{w}</p>)}
                </div>
              </div>
            </div>
          )}

          {/* Invoice header (processing-focused, no debtor actions) */}
          <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0E2A47]">{invoice.invoiceNumber}</h1>
                <p className="text-sm text-gray-500 mt-1">Customer: <strong>{client?.company || invoice.clientId}</strong> · Debtor: <strong>{invoice.customerName}</strong></p>
                {invoice.isCredit && <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Credit note</span>}
              </div>
              <div className="text-left sm:text-right">
                <p className="text-2xl sm:text-3xl font-bold text-[#0E2A47]">{formatCurrency(invoice.total)}</p>
              </div>
            </div>
          </div>

          {/* Invoice details grid — editable */}
          <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#0E2A47]">Factuurgegevens</h2>
              {!editingDetails ? (
                <button onClick={startEditingDetails} className="text-xs text-[#2E6FA7] hover:text-[#12355B] font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingDetails(false)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                  <button onClick={saveDetails} disabled={savingDetails} className="text-xs bg-[#2E6FA7] text-white px-3 py-1 rounded-lg font-medium hover:bg-[#245A87] disabled:opacity-50">
                    {savingDetails ? "Save..." : "Save"}
                  </button>
                </div>
              )}
            </div>
            {editingDetails ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <label className="text-gray-500 text-xs block mb-1">Factuurdatum</label>
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                </div>
                <div>
                  <label className="text-gray-500 text-xs block mb-1">Due date</label>
                  <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                </div>
                <div>
                  <label className="text-gray-500 text-xs block mb-1">Customer</label>
                  <input type="text" value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                </div>
                <div>
                  <label className="text-gray-500 text-xs block mb-1">Adres</label>
                  <input type="text" value={editCustomerAddress} onChange={(e) => setEditCustomerAddress(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs">Factuurdatum</p><p className="font-medium">{formatDate(invoice.date)}</p></div>
                <div><p className="text-gray-500 text-xs">Due date</p><p className="font-medium">{formatDate(invoice.dueDate)}</p></div>
                <div><p className="text-gray-500 text-xs">Customer</p><p className="font-medium">{invoice.customerName}</p></div>
                <div><p className="text-gray-500 text-xs">Adres</p><p className="font-medium text-xs">{invoice.customerAddress}</p></div>
              </div>
            )}
          </div>

          {/* ══ BOOKKEEPING PROCESSING ══ */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-[#2E6FA7]/20 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-semibold text-[#0E2A47] flex items-center gap-2">
                <svg className="w-5 h-5 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                Boekhouding verwerking
              </h2>
              {/* Mode toggle - only show for multi-line invoices */}
              {hasMultipleLines && canBook && (
                <div className="flex bg-gray-100 p-0.5 rounded-lg">
                  <button onClick={() => setBookingMode("invoice")}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${bookingMode === "invoice" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                    Full invoice
                  </button>
                  <button onClick={() => setBookingMode("line")}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${bookingMode === "line" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                    Per line
                  </button>
                </div>
              )}
            </div>

            {/* Current status bar */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
              <StatusBadge status={invoice.bookkeepingStatus} />
              {invoice.category && <span className="text-xs text-gray-400">{invoice.category}</span>}
              {invoice.vatType && <span className="text-xs text-blue-500">VAT: {invoice.vatType}</span>}
            </div>

            {/* ── INVOICE-LEVEL BOOKING ── */}
            {bookingMode === "invoice" && (
              <>
                {/* Invoice lines (read-only) */}
                <div className="mb-5 overflow-hidden rounded-lg border border-gray-100">
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50">
                        <th className="px-4 py-2 font-medium">Description</th><th className="px-3 py-2 font-medium text-right">Aantal</th>
                        <th className="px-3 py-2 font-medium text-right">Prijs</th><th className="px-3 py-2 font-medium text-right">VAT</th>
                        <th className="px-3 py-2 font-medium text-right">Totaal</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {invoice.items.map((item, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-700">{item.description}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{item.quantity}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{item.vatRate}%</td>
                            <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.quantity * item.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile lines */}
                  <div className="md:hidden divide-y divide-gray-50">
                    {invoice.items.map((item, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <p className="text-xs text-gray-700 font-medium">{item.description}</p>
                        <div className="flex justify-between text-[11px] text-gray-500 mt-0.5">
                          <span>{item.quantity} x {formatCurrency(item.unitPrice)} · {item.vatRate}%</span>
                          <span className="font-medium text-gray-700">{formatCurrency(item.quantity * item.unitPrice)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-200 px-4 py-2.5 bg-gray-50">
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">VAT</span><span>{formatCurrency(invoice.vatAmount)}</span></div>
                    <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-1 mt-1"><span>Totaal</span><span>{formatCurrency(invoice.total)}</span></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  {/* Ledger account */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Ledger account</label>
                    <div className="relative">
                      <input type="text" value={ledgerSearch}
                        onChange={(e) => { setLedgerSearch(e.target.value); setSelectedLedger(""); }}
                        placeholder="Type number or name..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                      {ledgerSearch && !selectedLedger && filteredLedgerAccounts.length > 0 && (
                        <div className="absolute z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {filteredLedgerAccounts.slice(0, 15).map((a: LedgerAccountData) => (
                            <button key={a.id} type="button"
                              onClick={() => {
                                setSelectedLedger(`${a.accountNumber} ${a.name}`);
                                setLedgerSearch(`${a.accountNumber} - ${a.name}`);
                                if (a.defaultVatCode && !selectedVat) {
                                  setSelectedVat(`${a.defaultVatCode.code} ${a.defaultVatCode.name} ${a.defaultVatCode.percentage}%`);
                                  setVatSearch(`${a.defaultVatCode.code} - ${a.defaultVatCode.name} (${a.defaultVatCode.percentage}%)`);
                                }
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-2 border-b border-gray-50 last:border-0">
                              <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{a.accountNumber}</span>
                              <span className="text-gray-700 truncate">{a.name}</span>
                              {a.defaultVatCode && <span className="ml-auto text-[10px] text-gray-400 shrink-0">{a.defaultVatCode.code}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedLedger && <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{selectedLedger}</p>}
                  </div>
                  {/* VAT code */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">VAT-code</label>
                    <div className="relative">
                      <input type="text" value={vatSearch}
                        onChange={(e) => { setVatSearch(e.target.value); setSelectedVat(""); }}
                        placeholder="Search VAT code..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                      {vatSearch && !selectedVat && filteredVatCodes.length > 0 && (
                        <div className="absolute z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {filteredVatCodes.map((v) => (
                            <button key={v.id} type="button"
                              onClick={() => { setSelectedVat(`${v.code} ${v.name} ${v.percentage}%`); setVatSearch(`${v.code} - ${v.name} (${v.percentage}%)`); }}
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-2 border-b border-gray-50 last:border-0">
                              <span className="font-mono text-xs text-blue-600 w-12 shrink-0">{v.code}</span>
                              <span className="text-gray-700 truncate">{v.name}</span>
                              <span className="ml-auto text-xs text-gray-400 shrink-0">{v.percentage}%</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedVat && <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{selectedVat}</p>}
                  </div>
                </div>

                {/* Booking preview */}
                {selectedLedger && canBook && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 space-y-0.5">
                    <p className="text-xs text-emerald-800"><span className="font-medium">{invoice.invoiceNumber}</span> is booked on <span className="font-medium">{selectedLedger}</span> · Amount: <span className="font-medium">{formatCurrency(invoice.total)}</span></p>
                    {selectedVat && <p className="text-xs text-emerald-700">VAT-code: <span className="font-medium">{selectedVat}</span></p>}
                  </div>
                )}
              </>
            )}

            {/* ── LINE-LEVEL BOOKING ── */}
            {bookingMode === "line" && (
              <>
                <p className="text-xs text-gray-500 mb-3">Choose a general ledger account and VAT code per invoice line.</p>

                {/* Desktop: table with inline fields */}
                <div className="hidden md:block mb-5 overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2.5 font-medium">Description</th>
                      <th className="px-3 py-2.5 font-medium text-right w-20">Amount</th>
                      <th className="px-3 py-2.5 font-medium text-right w-14">VAT%</th>
                      <th className="px-3 py-2.5 font-medium w-56">Ledger account</th>
                      <th className="px-3 py-2.5 font-medium w-44">VAT-code</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoice.items.map((item) => {
                        const lb = lineBookings[item.id] || { ledger: "", ledgerSearch: "", vatCode: "", vatSearch: "" };
                        const lineLedgerResults = filterLedgerForLine(lb.ledgerSearch);
                        const lineVatResults = filterVatForLine(lb.vatSearch);
                        const lineTotal = item.quantity * item.unitPrice;
                        return (
                          <tr key={item.id} className="align-top">
                            <td className="px-4 py-3">
                              <p className="text-sm text-gray-800 font-medium">{item.description}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                            </td>
                            <td className="px-3 py-3 text-right text-sm font-medium">{formatCurrency(lineTotal)}</td>
                            <td className="px-3 py-3 text-right text-gray-500">{item.vatRate}%</td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <input type="text" value={lb.ledgerSearch}
                                  onChange={(e) => { updateLineLedger(item.id, "ledgerSearch", e.target.value); updateLineLedger(item.id, "ledger", ""); setActiveLineDrop(`ledger-${item.id}`); }}
                                  onFocus={() => setActiveLineDrop(`ledger-${item.id}`)}
                                  onBlur={() => setTimeout(() => setActiveLineDrop(null), 200)}
                                  placeholder="Account..."
                                  className={`w-full border rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#2E6FA7]/30 ${lb.ledger ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`} />
                                {activeLineDrop === `ledger-${item.id}` && lb.ledgerSearch && !lb.ledger && lineLedgerResults.length > 0 && (
                                  <div className="absolute z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                    {lineLedgerResults.slice(0, 12).map((a) => (
                                      <button key={a.id} type="button" onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updateLineLedger(item.id, "ledger", `${a.accountNumber} ${a.name}`);
                                          updateLineLedger(item.id, "ledgerSearch", `${a.accountNumber} - ${a.name}`);
                                          if (a.defaultVatCode && !lb.vatCode) {
                                            updateLineLedger(item.id, "vatCode", `${a.defaultVatCode.code} ${a.defaultVatCode.name} ${a.defaultVatCode.percentage}%`);
                                            updateLineLedger(item.id, "vatSearch", `${a.defaultVatCode.code} - ${a.defaultVatCode.name} (${a.defaultVatCode.percentage}%)`);
                                          }
                                          setActiveLineDrop(null);
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2">
                                        <span className="font-mono text-gray-400 w-10 shrink-0">{a.accountNumber}</span>
                                        <span className="text-gray-700 truncate">{a.name}</span>
                                        {a.defaultVatCode && <span className="ml-auto text-[10px] text-gray-400 shrink-0">{a.defaultVatCode.code}</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="relative">
                                <input type="text" value={lb.vatSearch}
                                  onChange={(e) => { updateLineLedger(item.id, "vatSearch", e.target.value); updateLineLedger(item.id, "vatCode", ""); setActiveLineDrop(`vat-${item.id}`); }}
                                  onFocus={() => setActiveLineDrop(`vat-${item.id}`)}
                                  onBlur={() => setTimeout(() => setActiveLineDrop(null), 200)}
                                  placeholder="VAT..."
                                  className={`w-full border rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#2E6FA7]/30 ${lb.vatCode ? "border-blue-300 bg-blue-50" : "border-gray-200"}`} />
                                {activeLineDrop === `vat-${item.id}` && lb.vatSearch && !lb.vatCode && lineVatResults.length > 0 && (
                                  <div className="absolute z-50 w-60 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                    {lineVatResults.map((v) => (
                                      <button key={v.id} type="button" onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updateLineLedger(item.id, "vatCode", `${v.code} ${v.name} ${v.percentage}%`);
                                          updateLineLedger(item.id, "vatSearch", `${v.code} - ${v.name} (${v.percentage}%)`);
                                          setActiveLineDrop(null);
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2">
                                        <span className="font-mono text-blue-600 w-12 shrink-0">{v.code}</span>
                                        <span className="text-gray-700 truncate">{v.name}</span>
                                        <span className="ml-auto text-gray-400 shrink-0">{v.percentage}%</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="border-t border-gray-200 px-4 py-2.5 bg-gray-50 flex justify-between text-sm font-bold">
                    <span>Totaal</span><span>{formatCurrency(invoice.total)}</span>
                  </div>
                </div>

                {/* Mobile: stacked cards with inline fields */}
                <div className="md:hidden space-y-3 mb-5">
                  {invoice.items.map((item) => {
                    const lb = lineBookings[item.id] || { ledger: "", ledgerSearch: "", vatCode: "", vatSearch: "" };
                    const lineLedgerResults = filterLedgerForLine(lb.ledgerSearch);
                    const lineVatResults = filterVatForLine(lb.vatSearch);
                    const lineTotal = item.quantity * item.unitPrice;
                    return (
                      <div key={item.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800">{item.description}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{item.quantity} x {formatCurrency(item.unitPrice)} · {item.vatRate}% VAT</p>
                          </div>
                          <p className="text-sm font-bold text-[#0E2A47] shrink-0">{formatCurrency(lineTotal)}</p>
                        </div>
                        {/* Line ledger */}
                        <div>
                          <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Ledger account</label>
                          <div className="relative">
                            <input type="text" value={lb.ledgerSearch}
                              onChange={(e) => { updateLineLedger(item.id, "ledgerSearch", e.target.value); updateLineLedger(item.id, "ledger", ""); setActiveLineDrop(`ledger-${item.id}`); }}
                              onFocus={() => setActiveLineDrop(`ledger-${item.id}`)}
                              onBlur={() => setTimeout(() => setActiveLineDrop(null), 200)}
                              placeholder="Type number or name..."
                              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2E6FA7]/30 ${lb.ledger ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`} />
                            {activeLineDrop === `ledger-${item.id}` && lb.ledgerSearch && !lb.ledger && lineLedgerResults.length > 0 && (
                              <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                {lineLedgerResults.slice(0, 10).map((a) => (
                                  <button key={a.id} type="button" onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      updateLineLedger(item.id, "ledger", `${a.accountNumber} ${a.name}`);
                                      updateLineLedger(item.id, "ledgerSearch", `${a.accountNumber} - ${a.name}`);
                                      if (a.defaultVatCode && !lb.vatCode) {
                                        updateLineLedger(item.id, "vatCode", `${a.defaultVatCode.code} ${a.defaultVatCode.name} ${a.defaultVatCode.percentage}%`);
                                        updateLineLedger(item.id, "vatSearch", `${a.defaultVatCode.code} - ${a.defaultVatCode.name} (${a.defaultVatCode.percentage}%)`);
                                      }
                                      setActiveLineDrop(null);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                                    <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{a.accountNumber}</span>
                                    <span className="text-gray-700 truncate">{a.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Line VAT */}
                        <div>
                          <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">VAT-code</label>
                          <div className="relative">
                            <input type="text" value={lb.vatSearch}
                              onChange={(e) => { updateLineLedger(item.id, "vatSearch", e.target.value); updateLineLedger(item.id, "vatCode", ""); setActiveLineDrop(`vat-${item.id}`); }}
                              onFocus={() => setActiveLineDrop(`vat-${item.id}`)}
                              onBlur={() => setTimeout(() => setActiveLineDrop(null), 200)}
                              placeholder="Search VAT code..."
                              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2E6FA7]/30 ${lb.vatCode ? "border-blue-300 bg-blue-50" : "border-gray-200"}`} />
                            {activeLineDrop === `vat-${item.id}` && lb.vatSearch && !lb.vatCode && lineVatResults.length > 0 && (
                              <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                {lineVatResults.map((v) => (
                                  <button key={v.id} type="button" onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      updateLineLedger(item.id, "vatCode", `${v.code} ${v.name} ${v.percentage}%`);
                                      updateLineLedger(item.id, "vatSearch", `${v.code} - ${v.name} (${v.percentage}%)`);
                                      setActiveLineDrop(null);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                                    <span className="font-mono text-xs text-blue-600 w-12 shrink-0">{v.code}</span>
                                    <span className="text-gray-700 truncate">{v.name}</span>
                                    <span className="ml-auto text-xs text-gray-400 shrink-0">{v.percentage}%</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="border border-gray-200 rounded-lg px-4 py-2.5 bg-gray-50 flex justify-between text-sm font-bold">
                    <span>Totaal</span><span>{formatCurrency(invoice.total)}</span>
                  </div>
                </div>

                {/* Per-line booking overview */}
                {allLinesFilled && canBook && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                    <p className="text-[10px] text-emerald-700 uppercase tracking-wider font-medium mb-2">Entry overview per line</p>
                    <div className="space-y-1">
                      {invoice.items.map((item) => {
                        const lb = lineBookings[item.id];
                        return (
                          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-1 text-xs text-emerald-800 py-1 border-b border-emerald-200/50 last:border-0">
                            <span className="font-medium min-w-0 truncate sm:w-1/4">{item.description}</span>
                            <span className="text-emerald-600 sm:w-1/4 truncate">{lb?.ledger || "—"}</span>
                            <span className="text-blue-600 sm:w-1/4 truncate">{lb?.vatCode || "—"}</span>
                            <span className="font-medium sm:w-1/4 sm:text-right">{formatCurrency(item.quantity * item.unitPrice)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {invoice.notes && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500 mb-0.5">Notes</p><p className="text-sm">{invoice.notes}</p></div>
            )}

            <div className="flex flex-wrap gap-2">
              {canBook && (
                <button onClick={() => updateStatus("booked")} disabled={saving || !allLinesFilled}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {saving ? "Boeken..." : bookingMode === "line" ? `${invoice.items.length} lines to book` : "Book invoice"}
                </button>
              )}
              {(invoice.bookkeepingStatus === "booked" || invoice.bookkeepingStatus === "processed") && (
                <button onClick={() => updateStatus("to_book")} disabled={saving} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Heropenen</button>
              )}
              <button onClick={() => router.push("/bookkeeper?section=sales")} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">Back to overview</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ═══ DEBTOR MANAGEMENT VIEW (from Accounts receivable) ═══
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/bookkeeper?section=sales" className="text-[#2E6FA7] hover:text-[#12355B] text-sm font-medium">&larr; Back to Sales</Link>
            <div className="flex items-center gap-2">
              <StatusBadge status={invoice.status} />
              <StatusBadge status={invoice.bookkeepingStatus} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-6 space-y-5">
        {/* Duplicate warnings */}
        {duplicateWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">Mogelijke duplicaat / controle</p>
                {duplicateWarnings.map((w, i) => <p key={i} className="text-sm text-amber-700 mt-0.5">{w}</p>)}
              </div>
            </div>
          </div>
        )}

        {/* Invoice header + quick actions */}
        <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-5">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0E2A47]">{invoice.invoiceNumber}</h1>
              <p className="text-sm text-gray-500 mt-1">Or: <strong>{client?.company || invoice.clientId}</strong></p>
              {invoice.isCredit && <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Credit note</span>}
            </div>
            <div className="text-left sm:text-right">
              <p className="text-2xl sm:text-3xl font-bold text-[#0E2A47]">{formatCurrency(invoice.total)}</p>
              {daysOverdue > 0 && isOverdueOrSent && <p className="text-xs text-red-500 mt-1">{daysOverdue} days past due date</p>}
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
            {isOverdueOrSent && (
              <button onClick={openReminderModal} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Send reminder
              </button>
            )}
            {!invoice.isCredit && (
              <button onClick={() => setShowCreditModal(true)} className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                Create credit note
              </button>
            )}
            <Link href={`/bookkeeper/invoices/${id}`} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              Vernewen
            </Link>
          </div>
          {invoice.remindersSent > 0 && (
            <p className="text-xs text-gray-400 mt-3">{invoice.remindersSent} reminder(s) sent</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column: invoice details */}
          <div className="lg:col-span-2 space-y-5">
            {/* Invoice info grid — editable */}
            <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#0E2A47]">Factuurgegevens</h2>
                {!editingDetails ? (
                  <button onClick={startEditingDetails} className="text-xs text-[#2E6FA7] hover:text-[#12355B] font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditingDetails(false)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                    <button onClick={saveDetails} disabled={savingDetails} className="text-xs bg-[#2E6FA7] text-white px-3 py-1 rounded-lg font-medium hover:bg-[#245A87] disabled:opacity-50">
                      {savingDetails ? "Save..." : "Save"}
                    </button>
                  </div>
                )}
              </div>
              {editingDetails ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Factuurdatum</label>
                    <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Due date</label>
                    <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Customer</label>
                    <input type="text" value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Adres</label>
                    <input type="text" value={editCustomerAddress} onChange={(e) => setEditCustomerAddress(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-gray-500 text-xs">Factuurdatum</p><p className="font-medium">{formatDate(invoice.date)}</p></div>
                  <div><p className="text-gray-500 text-xs">Due date</p><p className="font-medium">{formatDate(invoice.dueDate)}</p></div>
                  <div><p className="text-gray-500 text-xs">Customer</p><p className="font-medium">{invoice.customerName}</p></div>
                  <div><p className="text-gray-500 text-xs">Adres</p><p className="font-medium text-xs">{invoice.customerAddress}</p></div>
                </div>
              )}
            </div>

            {/* Invoice lines */}
            <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100"><h2 className="text-sm font-semibold text-[#0E2A47]">Factuurregels</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-2.5 font-medium">Description</th><th className="px-3 py-2.5 font-medium text-right">Aantal</th>
                    <th className="px-3 py-2.5 font-medium text-right">Prijs</th><th className="px-3 py-2.5 font-medium text-right">VAT</th>
                    <th className="px-3 py-2.5 font-medium text-right">Totaal</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoice.items.map((item, i) => (
                      <tr key={i}>
                        <td className="px-5 py-3 text-sm">{item.description}</td>
                        <td className="px-3 py-3 text-sm text-right">{item.quantity}</td>
                        <td className="px-3 py-3 text-sm text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-3 py-3 text-sm text-right text-gray-500">{item.vatRate}%</td>
                        <td className="px-3 py-3 text-sm text-right font-medium">{formatCurrency(item.quantity * item.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-200 p-5">
                <div className="w-56 ml-auto space-y-1.5">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">VAT</span><span>{formatCurrency(invoice.vatAmount)}</span></div>
                  <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-1.5"><span>Totaal</span><span>{formatCurrency(invoice.total)}</span></div>
                </div>
              </div>
            </div>

            {/* Bookkeeping processing — with ledger/VAT search */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-[#2E6FA7]/20 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-semibold text-[#0E2A47] flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#2E6FA7]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  Boekhouding verwerking
                </h2>
                {/* Mode toggle for multi-line invoices */}
                {hasMultipleLines && canBook && (
                  <div className="flex bg-gray-100 p-0.5 rounded-lg">
                    <button onClick={() => setBookingMode("invoice")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${bookingMode === "invoice" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                      Full invoice
                    </button>
                    <button onClick={() => setBookingMode("line")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${bookingMode === "line" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                      Per line
                    </button>
                  </div>
                )}
              </div>

              {/* Current status */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                <StatusBadge status={invoice.bookkeepingStatus} />
                {invoice.category && <span className="text-xs text-gray-400">{invoice.category}</span>}
                {invoice.vatType && <span className="text-xs text-blue-500">VAT: {invoice.vatType}</span>}
              </div>

              {/* Invoice-level booking */}
              {bookingMode === "invoice" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {/* Ledger account search */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Ledger account</label>
                    <div className="relative">
                      <input type="text" value={ledgerSearch}
                        onChange={(e) => { setLedgerSearch(e.target.value); setSelectedLedger(""); }}
                        placeholder="Type number or name..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                      {ledgerSearch && !selectedLedger && filteredLedgerAccounts.length > 0 && (
                        <div className="absolute z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {filteredLedgerAccounts.slice(0, 15).map((a: LedgerAccountData) => (
                            <button key={a.id} type="button"
                              onClick={() => {
                                setSelectedLedger(`${a.accountNumber} ${a.name}`);
                                setLedgerSearch(`${a.accountNumber} - ${a.name}`);
                                if (a.defaultVatCode && !selectedVat) {
                                  setSelectedVat(`${a.defaultVatCode.code} ${a.defaultVatCode.name} ${a.defaultVatCode.percentage}%`);
                                  setVatSearch(`${a.defaultVatCode.code} - ${a.defaultVatCode.name} (${a.defaultVatCode.percentage}%)`);
                                }
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-2 border-b border-gray-50 last:border-0">
                              <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{a.accountNumber}</span>
                              <span className="text-gray-700 truncate">{a.name}</span>
                              {a.defaultVatCode && <span className="ml-auto text-[10px] text-gray-400 shrink-0">{a.defaultVatCode.code}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedLedger && <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{selectedLedger}</p>}
                  </div>
                  {/* VAT code search */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">VAT-code</label>
                    <div className="relative">
                      <input type="text" value={vatSearch}
                        onChange={(e) => { setVatSearch(e.target.value); setSelectedVat(""); }}
                        placeholder="Search VAT code..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2E6FA7]/30 outline-none" />
                      {vatSearch && !selectedVat && filteredVatCodes.length > 0 && (
                        <div className="absolute z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {filteredVatCodes.map((v) => (
                            <button key={v.id} type="button"
                              onClick={() => { setSelectedVat(`${v.code} ${v.name} ${v.percentage}%`); setVatSearch(`${v.code} - ${v.name} (${v.percentage}%)`); }}
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-2 border-b border-gray-50 last:border-0">
                              <span className="font-mono text-xs text-blue-600 w-12 shrink-0">{v.code}</span>
                              <span className="text-gray-700 truncate">{v.name}</span>
                              <span className="ml-auto text-xs text-gray-400 shrink-0">{v.percentage}%</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedVat && <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{selectedVat}</p>}
                  </div>
                </div>
              )}

              {/* Line-level booking */}
              {bookingMode === "line" && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-3">Choose a general ledger account and VAT code per invoice line.</p>
                  <div className="space-y-3">
                    {invoice.items.map((item) => {
                      const lb = lineBookings[item.id] || { ledger: "", ledgerSearch: "", vatCode: "", vatSearch: "" };
                      const lineLedgerResults = filterLedgerForLine(lb.ledgerSearch);
                      const lineVatResults = filterVatForLine(lb.vatSearch);
                      const lineTotal = item.quantity * item.unitPrice;
                      return (
                        <div key={item.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                          <div className="flex justify-between items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800">{item.description}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{item.quantity} x {formatCurrency(item.unitPrice)} · {item.vatRate}% VAT</p>
                            </div>
                            <p className="text-sm font-bold text-[#0E2A47] shrink-0">{formatCurrency(lineTotal)}</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Ledger account</label>
                              <div className="relative">
                                <input type="text" value={lb.ledgerSearch}
                                  onChange={(e) => { updateLineLedger(item.id, "ledgerSearch", e.target.value); updateLineLedger(item.id, "ledger", ""); setActiveLineDrop(`ledger-${item.id}`); }}
                                  onFocus={() => setActiveLineDrop(`ledger-${item.id}`)}
                                  onBlur={() => setTimeout(() => setActiveLineDrop(null), 200)}
                                  placeholder="Type number or name..."
                                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2E6FA7]/30 ${lb.ledger ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`} />
                                {activeLineDrop === `ledger-${item.id}` && lb.ledgerSearch && !lb.ledger && lineLedgerResults.length > 0 && (
                                  <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                    {lineLedgerResults.slice(0, 10).map((a) => (
                                      <button key={a.id} type="button" onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updateLineLedger(item.id, "ledger", `${a.accountNumber} ${a.name}`);
                                          updateLineLedger(item.id, "ledgerSearch", `${a.accountNumber} - ${a.name}`);
                                          if (a.defaultVatCode && !lb.vatCode) {
                                            updateLineLedger(item.id, "vatCode", `${a.defaultVatCode.code} ${a.defaultVatCode.name} ${a.defaultVatCode.percentage}%`);
                                            updateLineLedger(item.id, "vatSearch", `${a.defaultVatCode.code} - ${a.defaultVatCode.name} (${a.defaultVatCode.percentage}%)`);
                                          }
                                          setActiveLineDrop(null);
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                                        <span className="font-mono text-xs text-gray-400 w-10 shrink-0">{a.accountNumber}</span>
                                        <span className="text-gray-700 truncate">{a.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">VAT-code</label>
                              <div className="relative">
                                <input type="text" value={lb.vatSearch}
                                  onChange={(e) => { updateLineLedger(item.id, "vatSearch", e.target.value); updateLineLedger(item.id, "vatCode", ""); setActiveLineDrop(`vat-${item.id}`); }}
                                  onFocus={() => setActiveLineDrop(`vat-${item.id}`)}
                                  onBlur={() => setTimeout(() => setActiveLineDrop(null), 200)}
                                  placeholder="Search VAT code..."
                                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#2E6FA7]/30 ${lb.vatCode ? "border-blue-300 bg-blue-50" : "border-gray-200"}`} />
                                {activeLineDrop === `vat-${item.id}` && lb.vatSearch && !lb.vatCode && lineVatResults.length > 0 && (
                                  <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                    {lineVatResults.map((v) => (
                                      <button key={v.id} type="button" onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updateLineLedger(item.id, "vatCode", `${v.code} ${v.name} ${v.percentage}%`);
                                          updateLineLedger(item.id, "vatSearch", `${v.code} - ${v.name} (${v.percentage}%)`);
                                          setActiveLineDrop(null);
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                                        <span className="font-mono text-xs text-blue-600 w-12 shrink-0">{v.code}</span>
                                        <span className="text-gray-700 truncate">{v.name}</span>
                                        <span className="ml-auto text-xs text-gray-400 shrink-0">{v.percentage}%</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Booking preview */}
              {bookingMode === "invoice" && selectedLedger && canBook && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 space-y-0.5">
                  <p className="text-xs text-emerald-800"><span className="font-medium">{invoice.invoiceNumber}</span> is booked on <span className="font-medium">{selectedLedger}</span> · Amount: <span className="font-medium">{formatCurrency(invoice.total)}</span></p>
                  {selectedVat && <p className="text-xs text-emerald-700">VAT-code: <span className="font-medium">{selectedVat}</span></p>}
                </div>
              )}

              {/* Per-line overview */}
              {bookingMode === "line" && allLinesFilled && canBook && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                  <p className="text-[10px] text-emerald-700 uppercase tracking-wider font-medium mb-2">Entry overview per line</p>
                  <div className="space-y-1">
                    {invoice.items.map((item) => {
                      const lb = lineBookings[item.id];
                      return (
                        <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-1 text-xs text-emerald-800 py-1 border-b border-emerald-200/50 last:border-0">
                          <span className="font-medium min-w-0 truncate sm:w-1/4">{item.description}</span>
                          <span className="text-emerald-600 sm:w-1/4 truncate">{lb?.ledger || "—"}</span>
                          <span className="text-blue-600 sm:w-1/4 truncate">{lb?.vatCode || "—"}</span>
                          <span className="font-medium sm:w-1/4 sm:text-right">{formatCurrency(item.quantity * item.unitPrice)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {invoice.notes && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500 mb-0.5">Notes</p><p className="text-sm">{invoice.notes}</p></div>
              )}

              <div className="flex flex-wrap gap-2">
                {canBook && (
                  <button onClick={() => updateStatus("booked")} disabled={saving || !allLinesFilled}
                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {saving ? "Boeken..." : bookingMode === "line" ? `${invoice.items.length} lines to book` : "Book invoice"}
                  </button>
                )}
                {(invoice.bookkeepingStatus === "booked" || invoice.bookkeepingStatus === "processed") && (
                  <button onClick={() => updateStatus("to_book")} disabled={saving} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Heropenen</button>
                )}
                <button onClick={() => router.push("/bookkeeper?section=sales")} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">Back to overview</button>
              </div>
            </div>
          </div>

          {/* Right column: debtor info + related invoices */}
          <div className="space-y-5">
            {/* Debtor contact card */}
            <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
              <h2 className="text-sm font-semibold text-[#0E2A47] mb-3">Debiteurgegevens</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Name</p>
                  <p className="text-sm font-medium">{invoice.customerName}</p>
                </div>
                {customer?.email && (
                  <div>
                    <p className="text-xs text-gray-500">E-mail</p>
                    <a href={`mailto:${customer.email}`} className="text-sm text-[#2E6FA7] hover:text-[#12355B] font-medium">{customer.email}</a>
                  </div>
                )}
                {customer?.phone && (
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <a href={`tel:${customer.phone}`} className="text-sm text-[#2E6FA7] hover:text-[#12355B] font-medium flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      {customer.phone}
                    </a>
                  </div>
                )}
                {customer?.address && (
                  <div>
                    <p className="text-xs text-gray-500">Adres</p>
                    <p className="text-sm text-gray-700">{customer.address}{customer.postalCode ? `, ${customer.postalCode}` : ""}{customer.city ? ` ${customer.city}` : ""}</p>
                  </div>
                )}
                {customer?.vatNumber && (
                  <div>
                    <p className="text-xs text-gray-500">VAT-nummer</p>
                    <p className="text-sm font-mono text-gray-700">{customer.vatNumber}</p>
                  </div>
                )}
                {!customer && (
                  <p className="text-xs text-gray-400">No debtor data available. The debtor may not be linked to a customer record.</p>
                )}
              </div>
            </div>

            {/* Client info */}
            {client && (
              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
                <h2 className="text-sm font-semibold text-[#0E2A47] mb-3">Customer (billed to)</h2>
                <div className="space-y-2 text-sm">
                  <div><span className="text-xs text-gray-500">Company</span><p className="font-medium">{client.company}</p></div>
                  <div><span className="text-xs text-gray-500">Contact person</span><p>{client.name}</p></div>
                  {client.phone && <div><span className="text-xs text-gray-500">Phone</span><p><a href={`tel:${client.phone}`} className="text-[#2E6FA7]">{client.phone}</a></p></div>}
                </div>
              </div>
            )}

            {/* Related invoices for this debtor */}
            {relatedInvoices.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
                <h2 className="text-sm font-semibold text-[#0E2A47] mb-3">Andere invoices for {invoice.customerName}</h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {relatedInvoices.slice(0, 10).map((ri) => (
                    <Link key={ri.id} href={`/bookkeeper/invoices/${ri.id}`} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#12355B]">{ri.invoiceNumber}</p>
                        <p className="text-[10px] text-gray-400">{formatDate(ri.date)}</p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <span className="text-xs font-medium">{formatCurrency(ri.total)}</span>
                        <StatusBadge status={ri.status} />
                      </div>
                    </Link>
                  ))}
                  {relatedInvoices.length > 10 && <p className="text-xs text-gray-400 text-center">+{relatedInvoices.length - 10} meer</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Reminder modal */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReminderModal(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#0E2A47]">Send reminder</h3>
              <button onClick={() => setShowReminderModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            {reminderSent ? (
              <div className="p-6 text-center">
                <svg className="w-12 h-12 text-emerald-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm font-medium text-gray-700">Reminder sent!</p>
                <button onClick={() => setShowReminderModal(false)} className="mt-4 px-4 py-2 bg-[#2E6FA7] text-white rounded-lg text-sm font-medium hover:bg-[#245A87]">Close</button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">To (email address)</label>
                  <input type="email" value={reminderEmail} onChange={(e) => setReminderEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6FA7]/30" placeholder="email@customer.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Onderwerp</label>
                  <input type="text" value={reminderSubject} onChange={(e) => setReminderSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6FA7]/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bericht</label>
                  <textarea value={reminderMessage} onChange={(e) => setReminderMessage(e.target.value)} rows={6}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6FA7]/30 resize-none" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowReminderModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                  <button onClick={sendReminder} disabled={reminderSending || !reminderEmail}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
                    {reminderSending ? "Send..." : "Send reminder"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Credit invoice confirmation modal */}
      {showCreditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreditModal(false)}>
          <div className="bg-white rounded-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-[#0E2A47]">Create credit note</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Are you sure you want to create a credit invoice for invoice <strong>{invoice.invoiceNumber}</strong>?</p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Original amount</span><span className="font-medium">{formatCurrency(invoice.total)}</span></div>
                <div className="flex justify-between mt-1"><span className="text-gray-500">Credit amount</span><span className="font-medium text-red-600">-{formatCurrency(invoice.total)}</span></div>
              </div>
              <p className="text-xs text-gray-400">The credit invoice will be created as a draft. You can then edit and send it.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreditModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={createCreditInvoice} disabled={creditLoading}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50">
                  {creditLoading ? "Creating..." : "Create credit note"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvoiceReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><InvoiceReviewInner id={id} /></Suspense>;
}
