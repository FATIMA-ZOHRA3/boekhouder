"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchResultGroup, SearchResultType } from "@/lib/search";

export interface GlobalSearchApiResponse {
  query: string;
  isStaff: boolean;
  clientId: string | null;
  searchableTypes: SearchResultType[];
  scopedTypes: SearchResultType[];
  groups: SearchResultGroup[];
  results: GlobalSearchApiResponse["groups"][number]["items"];
}

export interface UseGlobalSearchOptions {
  initialQuery?: string;
  /** Active administration id. Only meaningful for staff — ignored server-side for clients. */
  clientId?: string | null;
  types?: SearchResultType[];
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  /** ms to wait after the last keystroke before firing a request. Spec: 300-400ms. */
  debounceMs?: number;
  /** Below this length, no request is sent at all (spec Step 6). */
  minLength?: number;
}

const DEFAULT_DEBOUNCE_MS = 350;
const DEFAULT_MIN_LENGTH = 2;
// Stable empty-array reference so "too short" renders don't hand callers a
// fresh array identity every time (and don't need a setState to produce it).
const EMPTY_GROUPS: SearchResultGroup[] = [];

export function useGlobalSearch(options: UseGlobalSearchOptions = {}) {
  const {
    initialQuery = "",
    clientId = null,
    types,
    status = null,
    dateFrom = null,
    dateTo = null,
    limit,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minLength = DEFAULT_MIN_LENGTH,
  } = options;

  const [query, setQuery] = useState(initialQuery);
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [searchableTypes, setSearchableTypes] = useState<SearchResultType[]>([]);
  const [scopedTypes, setScopedTypes] = useState<SearchResultType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const typesKey = types?.join(",") ?? "";
  const trimmed = query.trim();
  const isTooShort = trimmed.length < minLength;

  // Single fetch implementation, reused by both the debounced effect and the
  // manual retry button (Step 16) — nothing here is duplicated.
  const runSearch = useCallback(
    (q: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ q });
      if (clientId) params.set("clientId", clientId);
      if (typesKey) params.set("types", typesKey);
      if (status) params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (limit) params.set("limit", String(limit));

      fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error("search_failed");
          return (await res.json()) as GlobalSearchApiResponse;
        })
        .then((data) => {
          setGroups(data.groups);
          setSearchableTypes(data.searchableTypes);
          setScopedTypes(data.scopedTypes);
          setHasSearched(true);
          setLoading(false);
        })
        .catch((err: unknown) => {
          // A newer request superseding this one aborts it on purpose — not a real error.
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError("Unable to complete search.");
          setHasSearched(true);
          setLoading(false);
        });
    },
    [clientId, typesKey, status, dateFrom, dateTo, limit]
  );

  // Debounced fetch. When the query is too short there is nothing to
  // synchronize with the server — state for that case is derived below
  // (effectiveGroups/effectiveLoading/...) instead of reset imperatively
  // here, so this effect only ever does the one real side effect it needs:
  // making sure a stale in-flight request can't land late.
  useEffect(() => {
    if (isTooShort) {
      abortRef.current?.abort();
      return;
    }
    const timer = setTimeout(() => runSearch(trimmed), debounceMs);
    return () => clearTimeout(timer);
  }, [trimmed, isTooShort, debounceMs, runSearch]);

  // Unmount: make sure a pending request never sets state on a gone component.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Derived "too short" view — avoids a second effect whose only job would
  // be calling four setState functions to reset state that render can just
  // compute directly.
  const effectiveGroups = isTooShort ? EMPTY_GROUPS : groups;
  const effectiveLoading = isTooShort ? false : loading;
  const effectiveError = isTooShort ? null : error;
  const effectiveHasSearched = isTooShort ? false : hasSearched;

  const results = useMemo(() => effectiveGroups.flatMap((g) => g.items), [effectiveGroups]);

  const retry = useCallback(() => {
    if (!isTooShort) runSearch(trimmed);
  }, [isTooShort, runSearch, trimmed]);

  return {
    query,
    setQuery,
    groups: effectiveGroups,
    results,
    totalCount: results.length,
    searchableTypes,
    scopedTypes,
    loading: effectiveLoading,
    error: effectiveError,
    hasSearched: effectiveHasSearched,
    isTooShort,
    retry,
  };
}
