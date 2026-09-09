"use client";

import { COLUMN_META, COLUMN_ORDER, type ControlCenterColumn } from "@/lib/controlCenter";

interface ControlCenterSummaryProps {
  counts: Record<ControlCenterColumn, number>;
  activeColumn: ControlCenterColumn | null;
  onSelectColumn: (column: ControlCenterColumn | null) => void;
}

export default function ControlCenterSummary({ counts, activeColumn, onSelectColumn }: ControlCenterSummaryProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {COLUMN_ORDER.map((col) => {
        const meta = COLUMN_META[col];
        const isActive = activeColumn === col;
        return (
          <button
            key={col}
            type="button"
            onClick={() => onSelectColumn(isActive ? null : col)}
            className={`rounded-2xl p-5 border text-left transition-all shadow-[0_1px_2px_0_rgba(17,24,39,0.04)] ${meta.badgeClass} ${
              isActive ? "ring-2 ring-offset-1 ring-indigo-500" : "hover:shadow-[0_4px_12px_-2px_rgba(17,24,39,0.08)]"
            }`}
          >
            <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <span aria-hidden>{meta.emoji}</span> {meta.label}
            </p>
            <p className="text-2xl font-bold">{counts[col]}</p>
          </button>
        );
      })}
    </div>
  );
}
