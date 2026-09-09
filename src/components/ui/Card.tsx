// ---------------------------------------------------------------------------
// FinTech design system — Card / PageHeader / Empty & Error states / Skeleton
// ---------------------------------------------------------------------------
// Reusable primitives requested by the frontend redesign brief. Purely
// presentational (no data fetching, no business logic) so any page can adopt
// them without touching how it loads or computes data. See
// src/components/ui/README-DESIGN-SYSTEM.md for palette, spacing and the
// migration status across the app.

import type { ReactNode } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Card — the base surface every KPI, table, and content block sits on.
// ---------------------------------------------------------------------------
export function Card({
  children,
  className = "",
  padding = "md",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  /** "none" for cards that manage their own inner spacing (e.g. tables with a header row). */
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds a subtle lift + border tint on hover — for clickable cards. */
  hover?: boolean;
}) {
  const paddingClass = { none: "", sm: "p-4", md: "p-6", lg: "p-7" }[padding];
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100/80 shadow-[0_1px_2px_0_rgba(15,32,89,0.04),0_8px_24px_-14px_rgba(37,99,235,0.20)] ${
        hover ? "transition-all hover:shadow-[0_10px_30px_-12px_rgba(37,99,235,0.28),0_2px_6px_-2px_rgba(15,32,89,0.10)] hover:border-blue-100" : ""
      } ${paddingClass} ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageHeader — consistent title/subtitle/actions block for every page.
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState / ErrorState — one consistent shape for every "nothing here" /
// "something broke" moment, replacing the many hand-rolled variants that
// existed per page.
// ---------------------------------------------------------------------------
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
}) {
  return (
    <Card padding="lg" className="text-center py-10">
      {icon ?? (
        <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 4h18a2 2 0 002-2V6a2 2 0 00-2-2H3a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )}
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {body && <p className="text-sm text-gray-400 mt-1">{body}</p>}
      {action && "href" in action && (
        <Link href={action.href} className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          {action.label}
        </Link>
      )}
      {action && "onClick" in action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card padding="lg" className="text-center py-10">
      <svg className="w-10 h-10 text-red-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="text-sm text-gray-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        Retry
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — shimmer-based loading placeholders.
// ---------------------------------------------------------------------------
export function SkeletonLine({ width = "100%", height = "0.875rem" }: { width?: string; height?: string }) {
  return <div className="skeleton-shimmer rounded" style={{ width, height }} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card className="space-y-2.5">
      <SkeletonLine width="40%" height="0.75rem" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </Card>
  );
}
