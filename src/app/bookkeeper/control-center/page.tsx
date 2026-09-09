"use client";

import { Suspense, useMemo, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import ControlCenterHeader from "@/components/bookkeeper/control-center/ControlCenterHeader";
import ControlCenterSummary from "@/components/bookkeeper/control-center/ControlCenterSummary";
import ControlCenterFilters from "@/components/bookkeeper/control-center/ControlCenterFilters";
import ControlCenterColumn from "@/components/bookkeeper/control-center/ControlCenterColumn";
import { useControlCenterData } from "@/components/bookkeeper/control-center/useControlCenterData";
import {
  COLUMN_ORDER,
  groupByColumn,
  matchesSearch,
  type ControlCenterColumn as ColumnKey,
  type ControlCenterItemType,
  type ControlCenterStatus,
} from "@/lib/controlCenter";
import { EmptyState, ErrorState } from "@/components/ui/Card";

function ColumnSkeleton() {
  return (
    <div className="bg-gray-50/60 rounded-2xl border border-gray-100 p-3 space-y-3">
      <div className="h-4 w-24 skeleton-shimmer rounded" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
          <div className="h-3 w-16 skeleton-shimmer rounded" />
          <div className="h-4 w-3/4 skeleton-shimmer rounded" />
          <div className="h-3 w-full skeleton-shimmer rounded" />
        </div>
      ))}
    </div>
  );
}

function ControlCenterInner() {
  const { activeAdministration, loading: adminLoading } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const { items, loading, error, refresh } = useControlCenterData(activeAdminId);

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<ColumnKey | null>(null);
  const [typeFilter, setTypeFilter] = useState<ControlCenterItemType | null>(null);
  const [statusFilter, setStatusFilter] = useState<ControlCenterStatus | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (severityFilter && item.column !== severityFilter) return false;
      if (typeFilter && item.itemType !== typeFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (!matchesSearch(item, search)) return false;
      return true;
    });
  }, [items, severityFilter, typeFilter, statusFilter, search]);

  // Summary cards always reflect true totals (type/status/search don't
  // affect them — only the severity itself defines the four counts), so an
  // accountant clicking "Critical" always sees the real critical count.
  const totalCounts = useMemo(() => {
    const counts: Record<ColumnKey, number> = { critical: 0, needs_review: 0, pending: 0, resolved: 0 };
    for (const item of items) counts[item.column] += 1;
    return counts;
  }, [items]);

  const grouped = useMemo(() => groupByColumn(filteredItems), [filteredItems]);

  const anyFilterActive = !!severityFilter || !!typeFilter || !!statusFilter || !!search.trim();

  return (
    <div className="p-4 sm:p-6 lg:p-8 lg:pt-3 max-w-7xl space-y-6">
      <ControlCenterHeader companyLabel={activeAdministration ? activeAdministration.company || activeAdministration.name : null} />

      {!adminLoading && !activeAdminId ? (
        <div className="max-w-xl mx-auto mt-10">
          <EmptyState
            icon={
              <svg className="w-12 h-12 text-indigo-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            title="Select a company first"
            body="The Control Center works within one customer company. Choose which company you want to review."
            action={{ label: "Choose a company", href: "/bookkeeper?section=administraties" }}
          />
        </div>
      ) : (
        <>
          <ControlCenterSummary
            counts={totalCounts}
            activeColumn={severityFilter}
            onSelectColumn={setSeverityFilter}
          />

          <ControlCenterFilters
            search={search}
            onSearchChange={setSearch}
            severity={severityFilter}
            onSeverityChange={setSeverityFilter}
            type={typeFilter}
            onTypeChange={setTypeFilter}
            status={statusFilter}
            onStatusChange={setStatusFilter}
          />

          {anyFilterActive && (
            <button
              type="button"
              onClick={() => {
                setSeverityFilter(null);
                setTypeFilter(null);
                setStatusFilter(null);
                setSearch("");
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              × Clear filters
            </button>
          )}

          {error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {COLUMN_ORDER.map((col) => (
                <ColumnSkeleton key={col} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {COLUMN_ORDER.map((col) => (
                <ControlCenterColumn key={col} column={col} items={grouped[col]} onItemCreated={refresh} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ControlCenterPage() {
  return (
    <Suspense>
      <ControlCenterInner />
    </Suspense>
  );
}
