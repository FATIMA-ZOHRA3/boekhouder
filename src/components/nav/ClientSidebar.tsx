"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { CLIENT_NAV } from "./clientNavConfig";
import type { NavItem } from "./bookkeeperNavConfig";

// ---------------------------------------------------------------------------
// Client portal sidebar — same visual language and structure as
// BookkeeperSidebar (navy #12355B shell, #2E6FA7 blue active state, wide
// vs. rail modes, grouped sections) so both portals feel like one product.
// The client has no multi-company "workspace" concept (a client only ever
// sees their own company), so there is no WorkspaceSwitcher here — otherwise
// this is a straight structural match.
// ---------------------------------------------------------------------------

function NavRows({ items, activeKey, rail, onNavigate }: { items: NavItem[]; activeKey: string; rail: boolean; onNavigate?: () => void }) {
  return (
    <div className="px-2 space-y-0.5">
      {items.map((item) => {
        const isActive = activeKey === item.key;
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
          </Link>
        );
      })}
    </div>
  );
}

export function ClientSidebarContent({ activeKey, rail, onNavigate }: { activeKey: string; rail: boolean; onNavigate?: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-3 pt-2">
      {CLIENT_NAV.map((group) => (
        <div key={group.key} className="mb-1">
          {!rail && (
            <div className="px-3 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/35">
              {group.label}
            </div>
          )}
          {rail && <div className="h-3" />}
          <NavRows items={group.items} activeKey={activeKey} rail={rail} onNavigate={onNavigate} />
        </div>
      ))}
    </div>
  );
}

export default function ClientSidebar({
  expanded,
  onToggleExpanded,
  activeKey,
  onLogout,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  activeKey: string;
  onLogout: () => void;
}) {
  const [logoutHover, setLogoutHover] = useState(false);

  return (
    <aside
      className={`hidden lg:flex bg-[#12355B] flex-col fixed top-0 left-0 bottom-0 z-30 shadow-[4px_0_20px_-10px_rgba(0,0,0,0.35)] transition-[width] duration-300 ease-out ${expanded ? "w-72" : "w-20"}`}
    >
      <div className={`h-14 border-b border-white/10 flex items-center shrink-0 overflow-hidden ${expanded ? "px-4" : "justify-center"}`}>
        <Link href="/client" aria-label="Home" className="flex items-center">
          {expanded ? (
            <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={150} height={39} className="brightness-0 invert" priority />
          ) : (
            <svg viewBox="0 0 152 190" aria-hidden className="w-7 h-9">
              <path fill="#2E6FA7" d="M91,8v30h-16V0H30v30H0v152h45v-30h15v38h45v-30h31V8h-45ZM30,167h-15V46h15v121ZM60,137h-15V16h15v121ZM90,175h-15V54h15v121ZM121,144h-15V23h15v121Z" />
            </svg>
          )}
        </Link>
      </div>

      <ClientSidebarContent activeKey={activeKey} rail={!expanded} />

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

export function MobileClientNavDrawer({ open, onClose, activeKey, onLogout }: { open: boolean; onClose: () => void; activeKey: string; onLogout: () => void }) {
  return (
    <>
      {open && <div className="lg:hidden fixed inset-0 bg-black/50 z-50" onClick={onClose} />}
      <aside className={`lg:hidden fixed top-0 left-0 h-full w-[300px] bg-[#12355B] z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <Link href="/client" onClick={onClose} className="block">
            <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={140} height={36} className="brightness-0 invert" priority />
          </Link>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/50 hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <ClientSidebarContent activeKey={activeKey} rail={false} onNavigate={onClose} />
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
