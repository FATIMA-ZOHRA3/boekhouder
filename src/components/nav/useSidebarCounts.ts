"use client";

import { useEffect, useState } from "react";

export interface SidebarCounts {
  sales: number;
  purchases: number;
  exceptions: number;
  tasks: number;
}

const EMPTY: SidebarCounts = { sales: 0, purchases: 0, exceptions: 0, tasks: 0 };

/**
 * Small, cheap counts shown as badges next to a few nav items (Sales,
 * Purchases, Exceptions, Tasks) so the grouped sidebar keeps the same
 * at-a-glance signal the old flat rail gave via `sidebarCounts`. Each call
 * is scoped to the active administration and re-runs whenever it changes.
 * Deliberately not wired to every module — badges on every row would just
 * recreate the old rail's visual noise.
 */
export function useSidebarCounts(activeAdminId: string | null): SidebarCounts {
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY);

  useEffect(() => {
    // Synchronous reset on every activeAdminId change (not just when it
    // becomes null): without this, the badges kept showing the previous
    // company's sales/purchases/exceptions/tasks counts for the entire
    // duration of the new company's fetch below, since nothing else in this
    // hook gates rendering on a "loading" flag — the caller only ever sees
    // `counts`, so those numbers ARE what's on screen the instant this runs.
    setCounts(EMPTY);
    if (!activeAdminId) return;
    let cancelled = false;

    async function load() {
      try {
        const [invoicesRes, purchasesRes, exceptionsRes, tasksRes] = await Promise.all([
          fetch(`/api/invoices?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/purchases/all?clientId=${activeAdminId}&status=uploaded`).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/exceptions`).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/tasks?clientId=${activeAdminId}&date=${new Date().toISOString().split("T")[0]}&includeOverdue=true`).then((r) => (r.ok ? r.json() : [])),
        ]);
        if (cancelled) return;
        const salesCount = Array.isArray(invoicesRes)
          ? invoicesRes.filter((i: { bookkeepingStatus?: string }) => i.bookkeepingStatus === "pending" || i.bookkeepingStatus === "to_book").length
          : 0;
        const purchasesCount = Array.isArray(purchasesRes) ? purchasesRes.length : 0;
        const exceptionsCount = Array.isArray(exceptionsRes)
          ? exceptionsRes.filter((e: { status?: string; user?: { id?: string } }) => e.status === "waiting" && e.user?.id === activeAdminId).length
          : 0;
        const tasksCount = Array.isArray(tasksRes)
          ? tasksRes.filter((t: { completed?: boolean }) => !t.completed).length
          : 0;
        setCounts({ sales: salesCount, purchases: purchasesCount, exceptions: exceptionsCount, tasks: tasksCount });
      } catch {
        if (!cancelled) setCounts(EMPTY);
      }
    }

    const timer = setTimeout(load, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeAdminId]);

  return counts;
}
