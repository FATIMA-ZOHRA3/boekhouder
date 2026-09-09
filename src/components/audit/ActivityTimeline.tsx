"use client";

import Link from "next/link";
import ActivityEntityIcon, { ENTITY_STYLE } from "./ActivityEntityIcon";
import { groupByDay, formatTime } from "@/lib/auditActivity";
import type { ActivityItem } from "./useActivityLogs";

// Reusable timeline (Step 2 of the spec). Purely presentational — given a
// list of already-fetched, already-authorized items, it renders them. Used
// today by the global Activity page (app/bookkeeper/activity/page.tsx); the
// same component is meant to be reusable later for a per-entity "Activity"
// tab (e.g. on an invoice detail page) by simply passing a narrower `items`
// list — no change needed here for that.
export default function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const groups = groupByDay(items);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">{group.label}</p>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden shadow-[0_1px_2px_0_rgba(17,24,39,0.04)]">
            {group.items.map((item) => {
              const style = ENTITY_STYLE[item.entity];
              const row = (
                <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
                  <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${style.bg} ${style.text}`}>
                    <ActivityEntityIcon entity={item.entity} className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.description}</p>
                    <p className="text-xs text-gray-500 mt-0.5">by {item.actorName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {item.amountLabel && <p className="text-sm font-semibold text-gray-700">{item.amountLabel}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{formatTime(item.createdAt)}</p>
                  </div>
                </div>
              );
              return item.href ? (
                <Link key={item.id} href={item.href} className="block">
                  {row}
                </Link>
              ) : (
                <div key={item.id}>{row}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
