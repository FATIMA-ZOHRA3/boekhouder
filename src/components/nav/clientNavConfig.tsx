import type { ReactNode } from "react";
import type { NavGroup } from "./bookkeeperNavConfig";

// ---------------------------------------------------------------------------
// Navigation model for the redesigned client portal shell — same grouped
// structure as the bookkeeper's BOOKKEEPER_NAV, but scoped to the client's
// existing sections. No routes were added or removed here: every item below
// keeps the exact href it already had in the old ClientLayout (some are real
// routes, some are still `/client?section=...` query params handled by the
// dashboard page itself) — only the surrounding chrome/style changes.
// ---------------------------------------------------------------------------

const iconProps = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw = 1.6;

const Icons: Record<string, ReactNode> = {
  home: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>
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
  taxes: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
  ),
  messages: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
  ),
  tasks: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm4-6l2 2 4-4" /></svg>
  ),
  customers: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  ),
  settings: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export const CLIENT_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [{ key: "dashboard", label: "Dashboard", href: "/client", icon: Icons.home }],
  },
  {
    key: "work",
    label: "Work",
    items: [
      { key: "sales", label: "Sales", href: "/client?section=sales", icon: Icons.sales },
      { key: "purchases", label: "Purchases", href: "/client?section=purchases", icon: Icons.purchases },
      { key: "bank", label: "Bank", href: "/client?section=bank", icon: Icons.banking },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    items: [
      { key: "fiscaal", label: "VAT & Tax", href: "/client?section=fiscaal", icon: Icons.taxes },
      { key: "planning", label: "Planning", href: "/client?section=planning", icon: Icons.tasks },
    ],
  },
  {
    key: "relationships",
    label: "Relationships",
    items: [
      { key: "customers", label: "Customers", href: "/client/customers", icon: Icons.customers },
      { key: "berichten", label: "Berichten", href: "/client?section=berichten", icon: Icons.messages },
    ],
  },
  {
    key: "system",
    label: "System",
    items: [{ key: "settings", label: "Settings", href: "/client/settings", icon: Icons.settings }],
  },
];

/**
 * Resolves the active nav key for the client portal. Unlike the bookkeeper's
 * findActiveNavKey (pure pathname match), most client items live behind
 * `/client?section=...`, so the active section must be read from the query
 * string when we're on the main `/client` route.
 */
export function findActiveClientNavKey(pathname: string, section: string | null): string {
  if (pathname === "/client/customers") return "customers";
  if (pathname === "/client/settings") return "settings";
  if (pathname === "/client") return section || "dashboard";
  return "dashboard";
}
