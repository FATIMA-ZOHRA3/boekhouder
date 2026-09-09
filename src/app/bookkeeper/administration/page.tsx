"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdministration } from "@/components/AdministrationProvider";
import { Card, PageHeader } from "@/components/ui/Card";
import type { Invoice } from "@/lib/data";

// ---------------------------------------------------------------------------
// Administration (SYSTEM > Administration) — was the "administraties"
// section, the only part of the old monolith that ISN'T gated behind an
// active company (it's how you pick one). The per-card stats
// (invoices / to book / purchase documents) mean this is also the one page
// that deliberately fetches firm-wide data instead of scoping to a single
// administration — every other new route intentionally avoids that for
// efficiency and isolation; this is the one legitimate exception, same as
// in the original.
// ---------------------------------------------------------------------------

interface PurchaseDoc { id: string; userId: string }

function AdministrationInner() {
  const router = useRouter();
  const { administrations, activeAdministration, activeAdministrationId, selectAdministration, loading } = useAdministration();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [docs, setDocs] = useState<PurchaseDoc[]>([]);

  useEffect(() => {
    fetch("/api/invoices").then((r) => (r.ok ? r.json() : [])).then((d) => setInvoices(Array.isArray(d) ? d : []));
    fetch("/api/purchases/all").then((r) => (r.ok ? r.json() : [])).then((d) => setDocs(Array.isArray(d) ? d : []));
  }, []);

  function statsFor(adminId: string) {
    const invs = invoices.filter((i) => i.clientId === adminId);
    return {
      invoiceCount: invs.length,
      toBook: invs.filter((i) => i.bookkeepingStatus === "pending" || i.bookkeepingStatus === "to_book").length,
      docCount: docs.filter((d) => d.userId === adminId).length,
    };
  }

  function openCompany(id: string) {
    selectAdministration(id);
    router.push("/bookkeeper");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <PageHeader title="Administration" subtitle="Choose a company to work within. Every module switches automatically." />

      {activeAdministration && (
        <Card className="!bg-indigo-50 !border-indigo-200 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-10 h-10 rounded-lg bg-[#12355B] text-white font-bold flex items-center justify-center shrink-0">{(activeAdministration.company || activeAdministration.name).charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="text-[10px] text-indigo-700/70 uppercase tracking-wider font-semibold">Currently working on</p>
              <p className="text-sm font-semibold text-indigo-900 truncate">{activeAdministration.company || activeAdministration.name}</p>
              <p className="text-xs text-gray-500 truncate">{activeAdministration.email}</p>
            </div>
          </div>
          <button onClick={() => selectAdministration(null)} className="text-xs font-medium text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 shrink-0">Clear selection</button>
        </Card>
      )}

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading companies…</p></Card>
      ) : administrations.length === 0 ? (
        <Card className="text-center py-10">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          <p className="text-sm text-gray-500">No companies available yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {administrations.map((adm) => {
            const isActive = adm.id === activeAdministrationId;
            const stats = statsFor(adm.id);
            return (
              <button key={adm.id} onClick={() => openCompany(adm.id)} className="text-left">
                <Card hover className={`relative overflow-hidden h-full ${isActive ? "!border-indigo-300 ring-2 ring-indigo-200" : ""}`}>
                  {isActive && (
                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />Active
                    </span>
                  )}
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-11 h-11 rounded-lg bg-[#12355B] text-white font-bold text-lg flex items-center justify-center shrink-0">{(adm.company || adm.name).charAt(0).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-800 truncate">{adm.company || adm.name}</h3>
                      <p className="text-xs text-gray-500 truncate">{adm.name !== (adm.company || adm.name) ? adm.name : adm.email}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg py-2"><p className="text-[10px] text-gray-500">Invoices</p><p className="text-sm font-bold text-gray-800">{stats.invoiceCount}</p></div>
                    <div className={`rounded-lg py-2 ${stats.toBook > 0 ? "bg-amber-50" : "bg-gray-50"}`}><p className={`text-[10px] ${stats.toBook > 0 ? "text-amber-700" : "text-gray-500"}`}>To book</p><p className={`text-sm font-bold ${stats.toBook > 0 ? "text-amber-600" : "text-gray-400"}`}>{stats.toBook}</p></div>
                    <div className="bg-gray-50 rounded-lg py-2"><p className="text-[10px] text-gray-500">Purchases</p><p className="text-sm font-bold text-gray-800">{stats.docCount}</p></div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdministrationPage() {
  return <AdministrationInner />;
}
