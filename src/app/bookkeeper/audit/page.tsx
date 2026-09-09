"use client";

// ---------------------------------------------------------------------------
// Audit (CONTROL > Audit) — this is the full-featured page that used to
// live at /bookkeeper/activity ("Activity & Audit Timeline"). Moved here
// unchanged (filters, search, load-more all preserved) so CONTROL owns the
// formal, filterable audit trail. /bookkeeper/activity is now a lighter
// "what's new" digest built on the same useActivityLogs hook — see that
// file's header comment for the split rationale.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Suspense } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import { useActivityLogs } from "@/components/audit/useActivityLogs";
import ActivityTimeline from "@/components/audit/ActivityTimeline";
import { entityLabel, actionLabel, type AuditEntity } from "@/lib/auditActivity";
import { PageHeader, EmptyState, ErrorState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Badge";

const inputClass =
  "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {[0, 1, 2].map((j) => (
            <div key={j} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg skeleton-shimmer" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 skeleton-shimmer rounded" />
                <div className="h-2.5 w-1/4 skeleton-shimmer rounded" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BookkeeperAuditInner() {
  const { activeAdministration } = useAdministration();
  const clientId = activeAdministration ? activeAdministration.id : null;

  const [entityFilter, setEntityFilter] = useState<AuditEntity | null>(null);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the search box so every keystroke doesn't fire a request —
  // same 300ms feel as GlobalSearch.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // An action value only makes sense for the entity it belongs to (e.g.
  // "reconcile" means nothing once "Invoice" is selected) — reset it
  // whenever the entity filter changes, same rule SearchResultsView applies
  // to its status filter.
  useEffect(() => {
    const timer = setTimeout(() => setActionFilter(null), 0);
    return () => clearTimeout(timer);
  }, [entityFilter]);

  const activity = useActivityLogs({
    clientId,
    entity: entityFilter,
    action: actionFilter,
    q: debouncedQuery,
    limit: 20,
  });

  const showAdminHint = !clientId;
  const anyFilterActive = !!entityFilter || !!actionFilter || !!debouncedQuery;

  return (
    <div className="p-4 sm:p-6 lg:p-8 lg:pt-3 max-w-4xl space-y-6">
      <PageHeader title="Audit" subtitle="Full, filterable trail of every action across your accounting workspace" />

      <div className="relative">
        <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search activity..."
          className="w-full text-sm border border-gray-200 rounded-xl pl-10 pr-4 py-3 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      {(activity.availableEntities.length > 0 || activity.availableActions.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {activity.availableEntities.length > 0 && (
            <select
              value={entityFilter ?? "all"}
              onChange={(e) => setEntityFilter(e.target.value === "all" ? null : (e.target.value as AuditEntity))}
              className={inputClass}
              aria-label="Filter by entity"
            >
              <option value="all">All entities</option>
              {activity.availableEntities.map((ent) => (
                <option key={ent} value={ent}>
                  {entityLabel(ent)}
                </option>
              ))}
            </select>
          )}
          {activity.availableActions.length > 0 && (
            <select
              value={actionFilter ?? "all"}
              onChange={(e) => setActionFilter(e.target.value === "all" ? null : e.target.value)}
              className={inputClass}
              aria-label="Filter by action"
            >
              <option value="all">All actions</option>
              {activity.availableActions.map((act) => (
                <option key={act} value={act}>
                  {actionLabel(act)}
                </option>
              ))}
            </select>
          )}
          {anyFilterActive && (
            <button
              type="button"
              onClick={() => {
                setEntityFilter(null);
                setActionFilter(null);
                setQuery("");
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              × Clear filters
            </button>
          )}
        </div>
      )}

      {showAdminHint && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-amber-700">
            No company selected — showing firm-wide accounting activity only. Pick a company to also see its invoices, purchases, bank and customer activity.
          </p>
        </div>
      )}

      {activity.loading ? (
        <ActivitySkeleton />
      ) : activity.error ? (
        <ErrorState message="Unable to load activity." onRetry={activity.retry} />
      ) : activity.items.length === 0 ? (
        <EmptyState
          title={anyFilterActive ? "No matching activity" : "No activity yet"}
          body={anyFilterActive ? "Try changing your filters or search." : "Activity will appear here as actions are performed."}
        />
      ) : (
        <>
          <ActivityTimeline items={activity.items} />
          {activity.hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={activity.loadMore} disabled={activity.loadingMore}>
                {activity.loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BookkeeperAuditPage() {
  return (
    <Suspense>
      <BookkeeperAuditInner />
    </Suspense>
  );
}
