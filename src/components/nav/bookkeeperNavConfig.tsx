import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Navigation model for the redesigned bookkeeper portal shell.
//
// Replaces the flat 19-item list that used to live inline in
// app/bookkeeper/layout.tsx (`sidebarItems`). Grouped by business domain per
// the redesign brief: OVERVIEW / WORK / FINANCE / RELATIONSHIPS / CONTROL /
// SYSTEM. Every route that existed before (as a `?section=` query param) has
// a real path here; a handful of sections were consolidated into tabs
// within one page (see each page's own header comment for the mapping),
// and a few destinations (Customers, Suppliers, Documents, Reports) are new
// — built on data that already existed but had no dedicated view before.
//
// Icons are intentionally the *same* glyphs the old sidebar used for the
// same concept (dashboard, sales, purchases, bank, tasks, exceptions,
// settings, etc.) — only the surrounding chrome changes. Re-using the icon
// language keeps the new nav legible to anyone who used the old one, while
// everything else about the shell is rebuilt.
// ---------------------------------------------------------------------------

export interface NavBadge {
  /** Which live count (computed in the layout) this item's badge should show. */
  countKey?: "sales" | "purchases" | "exceptions" | "tasks";
  tone?: "warning" | "danger";
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  badge?: NavBadge;
  /** Extra paths (besides `href`) that should also mark this item active. */
  matchPrefixes?: string[];
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

const iconProps = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw = 1.6;

const Icons = {
  home: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>
  ),
  activity: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  insights: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
  ),
  sales: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  ),
  purchases: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
  ),
  banking: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
  ),
  cash: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
  ),
  accounting: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
  ),
  taxes: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
  ),
  reports: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
  ),
  customers: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  ),
  suppliers: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25M21 7.5v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
  ),
  documents: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  ),
  messages: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
  ),
  controlCenter: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9 3v18M3 9h6m0-6h12a2 2 0 012 2v14a2 2 0 01-2 2H9M3 9v10a2 2 0 002 2h4M3 9V5a2 2 0 012-2h4" /></svg>
  ),
  tasks: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm4-6l2 2 4-4" /></svg>
  ),
  exceptions: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
  ),
  audit: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.286z" /></svg>
  ),
  administration: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
  ),
  settings: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export const BOOKKEEPER_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [
      { key: "home", label: "Home", href: "/bookkeeper", icon: Icons.home },
      { key: "activity", label: "Activity", href: "/bookkeeper/activity", icon: Icons.activity },
      { key: "insights", label: "Insights", href: "/bookkeeper/ai-insights", icon: Icons.insights },
    ],
  },
  {
    key: "work",
    label: "Work",
    items: [
      { key: "sales", label: "Sales", href: "/bookkeeper/sales", icon: Icons.sales, badge: { countKey: "sales", tone: "warning" } },
      { key: "purchases", label: "Purchases", href: "/bookkeeper/purchases", icon: Icons.purchases, badge: { countKey: "purchases", tone: "warning" } },
      { key: "banking", label: "Banking", href: "/bookkeeper/banking", icon: Icons.banking },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    items: [
      { key: "cash", label: "Cash", href: "/bookkeeper/cash", icon: Icons.cash },
      { key: "accounting", label: "Accounting", href: "/bookkeeper/accounting", icon: Icons.accounting },
      { key: "taxes", label: "Taxes", href: "/bookkeeper/taxes", icon: Icons.taxes },
      { key: "reports", label: "Reports", href: "/bookkeeper/reports", icon: Icons.reports },
    ],
  },
  {
    key: "relationships",
    label: "Relationships",
    items: [
      { key: "customers", label: "Customers", href: "/bookkeeper/customers", icon: Icons.customers },
      { key: "suppliers", label: "Suppliers", href: "/bookkeeper/suppliers", icon: Icons.suppliers },
      { key: "documents", label: "Documents", href: "/bookkeeper/documents", icon: Icons.documents },
      { key: "messages", label: "Messages", href: "/bookkeeper/messages", icon: Icons.messages },
    ],
  },
  {
    key: "control",
    label: "Control",
    items: [
      { key: "control-center", label: "Control Center", href: "/bookkeeper/control-center", icon: Icons.controlCenter },
      { key: "tasks", label: "Tasks", href: "/bookkeeper/tasks", icon: Icons.tasks, badge: { countKey: "tasks", tone: "warning" } },
      { key: "exceptions", label: "Exceptions", href: "/bookkeeper/exceptions", icon: Icons.exceptions, badge: { countKey: "exceptions", tone: "danger" } },
      { key: "audit", label: "Audit", href: "/bookkeeper/audit", icon: Icons.audit },
    ],
  },
  {
    key: "system",
    label: "System",
    items: [
      { key: "administration", label: "Administration", href: "/bookkeeper/administration", icon: Icons.administration },
      { key: "settings", label: "Settings", href: "/bookkeeper/settings", icon: Icons.settings },
    ],
  },
];

/** Flat lookup used to resolve the active item from the current pathname. */
export function findActiveNavKey(pathname: string): string | null {
  let best: { key: string; len: number } | null = null;
  for (const group of BOOKKEEPER_NAV) {
    for (const item of group.items) {
      const candidates = [item.href, ...(item.matchPrefixes || [])];
      for (const href of candidates) {
        if (pathname === href || (href !== "/bookkeeper" && pathname.startsWith(href + "/"))) {
          if (!best || href.length > best.len) best = { key: item.key, len: href.length };
        }
      }
    }
  }
  return best ? best.key : null;
}
