"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import GlobalSearch from "@/components/search/GlobalSearch";
import AdminSidebar, { MobileAdminNavDrawer } from "@/components/nav/AdminSidebar";
import { findActiveAdminNavKey } from "@/components/nav/adminNavConfig";

// ---------------------------------------------------------------------------
// Admin portal shell — same grouped-sidebar pattern as the bookkeeper and
// client portals. Replaces the old single-page pill tab bar with real
// routes (/admin, /admin/users, /admin/settings, /admin/tax-concepts),
// each rendering AdminDashboardContent with a different `tab` prop.
// ---------------------------------------------------------------------------

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeKey = findActiveAdminNavKey(pathname);

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
      <AdminSidebar expanded={expanded} onToggleExpanded={toggleExpanded} activeKey={activeKey} onLogout={handleLogout} />
      <MobileAdminNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} activeKey={activeKey} onLogout={handleLogout} />

      <div className={`flex-1 min-h-screen flex flex-col transition-[margin-left] duration-300 ease-out ${expanded ? "lg:ml-72" : "lg:ml-20"}`}>
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 pt-[env(safe-area-inset-top)]">
          <div className="h-14 lg:h-16 flex items-center gap-3 px-3 sm:px-4 lg:px-6">
            <button onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Open menu">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <Link href="/admin" className="lg:hidden shrink-0">
              <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={104} height={27} />
            </Link>

            <div className="hidden lg:block min-w-0">
              <p className="text-xs text-gray-400">Platform administration</p>
            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              <GlobalSearch isStaff />
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  );
}
