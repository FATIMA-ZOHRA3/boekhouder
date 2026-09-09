"use client";

import { Suspense } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import SearchResultsView from "@/components/search/SearchResultsView";

function BookkeeperSearchInner() {
  const { activeAdministration } = useAdministration();
  return <SearchResultsView isStaff clientId={activeAdministration ? activeAdministration.id : null} />;
}

export default function BookkeeperSearchPage() {
  return (
    <Suspense>
      <BookkeeperSearchInner />
    </Suspense>
  );
}
