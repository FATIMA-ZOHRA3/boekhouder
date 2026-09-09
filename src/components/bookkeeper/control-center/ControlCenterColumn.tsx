"use client";

import { COLUMN_META, type ControlCenterColumn as ColumnKey, type ControlCenterItem as ControlCenterItemData } from "@/lib/controlCenter";
import ControlCenterItem from "./ControlCenterItem";

interface ControlCenterColumnProps {
  column: ColumnKey;
  items: ControlCenterItemData[];
  onItemCreated?: () => void;
}

export default function ControlCenterColumn({ column, items, onItemCreated }: ControlCenterColumnProps) {
  const meta = COLUMN_META[column];

  return (
    <div className="bg-gray-50/60 rounded-2xl border border-gray-100 flex flex-col min-w-0">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <span aria-hidden>{meta.emoji}</span> {meta.label}
        </p>
        <span className="text-xs text-gray-400 font-medium">{items.length}</span>
      </div>

      <div className="p-3 space-y-3 flex-1">
        {items.length === 0 ? (
          <div className="text-center py-8 px-3">
            <svg className="w-8 h-8 text-emerald-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-gray-600">{meta.emptyTitle}</p>
            <p className="text-xs text-gray-400 mt-0.5">{meta.emptyBody}</p>
          </div>
        ) : (
          items.map((item) => <ControlCenterItem key={item.id} item={item} onCreated={onItemCreated} />)
        )}
      </div>
    </div>
  );
}
