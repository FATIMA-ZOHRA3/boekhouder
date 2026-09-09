"use client";

import {
  COLUMN_META,
  COLUMN_ORDER,
  TYPE_META,
  STATUS_META,
  type ControlCenterColumn,
  type ControlCenterItemType,
  type ControlCenterStatus,
} from "@/lib/controlCenter";

const TYPE_ORDER: ControlCenterItemType[] = ["bank", "invoice", "purchase", "vat", "accounting", "ai", "other"];
const STATUS_ORDER: ControlCenterStatus[] = ["open", "in_progress", "resolved"];

interface ControlCenterFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  severity: ControlCenterColumn | null;
  onSeverityChange: (value: ControlCenterColumn | null) => void;
  type: ControlCenterItemType | null;
  onTypeChange: (value: ControlCenterItemType | null) => void;
  status: ControlCenterStatus | null;
  onStatusChange: (value: ControlCenterStatus | null) => void;
}

const selectClass =
  "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

export default function ControlCenterFilters({
  search,
  onSearchChange,
  severity,
  onSeverityChange,
  type,
  onTypeChange,
  status,
  onStatusChange,
}: ControlCenterFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[220px]">
        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search issues..."
          className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      <select
        value={severity ?? "all"}
        onChange={(e) => onSeverityChange(e.target.value === "all" ? null : (e.target.value as ControlCenterColumn))}
        className={selectClass}
        aria-label="Filter by severity"
      >
        <option value="all">All severities</option>
        {COLUMN_ORDER.map((col) => (
          <option key={col} value={col}>
            {COLUMN_META[col].label}
          </option>
        ))}
      </select>

      <select
        value={type ?? "all"}
        onChange={(e) => onTypeChange(e.target.value === "all" ? null : (e.target.value as ControlCenterItemType))}
        className={selectClass}
        aria-label="Filter by type"
      >
        <option value="all">All types</option>
        {TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {TYPE_META[t]}
          </option>
        ))}
      </select>

      <select
        value={status ?? "all"}
        onChange={(e) => onStatusChange(e.target.value === "all" ? null : (e.target.value as ControlCenterStatus))}
        className={selectClass}
        aria-label="Filter by status"
      >
        <option value="all">All statuses</option>
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
    </div>
  );
}
