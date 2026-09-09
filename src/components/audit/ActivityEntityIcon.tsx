import SearchTypeIcon from "@/components/search/SearchTypeIcon";
import type { AuditEntity } from "@/lib/auditActivity";
import type { SearchResultType } from "@/lib/search";

// Entities that already have an icon in Global Search (Phase 5) reuse that
// exact icon — one visual language for "this is an invoice" everywhere in
// the app, instead of a second, slightly different invoice icon just for
// this page.
const ENTITY_TO_SEARCH_TYPE: Partial<Record<AuditEntity, SearchResultType>> = {
  Invoice: "invoice",
  Quotation: "quotation",
  PurchaseDocument: "purchase",
  BankTransaction: "bank_transaction",
  JournalEntry: "journal_entry",
  Customer: "customer",
  LedgerAccount: "ledger_account",
};

// The handful of entities with no Global Search equivalent get a small
// dedicated glyph, drawn in the same minimal outline style (viewBox 0 0 24
// 24, stroke-based) as SearchTypeIcon and the rest of the app's iconography.
const FALLBACK_PATHS: Partial<Record<AuditEntity, string>> = {
  ExceptionItem: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  User: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z",
  VatCode: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  RecurringInvoice: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  SystemSetting: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  CashTransaction: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
};

// Bg/text pairs, same convention as NotificationBell's CATEGORY_ICONS.
export const ENTITY_STYLE: Record<AuditEntity, { bg: string; text: string; dot: string }> = {
  Invoice: { bg: "bg-blue-100", text: "text-blue-600", dot: "bg-blue-500" },
  Quotation: { bg: "bg-purple-100", text: "text-purple-600", dot: "bg-purple-500" },
  PurchaseDocument: { bg: "bg-amber-100", text: "text-amber-600", dot: "bg-amber-500" },
  BankTransaction: { bg: "bg-green-100", text: "text-green-600", dot: "bg-green-500" },
  CashTransaction: { bg: "bg-emerald-100", text: "text-emerald-600", dot: "bg-emerald-500" },
  ExceptionItem: { bg: "bg-red-100", text: "text-red-600", dot: "bg-red-500" },
  JournalEntry: { bg: "bg-teal-100", text: "text-teal-600", dot: "bg-teal-500" },
  Customer: { bg: "bg-indigo-100", text: "text-indigo-600", dot: "bg-indigo-500" },
  User: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
  LedgerAccount: { bg: "bg-cyan-100", text: "text-cyan-600", dot: "bg-cyan-500" },
  VatCode: { bg: "bg-pink-100", text: "text-pink-600", dot: "bg-pink-500" },
  RecurringInvoice: { bg: "bg-orange-100", text: "text-orange-600", dot: "bg-orange-500" },
  SystemSetting: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
};

export default function ActivityEntityIcon({ entity, className = "w-4 h-4" }: { entity: AuditEntity; className?: string }) {
  const searchType = ENTITY_TO_SEARCH_TYPE[entity];
  if (searchType) return <SearchTypeIcon type={searchType} className={className} />;
  const d = FALLBACK_PATHS[entity];
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={d} />
    </svg>
  );
}
