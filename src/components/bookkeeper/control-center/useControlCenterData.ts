"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildControlCenterItems,
  type ControlCenterItem,
  type ExceptionItemInput,
  type MissingDocSuggestionInput,
  type InconsistencySuggestionInput,
} from "@/lib/controlCenter";

interface UseControlCenterDataResult {
  items: ControlCenterItem[];
  loading: boolean;
  error: string;
  refresh: () => void;
}

/**
 * Fetches the three existing signal sources (exceptions, missing-document
 * suggestions, inconsistency suggestions) and normalizes them into
 * ControlCenterItem[], scoped to the given administration (client) id —
 * same client-side scoping pattern already used elsewhere in the bookkeeper
 * portal (see `allExceptions.filter(e => e.userId === activeAdminId)` in
 * src/app/bookkeeper/page.tsx). No new API routes, no duplicated detection
 * logic — this hook only calls the three routes that already exist.
 */
export function useControlCenterData(administrationId: string | null): UseControlCenterDataResult {
  const [items, setItems] = useState<ControlCenterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!administrationId) {
      setItems([]);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      fetch("/api/exceptions").then((r) => (r.ok ? r.json() : Promise.reject(new Error("exceptions")))),
      fetch("/api/exceptions/suggestions").then((r) => (r.ok ? r.json() : Promise.reject(new Error("suggestions")))),
      fetch("/api/exceptions/inconsistencies").then((r) => (r.ok ? r.json() : Promise.reject(new Error("inconsistencies")))),
    ])
      .then(([exceptionsRaw, suggestionsRaw, inconsistenciesRaw]: [
        ExceptionItemInput[],
        { suggestions: MissingDocSuggestionInput[] },
        { suggestions: InconsistencySuggestionInput[] },
      ]) => {
        if (cancelled) return;
        const exceptions = Array.isArray(exceptionsRaw)
          ? exceptionsRaw.filter((e) => e.userId === administrationId)
          : [];
        const missingDocSuggestions = Array.isArray(suggestionsRaw?.suggestions)
          ? suggestionsRaw.suggestions.filter((s) => s.userId === administrationId)
          : [];
        const inconsistencySuggestions = Array.isArray(inconsistenciesRaw?.suggestions)
          ? inconsistenciesRaw.suggestions.filter((s) => s.userId === administrationId)
          : [];

        setItems(buildControlCenterItems({ exceptions, missingDocSuggestions, inconsistencySuggestions }));
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load accounting issues.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [administrationId, reloadToken]);

  return { items, loading, error, refresh };
}
