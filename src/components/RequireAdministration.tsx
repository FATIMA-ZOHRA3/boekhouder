"use client";

import type { ReactNode } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import { EmptyState, SkeletonCard } from "@/components/ui/Card";

/**
 * Every module below the new workspace switcher operates on exactly one
 * customer administration at a time (same rule the old `activeAdminId && (...)`
 * guards enforced inline in the bookkeeper/page.tsx monolith). This
 * component centralises that gate so each of the new route pages doesn't
 * repeat the same loading/empty branching.
 */
export default function RequireAdministration({ children }: { children: ReactNode }) {
  const { activeAdministration, loading } = useAdministration();

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!activeAdministration) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <EmptyState
          icon={
            <svg className="w-12 h-12 text-indigo-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
          title="Select a company first"
          body="This page works within one customer company. Choose which one you want to work on from the switcher in the sidebar."
          action={{ label: "Choose a company", href: "/bookkeeper/administration" }}
        />
      </div>
    );
  }

  return <>{children}</>;
}
