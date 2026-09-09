"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdministration } from "@/components/AdministrationProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

// ---------------------------------------------------------------------------
// Customers — new destination (RELATIONSHIPS > Customers). There was no
// dedicated list route before; customers were only reachable one at a time,
// by clicking a debtor name inside the Sales table. The detail page
// (app/bookkeeper/customers/[id]) already existed and is unchanged — this
// just gives it a proper front door. Reads the same Customer records via a
// small, precedented extension to GET /api/customers (clientId support for
// staff, mirroring the pattern already used by /api/purchases/all etc.).
// ---------------------------------------------------------------------------

interface CustomerRow { id: string; name: string; email: string | null; phone: string | null; vatNumber: string | null; accountantAccess: boolean; city: string | null }

function CustomersInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!activeAdminId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/customers?clientId=${activeAdminId}`).then((r) => (r.ok ? r.json() : [])).then((d) => { if (!cancelled) setCustomers(Array.isArray(d) ? d : []); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeAdminId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
  }, [customers, search]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <PageHeader title="Customers" subtitle={activeAdministration ? `Debtors of ${activeAdministration.company || activeAdministration.name}` : undefined} />

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers…" className="w-full sm:w-80 border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : filtered.length === 0 ? (
        <EmptyState title="No customers yet" body="Customers appear here once this company adds them or invoices them." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Link key={c.id} href={`/bookkeeper/customers/${c.id}`} className="block">
              <Card hover className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    {c.email && <p className="text-xs text-gray-400 truncate mt-0.5">{c.email}</p>}
                  </div>
                  {c.accountantAccess && <Badge tone="info">Access</Badge>}
                </div>
                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  {c.city && <p>{c.city}</p>}
                  {c.vatNumber && <p className="font-mono">{c.vatNumber}</p>}
                  {c.phone && <p>{c.phone}</p>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <RequireAdministration>
      <CustomersInner />
    </RequireAdministration>
  );
}
