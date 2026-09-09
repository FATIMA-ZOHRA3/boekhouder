"use client";

import { useState } from "react";
import Link from "next/link";
import { COLUMN_META, STATUS_META, TYPE_META, formatCurrency, formatDate, type ControlCenterItem as ControlCenterItemData } from "@/lib/controlCenter";

interface ControlCenterItemProps {
  item: ControlCenterItemData;
  /** Called after a suggestion was successfully turned into a real exception, so the parent can refetch. */
  onCreated?: () => void;
}

export default function ControlCenterItem({ item, onCreated }: ControlCenterItemProps) {
  const columnMeta = COLUMN_META[item.column];
  const statusMeta = STATUS_META[item.status];
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    if (!item.createAction) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.createAction.payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || "Could not create the exception.");
        return;
      }
      // The suggestion endpoint filters out anything with an open ExceptionItem
      // already linked to it, so refetching removes this card and shows the
      // real exception in its place — same list, now backed by a persisted record.
      onCreated?.();
    } catch {
      setCreateError("Connection error.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 hover:border-indigo-100 hover:shadow-[0_4px_12px_-2px_rgba(17,24,39,0.06)] transition-all">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${columnMeta.badgeClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${columnMeta.dotClass}`} />
          {columnMeta.label}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600">
          {TYPE_META[item.itemType]}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusMeta.badgeClass}`}>
          {statusMeta.label}
        </span>
      </div>

      <p className="text-sm font-medium text-gray-900">{item.title}</p>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.description}</p>

      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
        <p className="text-[11px] text-gray-400">
          {item.source}
          {item.entityLabel && <> &middot; {item.entityLabel}</>}
          {item.occurredAt && <> &middot; {formatDate(item.occurredAt)}</>}
          {item.amount != null && <> &middot; {formatCurrency(item.amount)}</>}
        </p>
        {item.cta && (
          <Link
            href={item.cta.href}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shrink-0"
          >
            {item.cta.label}
          </Link>
        )}
        {item.createAction && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            title="Turn this AI suggestion into a real exception the customer will see"
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "Creating…" : item.createAction.label}
          </button>
        )}
      </div>
      {createError && <p className="text-[11px] text-red-500 mt-1.5">{createError}</p>}
    </div>
  );
}
