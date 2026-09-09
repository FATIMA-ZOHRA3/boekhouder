"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAdministration, type AdministrationSummary } from "@/components/AdministrationProvider";
import { BOOKKEEPER_NAV, findActiveNavKey, type NavGroup } from "./bookkeeperNavConfig";
import type { SidebarCounts } from "./useSidebarCounts";

// ---------------------------------------------------------------------------
// The redesigned bookkeeper navigation shell.
//
// This intentionally shares almost nothing with the old SideRail: no
// portal-mounted hover pills, no icon-only default, no wave animation. It's
// a plain, wide, grouped list — six labelled sections instead of one flat
// row of 19 icons — plus a workspace (administration) switcher pinned at
// the top, which used to live as a floating chip in the page header instead
// of the navigation itself. Colors are unchanged from the old shell
// (#12355B navy, #2E6FA7 blue accent) — only the structure changes.
// ---------------------------------------------------------------------------

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function WorkspaceSwitcher({ rail }: { rail: boolean }) {
  const { administrations, activeAdministration, selectAdministration, loading } = useAdministration();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return administrations;
    return administrations.filter((a) => (a.company || a.name).toLowerCase().includes(q));
  }, [administrations, query]);

  const label = activeAdministration ? (activeAdministration.company || activeAdministration.name) : loading ? "Loading…" : "Select a company";

  if (rail) {
    return (
      <div className="px-2.5 pb-3">
        <Link href="/bookkeeper/administration" title={label}
          className="flex items-center justify-center w-11 h-11 mx-auto rounded-xl bg-white/8 hover:bg-white/12 text-white/80 text-xs font-semibold transition-colors">
          {activeAdministration ? initials(activeAdministration.company || activeAdministration.name) : "—"}
        </Link>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 px-3 py-2.5 text-left transition-colors"
      >
        <span className="w-8 h-8 shrink-0 rounded-lg bg-[#2E6FA7]/90 text-white text-[11px] font-bold flex items-center justify-center">
          {activeAdministration ? initials(activeAdministration.company || activeAdministration.name) : "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wider text-white/40 leading-none mb-0.5">Working on</span>
          <span className="block text-[13px] font-medium text-white truncate leading-tight">{label}</span>
        </span>
        <svg className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-dropdown-enter">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search companies…"
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No companies found.</p>}
            {filtered.map((a: AdministrationSummary) => (
              <button
                key={a.id}
                onClick={() => { selectAdministration(a.id); setOpen(false); setQuery(""); }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-gray-50 ${activeAdministration?.id === a.id ? "bg-indigo-50/70 text-indigo-700 font-medium" : "text-gray-700"}`}
              >
                <span className="w-6 h-6 shrink-0 rounded-md bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center">{initials(a.company || a.name)}</span>
                <span className="truncate">{a.company || a.name}</span>
              </button>
            ))}
          </div>
          <Link href="/bookkeeper/administration" onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 border-t border-gray-100">
            Manage all companies →
          </Link>
        </div>
      )}
    </div>
  );
}

function CountBadge({ n, tone }: { n: number; tone: "warning" | "danger" }) {
  if (!n) return null;
  const cls = tone === "danger" ? "bg-red-500/20 text-red-300" : "bg-amber-400/20 text-amber-300";
  return <span className={`ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${cls}`}>{n > 99 ? "99+" : n}</span>;
}

function NavRows({ group, activeKey, rail, counts, onNavigate }: { group: NavGroup; activeKey: string | null; rail: boolean; counts: SidebarCounts; onNavigate?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-1">
      {!rail && (
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/35 hover:text-white/60 transition-colors"
        >
          {group.label}
          <svg className={`w-3 h-3 transition-transform ${collapsed ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      {rail && <div className="h-3" />}
      {!collapsed && (
        <div className="px-2 space-y-0.5">
          {group.items.map((item) => {
            const isActive = activeKey === item.key;
            const count = item.badge?.countKey ? counts[item.badge.countKey] : 0;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                title={rail ? item.label : undefined}
                className={`relative flex items-center gap-3 rounded-xl text-[13.5px] font-medium transition-colors ${rail ? "justify-center h-11 w-11 mx-auto" : "h-10 px-3"} ${
                  isActive ? "bg-[#2E6FA7] text-white shadow-[0_4px_14px_-4px_rgba(37, 99, 235,0.6)]" : "text-white/65 hover:bg-white/8 hover:text-white"
                }`}
              >
                <span className={`w-[19px] h-[19px] shrink-0 [&>svg]:w-[19px] [&>svg]:h-[19px] flex items-center justify-center ${isActive ? "text-white" : "text-white/55"}`}>
                  {item.icon}
                </span>
                {!rail && <span className="flex-1 min-w-0 truncate">{item.label}</span>}
                {!rail && item.badge && <CountBadge n={count} tone={item.badge.tone || "warning"} />}
                {rail && !!count && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-400 ring-2 ring-[#12355B]" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BookkeeperSidebarContent({ rail, counts, onNavigate }: { rail: boolean; counts: SidebarCounts; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeKey = useMemo(() => findActiveNavKey(pathname), [pathname]);

  return (
    <>
      <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-3">
        {BOOKKEEPER_NAV.map((group) => (
          <NavRows key={group.key} group={group} activeKey={activeKey} rail={rail} counts={counts} onNavigate={onNavigate} />
        ))}
      </div>
    </>
  );
}

export default function BookkeeperSidebar({
  expanded,
  onToggleExpanded,
  counts,
  onLogout,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  counts: SidebarCounts;
  onLogout: () => void;
}) {
  const [logoutHover, setLogoutHover] = useState(false);

  return (
    <aside
      className={`hidden lg:flex bg-[#12355B] flex-col fixed top-0 left-0 bottom-0 z-30 shadow-[4px_0_20px_-10px_rgba(0,0,0,0.35)] transition-[width] duration-300 ease-out ${expanded ? "w-72" : "w-20"}`}
    >
      {/* Brand */}
      <div className={`h-14 border-b border-white/10 flex items-center shrink-0 overflow-hidden ${expanded ? "px-4" : "justify-center"}`}>
        <Link href="/bookkeeper" aria-label="Home" className="flex items-center">
          {expanded ? (
            <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={150} height={39} className="brightness-0 invert" priority />
          ) : (
            <svg viewBox="0 0 152 190" aria-hidden className="w-7 h-9">
              <path fill="#2E6FA7" d="M91,8v30h-16V0H30v30H0v152h45v-30h15v38h45v-30h31V8h-45ZM30,167h-15V46h15v121ZM60,137h-15V16h15v121ZM90,175h-15V54h15v121ZM121,144h-15V23h15v121Z" />
            </svg>
          )}
        </Link>
      </div>

      {/* Workspace switcher */}
      <div className="pt-3 shrink-0">
        <WorkspaceSwitcher rail={!expanded} />
      </div>

      {/* Grouped nav */}
      <BookkeeperSidebarContent rail={!expanded} counts={counts} />

      {/* Bottom controls */}
      <div className="border-t border-white/10 py-2 shrink-0">
        {expanded ? (
          <div className="flex flex-col gap-0.5 px-2">
            <button onClick={onLogout} aria-label="Log out"
              className="flex items-center gap-3 h-10 pl-3 pr-2 rounded-lg text-[13px] font-medium text-white/60 hover:bg-red-500/15 hover:text-red-300 transition-colors">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              <span className="flex-1 text-left">Log out</span>
            </button>
            <button onClick={onToggleExpanded} aria-label="Collapse menu"
              className="flex items-center gap-3 h-10 pl-3 pr-2 rounded-lg text-[13px] font-medium text-white/45 hover:bg-white/5 hover:text-white/85 transition-colors">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
              <span className="flex-1 text-left">Collapse</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1 px-1.5">
            <button onClick={onLogout} aria-label="Log out"
              onMouseEnter={() => setLogoutHover(true)} onMouseLeave={() => setLogoutHover(false)}
              className={`group relative flex items-center h-11 rounded-xl overflow-hidden whitespace-nowrap transition-[width,background-color,color] duration-300 ease-out ${
                logoutHover ? "bg-red-500/15 text-red-300 w-[190px] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.55)] ring-1 ring-white/5 z-30" : "bg-transparent text-white/55 w-11"
              }`}>
              <span className="w-11 h-11 shrink-0 flex items-center justify-center">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </span>
              <span className="text-[13px] font-medium pr-4 transition-opacity duration-200" style={{ opacity: logoutHover ? 1 : 0 }}>Log out</span>
            </button>
            <button onClick={onToggleExpanded} aria-label="Expand menu"
              className="w-11 h-11 flex items-center justify-center rounded-xl text-white/50 hover:bg-white/5 hover:text-white/85 transition-colors">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export function MobileNavDrawer({ open, onClose, counts, onLogout }: { open: boolean; onClose: () => void; counts: SidebarCounts; onLogout: () => void }) {
  return (
    <>
      {open && <div className="lg:hidden fixed inset-0 bg-black/50 z-50" onClick={onClose} />}
      <aside className={`lg:hidden fixed top-0 left-0 h-full w-[300px] bg-[#12355B] z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <Link href="/bookkeeper" onClick={onClose} className="block">
            <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={140} height={36} className="brightness-0 invert" priority />
          </Link>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/50 hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="pt-3 shrink-0">
          <WorkspaceSwitcher rail={false} />
        </div>
        <BookkeeperSidebarContent rail={false} counts={counts} onNavigate={onClose} />
        <div className="border-t border-white/10 py-2 px-2 shrink-0">
          <button onClick={() => { onClose(); onLogout(); }}
            className="w-full flex items-center gap-3 h-10 pl-3 pr-2 rounded-lg text-[13px] font-medium text-white/60 hover:bg-red-500/15 hover:text-red-300 transition-colors">
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
