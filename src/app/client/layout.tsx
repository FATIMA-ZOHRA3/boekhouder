"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import GlobalSearch from "@/components/search/GlobalSearch";
import ClientSidebar, { MobileClientNavDrawer } from "@/components/nav/ClientSidebar";
import { findActiveClientNavKey } from "@/components/nav/clientNavConfig";

// ---------------------------------------------------------------------------
// Client portal shell — rebuilt around the same grouped sidebar pattern as
// the bookkeeper portal (src/components/nav/ClientSidebar.tsx) instead of
// the old SideRail icon rail, so both portals share one visual language:
// navy sidebar, blue active state, wide-by-default with a collapse
// toggle, and a real top bar for search/notifications instead of a
// floating borderless chip. The client's own sections (Dashboard, Sales,
// Purchases, Bank, VAT & Tax, Berichten, Planning, Customers, Settings)
// are unchanged — only the chrome around them changes.
// ---------------------------------------------------------------------------

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeKey = findActiveClientNavKey(pathname, searchParams.get("section"));

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
      <ClientSidebar expanded={expanded} onToggleExpanded={toggleExpanded} activeKey={activeKey} onLogout={handleLogout} />
      <MobileClientNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} activeKey={activeKey} onLogout={handleLogout} />

      <div className={`flex-1 min-h-screen flex flex-col transition-[margin-left] duration-300 ease-out ${expanded ? "lg:ml-72" : "lg:ml-20"}`}>
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 pt-[env(safe-area-inset-top)]">
          <div className="h-14 lg:h-16 flex items-center gap-3 px-3 sm:px-4 lg:px-6">
            <button onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Open menu">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <Link href="/client" className="lg:hidden shrink-0">
              <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={104} height={27} />
            </Link>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              <GlobalSearch />
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

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ClientLayoutInner>{children}</ClientLayoutInner>
    </Suspense>
  );
}
