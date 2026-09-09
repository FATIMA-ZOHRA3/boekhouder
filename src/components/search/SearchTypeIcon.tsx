import type { SearchResultType } from "@/lib/search";

const PATHS: Record<SearchResultType, string> = {
  customer: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z",
  invoice: "M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M8.5 12h7M8.5 15h7M8.5 9h3",
  purchase: "M6 7h12l-1 13H7L6 7zM9 7V5a3 3 0 016 0v2",
  bank_transaction: "M3 10l9-6 9 6M4 10v9h16v-9M9 19v-6h6v6M4 21h16",
  quotation: "M9 3h6l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM9 12.5l2 2 4-4.5",
  journal_entry: "M4 5.5A2.5 2.5 0 016.5 3H19a1 1 0 011 1v15a1 1 0 01-1 1H6.5A2.5 2.5 0 014 17.5v-12zM4 17.5A2.5 2.5 0 016.5 15H20",
  ledger_account: "M4 5h16v3H4V5zM4 11h16v3H4v-3zM4 17h16v3H4v-3z",
};

export default function SearchTypeIcon({ type, className }: { type: SearchResultType; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={PATHS[type]} />
    </svg>
  );
}
