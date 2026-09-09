"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export interface AdministrationSummary {
  id: string;
  name: string;
  company: string | null;
  email: string;
}

interface AdministrationContextValue {
  administrations: AdministrationSummary[];
  activeAdministration: AdministrationSummary | null;
  activeAdministrationId: string | null;
  loading: boolean;
  selectAdministration: (id: string | null) => void;
  refresh: () => void;
}

const AdministrationContext = createContext<AdministrationContextValue | null>(null);

const STORAGE_KEY = "bookkeeper.activeAdministrationId";

/**
 * Accountant portal administration context.
 *
 * Each record returned by /api/clients (User with role="client") represents
 * one customer administration. The accountant picks one and every module in
 * the bookkeeper portal scopes its data to that administration's userId.
 *
 * The selected id is persisted in localStorage so the accountant lands on
 * the same administration on the next visit. Clearing it brings the user
 * back to the administration selector.
 */
export function AdministrationProvider({ children }: { children: ReactNode }) {
  const [administrations, setAdministrations] = useState<AdministrationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ id: string; name: string; company: string | null; email: string; role: string }>) => {
        if (!Array.isArray(data)) return;
        const admins: AdministrationSummary[] = data
          .filter((u) => u.role === "client")
          .map((u) => ({ id: u.id, name: u.name, company: u.company, email: u.email }));
        setAdministrations(admins);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setActiveId(saved);
    }
    refresh();
  }, [refresh]);

  // If the saved id no longer exists in the current admin list, clear it so
  // the accountant is forced back to the selector rather than working on a
  // stale administration.
  useEffect(() => {
    if (loading) return;
    if (activeId && !administrations.some((a) => a.id === activeId)) {
      setActiveId(null);
      if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
    }
  }, [loading, activeId, administrations]);

  const selectAdministration = useCallback((id: string | null) => {
    setActiveId(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeAdministration = activeId ? administrations.find((a) => a.id === activeId) || null : null;

  return (
    <AdministrationContext.Provider
      value={{
        administrations,
        activeAdministration,
        activeAdministrationId: activeAdministration ? activeAdministration.id : null,
        loading,
        selectAdministration,
        refresh,
      }}
    >
      {children}
    </AdministrationContext.Provider>
  );
}

export function useAdministration(): AdministrationContextValue {
  const ctx = useContext(AdministrationContext);
  if (!ctx) throw new Error("useAdministration must be used within <AdministrationProvider>");
  return ctx;
}
