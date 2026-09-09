import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { getItemAsync, setItemAsync, deleteItemAsync } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// "Active client" — the client a BOOKKEEPER has chosen to work on right now.
//
// This is intentionally a separate, much smaller concept than auth/role
// (useAuth): it never changes `role`, `isStaff`, which tabs are visible
// (app/(tabs)/_layout.tsx), or which API calls are permitted. It is purely
// a UI-level "which client's data should the staff-only screens default
// to showing" preference, similar to a filter that happens to persist
// across tabs.
//
// Root cause this fixes: previously nothing remembered which client a
// bookkeeper had opened. Screens reached directly from a Client detail
// page (via an explicit `?clientId=` link) showed that one client's data,
// but the Accounting tab's own cards (Purchases to validate, Bank,
// Exceptions, Invoices, Messages, Activity) always linked out with no
// clientId at all — by design, for the firm-wide queue. That's correct
// when a bookkeeper wants a cross-client view, but there was no way to
// say "no, keep me on the client I just opened" — so after selecting
// "De Vries Consulting BV" and going Accounting -> Purchases to validate,
// the bookkeeper saw every client's pending purchases mixed together
// (in practice, whichever document happened to be listed, e.g. a
// "Demo BV" upload) — not because of a permissions bug, but because nothing
// tracked the selection past that one tap.
//
// Every screen that reads `activeClient` still calls the exact same
// staff-only endpoints, still runs as the bookkeeper's own session, and
// the backend still re-checks that this bookkeeper is authorized to see
// this specific client's data (see each service file's own comments) —
// this context never impersonates the client or grants anything new.
export type ActiveClient = { id: string; name: string };

type ActiveClientState = {
  activeClient: ActiveClient | null;
  setActiveClient: (client: ActiveClient) => void;
  clearActiveClient: () => void;
};

const STORAGE_KEY = "activeClient"; // JSON-encoded ActiveClient

const ActiveClientContext = createContext<ActiveClientState | null>(null);

export function ActiveClientProvider({ children }: { children: React.ReactNode }) {
  const { isStaff, status } = useAuth();
  const [activeClient, setActiveClientState] = useState<ActiveClient | null>(null);
  const [restored, setRestored] = useState(false);

  // Restore on launch (staff only — a client account never has one).
  useEffect(() => {
    (async () => {
      try {
        const raw = await getItemAsync(STORAGE_KEY);
        if (raw) setActiveClientState(JSON.parse(raw));
      } catch {
        // Corrupt/missing value — just start with no active client.
      } finally {
        setRestored(true);
      }
    })();
  }, []);

  // Clear whenever the signed-in account isn't staff (logout, or a client
  // account signing in on the same device) — this selection must never
  // survive into a session it doesn't apply to.
  useEffect(() => {
    if (!restored) return;
    if (status === "signed-in" && isStaff) return;
    if (activeClient) {
      setActiveClientState(null);
      deleteItemAsync(STORAGE_KEY);
    }
  }, [status, isStaff, restored, activeClient]);

  const setActiveClient = useCallback((client: ActiveClient) => {
    setActiveClientState(client);
    setItemAsync(STORAGE_KEY, JSON.stringify(client));
  }, []);

  const clearActiveClient = useCallback(() => {
    setActiveClientState(null);
    deleteItemAsync(STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({ activeClient, setActiveClient, clearActiveClient }),
    [activeClient, setActiveClient, clearActiveClient]
  );

  return <ActiveClientContext.Provider value={value}>{children}</ActiveClientContext.Provider>;
}

export function useActiveClient() {
  const ctx = useContext(ActiveClientContext);
  if (!ctx) throw new Error("useActiveClient must be used within ActiveClientProvider");
  return ctx;
}
