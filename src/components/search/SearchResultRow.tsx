"use client";

import Link from "next/link";
import SearchTypeIcon from "./SearchTypeIcon";
import type { SearchResultItem } from "@/lib/search";

export default function SearchResultRow({
  item,
  active = false,
  onClick,
  onMouseEnter,
}: {
  item: SearchResultItem;
  active?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        active ? "bg-indigo-50" : "hover:bg-gray-50"
      }`}
    >
      <span
        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
          active ? "bg-white text-indigo-600" : "bg-gray-100 text-gray-500"
        }`}
      >
        <SearchTypeIcon type={item.type} className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900 truncate">{item.title}</span>
        <span className="block text-xs text-gray-500 truncate">{item.subtitle}</span>
      </span>
      {item.metadata && (
        <span className="shrink-0 text-xs text-gray-500 text-right whitespace-nowrap">{item.metadata}</span>
      )}
    </Link>
  );
}
