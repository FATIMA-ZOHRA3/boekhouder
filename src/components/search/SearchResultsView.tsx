"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useGlobalSearch } from "./useGlobalSearch";
import SearchResultRow from "./SearchResultRow";
import SearchTypeIcon from "./SearchTypeIcon";
import { SEARCH_TYPE_ORDER, SEARCH_TYPE_LABEL, type SearchResultType } from "@/lib/search";
import { Card, PageHeader, EmptyState, ErrorState } from "@/components/ui/Card";

// Real status vocabularies, copied from the existing per-entity detail pages
// (bookkeeper/invoices/[id], client/invoices/[id]/view, client/quotations/[id]/view)
// and the schema's own inline comments for purchase/bank/journal — not
// invented. Only shown once a single type is selected, since the values
// mean different things per entity (Step 10: "do not add unnecessary
// filters" — a single cross-entity status dropdown would mostly be wrong).
const STATUS_OPTIONS: Partial<Record<SearchResultType, { value: string; label: string }[]>> = {
  invoice: [
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "paid", label: "Paid" },
    { value: "partial", label: "Partially paid" },
    { value: "overdue", label: "Overdue" },
  ],
  quotation: [
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "accepted", label: "Accepted" },
    { value: "expired", label: "Expired" },
    { value: "rejected", label: "Rejected" },
    { value: "converted", label: "Converted" },
  ],
  purchase: [
    { value: "uploaded", label: "Uploaded" },
    { value: "processing", label: "Processing" },
    { value: "booked", label: "Booked" },
  ],
  bank_transaction: [
    { value: "new", label: "New" },
    { value: "processing", label: "Processing" },
    { value: "matched", label: "Matched" },
    { value: "reconciled", label: "Reconciled" },
  ],
  journal_entry: [
    { value: "draft", label: "Draft" },
    { value: "booked", label: "Booked" },
  ],
};

const inputClass =
  "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

interface SearchResultsViewProps {
  isStaff: boolean;
  /** The bookkeeper's currently active administration id. Ignored for clients. */
  clientId?: string | null;
}

export default function SearchResultsView({ isStaff, clientId = null }: SearchResultsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [typeFilter, setTypeFilter] = useState<SearchResultType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const search = useGlobalSearch({
    initialQuery: searchParams.get("q") || "",
    clientId,
    types: typeFilter === "all" ? undefined : [typeFilter],
    status: statusFilter,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    limit: 20,
  });

  // Keep ?q= in sync so the page is shareable/bookmarkable/refresh-safe.
  useEffect(() => {
    const trimmed = search.query.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
    // Only the query drives the URL; filters are local UI state on purpose
    // (mirrors Control Center, where filters aren't persisted to the URL either).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query]);

  // A status value from one type rarely means anything for another.
  useEffect(() => setStatusFilter(null), [typeFilter]);

  const typeChips: (SearchResultType | "all")[] = [
    "all",
    ...(search.searchableTypes.length > 0 ? search.searchableTypes : SEARCH_TYPE_ORDER),
  ];

  const showAdminHint = isStaff && !clientId;
  const anyFilterActive = typeFilter !== "all" || !!statusFilter || !!dateFrom || !!dateTo;
  const statusOptionsForType = typeFilter !== "all" ? STATUS_OPTIONS[typeFilter] : undefined;

  return (
    <div className="p-4 sm:p-6 lg:p-8 lg:pt-3 max-w-5xl space-y-6">
      <PageHeader
        title="Search"
        subtitle={search.query.trim() ? `Search results for "${search.query.trim()}"` : "Search customers, invoices, purchases and more."}
      />

      <div className="relative">
        <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          placeholder="Search customers, invoices, purchases..."
          autoFocus
          className="w-full text-sm border border-gray-200 rounded-xl pl-10 pr-4 py-3 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {typeChips.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              typeFilter === t
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-indigo-200"
            }`}
          >
            {t !== "all" && <SearchTypeIcon type={t} className="w-3.5 h-3.5" />}
            {t === "all" ? "All" : SEARCH_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {statusOptionsForType && (
          <select
            value={statusFilter ?? "all"}
            onChange={(e) => setStatusFilter(e.target.value === "all" ? null : e.target.value)}
            className={inputClass}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {statusOptionsForType.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
        </label>
        {anyFilterActive && (
          <button
            type="button"
            onClick={() => {
              setTypeFilter("all");
              setStatusFilter(null);
              setDateFrom("");
              setDateTo("");
            }}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            × Clear filters
          </button>
        )}
      </div>

      {showAdminHint && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-amber-700">
            No company selected — showing accounting results only. Pick a company to also search its customers, invoices, purchases and bank transactions.
          </p>
        </div>
      )}

      {search.isTooShort ? (
        <Card padding="lg" className="text-center text-sm text-gray-400">
          Type at least 2 characters to search.
        </Card>
      ) : search.loading && search.groups.length === 0 ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Card key={i} className="space-y-3">
              <div className="h-3 w-28 skeleton-shimmer rounded" />
              {[0, 1].map((j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg skeleton-shimmer" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 skeleton-shimmer rounded" />
                    <div className="h-2.5 w-1/4 skeleton-shimmer rounded" />
                  </div>
                </div>
              ))}
            </Card>
          ))}
        </div>
      ) : search.error ? (
        <ErrorState message="Unable to complete search." onRetry={search.retry} />
      ) : search.hasSearched && search.results.length === 0 ? (
        <EmptyState title="No results found" body="Try searching for a customer, invoice number or transaction." />
      ) : (
        <div className="space-y-5">
          {search.groups.map((group) => (
            <Card key={group.type} padding="none" className="overflow-hidden">
              <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <SearchTypeIcon type={group.type} className="w-4 h-4 text-gray-400" />
                  {group.label}
                </span>
                <span className="text-xs text-gray-400">
                  {group.items.length}
                  {group.hasMore ? "+" : ""} result{group.items.length === 1 && !group.hasMore ? "" : "s"}
                </span>
              </header>
              <div className="p-1.5">
                {group.items.map((item) => (
                  <SearchResultRow key={`${item.type}-${item.id}`} item={item} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
