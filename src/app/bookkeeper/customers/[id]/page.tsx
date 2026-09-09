"use client";

import { use, Suspense } from "react";
import Link from "next/link";
import { useCustomerFinancialProfile } from "@/components/customers/useCustomerFinancialProfile";
import { useActivityLogs } from "@/components/audit/useActivityLogs";
import ActivityTimeline from "@/components/audit/ActivityTimeline";
import { Card, EmptyState, ErrorState, SkeletonLine } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

// Same labels/colors as the invoice detail page's StatusBadge
// (app/bookkeeper/invoices/[id]/page.tsx) — kept local rather than shared,
// matching how every other page in this app already duplicates this small
// helper instead of importing across page files.
const statusLabels: Record<string, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", partial: "Partial",
};
const statusTone: Record<string, BadgeTone> = {
  draft: "neutral", sent: "info", paid: "success", overdue: "danger", partial: "warning",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? "neutral"}>{statusLabels[status] || status}</Badge>;
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonLine width="12rem" height="1.5rem" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-2">
            <SkeletonLine width="60%" height="0.7rem" />
            <SkeletonLine width="80%" height="1.5rem" />
          </Card>
        ))}
      </div>
      <Card className="h-48 flex items-center justify-center">
        <SkeletonLine width="50%" height="1rem" />
      </Card>
    </div>
  );
}

function CustomerFinancialProfileInner({ id }: { id: string }) {
  const { data, loading, error, notFound, retry } = useCustomerFinancialProfile(id);

  // Step 9: reuse the Phase 6 Activity Timeline as-is, narrowed to this
  // customer's own AuditLog entries (the customer record itself + each of
  // its invoices) via the entityIds filter added to /api/audit-logs.
  // clientId is the administration the customer belongs to (customer.userId
  // in the data model) — not the customer's own id.
  const activity = useActivityLogs({
    clientId: data ? data.customer.userId : null,
    entityIds: data?.auditEntityIds,
    limit: 10,
  });

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
        <ProfileSkeleton />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
        <EmptyState
          title="Customer not found"
          body="It may have been removed, or you don't have access to it."
          action={{ label: "Back to accounts receivable", href: "/bookkeeper?section=sales&tab=debiteurenbeheer" }}
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
        <ErrorState message="Unable to load this customer's financial profile." onRetry={retry} />
      </div>
    );
  }

  const { customer, summary, invoices, invoiceTotalCount, payments } = data;

  return (
    <div className="p-4 sm:p-6 lg:p-8 lg:pt-3 max-w-4xl space-y-6">
      <div>
        <Link href="/bookkeeper?section=sales&tab=debiteurenbeheer" className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
          ← Accounts receivable
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 tracking-tight">{customer.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Customer Financial Profile
          {customer.email && <> · {customer.email}</>}
          {customer.phone && <> · {customer.phone}</>}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total invoiced" value={formatCurrency(summary.totalInvoiced)} icon="💰" tone="primary" />
        <KpiCard label="Total paid" value={formatCurrency(summary.totalPaid)} icon="✅" tone="success" />
        <KpiCard label="Outstanding" value={formatCurrency(summary.outstanding)} icon="🟡" tone="warning" />
        <KpiCard label="Overdue" value={formatCurrency(summary.overdue)} icon="🔴" tone={summary.overdue > 0 ? "danger" : "default"} />
      </div>

      <Card className="flex items-center gap-2">
        <span aria-hidden>🧾</span>
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{summary.invoiceCount}</span> invoice{summary.invoiceCount === 1 ? "" : "s"}
        </p>
      </Card>

      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Invoices</h2>
        {invoices.length === 0 ? (
          <EmptyState title="No invoices yet" body="Invoices for this customer will appear here." />
        ) : (
          <Card padding="none" className="divide-y divide-gray-50 overflow-hidden">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/bookkeeper/invoices/${inv.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {inv.invoiceNumber}
                    {inv.isCredit && <span className="ml-1.5 text-[10px] text-red-500">(credit)</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(inv.date)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-gray-700">{formatCurrency(inv.total)}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </Link>
            ))}
          </Card>
        )}
        {invoiceTotalCount > invoices.length && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            Showing {invoices.length} of {invoiceTotalCount} invoices —{" "}
            <Link href="/bookkeeper?section=sales&tab=debiteurenbeheer" className="text-indigo-600 hover:text-indigo-800 font-medium">
              view all in accounts receivable
            </Link>
          </p>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          <span aria-hidden>💳</span> Recent Payments
        </h2>
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" body="Payments recorded for this customer will appear here." />
        ) : (
          <Card padding="none" className="divide-y divide-gray-50 overflow-hidden">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm text-gray-900">{formatDate(p.date)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.invoiceNumber}</p>
                </div>
                <span className="text-sm font-semibold text-emerald-600">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {activity.items.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Recent activity</h2>
          <ActivityTimeline items={activity.items} />
        </div>
      )}
    </div>
  );
}

export default function CustomerFinancialProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <CustomerFinancialProfileInner id={id} />
    </Suspense>
  );
}
