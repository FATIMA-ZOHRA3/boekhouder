"use client";

import Link from "next/link";
import { useAdministration } from "@/components/AdministrationProvider";
import { useActivityLogs } from "@/components/audit/useActivityLogs";
import ActivityTimeline from "@/components/audit/ActivityTimeline";
import { PageHeader, EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// Activity (OVERVIEW > Activity) — a quick "what's new" glance, separate
// from the full filterable trail that used to live at this exact path
// (now CONTROL > Audit, see src/app/bookkeeper/audit/page.tsx). Same data
// source (useActivityLogs / AuditLog), just the last handful of events
// with no filter UI — for catching up, not investigating.
// ---------------------------------------------------------------------------

function ActivityInner() {
  const { activeAdministration } = useAdministration();
  const clientId = activeAdministration ? activeAdministration.id : null;
  const activity = useActivityLogs({ clientId, limit: 12 });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl space-y-6">
      <PageHeader
        title="Activity"
        subtitle={activeAdministration ? `Recent activity for ${activeAdministration.company || activeAdministration.name}` : "Recent firm-wide activity"}
      />

      {activity.loading ? (
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
      ) : activity.error ? (
        <ErrorState message="Unable to load activity." onRetry={activity.retry} />
      ) : activity.items.length === 0 ? (
        <EmptyState title="No activity yet" body="Activity will appear here as actions are performed." />
      ) : (
        <>
          <ActivityTimeline items={activity.items} />
          <div className="text-center pt-1">
            <Link href="/bookkeeper/audit" className="text-sm text-indigo-600 font-medium hover:text-indigo-800">View full audit trail →</Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function BookkeeperActivityPage() {
  return <ActivityInner />;
}
