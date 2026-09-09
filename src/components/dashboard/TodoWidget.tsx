"use client";

import Link from "next/link";
import { computeExceptionSeverity, severityMeta, SEVERITY_ORDER, type ExceptionSeverity } from "@/lib/exceptionSeverity";

// Structural types — intentionally minimal. This component only needs a
// few fields, so it doesn't import the full, locally-declared types from
// bookkeeper/page.tsx (those aren't exported). Any object with at least
// these fields — including the real ExceptionItemData / BankTx used on the
// dashboard — satisfies these.
export interface TodoException {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  title: string;
  amount?: number | null;
  severity?: ExceptionSeverity;
  user?: { name: string; company: string | null } | null;
}

export interface TodoBankTx {
  id: string;
  status: string;
}

interface TodoWidgetProps {
  exceptions: TodoException[];
  bankTxs: TodoBankTx[];
  exceptionsHref?: string;
  bankHref?: string;
}

/**
 * Dashboard "À traiter" widget — pure aggregation over data already held
 * in component state (no network requests of its own). Shows open
 * exceptions broken down by derived severity, plus unreconciled bank
 * transactions.
 */
export function TodoWidget({ exceptions, bankTxs, exceptionsHref = "/bookkeeper?section=exceptions", bankHref = "/bookkeeper?section=bank" }: TodoWidgetProps) {
  const openExceptions = exceptions.filter((e) => e.status !== "resolved");

  const bySeverity = new Map<ExceptionSeverity, number>();
  for (const s of SEVERITY_ORDER) bySeverity.set(s, 0);
  for (const exc of openExceptions) {
    const severity = exc.severity ?? computeExceptionSeverity(exc);
    bySeverity.set(severity, (bySeverity.get(severity) ?? 0) + 1);
  }

  const unreconciled = bankTxs.filter((t) => t.status !== "reconciled" && t.status !== "matched");

  const nothingToDo = openExceptions.length === 0 && unreconciled.length === 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-[#0E2A47]">To process</h2>
        {openExceptions.length > 0 && (
          <Link href={exceptionsHref} className="text-xs text-[#2E6FA7] font-medium hover:text-[#12355B]">
            View all →
          </Link>
        )}
      </div>

      {nothingToDo ? (
        <p className="text-sm text-gray-400 py-4 text-center">Nothing to process — all caught up.</p>
      ) : (
        <div className="space-y-4">
          {openExceptions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Open exceptions</span>
                <span className="text-sm font-semibold text-[#0E2A47]">{openExceptions.length}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SEVERITY_ORDER.map((sev) => {
                  const count = bySeverity.get(sev) ?? 0;
                  const meta = severityMeta[sev];
                  return (
                    <Link
                      key={sev}
                      href={`${exceptionsHref}${exceptionsHref.includes("?") ? "&" : "?"}severity=${sev}`}
                      className={`rounded-lg px-2 py-2 text-center transition-opacity ${count === 0 ? "opacity-40" : "hover:opacity-80"} ${meta.badgeClass}`}
                    >
                      <p className="text-lg font-bold leading-none">{count}</p>
                      <p className="text-[10px] font-medium mt-1 leading-none">{meta.label}</p>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {unreconciled.length > 0 && (
            <div className="flex items-center justify-between py-2 border-t border-gray-50">
              <Link href={bankHref} className="text-sm text-gray-600 hover:text-[#2E6FA7]">
                Unmatched bank transactions
              </Link>
              <span className="text-sm font-semibold text-amber-600">{unreconciled.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TodoWidget;
