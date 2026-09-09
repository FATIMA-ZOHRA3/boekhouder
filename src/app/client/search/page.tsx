"use client";

import { Suspense } from "react";
import SearchResultsView from "@/components/search/SearchResultsView";

export default function ClientSearchPage() {
  return (
    <Suspense>
      <SearchResultsView isStaff={false} />
    </Suspense>
  );
}
