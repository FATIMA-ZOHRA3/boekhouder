"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useGlobalSearch } from "./useGlobalSearch";
import SearchResultRow from "./SearchResultRow";

const PLACEHOLDER = "Search customers, invoices, purchases...";
const DROPDOWN_WIDTH = 420;

interface GlobalSearchProps {
  /** True inside the bookkeeper/admin portal, false (default) inside the client portal. */
  isStaff?: boolean;
  /** The bookkeeper's currently active administration id, if any. Ignored for clients. */
  clientId?: string | null;
}

export default function GlobalSearch({ isStaff = false, clientId = null }: GlobalSearchProps) {
  const router = useRouter();
  const { query, setQuery, groups, results, loading, error, hasSearched, isTooShort, retry } = useGlobalSearch({
    clientId,
    limit: 5,
  });

  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const searchPageHref = isStaff ? "/bookkeeper/search" : "/client/search";
  // Staff without an active administration still get accounting results
  // (journal entries / ledger accounts are firm-wide) — see /api/search's
  // own comment for why customer/invoice/purchase/bank/quotation don't
  // appear in that case rather than mixing in another customer's data.
  const showAdminHint = isStaff && !clientId;

  const [prevResults, setPrevResults] = useState(results);
  if (results !== prevResults) {
    setPrevResults(results);
    setActiveIndex(-1);
  }

  // Position the portaled dropdown under the input, right-aligned to it —
  // same technique as NotificationBell (fixed positioning computed from the
  // trigger's own bounding rect, recomputed on resize/scroll).
  useEffect(() => {
    if (!desktopOpen) return;
    function update() {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, left: Math.max(16, rect.right - DROPDOWN_WIDTH), width: DROPDOWN_WIDTH });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [desktopOpen]);

  // Close the dropdown on outside click (trigger + portaled panel are both
  // exempt, everything else closes it).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setDesktopOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Lock page scroll while the mobile overlay is open and focus its input.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => mobileInputRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [mobileOpen]);

  const closeAll = useCallback(() => {
    setDesktopOpen(false);
    setMobileOpen(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (results.length > 0) setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (results.length > 0) setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const trimmed = query.trim();
        if (activeIndex >= 0 && results[activeIndex]) {
          const href = results[activeIndex].href;
          closeAll();
          router.push(href);
        } else if (trimmed.length >= 2) {
          closeAll();
          router.push(`${searchPageHref}?q=${encodeURIComponent(trimmed)}`);
        }
      } else if (e.key === "Escape") {
        closeAll();
        (e.target as HTMLInputElement).blur();
      }
    },
    [results, activeIndex, query, closeAll, router, searchPageHref]
  );

  const resultIndex = new Map<string, number>();
  results.forEach((item, i) => resultIndex.set(`${item.type}-${item.id}`, i));

  const body = (
    <>
      {isTooShort ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Keep typing to search customers, invoices &amp; more
        </div>
      ) : loading && groups.length === 0 ? (
        <div className="px-3 py-2 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse-subtle" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/2 bg-gray-100 rounded animate-pulse-subtle" />
                <div className="h-2.5 w-1/3 bg-gray-100 rounded animate-pulse-subtle" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-600">Unable to complete search.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2E6FA7] text-white rounded-lg text-xs font-medium hover:bg-[#245A87]"
          >
            Try again
          </button>
        </div>
      ) : hasSearched && results.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-medium text-[#0E2A47]">No results found</p>
          <p className="text-xs text-gray-500 mt-1">Try searching for a customer, invoice number or transaction.</p>
        </div>
      ) : (
        <div className="py-1.5">
          {groups.map((group) => (
            <div key={group.type} className="px-1.5 py-1">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{group.label}</span>
                <span className="text-[11px] text-gray-400">{group.items.length}{group.hasMore ? "+" : ""}</span>
              </div>
              {group.items.map((item) => {
                const idx = resultIndex.get(`${item.type}-${item.id}`) ?? -1;
                return (
                  <SearchResultRow
                    key={`${item.type}-${item.id}`}
                    item={item}
                    active={idx === activeIndex}
                    onClick={closeAll}
                    onMouseEnter={() => setActiveIndex(idx)}
                  />
                );
              })}
            </div>
          ))}
          {showAdminHint && (
            <p className="px-3.5 py-2 text-[11px] text-gray-400 border-t border-gray-100 mt-1">
              Select a company above to also search its customers, invoices, purchases &amp; bank transactions.
            </p>
          )}
          {results.length > 0 && (
            <a
              href={`${searchPageHref}?q=${encodeURIComponent(query.trim())}`}
              onClick={closeAll}
              className="flex items-center justify-between px-3.5 py-2.5 border-t border-gray-100 text-xs font-medium text-[#2E6FA7] hover:text-[#12355B]"
            >
              View all results
              <span className="text-gray-300">↵</span>
            </a>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop bar */}
      <div ref={wrapRef} className="relative hidden lg:block">
        <div
          className={`flex items-center gap-2 bg-white border rounded-full shadow-sm pl-3.5 pr-2 py-2 transition-all ${
            desktopOpen ? "w-80 border-[#2E6FA7] ring-2 ring-[#2E6FA7]/25" : "w-64 border-gray-200"
          }`}
        >
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setDesktopOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER}
            aria-label="Global search"
            className="flex-1 min-w-0 bg-transparent text-sm text-[#0E2A47] placeholder:text-gray-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {desktopOpen &&
          dropdownPos &&
          createPortal(
            <div
              ref={dropdownRef}
              style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
              className="z-[9999] bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden animate-dropdown-enter"
            >
              <div className="max-h-[60vh] overflow-y-auto">{body}</div>
              {!isTooShort && (
                <div className="hidden sm:flex items-center gap-3 px-3.5 py-2 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-gray-500">↑</kbd>
                    <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-gray-500">↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-gray-500">Enter</kbd>
                    Open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-gray-500">Esc</kbd>
                    Close
                  </span>
                </div>
              )}
            </div>,
            document.body
          )}
      </div>

      {/* Mobile trigger — styled to match NotificationBell's dark-header
          variant (icon-only, translucent white on the brand-teal mobile
          header), since that's the only context this renders in today. */}
      <button
        type="button"
        aria-label="Search"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden relative p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {mobileOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-white flex flex-col lg:hidden">
            <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 shrink-0">
              <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3.5 py-2.5">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={PLACEHOLDER}
                  aria-label="Global search"
                  className="flex-1 min-w-0 bg-transparent text-sm text-[#0E2A47] placeholder:text-gray-400 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={closeAll}
                className="shrink-0 text-sm font-medium text-gray-500 px-2 py-2"
              >
                Cancel
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{body}</div>
          </div>,
          document.body
        )}
    </>
  );
}
