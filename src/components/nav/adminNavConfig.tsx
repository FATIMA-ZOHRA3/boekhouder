import type { ReactNode } from "react";
import type { NavGroup } from "./bookkeeperNavConfig";

// ---------------------------------------------------------------------------
// Navigation model for the redesigned admin portal shell. Replaces the old
// in-page pill tab bar (Overview / Gebruikers / Settings / Fiscale
// begrippen) with real routes and the same grouped-sidebar pattern used by
// the bookkeeper and client portals. The admin has no per-company
// "workspace" concept — it manages the whole platform — so there's no
// workspace switcher, just Overview / Management / System groups.
// ---------------------------------------------------------------------------

const iconProps = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" } as const;
const sw = 1.6;

const Icons: Record<string, ReactNode> = {
  home: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>
  ),
  users: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  ),
  taxes: (
    <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
  ),
  settings: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export const ADMIN_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [{ key: "overview", label: "Dashboard", href: "/admin", icon: Icons.home }],
  },
  {
    key: "management",
    label: "Management",
    items: [
      { key: "users", label: "Users", href: "/admin/users", icon: Icons.users },
      { key: "taxconcepts", label: "Tax concepts", href: "/admin/tax-concepts", icon: Icons.taxes },
    ],
  },
  {
    key: "system",
    label: "System",
    items: [{ key: "settings", label: "Settings", href: "/admin/settings", icon: Icons.settings }],
  },
];

export function findActiveAdminNavKey(pathname: string): string {
  if (pathname === "/admin") return "overview";
  if (pathname.startsWith("/admin/users")) return "users";
  if (pathname.startsWith("/admin/tax-concepts")) return "taxconcepts";
  if (pathname.startsWith("/admin/settings")) return "settings";
  return "overview";
}
