"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import GlobalSearch from "@/components/search/GlobalSearch";
import { ToastProvider } from "@/components/ToastProvider";
import { AdministrationProvider, useAdministration } from "@/components/AdministrationProvider";
import BookkeeperSidebar, { MobileNavDrawer } from "@/components/nav/BookkeeperSidebar";
import { useSidebarCounts } from "@/components/nav/useSidebarCounts";

// ---------------------------------------------------------------------------
// Bookkeeper portal shell — rebuilt around the new grouped sidebar
// (src/components/nav/BookkeeperSidebar.tsx) instead of the old SideRail
// icon rail. Structural changes from the previous shell:
//
//  - The sidebar defaults to its wide, labelled state (the old rail
//    defaulted to icon-only). A collapse toggle is still offered for
//    anyone who prefers the compact rail.
//  - The administration ("workspace") switcher now lives at the top of the
//    sidebar instead of floating in the page header — every page used to
//    render its own "Actieve administratie" line; now the shell owns it.
//  - A real top bar replaces the old borderless floating search/bell
//    chips, giving every page a consistent header strip for search,
//    notifications and (on mobile) the menu trigger.
//  - Session refresh, mobile drawer and logout behaviour are preserved
//    unchanged from the previous layout.
// ---------------------------------------------------------------------------

function BookkeeperLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const counts = useSidebarCounts(activeAdminId);

  // Sidebar defaults to WIDE now (the redesign brief explicitly asked for
  // a "large" navigation) — the old rail defaulted to collapsed. A
  // separate localStorage key (v2) is used deliberately so a stale
  // "collapsed" preference from the old rail doesn't silently carry over
  // and reintroduce icon-only mode for returning users.
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem("hamza.sidebar.expanded.v2");
        if (saved === "false") setExpanded(false);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem("hamza.sidebar.expanded.v2", String(next)); } catch {}
      return next;
    });
  }, []);

  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMobileOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  // Session keep-alive — unchanged from the previous layout.
  const lastRefresh = useRef(0);
  const refreshSession = useCallback(() => {
    const now = Date.now();
    if (now - lastRefresh.current < 5 * 60 * 1000) return;
    lastRefresh.current = now;
    fetch("/api/auth/refresh", { method: "POST" }).then((res) => {
      if (res.status === 401) router.push("/login");
    }).catch(() => {});
  }, [router]);
  useEffect(() => {
    const events = ["click", "keydown", "scroll", "mousemove", "touchstart"];
    events.forEach((e) => window.addEventListener(e, refreshSession, { passive: true }));
    refreshSession();
    return () => { events.forEach((e) => window.removeEventListener(e, refreshSession)); };
  }, [refreshSession]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#F5F7FA]">
      <BookkeeperSidebar expanded={expanded} onToggleExpanded={toggleExpanded} counts={counts} onLogout={handleLogout} />
      <MobileNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} counts={counts} onLogout={handleLogout} />

      <div className={`flex-1 min-h-screen flex flex-col transition-[margin-left] duration-300 ease-out ${expanded ? "lg:ml-72" : "lg:ml-20"}`}>
        {/* Top bar — replaces the old floating, headerless search/bell
            chips with one consistent strip shared by every page in the
            portal. */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 pt-[env(safe-area-inset-top)]">
          <div className="h-14 lg:h-16 flex items-center gap-3 px-3 sm:px-4 lg:px-6">
            <button onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Open menu">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <Link href="/bookkeeper" className="lg:hidden shrink-0">
              <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={104} height={27} />
            </Link>

            <div className="hidden lg:block min-w-0">
              {activeAdministration ? (
                <p className="text-xs text-gray-400 truncate">
                  Working on <span className="font-medium text-gray-700">{activeAdministration.company || activeAdministration.name}</span>
                </p>
              ) : (
                <p className="text-xs text-gray-400">No company selected</p>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              <GlobalSearch isStaff clientId={activeAdminId} />
              <NotificationBell variant="light" />
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function BookkeeperLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Suspense>
        <AdministrationProvider>
          <BookkeeperLayoutInner>{children}</BookkeeperLayoutInner>
        </AdministrationProvider>
      </Suspense>
    </ToastProvider>
  );
}
